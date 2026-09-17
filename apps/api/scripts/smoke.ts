import { setTimeout as sleep } from "node:timers/promises";
import sharp from "sharp";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { loadEnv } from "../src/shared-kernel/env";
import { createDatabase } from "../src/db/client";
import {
  DrizzleStudioMemberRepository,
  DrizzleStudioRepository,
  DrizzleSubscriptionRepository,
} from "../src/modules/identity/infrastructure/persistence/drizzle-studio-repository";
import { DrizzleProjectRepository } from "../src/modules/media-ingestion/infrastructure/persistence/drizzle-project-repository";
import { Studio } from "../src/modules/identity/domain/studio";
import { StudioMember } from "../src/modules/identity/domain/studio-member";
import { Subscription } from "../src/modules/identity/domain/subscription";
import { Project } from "../src/modules/media-ingestion/domain/project";

/**
 * Proves a running deployment actually works, rather than merely starting.
 *
 * Unit tests run against in-memory adapters, so they cannot tell you that Postgres
 * migrated, that Redis is reachable, that the worker is consuming its queues, or
 * that S3 credentials are right. This drives the real HTTP surface end to end and
 * is what a release should be gated on.
 *
 *   BASE_URL=https://api.example.com pnpm --filter @albumflow/api smoke
 */
const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:4000";
const WORKER_TIMEOUT_MS = Number(process.env.SMOKE_WORKER_TIMEOUT_MS ?? 90_000);

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

async function main() {
  const env = loadEnv();
  console.log(`Smoke testing ${BASE_URL}\n`);

  // --- a studio to act as, created straight in the database ----------------
  const { db, close } = createDatabase(env.DATABASE_URL);
  const studioId = UniqueEntityId.create();
  const projectId = UniqueEntityId.create();
  const { studio, apiKey } = Studio.create(
    { name: `Smoke ${Date.now()}`, ownerEmail: `smoke+${Date.now()}@example.com` },
    studioId,
  );
  await new DrizzleStudioRepository(db).save(studio);
  const subscription = Subscription.startTrial(studio.id);
  subscription.changePlan("STUDIO");
  await new DrizzleSubscriptionRepository(db).save(subscription);
  await new DrizzleStudioMemberRepository(db).save(
    StudioMember.invite({
      studioId: studio.id,
      email: studio.ownerEmail,
      name: "Smoke",
      role: "OWNER",
    }),
  );
  await new DrizzleProjectRepository(db).save(
    Project.create(
      { studioId: studio.id, name: "Smoke shoot", type: "WEDDING" },
      projectId,
    ),
  );

  const studioHeaders = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  async function api<T>(
    path: string,
    init: RequestInit = {},
    headers: Record<string, string> = studioHeaders,
  ): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
    if (!response.ok) {
      throw new Error(`${init.method ?? "GET"} ${path} -> ${response.status} ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  }

  try {
    // --- 1. the process is up ---------------------------------------------
    const health = await api<{ status: string }>("/health");
    check("API answers /health", health.status === "ok");

    // --- 2. authentication is actually enforced ---------------------------
    const unauthenticated = await fetch(`${BASE_URL}/projects/${projectId}/photos`);
    check("rejects an unauthenticated request", unauthenticated.status === 401,
      `got ${unauthenticated.status}`);

    // --- 3. upload a photo through the presigned URL ----------------------
    const jpeg = await texturedJpeg(1600, 1067, 4242);
    const requested = await api<{ photoId: string; uploadUrl: string }>(
      `/studios/${studioId}/projects/${projectId}/photos`,
      {
        method: "POST",
        body: JSON.stringify({
          fileName: "smoke.jpg",
          mimeType: "image/jpeg",
          byteSize: jpeg.byteLength,
        }),
      },
    );
    const put = await fetch(requested.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: new Uint8Array(jpeg),
    });
    check("object storage accepts a presigned upload", put.ok, `status ${put.status}`);

    await api(`/photos/${requested.photoId}/confirm-upload`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    // --- 4. the worker is consuming its queues ----------------------------
    const processed = await waitFor(async () => {
      const photos = await api<
        { id: string; status: string; previewUrl: string | null; thumbnailUrl: string | null }[]
      >(`/projects/${projectId}/photos`);
      const photo = photos.find((candidate) => candidate.id === requested.photoId);
      const ready =
        photo?.status === "ANALYSED" && photo.thumbnailUrl?.includes("/derivatives/") === true;
      return ready ? photo : undefined;
    });

    check("worker analysed the photo", processed?.status === "ANALYSED",
      processed ? `status ${processed.status}` : "timed out");
    check(
      "worker wrote display derivatives",
      processed?.thumbnailUrl?.includes("/derivatives/") === true,
      "the tray would otherwise be served full-resolution originals",
    );

    // --- 5. planning produces a real album --------------------------------
    for (let i = 0; i < 5; i += 1) await uploadOne(api, studioId.toString(), projectId.toString(), i);
    await waitFor(async () => {
      const photos = await api<{ status: string }[]>(`/projects/${projectId}/photos`);
      return photos.every((photo) => photo.status === "ANALYSED") ? photos : undefined;
    });

    const album = await api<{ id: string; spreadCount: number }>(
      `/projects/${projectId}/albums`,
      { method: "POST", body: JSON.stringify({ targetSpreads: 2 }) },
    );
    check("planner built an album", album.spreadCount > 0, `${album.spreadCount} spreads`);

    // --- 6. the client review loop ----------------------------------------
    const link = await api<{ token: string }>(`/albums/${album.id}/review-sessions`, {
      method: "POST",
      body: JSON.stringify({ clientName: "Smoke Client" }),
    });
    await api(
      `/review/${link.token}/comments`,
      { method: "POST", body: JSON.stringify({ spreadIndex: 0, body: "Smoke note" }) },
      { "Content-Type": "application/json" },
    );
    const feedback = await api<{ openCount: number; comments: { body: string }[] }>(
      `/albums/${album.id}/comments`,
    );
    check(
      "photographer can read what the client wrote",
      feedback.openCount === 1 && feedback.comments[0]?.body === "Smoke note",
    );

    // --- 7. the printer gets a real PDF -----------------------------------
    const job = await api<{ id: string }>(`/albums/${album.id}/exports`, {
      method: "POST",
      body: JSON.stringify({ printProfileId: "client-proof-150" }),
    });
    const exported = await waitFor(async () => {
      const jobs = await api<{ id: string; status: string; byteSize: number | null }[]>(
        `/albums/${album.id}/exports`,
      );
      const mine = jobs.find((candidate) => candidate.id === job.id);
      return mine?.status === "READY" || mine?.status === "FAILED" ? mine : undefined;
    });
    check("export rendered a PDF", exported?.status === "READY",
      exported ? `status ${exported.status}, ${exported.byteSize} bytes` : "timed out");

    const download = await api<{ url: string }>(`/exports/${job.id}/download`);
    const pdf = Buffer.from(await (await fetch(download.url)).arrayBuffer());
    check("the PDF is downloadable and well formed",
      pdf.subarray(0, 5).toString() === "%PDF-",
      `${(pdf.byteLength / 1024 / 1024).toFixed(2)} MB`);
  } finally {
    await close();
  }

  console.log(`\n${failures === 0 ? "Smoke test passed." : `${failures} check(s) failed.`}`);
  if (failures > 0) process.exit(1);
}

async function uploadOne(
  api: <T>(path: string, init?: RequestInit) => Promise<T>,
  studioId: string,
  projectId: string,
  seed: number,
): Promise<void> {
  const jpeg = await texturedJpeg(1600, 1067, seed * 977 + 11);
  const requested = await api<{ photoId: string; uploadUrl: string }>(
    `/studios/${studioId}/projects/${projectId}/photos`,
    {
      method: "POST",
      body: JSON.stringify({
        fileName: `smoke-${seed}.jpg`,
        mimeType: "image/jpeg",
        byteSize: jpeg.byteLength,
      }),
    },
  );
  await fetch(requested.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: new Uint8Array(jpeg),
  });
  await api(`/photos/${requested.photoId}/confirm-upload`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/** Flat colour scores near zero for sharpness; real analysis needs real detail. */
async function texturedJpeg(width: number, height: number, seed: number): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 3);
  let state = seed;
  for (let i = 0; i < data.length; i += 1) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    data[i] = state % 256;
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).jpeg({ quality: 88 }).toBuffer();
}

async function waitFor<T>(attempt: () => Promise<T | undefined>): Promise<T | undefined> {
  const deadline = Date.now() + WORKER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await attempt();
    if (result !== undefined) return result;
    await sleep(2000);
  }
  return undefined;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

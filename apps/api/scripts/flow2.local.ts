import sharp from "sharp";
import { writeFile } from "node:fs/promises";
const BASE = "http://localhost:4000";
const H = { Authorization: "Bearer af_demo_key_do_not_use_in_production", "Content-Type": "application/json" };
const J = { "Content-Type": "application/json" };
const STUDIO = "11111111-1111-4111-8111-111111111111";
const OUT = process.argv[2]!;
let failures = 0;
const check = (n: string, ok: boolean, d = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
};
async function api<T>(p: string, init: RequestInit = {}, h: Record<string, string> = H): Promise<T> {
  const r = await fetch(`${BASE}${p}`, { ...init, headers: h });
  if (!r.ok) throw new Error(`${init.method ?? "GET"} ${p} -> ${r.status} ${await r.text()}`);
  return (r.status === 204 ? undefined : r.json()) as Promise<T>;
}
/** A photo you can read the orientation of: an arrow-ish split, red on top, blue bottom-left, green bottom-right, plus noise. */
async function marked(w: number, h: number, seed: number) {
  const d = Buffer.alloc(w * h * 3);
  let s = seed;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      s = (s * 1664525 + 1013904223) % 4294967296;
      const n = s % 40;
      if (y < h / 2) {
        d[i] = 215 + n;
        d[i + 1] = n;
        d[i + 2] = n;
      } else if (x < w / 2) {
        d[i] = n;
        d[i + 1] = n;
        d[i + 2] = 215 + n;
      } else {
        d[i] = n;
        d[i + 1] = 200 + n;
        d[i + 2] = n;
      }
    }
  return sharp(d, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 90 })
    .toBuffer();
}
async function upload(project: string, name: string, bytes: Buffer) {
  const r = await fetch(`${BASE}/studios/${STUDIO}/projects/${project}/photos`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ fileName: name, mimeType: "image/jpeg", byteSize: bytes.byteLength }),
  });
  if (!r.ok) return { status: r.status, body: (await r.json().catch(() => ({}))) as { code?: string } };
  const req = (await r.json()) as { photoId: string; uploadUrl: string };
  await fetch(req.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: new Uint8Array(bytes) });
  await api(`/photos/${req.photoId}/confirm-upload`, { method: "POST", body: "{}" });
  return { status: 200, photoId: req.photoId };
}
async function unlock(kind: string, token: string, password: string) {
  const { grant } = (await (
    await fetch(`${BASE}/${kind}/${token}/unlock`, { method: "POST", headers: J, body: JSON.stringify({ password }) })
  ).json()) as { grant: string };
  return { ...J, "X-Access-Grant": grant };
}
type Album = {
  id: string;
  spreads: { templateId: string; placements: { slotId: string; photoId: string; rotation?: number }[] }[];
};

async function main() {
  const project = await api<{ id: string }>(`/studios/${STUDIO}/projects`, {
    method: "POST",
    body: JSON.stringify({ name: "Flow 2", type: "WEDDING" }),
  });
  const ids: string[] = [];
  const files: Buffer[] = [];
  for (let i = 0; i < 8; i++) {
    const b = await marked(i % 2 ? 1200 : 1800, i % 2 ? 1800 : 1200, i + 3);
    files.push(b);
    const u = await upload(project.id, `p${i}.jpg`, b);
    ids.push(u.photoId!);
  }
  // 1. duplicates
  const again = await upload(project.id, "p0.jpg", files[0]!);
  check(
    "re-uploading the same file is skipped",
    again.status === 409 && again.body?.code === "ALREADY_UPLOADED",
    `${again.status} ${again.body?.code}`,
  );
  const edited = await upload(project.id, "p0.jpg", await marked(2400, 1600, 99));
  check("same name, different file still uploads", edited.status === 200);
  const list = await api<unknown[]>(`/projects/${project.id}/photos`);
  check("the shoot holds 9 photos, not 10", list.length === 9, `${list.length}`);

  // 2. two clients pick different photos
  const picks: Record<string, string[]> = { Ana: [ids[0]!, ids[1]!, ids[2]!], Maria: [ids[2]!, ids[5]!] };
  for (const [name, chosen] of Object.entries(picks)) {
    const link = await api<{ token: string; password: string }>(`/projects/${project.id}/pick-sessions`, {
      method: "POST",
      body: JSON.stringify({ clientName: name }),
    });
    const g = await unlock("pick", link.token, link.password);
    for (const id of chosen)
      await api(`/pick/${link.token}/photos/${id}`, { method: "PUT", body: JSON.stringify({ picked: true }) }, g);
    await api(`/pick/${link.token}/stage`, { method: "POST", body: JSON.stringify({ stage: "FINAL" }) }, g);
    await api(`/pick/${link.token}/submit`, { method: "POST" }, g);
  }
  const sessions = await api<{ clientName: string; pickedPhotoIds: string[]; status: string }[]>(
    `/projects/${project.id}/pick-sessions`,
  );
  for (const [name, chosen] of Object.entries(picks)) {
    const s = sessions.find((x) => x.clientName === name);
    check(
      `${name}'s selection is kept as her own`,
      s?.status === "SUBMITTED" && [...(s?.pickedPhotoIds ?? [])].sort().join() === [...chosen].sort().join(),
      `${s?.pickedPhotoIds.length}`,
    );
  }

  // 3. album, a turned photo, a JPG export to look at
  const album = await api<Album>(`/projects/${project.id}/albums`, {
    method: "POST",
    body: JSON.stringify({ targetSpreads: 3 }),
  });
  const s0 = album.spreads[0]!;
  const target = s0.placements[0]!;
  await api(`/albums/${album.id}`, {
    method: "PATCH",
    body: JSON.stringify({ type: "SET_ROTATION", spreadIndex: 0, slotId: target.slotId, rotation: 90 }),
  });
  const job = await api<{ id: string }>(`/albums/${album.id}/exports`, {
    method: "POST",
    body: JSON.stringify({ printProfileId: "client-proof-150", format: "JPG_ZIP" }),
  });
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) {
    const jobs = await api<{ id: string; status: string }[]>(`/albums/${album.id}/exports`);
    ready = jobs.find((j) => j.id === job.id)?.status === "READY";
    if (!ready) await new Promise((r) => setTimeout(r, 1000));
  }
  check("JPG export with a turned photo finishes", ready);
  const { url } = await api<{ url: string }>(`/exports/${job.id}/download`);
  await writeFile(`${OUT}/export.zip`, Buffer.from(await (await fetch(url)).arrayBuffer()));
  const preview = await api<{ previewUrl: string | null; id: string }[]>(`/projects/${project.id}/photos`);
  const turned = preview.find((p) => p.id === target.photoId);
  if (turned?.previewUrl)
    await writeFile(
      `${OUT}/turned-original-preview.jpg`,
      Buffer.from(await (await fetch(turned.previewUrl)).arrayBuffer()),
    );
  console.log(`  turned photo: ${target.photoId} in spread 1 slot ${target.slotId} (${s0.templateId})`);
  await fetch(`${BASE}/projects/${project.id}`, { method: "DELETE", headers: H });
  console.log(`\n${failures ? `${failures} failed` : "All passed"}`);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

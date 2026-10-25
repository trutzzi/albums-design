import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import Fastify from "fastify";
import sharp from "sharp";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { Project } from "../src/modules/media-ingestion/domain/project";
import { DownloadSession } from "../src/modules/review-collaboration/domain/download-session";
import { DownloadPortalUseCase } from "../src/modules/review-collaboration/application/use-cases/download-portal.use-case";
import { ClientAccessService } from "../src/modules/review-collaboration/application/services/client-access.service";
import type { PickablePhoto } from "../src/modules/review-collaboration/application/ports/pick-gateway";
import type { TeaserImages } from "../src/modules/review-collaboration/application/ports/cover-teaser";
import { MediaIngestionDeliveryGateway } from "../src/modules/review-collaboration/infrastructure/gateways/delivery-gateway";
import {
  SharpTeaserImages,
  TEASER_WIDTH,
} from "../src/modules/review-collaboration/infrastructure/imaging/sharp-teaser-images";
import { registerDownloadRoutes } from "../src/modules/review-collaboration/interface/http/download-routes";
import { ClientGrantSigner } from "../src/shared-kernel/client-grant";
import { SecretBox } from "../src/shared-kernel/secret-box";
import { silentLogger, type Logger } from "../src/shared-kernel/logger";
import { RecordingLogger } from "./support/recording-logger";
import type { StudioBrandingDirectory } from "../src/shared-kernel/studio-branding";
import {
  InMemoryDownloadSessionRepository,
  InMemoryObjectStorage,
  InMemoryPhotoRepository,
  InMemoryProjectRepository,
} from "./support/in-memory";

const SECRET = "test-secret-test-secret-test-secret-123";

async function world(options: { teaser?: boolean; logger?: Logger; failShrink?: boolean } = {}) {
  const projects = new InMemoryProjectRepository();
  const photos = new InMemoryPhotoRepository();
  const staging = new InMemoryObjectStorage();
  const sessions = new InMemoryDownloadSessionRepository();
  const project = Project.create({ studioId: UniqueEntityId.create(), name: "Cristina & Paul", type: "WEDDING" });
  await projects.save(project);

  async function addPhoto(name: string, options: { derivatives?: boolean } = {}) {
    const photo = Photo.requestUpload({
      projectId: project.id,
      studioId: project.studioId,
      fileName: name,
      mimeType: "image/jpeg",
      byteSize: 10,
    });
    photo.markUploaded({ byteSize: 10 });
    staging.upload(photo.storageKey.toString(), new Uint8Array(Buffer.from(`original ${name}`)));
    if (options.derivatives ?? true) {
      photo.markDerivativesReady();
      staging.upload(photo.storageKey.derivative("thumb").toString(), new Uint8Array(Buffer.from(`thumb ${name}`)));
    }
    await photos.save(photo);
    return photo.id.toString();
  }

  const branding = {
    forProject: async () => ({ name: "Studio Lumina", accent: "#2f5d86" }),
  } as unknown as StudioBrandingDirectory;
  const gateway = new MediaIngestionDeliveryGateway(projects, photos, staging, undefined, branding);
  const gallery = {
    listPhotos: async (): Promise<PickablePhoto[]> =>
      (await photos.findByProjectId(project.id)).map((photo) => ({
        id: photo.id.toString(),
        fileName: photo.fileName,
        previewUrl: "",
        thumbnailUrl: "",
        width: 1200,
        height: 800,
      })),
    countProcessing: async () => 0,
  };
  // Records what it was asked to shrink, so a test can see which photo became the teaser.
  const shrunk: string[] = [];
  const images: TeaserImages = {
    shrink: async (image) => {
      if (options.failShrink) throw new Error("corrupt thumbnail");
      shrunk.push(image.toString());
      return Buffer.from("tiny jpeg");
    },
  };
  const access = new ClientAccessService(new SecretBox(SECRET), new ClientGrantSigner(SECRET));
  const portal = new DownloadPortalUseCase(
    sessions,
    gateway,
    { photosDownloaded: async () => {} },
    options.logger ?? silentLogger,
    () => new Date(),
    access,
    gallery,
    options.teaser === false ? {} : { teaser: { source: gateway, images } },
  );

  async function openLink(protectedLink = false, coverPhotoId?: string) {
    const { session, token } = DownloadSession.open({ projectId: project.id, clientName: "Cristina" });
    if (protectedLink) session.protectWith(await access.issue(token));
    if (coverPhotoId) session.chooseCover(coverPhotoId);
    await sessions.save(session);
    return { session, token };
  }

  return { project, photos, staging, sessions, gateway, portal, addPhoto, openLink, shrunk };
}

describe("the teaser image", () => {
  it("is a 32-pixel-wide JPEG, whatever the size of the thumbnail", async () => {
    const thumbnail = await sharp({
      create: { width: 600, height: 400, channels: 3, background: { r: 200, g: 160, b: 120 } },
    })
      .jpeg()
      .toBuffer();
    const teaser = await new SharpTeaserImages().shrink(thumbnail);
    const meta = await sharp(teaser).metadata();
    assert.equal(meta.format, "jpeg");
    assert.equal(meta.width, TEASER_WIDTH);
  });
});

describe("what the password gate may show", () => {
  it("is the studio's name and colour only — never the shoot's name", async () => {
    const w = await world();
    const { token } = await w.openLink(true);
    const gate = (await w.portal.gate(token)).getValue();
    assert.deepEqual(gate, { studioName: "Studio Lumina", accent: "#2f5d86", teaser: true });
    assert.ok(!JSON.stringify(gate).includes("Cristina"));
  });

  it("says there is no teaser when the server has none, and refuses a revoked link", async () => {
    const w = await world({ teaser: false });
    const { token, session } = await w.openLink();
    assert.equal((await w.portal.gate(token)).getValue().teaser, false);
    assert.equal((await w.portal.teaser(token)).getError().code, "NOT_FOUND");
    session.revoke();
    await w.sessions.save(session);
    assert.equal((await w.portal.gate(token)).getError().code, "CONFLICT");
  });

  it("shrinks the cover's thumbnail — the photographer's chosen cover when there is one", async () => {
    const w = await world();
    await w.addPhoto("001.jpg");
    const chosen = await w.addPhoto("002.jpg");
    const { token } = await w.openLink(true, chosen);
    const teaser = (await w.portal.teaser(token)).getValue();
    assert.equal(teaser.toString(), "tiny jpeg");
    assert.deepEqual(w.shrunk, ["thumb 002.jpg"], "the thumbnail, never the original");
  });

  it("makes the teaser once and serves it from memory after that", async () => {
    const w = await world();
    await w.addPhoto("001.jpg");
    const { token } = await w.openLink();
    await w.portal.teaser(token);
    await w.portal.teaser(token);
    assert.equal(w.shrunk.length, 1);
  });

  it("logs a broken thumbnail and lets the gate fall back to the plain lock", async () => {
    const logger = new RecordingLogger();
    const w = await world({ logger, failShrink: true });
    await w.addPhoto("001.jpg");
    const { token } = await w.openLink();
    assert.equal((await w.portal.teaser(token)).getError().code, "NOT_FOUND");
    assert.deepEqual(
      logger.entries.map((entry) => [entry.level, entry.message]),
      [["warn", "could not make the gallery cover teaser"]],
    );
  });

  it("has nothing to show while the cover has no display copies yet", async () => {
    const w = await world();
    await w.addPhoto("001.jpg", { derivatives: false });
    const { token } = await w.openLink();
    assert.equal((await w.portal.teaser(token)).getError().code, "NOT_FOUND");
  });
});

describe("gate routes", () => {
  it("serve the gate and the teaser of a protected link, while the gallery still needs the password", async () => {
    const w = await world();
    await w.addPhoto("001.jpg");
    const { token } = await w.openLink(true);
    const app = Fastify();
    registerDownloadRoutes(app, { downloadAdmin: {} as never, downloadPortal: w.portal });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;

    const gallery = await fetch(`${base}/download/${token}`);
    assert.equal(gallery.status, 401);
    assert.equal(((await gallery.json()) as { code: string }).code, "PASSWORD_REQUIRED");

    const gate = await fetch(`${base}/download/${token}/gate`);
    assert.equal(gate.status, 200);
    assert.equal(((await gate.json()) as { studioName: string }).studioName, "Studio Lumina");

    const teaser = await fetch(`${base}/download/${token}/teaser.jpg`);
    assert.equal(teaser.status, 200);
    assert.equal(teaser.headers.get("content-type"), "image/jpeg");
    assert.equal(teaser.headers.get("cache-control"), "private, max-age=3600");
    assert.equal(Buffer.from(await teaser.arrayBuffer()).toString(), "tiny jpeg");

    assert.equal((await fetch(`${base}/download/unknown-token-value/teaser.jpg`)).status, 404);
    await app.close();
  });
});

describe("reading a thumbnail for the teaser", () => {
  it("reads the display copy and never the original; nothing before display copies exist", async () => {
    const w = await world();
    const ready = await w.addPhoto("001.jpg");
    const pending = await w.addPhoto("002.jpg", { derivatives: false });
    assert.equal((await w.gateway.thumbnail(ready))?.toString(), "thumb 001.jpg");
    assert.equal(await w.gateway.thumbnail(pending), undefined);
    assert.equal(await w.gateway.thumbnail(UniqueEntityId.create().toString()), undefined);
  });
});

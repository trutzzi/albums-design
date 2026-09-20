import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";
import sharp from "sharp";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { Project } from "../src/modules/media-ingestion/domain/project";
import { GenerateDerivativesUseCase } from "../src/modules/media-ingestion/application/use-cases/generate-derivatives/generate-derivatives.use-case";
import { ListProjectPhotosUseCase } from "../src/modules/media-ingestion/application/use-cases/list-project-photos/list-project-photos.use-case";
import { PromoteSelectedPhotosUseCase } from "../src/modules/media-ingestion/application/use-cases/promote-selected/promote-selected.use-case";
import { PurgeExpiredOriginalsUseCase } from "../src/modules/media-ingestion/application/use-cases/purge-expired-originals/purge-expired-originals.use-case";
import { DeleteProjectUseCase } from "../src/modules/media-ingestion/application/use-cases/delete-project/delete-project.use-case";
import { SharpImageResizer } from "../src/modules/media-ingestion/infrastructure/imaging/sharp-image-resizer";
import { AlbumCompositionPlacementDirectory } from "../src/modules/media-ingestion/infrastructure/gateways/album-placement-gateway";
import { ExportPrintDeliveryDirectory } from "../src/modules/media-ingestion/infrastructure/gateways/delivery-gateway";
import { ReviewCollaborationClientPickDirectory } from "../src/modules/media-ingestion/infrastructure/gateways/client-pick-gateway";
import { GenerateAlbumUseCase } from "../src/modules/album-composition/application/use-cases/generate-album/generate-album.use-case";
import { PickSession, PickClosedError, PickLimitError } from "../src/modules/review-collaboration/domain/pick-session";
import { PickSessionAdminUseCase } from "../src/modules/review-collaboration/application/use-cases/open-pick-session.use-case";
import { PickPortalUseCase } from "../src/modules/review-collaboration/application/use-cases/pick-portal.use-case";
import type { PickNotifier } from "../src/modules/review-collaboration/application/ports/pick-gateway";
import { MediaIngestionPickGateway } from "../src/modules/review-collaboration/infrastructure/gateways/pick-gateway";
import { PromoteOnPickNotifier } from "../src/modules/review-collaboration/infrastructure/gateways/promote-on-pick-notifier";
import { registerPickRoutes } from "../src/modules/review-collaboration/interface/http/pick-routes";
import { MediaUrlSigner } from "../src/infrastructure/storage/media-url-signer";
import { InMemoryStorageProvider } from "../src/dev/in-memory-storage-provider";
import { QUEUES } from "../src/shared-kernel/job-queue";
import {
  InMemoryAlbumRepository,
  InMemoryExportJobRepository,
  InMemoryJobQueue,
  InMemoryObjectStorage,
  InMemoryPhotoAnalysisRepository,
  InMemoryPhotoRepository,
  InMemoryPickSessionRepository,
  InMemoryProjectRepository,
  InMemoryReviewSessionRepository,
} from "./support/in-memory";

const DAY = 24 * 60 * 60 * 1000;

async function world() {
  const signer = new MediaUrlSigner("test-secret-test-secret-test-secret-123", "https://api.example.test");
  const permanent = new InMemoryStorageProvider(signer);
  const staging = new InMemoryObjectStorage();
  const photos = new InMemoryPhotoRepository();
  const projects = new InMemoryProjectRepository();
  const albums = new InMemoryAlbumRepository();
  const exportJobs = new InMemoryExportJobRepository();
  const pickSessions = new InMemoryPickSessionRepository();

  const studio = UniqueEntityId.create();
  const project = Project.create({ studioId: studio, name: "Elena & Radu", type: "WEDDING" });
  await projects.save(project);

  const original = await sharp({
    create: { width: 2400, height: 1600, channels: 3, background: { r: 90, g: 60, b: 30 } },
  })
    .jpeg({ quality: 88 })
    .toBuffer();

  /** A photo whose display copies exist — the only kind a client can be shown. */
  async function addPhoto(name: string, projectRef = project, { derived = true } = {}) {
    const photo = Photo.requestUpload({
      projectId: projectRef.id,
      studioId: projectRef.studioId,
      fileName: name,
      mimeType: "image/jpeg",
      byteSize: original.byteLength,
    });
    staging.upload(photo.storageKey.toString(), new Uint8Array(original));
    photo.markUploaded({ byteSize: original.byteLength });
    await photos.save(photo);
    if (derived) {
      await new GenerateDerivativesUseCase(photos, staging, new SharpImageResizer(), permanent).execute({
        photoId: photo.id.toString(),
      });
    }
    return photo;
  }

  const gateway = new MediaIngestionPickGateway(
    projects,
    photos,
    new ListProjectPhotosUseCase(photos, staging, permanent),
  );
  const notified: Parameters<PickNotifier["picksSubmitted"]>[0][] = [];
  const notifier: PickNotifier = { picksSubmitted: async (params) => void notified.push(params) };
  const admin = new PickSessionAdminUseCase(pickSessions, gateway);
  const portal = new PickPortalUseCase(pickSessions, gateway, notifier);

  const placements = new AlbumCompositionPlacementDirectory(albums);
  const clientPicks = new ReviewCollaborationClientPickDirectory(pickSessions);
  const promoter = new PromoteSelectedPhotosUseCase(photos, staging, permanent, placements, undefined, clientPicks);

  async function openLink(options: { pickLimit?: number } = {}) {
    const opened = await admin.open({ projectId: project.id.toString(), clientName: "Elena", ...options });
    return opened.getValue();
  }

  return {
    permanent, staging, photos, projects, albums, exportJobs, pickSessions, project, addPhoto,
    gateway, admin, portal, notified, promoter, clientPicks, placements, openLink, original,
  };
}

describe("PickSession", () => {
  const open = (pickLimit?: number) =>
    PickSession.open({ projectId: UniqueEntityId.create(), clientName: "Elena", ...(pickLimit ? { pickLimit } : {}) }).session;

  it("picks and un-picks idempotently", () => {
    const session = open();
    session.setPick("a", true);
    session.setPick("a", true);
    session.setPick("b", true);
    session.setPick("zzz", false);
    assert.deepEqual([...session.pickedPhotoIds], ["a", "b"]);
    session.setPick("a", false);
    assert.deepEqual([...session.pickedPhotoIds], ["b"]);
  });

  it("refuses a pick beyond the limit, but still lets one be swapped", () => {
    const session = open(2);
    session.setPick("a", true);
    session.setPick("b", true);
    assert.throws(() => session.setPick("c", true), PickLimitError);
    session.setPick("a", false);
    session.setPick("c", true);
    assert.deepEqual([...session.pickedPhotoIds], ["b", "c"]);
  });

  it("will not submit an empty selection, and freezes once submitted", () => {
    const session = open();
    assert.throws(() => session.submit(), /at least one/);
    session.setPick("a", true);
    session.submit();
    assert.equal(session.status, "SUBMITTED");
    assert.ok(session.submittedAt);
    assert.throws(() => session.setPick("b", true), PickClosedError);
  });

  it("lets the photographer reopen a sent selection, and never a revoked one", () => {
    const session = open();
    session.setPick("a", true);
    session.submit();
    session.reopen();
    assert.equal(session.status, "OPEN");
    session.setPick("b", true);
    session.revoke();
    assert.throws(() => session.reopen(), PickClosedError);
  });

  it("stores only a hash of the token", () => {
    const { session, token } = PickSession.open({ projectId: UniqueEntityId.create(), clientName: "E" });
    assert.notEqual(session.tokenHash, token);
    assert.ok(session.matchesToken(token));
    assert.equal(session.matchesToken("nope"), false);
  });
});

describe("client pick portal", () => {
  it("shows the shoot's ready photos with display copies only", async () => {
    const w = await world();
    await w.addPhoto("a.jpg");
    await w.addPhoto("b.jpg");
    await w.addPhoto("still-processing.jpg", w.project, { derived: false });
    const link = await w.openLink();

    const view = (await w.portal.view(link.token)).getValue();
    assert.equal(view.projectName, "Elena & Radu");
    assert.deepEqual(view.photos.map((photo) => photo.fileName).sort(), ["a.jpg", "b.jpg"]);
    // Nothing the client is handed may point at the full-resolution original.
    const keyOf = (url: string) => {
      const payload = url.split("/media/")[1]!.split(".")[1]!;
      return JSON.parse(Buffer.from(payload, "base64url").toString()).sub as string;
    };
    for (const photo of view.photos) {
      assert.match(keyOf(photo.previewUrl), /\/derivatives\/.*-preview\.jpg$/);
      assert.match(keyOf(photo.thumbnailUrl), /\/derivatives\/.*-thumb\.jpg$/);
    }
  });

  it("records picks and un-picks, respecting the limit", async () => {
    const w = await world();
    const a = await w.addPhoto("a.jpg");
    const b = await w.addPhoto("b.jpg");
    const link = await w.openLink({ pickLimit: 1 });

    const first = await w.portal.setPick(link.token, a.id.toString(), true);
    assert.deepEqual(first.getValue().pickedPhotoIds, [a.id.toString()]);

    const over = await w.portal.setPick(link.token, b.id.toString(), true);
    assert.ok(over.isFailure);
    assert.equal(over.getError().code, "CONFLICT");

    const dropped = await w.portal.setPick(link.token, a.id.toString(), false);
    assert.deepEqual(dropped.getValue().pickedPhotoIds, []);
  });

  it("rejects a photo that belongs to another shoot", async () => {
    const w = await world();
    const other = Project.create({ studioId: UniqueEntityId.create(), name: "Someone else", type: "EVENT" });
    await w.projects.save(other);
    const foreign = await w.addPhoto("foreign.jpg", other);
    const link = await w.openLink();

    const result = await w.portal.setPick(link.token, foreign.id.toString(), true);
    assert.ok(result.isFailure);
    assert.equal(result.getError().code, "NOT_FOUND");
  });

  it("submits once, tells the notifier exactly what was picked, and then locks", async () => {
    const w = await world();
    const a = await w.addPhoto("a.jpg");
    await w.addPhoto("b.jpg");
    const link = await w.openLink();

    assert.ok((await w.portal.submit(link.token)).isFailure, "an empty selection cannot be sent");

    await w.portal.setPick(link.token, a.id.toString(), true);
    const sent = await w.portal.submit(link.token);
    assert.equal(sent.getValue().status, "SUBMITTED");
    assert.equal(w.notified.length, 1);
    assert.deepEqual(w.notified[0]?.photoIds, [a.id.toString()]);
    assert.equal(w.notified[0]?.projectId, w.project.id.toString());

    const after = await w.portal.setPick(link.token, a.id.toString(), false);
    assert.ok(after.isFailure);
    assert.equal(after.getError().code, "CONFLICT");
  });

  it("drops a pick whose photo was deleted instead of reporting a phantom", async () => {
    const w = await world();
    const a = await w.addPhoto("a.jpg");
    const b = await w.addPhoto("b.jpg");
    const link = await w.openLink();
    await w.portal.setPick(link.token, a.id.toString(), true);
    await w.portal.setPick(link.token, b.id.toString(), true);
    await w.photos.delete(b.id);

    const view = (await w.portal.view(link.token)).getValue();
    assert.deepEqual(view.session.pickedPhotoIds, [a.id.toString()]);

    await w.portal.submit(link.token);
    assert.deepEqual(w.notified[0]?.photoIds, [a.id.toString()]);
  });

  it("answers an unknown token with not-found and a revoked link with a conflict", async () => {
    const w = await world();
    const link = await w.openLink();
    const unknown = await w.portal.view("definitely-not-a-real-token");
    assert.equal(unknown.getError().code, "NOT_FOUND");

    await w.admin.revoke(w.project.id.toString(), link.sessionId);
    const revoked = await w.portal.view(link.token);
    assert.equal(revoked.getError().code, "CONFLICT");
  });
});

describe("photographer's pick-link administration", () => {
  it("lists links with their counts, newest first", async () => {
    const w = await world();
    const a = await w.addPhoto("a.jpg");
    const first = await w.openLink({ pickLimit: 40 });
    await w.portal.setPick(first.token, a.id.toString(), true);

    const listed = await w.admin.list(w.project.id.toString());
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.pickedCount, 1);
    assert.equal(listed[0]?.pickLimit, 40);
    assert.deepEqual(listed[0]?.pickedPhotoIds, [a.id.toString()]);
  });

  it("will not let another shoot's id reopen or revoke a link", async () => {
    const w = await world();
    const link = await w.openLink();
    const stranger = UniqueEntityId.create().toString();

    assert.equal((await w.admin.revoke(stranger, link.sessionId)).getError().code, "NOT_FOUND");
    assert.equal((await w.admin.reopen(stranger, link.sessionId)).getError().code, "NOT_FOUND");
  });

  it("reopens a sent selection so the client can amend it", async () => {
    const w = await world();
    const a = await w.addPhoto("a.jpg");
    const link = await w.openLink();
    await w.portal.setPick(link.token, a.id.toString(), true);
    await w.portal.submit(link.token);

    const reopened = await w.admin.reopen(w.project.id.toString(), link.sessionId);
    assert.equal(reopened.getValue().status, "OPEN");
    assert.ok((await w.portal.setPick(link.token, a.id.toString(), false)).isSuccess);
  });

  it("refuses to open a link for a shoot that does not exist", async () => {
    const w = await world();
    const result = await w.admin.open({ projectId: UniqueEntityId.create().toString(), clientName: "X" });
    assert.equal(result.getError().code, "NOT_FOUND");
  });
});

describe("picks and the two-tier storage pipeline", () => {
  it("promotes only *submitted* picks to long-term storage", async () => {
    const w = await world();
    const sent = await w.addPhoto("sent.jpg");
    const draft = await w.addPhoto("draft.jpg");
    const submittedLink = await w.openLink();
    await w.portal.setPick(submittedLink.token, sent.id.toString(), true);
    await w.portal.submit(submittedLink.token);
    const draftLink = await w.openLink();
    await w.portal.setPick(draftLink.token, draft.id.toString(), true);

    const result = await w.promoter.executePicked({ projectId: w.project.id.toString() });
    assert.equal(result.getValue().promoted, 1);
    assert.ok(await w.permanent.head(sent.storageKey.toString()));
    assert.equal(await w.permanent.head(draft.storageKey.toString()), undefined);
    assert.ok((await w.photos.findById(sent.id))?.fullResStoredAt);
  });

  it("queues the promotion when a client submits, and survives the queue being down", async () => {
    const w = await world();
    const jobs = new InMemoryJobQueue();
    const a = await w.addPhoto("a.jpg");
    const portal = new PickPortalUseCase(w.pickSessions, w.gateway, new PromoteOnPickNotifier({ picksSubmitted: async () => {} }, jobs));
    const link = await w.openLink();
    await portal.setPick(link.token, a.id.toString(), true);
    await portal.submit(link.token);
    assert.deepEqual(jobs.jobs.at(-1), {
      queue: QUEUES.storage,
      name: "promote-picked",
      payload: { projectId: w.project.id.toString() },
    });

    const failing = { enqueue: async () => { throw new Error("redis down"); } } as unknown as InMemoryJobQueue;
    const logged: string[] = [];
    const resilient = new PickPortalUseCase(
      w.pickSessions,
      w.gateway,
      new PromoteOnPickNotifier({ picksSubmitted: async () => {} }, failing, (message) => logged.push(message)),
    );
    const second = await w.openLink();
    await resilient.setPick(second.token, a.id.toString(), true);
    const submitted = await resilient.submit(second.token);
    assert.ok(submitted.isSuccess, "the client's submission must not fail because Redis blinked");
    assert.equal(logged.length, 1);
  });

  it("retention keeps a picked photo the sweep has to promote first, and purges the rest", async () => {
    const w = await world();
    const picked = await w.addPhoto("picked.jpg");
    const rest = await w.addPhoto("rest.jpg");
    const link = await w.openLink();
    await w.portal.setPick(link.token, picked.id.toString(), true);
    await w.portal.submit(link.token);

    // Delivered 31 days ago through an album that does not even contain the pick.
    const now = new Date();
    const { ExportJob } = await import("../src/modules/export-print/domain/export-job");
    const { Album } = await import("../src/modules/album-composition/domain/album");
    const album = Album.create({ projectId: w.project.id, title: "A", spreads: [] });
    await w.albums.save(album);
    await w.exportJobs.save(
      ExportJob.reconstitute(
        {
          albumId: album.id,
          printProfileId: "lab-standard-300",
          status: "READY",
          storageKey: "exports/x.pdf",
          byteSize: 1,
          pageCount: 1,
          failureReason: undefined,
          requestedAt: new Date(now.getTime() - 31 * DAY),
          completedAt: new Date(now.getTime() - 31 * DAY),
        },
        UniqueEntityId.create(),
      ),
    );

    const sweep = new PurgeExpiredOriginalsUseCase(
      w.projects,
      w.photos,
      w.staging,
      new ExportPrintDeliveryDirectory(w.exportJobs, w.albums),
      w.placements,
      w.promoter,
      30,
      () => now,
      w.clientPicks,
    );
    const summary = await sweep.execute();

    assert.equal(summary.purged, 2);
    assert.ok(await w.permanent.head(picked.storageKey.toString()), "the picked original was saved before its staged copy was deleted");
    assert.equal(w.staging.objects.has(picked.storageKey.toString()), false);
    assert.equal(await w.permanent.head(rest.storageKey.toString()), undefined);
  });

  it("deleting a shoot removes its selection links too", async () => {
    const w = await world();
    const a = await w.addPhoto("a.jpg");
    const link = await w.openLink();
    await w.portal.setPick(link.token, a.id.toString(), true);

    const result = await new DeleteProjectUseCase(
      w.projects,
      w.photos,
      w.staging,
      new InMemoryPhotoAnalysisRepository(),
      w.albums,
      w.exportJobs,
      { delete: async () => {} } as never,
      new InMemoryReviewSessionRepository(),
      w.permanent,
      w.pickSessions,
    ).execute({ projectId: w.project.id.toString() });

    assert.ok(result.isSuccess);
    assert.equal((await w.admin.list(w.project.id.toString())).length, 0);
  });
});

describe("building an album from a client's picks", () => {
  it("uses exactly the picked photos, even ones the auto-selector would have dropped", async () => {
    const w = await world();
    const candidates = ["a", "b", "c", "d"].map((id, index) => ({
      photoId: id,
      score: index === 3 ? 20 : 90,
      category: "PORTRAIT",
      orientation: "LANDSCAPE" as const,
      capturedAt: index * 60_000,
    }));
    const albums = new InMemoryAlbumRepository();
    const useCase = new GenerateAlbumUseCase(
      albums,
      { findProject: async () => ({ id: w.project.id.toString(), name: "Elena & Radu", studioId: "studio" }) },
      { listForProject: async () => candidates },
      { ensureCanCreateAlbum: async () => ({ allowed: true }), recordAlbumCreated: async () => {} },
    );

    const picks = ["c", "d"];
    const result = await useCase.execute({ projectId: w.project.id.toString(), photoIds: picks });
    const album = result.getValue();
    const placed = album.spreads.flatMap((spread) => spread.placements.map((placement) => placement.photoId));
    assert.deepEqual([...placed].sort(), picks, "the low-scoring pick is kept and the unpicked ones are left out");

    const untouched = (await useCase.execute({ projectId: w.project.id.toString() })).getValue();
    const all = untouched.spreads.flatMap((spread) => spread.placements.map((placement) => placement.photoId));
    assert.equal(all.includes("d"), false, "without picks the low-scoring frame is still filtered out");
  });

  it("explains itself when none of the picks has been analysed yet", async () => {
    const w = await world();
    const useCase = new GenerateAlbumUseCase(
      new InMemoryAlbumRepository(),
      { findProject: async () => ({ id: w.project.id.toString(), name: "x", studioId: "studio" }) },
      { listForProject: async () => [] },
      { ensureCanCreateAlbum: async () => ({ allowed: true }), recordAlbumCreated: async () => {} },
    );
    const result = await useCase.execute({ projectId: w.project.id.toString(), photoIds: ["nope"] });
    assert.match(result.getError().message, /chosen photos/);
  });
});

describe("pick routes", () => {
  it("serves the public client surface end to end", async () => {
    const w = await world();
    const a = await w.addPhoto("a.jpg");
    const link = await w.openLink();
    const app = Fastify();
    registerPickRoutes(app, { pickAdmin: w.admin, pickPortal: w.portal });

    const view = await app.inject({ method: "GET", url: `/pick/${link.token}` });
    assert.equal(view.statusCode, 200);
    assert.equal(view.json().photos.length, 1);

    const picked = await app.inject({
      method: "PUT",
      url: `/pick/${link.token}/photos/${a.id.toString()}`,
      payload: { picked: true },
    });
    assert.equal(picked.statusCode, 200);
    assert.deepEqual(picked.json().pickedPhotoIds, [a.id.toString()]);

    const submitted = await app.inject({ method: "POST", url: `/pick/${link.token}/submit` });
    assert.equal(submitted.json().status, "SUBMITTED");

    const locked = await app.inject({
      method: "PUT",
      url: `/pick/${link.token}/photos/${a.id.toString()}`,
      payload: { picked: false },
    });
    assert.equal(locked.statusCode, 409);

    assert.equal((await app.inject({ method: "GET", url: "/pick/unknown-token-value" })).statusCode, 404);
    await app.close();
  });
});

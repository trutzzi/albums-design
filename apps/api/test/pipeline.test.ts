import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { UniqueEntityId } from "@albumflow/domain-kernel";

import { Project } from "../src/modules/media-ingestion/domain/project";
import { RequestUploadUseCase } from "../src/modules/media-ingestion/application/use-cases/request-upload/request-upload.use-case";
import { ConfirmUploadUseCase } from "../src/modules/media-ingestion/application/use-cases/confirm-upload/confirm-upload.use-case";
import { AnalyzePhotoUseCase } from "../src/modules/photo-intelligence/application/use-cases/analyze-photo/analyze-photo.use-case";
import { SharpImageInspector } from "../src/modules/photo-intelligence/infrastructure/vision/sharp-image-inspector";
import { HeuristicVisionClassifier } from "../src/modules/photo-intelligence/infrastructure/vision/heuristic-vision-classifier";
import { MediaIngestionPhotoLifecycle } from "../src/modules/photo-intelligence/infrastructure/gateways/photo-lifecycle-gateway";
import { GenerateAlbumUseCase } from "../src/modules/album-composition/application/use-cases/generate-album/generate-album.use-case";
import { EditAlbumUseCase } from "../src/modules/album-composition/application/use-cases/edit-album/edit-album.use-case";
import {
  MediaIngestionProjectDirectory,
  PhotoIntelligenceDirectory,
} from "../src/modules/album-composition/infrastructure/gateways/directories";
import { OpenReviewSessionUseCase } from "../src/modules/review-collaboration/application/use-cases/open-review-session.use-case";
import { ReviewPortalUseCase } from "../src/modules/review-collaboration/application/use-cases/review-portal.use-case";
import {
  AlbumCompositionGateway,
  LoggingReviewNotifier,
} from "../src/modules/review-collaboration/infrastructure/gateways/album-gateway";
import { RequestExportUseCase } from "../src/modules/export-print/application/use-cases/request-export.use-case";
import { RunExportUseCase } from "../src/modules/export-print/application/use-cases/run-export.use-case";
import {
  AlbumCompositionExportGateway,
  StoredPhotoResolver,
} from "../src/modules/export-print/infrastructure/gateways/album-gateway";
import { PdfAlbumRenderer } from "../src/modules/export-print/infrastructure/rendering/pdf-album-renderer";
import { StudioAdministrationUseCase } from "../src/modules/identity/application/use-cases/studio-administration.use-case";
import { SubscriptionQuotaPolicy } from "../src/modules/identity/application/subscription-quota-policy";
import { MM_TO_POINTS } from "../src/modules/export-print/domain/print-profile";

import {
  InMemoryAlbumRepository,
  InMemoryExportJobRepository,
  InMemoryJobQueue,
  InMemoryObjectStorage,
  InMemoryPhotoAnalysisRepository,
  InMemoryPhotoRepository,
  InMemoryProjectRepository,
  InMemoryReviewSessionRepository,
  InMemoryStudioMemberRepository,
  InMemoryStudioRepository,
  InMemorySubscriptionRepository,
} from "./support/in-memory";

const PHOTO_COUNT = 12;

function seededPixels(width: number, height: number, seed: number): Buffer {
  const data = Buffer.alloc(width * height * 3);
  let state = seed;
  for (let i = 0; i < data.length; i += 1) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    data[i] = state % 256;
  }
  return data;
}

async function makePhoto(index: number): Promise<Buffer> {
  const landscape = index % 3 !== 0;
  const width = landscape ? 480 : 320;
  const height = landscape ? 320 : 480;
  return sharp(seededPixels(width, height, 1000 + index * 77), {
    raw: { width, height, channels: 3 },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

function buildWorld() {
  const studios = new InMemoryStudioRepository();
  const subscriptions = new InMemorySubscriptionRepository();
  const members = new InMemoryStudioMemberRepository();
  const projects = new InMemoryProjectRepository();
  const photos = new InMemoryPhotoRepository();
  const analyses = new InMemoryPhotoAnalysisRepository();
  const albums = new InMemoryAlbumRepository();
  const reviews = new InMemoryReviewSessionRepository();
  const exports = new InMemoryExportJobRepository();
  const storage = new InMemoryObjectStorage();
  const queue = new InMemoryJobQueue();

  const administration = new StudioAdministrationUseCase(studios, subscriptions, members);
  const quota = new SubscriptionQuotaPolicy(subscriptions);
  const reviewGateway = new AlbumCompositionGateway(albums);
  const exportGateway = new AlbumCompositionExportGateway(albums);

  return {
    studios,
    subscriptions,
    members,
    projects,
    photos,
    analyses,
    albums,
    reviews,
    exports,
    storage,
    queue,
    administration,
    quota,
    requestUpload: new RequestUploadUseCase(projects, photos, storage),
    confirmUpload: new ConfirmUploadUseCase(photos, storage, queue),
    analyzePhoto: new AnalyzePhotoUseCase(
      analyses,
      storage,
      new SharpImageInspector(),
      new HeuristicVisionClassifier(),
      new MediaIngestionPhotoLifecycle(photos),
    ),
    generateAlbum: new GenerateAlbumUseCase(
      albums,
      new MediaIngestionProjectDirectory(projects),
      new PhotoIntelligenceDirectory(analyses),
      quota,
    ),
    editAlbum: new EditAlbumUseCase(albums),
    openReview: new OpenReviewSessionUseCase(reviews, reviewGateway),
    reviewPortal: new ReviewPortalUseCase(reviews, reviewGateway, new LoggingReviewNotifier(() => {})),
    requestExport: new RequestExportUseCase(exports, exportGateway, queue),
    runExport: new RunExportUseCase(
      exports,
      exportGateway,
      new PdfAlbumRenderer(new StoredPhotoResolver(photos, storage)),
      storage,
    ),
  };
}

describe("upload → analysis → album → review → export", () => {
  let world: ReturnType<typeof buildWorld>;
  let studioId: string;
  let projectId: string;
  let images: Buffer[];

  before(async () => {
    images = await Promise.all(
      Array.from({ length: PHOTO_COUNT }, (_, index) => makePhoto(index)),
    );
  });

  it("runs the whole flow and produces a print-ready PDF", async () => {
    world = buildWorld();

    // --- Epic 7: a studio exists with a plan that allows albums ---
    const onboarded = await world.administration.onboard({
      name: "Golden Hour Photography",
      ownerEmail: "studio@example.com",
    });
    assert.ok(onboarded.isSuccess);
    studioId = onboarded.getValue().studioId;
    assert.ok(onboarded.getValue().apiKey.startsWith("af_"));

    const subscription = await world.subscriptions.findByStudioId(
      UniqueEntityId.create(studioId),
    );
    subscription?.changePlan("STUDIO");
    if (subscription) await world.subscriptions.save(subscription);

    const project = Project.create({
      studioId: UniqueEntityId.create(studioId),
      name: "Maria & Andrei",
      type: "WEDDING",
    });
    await world.projects.save(project);
    projectId = project.id.toString();

    // --- Epic 1: upload each frame through presign → PUT → confirm ---
    for (const [index, image] of images.entries()) {
      const requested = await world.requestUpload.execute({
        studioId,
        projectId,
        fileName: `frame-${index}.jpg`,
        mimeType: "image/jpeg",
        byteSize: image.byteLength,
      });
      assert.ok(requested.isSuccess, "upload request failed");
      const { photoId, storageKey } = requested.getValue();

      world.storage.upload(storageKey, image);

      const confirmed = await world.confirmUpload.execute({ photoId });
      assert.ok(confirmed.isSuccess, "confirm failed");
      assert.equal(confirmed.getValue().status, "ANALYSIS_QUEUED");
    }

    const analysisJobs = world.queue.drain("photo-intelligence");
    assert.equal(analysisJobs.length, PHOTO_COUNT, "one analysis job per photo");

    // --- Epic 2: the worker drains the queue through the real analyser ---
    for (const job of analysisJobs) {
      const result = await world.analyzePhoto.execute({
        photoId: String(job.payload.photoId),
        projectId: String(job.payload.projectId),
        storageKey: String(job.payload.storageKey),
      });
      assert.ok(result.isSuccess, "analysis failed");
    }
    assert.equal(world.analyses.items.size, PHOTO_COUNT);

    // Analysis must close out the upload state machine, not leave it queued forever.
    const analysedPhotos = await world.photos.findByProjectId(UniqueEntityId.create(projectId));
    assert.equal(
      analysedPhotos.every((photo) => photo.status === "ANALYSED"),
      true,
      `photos left queued: ${analysedPhotos.map((p) => p.status).join(", ")}`,
    );

    // --- Epic 3: generate the album ---
    const generated = await world.generateAlbum.execute({ projectId, targetSpreads: 4 });
    assert.ok(generated.isSuccess, `generation failed: ${generated.isFailure && generated.getError().message}`);
    const album = generated.getValue();
    assert.ok(album.spreadCount >= 1);
    assert.ok(album.photoCount >= 1);
    assert.equal(album.status, "DRAFT");

    const usage = await world.subscriptions.findByStudioId(UniqueEntityId.create(studioId));
    assert.equal(usage?.albumsUsed, 1, "album generation should consume quota");

    // --- Epic 4: the photographer edits the draft ---
    const albumId = album.id.toString();
    const originalFirstPhoto = album.spreads[0]?.placements[0]?.photoId;
    const replacement = [...world.photos.items.values()].find(
      (photo) => photo.id.toString() !== originalFirstPhoto,
    );
    assert.ok(replacement);

    const swapped = await world.editAlbum.execute(albumId, {
      type: "SWAP_PHOTO",
      spreadIndex: 0,
      slotId: album.spreads[0]?.placements[0]?.slotId ?? "",
      photoId: replacement.id.toString(),
    });
    assert.ok(swapped.isSuccess, "swap failed");
    assert.equal(swapped.getValue().spreads[0]?.placements[0]?.photoId, replacement.id.toString());

    const retemplated = await world.editAlbum.execute(albumId, {
      type: "CHANGE_TEMPLATE",
      spreadIndex: 0,
      templateId: "quad",
    });
    assert.ok(retemplated.isSuccess, "template change failed");
    assert.equal(retemplated.getValue().spreads[0]?.placements.length, 4);

    // --- Epic 5: client review ---
    const opened = await world.openReview.execute({ albumId, clientName: "Maria" });
    assert.ok(opened.isSuccess, "opening review failed");
    const token = opened.getValue().token;

    const viewed = await world.reviewPortal.view(token);
    assert.ok(viewed.isSuccess, "client could not open the link");
    assert.equal(viewed.getValue().album.id, albumId);
    assert.equal(viewed.getValue().session.status, "OPEN");

    const commented = await world.reviewPortal.comment(token, {
      spreadIndex: 0,
      body: "Could we use the one from the church steps here?",
    });
    assert.ok(commented.isSuccess);
    assert.equal(commented.getValue().session.comments.length, 1);

    const approved = await world.reviewPortal.decide(token, "APPROVED");
    assert.ok(approved.isSuccess, "approval failed");
    assert.equal(approved.getValue().session.status, "APPROVED");

    const storedAlbum = await world.albums.findById(UniqueEntityId.create(albumId));
    assert.equal(storedAlbum?.status, "APPROVED");

    // --- Epic 6: export ---
    const exportRequested = await world.requestExport.execute({ albumId });
    assert.ok(exportRequested.isSuccess, "export request failed");
    assert.equal(exportRequested.getValue().status, "QUEUED");

    const renderJobs = world.queue.drain("album-export");
    assert.equal(renderJobs.length, 1);

    const ran = await world.runExport.execute(String(renderJobs[0]?.payload.exportJobId));
    assert.ok(ran.isSuccess);
    const finished = ran.getValue();
    assert.equal(finished.status, "READY", `export failed: ${finished.failureReason}`);
    assert.ok((finished.byteSize ?? 0) > 1000, "PDF looks suspiciously small");

    // --- the artifact itself ---
    const pdfBytes = await world.storage.read(finished.storageKey ?? "");
    assert.equal(Buffer.from(pdfBytes.slice(0, 5)).toString(), "%PDF-");

    const pdf = await PDFDocument.load(pdfBytes);
    assert.equal(pdf.getPageCount(), storedAlbum?.spreadCount);

    // A 300mm square page, printed as a spread with 3mm bleed all round.
    const { width, height } = pdf.getPage(0).getSize();
    const expectedWidth = (300 * 2 + 3 * 2) * MM_TO_POINTS;
    const expectedHeight = (300 + 3 * 2) * MM_TO_POINTS;
    assert.ok(Math.abs(width - expectedWidth) < 1, `spread width was ${width}`);
    assert.ok(Math.abs(height - expectedHeight) < 1, `spread height was ${height}`);
  });

  it("blocks album generation once the plan's quota is spent", async () => {
    const fresh = buildWorld();
    const onboarded = await fresh.administration.onboard({
      name: "Solo Shooter",
      ownerEmail: "solo@example.com",
    });
    const soloStudioId = onboarded.getValue().studioId;

    const project = Project.create({
      studioId: UniqueEntityId.create(soloStudioId),
      name: "Trial wedding",
      type: "WEDDING",
    });
    await fresh.projects.save(project);

    // Analysis results are enough to make generation viable.
    for (const [index, image] of images.entries()) {
      const requested = await fresh.requestUpload.execute({
        studioId: soloStudioId,
        projectId: project.id.toString(),
        fileName: `f${index}.jpg`,
        mimeType: "image/jpeg",
        byteSize: image.byteLength,
      });
      const { photoId, storageKey } = requested.getValue();
      fresh.storage.upload(storageKey, image);
      await fresh.confirmUpload.execute({ photoId });
    }
    for (const job of fresh.queue.drain("photo-intelligence")) {
      await fresh.analyzePhoto.execute({
        photoId: String(job.payload.photoId),
        projectId: String(job.payload.projectId),
        storageKey: String(job.payload.storageKey),
      });
    }

    // The trial plan covers exactly one album.
    const first = await fresh.generateAlbum.execute({ projectId: project.id.toString() });
    assert.ok(first.isSuccess, "the first album should be allowed on trial");

    const second = await fresh.generateAlbum.execute({ projectId: project.id.toString() });
    assert.ok(second.isFailure, "the second album should hit the trial quota");
    assert.equal(second.getError().code, "CONFLICT");
    assert.match(second.getError().message, /albums per month|quota/i);
  });
});

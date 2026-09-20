import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { Project } from "../src/modules/media-ingestion/domain/project";
import { ListProjectPhotosUseCase } from "../src/modules/media-ingestion/application/use-cases/list-project-photos/list-project-photos.use-case";
import { GenerateDerivativesUseCase } from "../src/modules/media-ingestion/application/use-cases/generate-derivatives/generate-derivatives.use-case";
import { SharpImageResizer } from "../src/modules/media-ingestion/infrastructure/imaging/sharp-image-resizer";
import { MediaIngestionPickGateway } from "../src/modules/review-collaboration/infrastructure/gateways/pick-gateway";
import { MediaIngestionDeliveryGateway } from "../src/modules/review-collaboration/infrastructure/gateways/delivery-gateway";
import { compareFileNames } from "../src/shared-kernel/natural-order";
import { InMemoryObjectStorage, InMemoryPhotoRepository, InMemoryProjectRepository } from "./support/in-memory";

async function world() {
  const staging = new InMemoryObjectStorage();
  const photos = new InMemoryPhotoRepository();
  const projects = new InMemoryProjectRepository();
  const project = Project.create({ studioId: UniqueEntityId.create(), name: "Shoot", type: "WEDDING" });
  await projects.save(project);
  const jpeg = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#456" } }).jpeg().toBuffer();

  async function add(fileName: string, state: "processed" | "uploaded" | "pending" = "uploaded") {
    const photo = Photo.requestUpload({
      projectId: project.id,
      studioId: project.studioId,
      fileName,
      mimeType: "image/jpeg",
      byteSize: jpeg.byteLength,
    });
    if (state !== "pending") {
      staging.upload(photo.storageKey.toString(), new Uint8Array(jpeg));
      photo.markUploaded({ byteSize: jpeg.byteLength });
    }
    await photos.save(photo);
    if (state === "processed") {
      await new GenerateDerivativesUseCase(photos, staging, new SharpImageResizer()).execute({ photoId: photo.id.toString() });
    }
    return photo;
  }
  return { staging, photos, projects, project, add, list: new ListProjectPhotosUseCase(photos, staging) };
}

const SORTED = ["DSC_0001.jpg", "DSC_0002.jpg", "DSC_0010.jpg", "DSC_0100.jpg"];
const SCRAMBLED = ["DSC_0010.jpg", "DSC_0002.jpg", "DSC_0100.jpg", "DSC_0001.jpg"];

describe("natural file-name order", () => {
  it("sorts by the numbers in names, ignores case, and is deterministic for identical names", () => {
    const rows = ["IMG_10.jpg", "img_2.JPG", "IMG_1.jpg"].map((fileName, i) => ({ fileName, id: `id${i}` }));
    assert.deepEqual(rows.sort(compareFileNames).map((r) => r.fileName), ["IMG_1.jpg", "img_2.JPG", "IMG_10.jpg"]);
    assert.ok(compareFileNames({ fileName: "a.jpg", id: "1" }, { fileName: "a.jpg", id: "2" }) < 0);
  });
});

describe("photo listing order", () => {
  it("lists the shoot in file-name order, however the uploads happened to finish", async () => {
    const w = await world();
    for (const n of SCRAMBLED) await w.add(n);
    const views = await w.list.execute(w.project.id.toString());
    assert.deepEqual(views.map((v) => v.fileName), SORTED);
  });

  it("gives the client's gallery the same order", async () => {
    const w = await world();
    for (const n of SCRAMBLED) await w.add(n, "processed");
    const gateway = new MediaIngestionPickGateway(w.projects, w.photos, w.list);
    const shown = await gateway.listPhotos(w.project.id.toString());
    assert.deepEqual(shown.map((p) => p.fileName), SORTED);
  });

  it("puts the download zip in the same order", async () => {
    const w = await world();
    for (const n of SCRAMBLED) await w.add(n);
    const gateway = new MediaIngestionDeliveryGateway(w.projects, w.photos, w.staging);
    const { available } = await gateway.listDeliverable(w.project.id.toString());
    assert.deepEqual(available.map((p) => p.fileName), SORTED);
  });
});

describe("client gallery progress", () => {
  it("counts photos still being prepared — not unfinished uploads, not finished photos", async () => {
    const w = await world();
    await w.add("done.jpg", "processed");
    await w.add("waiting1.jpg");
    await w.add("waiting2.jpg");
    await w.add("never-finished.jpg", "pending");
    const gateway = new MediaIngestionPickGateway(w.projects, w.photos, w.list);
    assert.equal(await gateway.countProcessing(w.project.id.toString()), 2);
    assert.equal((await gateway.listPhotos(w.project.id.toString())).length, 1);
  });
});

describe("display copies", () => {
  it("still produces a 1600px preview and a 400px thumbnail with the same proportions", async () => {
    const w = await world();
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#a55" } }).jpeg().toBuffer();
    const photo = Photo.requestUpload({
      projectId: w.project.id,
      studioId: w.project.studioId,
      fileName: "big.jpg",
      mimeType: "image/jpeg",
      byteSize: big.byteLength,
    });
    w.staging.upload(photo.storageKey.toString(), new Uint8Array(big));
    photo.markUploaded({ byteSize: big.byteLength });
    await w.photos.save(photo);

    const result = await new GenerateDerivativesUseCase(w.photos, w.staging, new SharpImageResizer()).execute({
      photoId: photo.id.toString(),
    });
    assert.ok(result.isSuccess);

    const meta = (variant: "preview" | "thumb") =>
      sharp(Buffer.from(w.staging.objects.get(photo.storageKey.derivative(variant).toString())!)).metadata();
    const preview = await meta("preview");
    const thumb = await meta("thumb");
    assert.equal(Math.max(preview.width!, preview.height!), 1600);
    assert.equal(Math.max(thumb.width!, thumb.height!), 400);
    assert.equal(Math.round((thumb.width! / thumb.height!) * 100), 133);
    assert.equal((await w.photos.findById(photo.id))?.hasDerivatives, true);
  });
});

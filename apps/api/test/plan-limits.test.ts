import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Project } from "../src/modules/media-ingestion/domain/project";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { Subscription } from "../src/modules/identity/domain/subscription";
import type { PlanCode } from "../src/modules/identity/domain/plan";
import { SubscriptionPlanFeatureDirectory } from "../src/modules/identity/infrastructure/gateways/subscription-plan-features";
import { RequestUploadUseCase } from "../src/modules/media-ingestion/application/use-cases/request-upload/request-upload.use-case";
import { DownloadSessionAdminUseCase } from "../src/modules/review-collaboration/application/use-cases/download-session-admin.use-case";
import { MediaIngestionDeliveryGateway } from "../src/modules/review-collaboration/infrastructure/gateways/delivery-gateway";
import { InMemoryStorageProvider } from "../src/dev/in-memory-storage-provider";
import { MediaUrlSigner } from "../src/infrastructure/storage/media-url-signer";
import { InMemorySubscriptionRepository } from "../src/dev/in-memory-adapters";
import {
  InMemoryDownloadSessionRepository,
  InMemoryObjectStorage,
  InMemoryPhotoRepository,
  InMemoryProjectRepository,
} from "./support/in-memory";

async function world(plan: PlanCode, photosAlready = 0) {
  const projects = new InMemoryProjectRepository();
  const photos = new InMemoryPhotoRepository();
  const subscriptions = new InMemorySubscriptionRepository();
  const storage = new InMemoryObjectStorage();
  const studioId = UniqueEntityId.create();
  const project = Project.create({ studioId, name: "Wedding", type: "WEDDING" });
  await projects.save(project);
  const subscription = Subscription.startDefault(studioId);
  subscription.assignPlan(plan);
  await subscriptions.save(subscription);
  for (let index = 0; index < photosAlready; index++) {
    await photos.save(
      Photo.requestUpload({ projectId: project.id, studioId, fileName: `p${index}.jpg`, mimeType: "image/jpeg", byteSize: 1000 }),
    );
  }
  const features = new SubscriptionPlanFeatureDirectory(projects, subscriptions);
  const upload = new RequestUploadUseCase(projects, photos, storage, features);
  const request = () =>
    upload.execute({
      studioId: studioId.toString(),
      projectId: project.id.toString(),
      fileName: "next.jpg",
      mimeType: "image/jpeg",
      byteSize: 1000,
    });
  const permanent = new InMemoryStorageProvider(
    new MediaUrlSigner("test-secret-test-secret-test-secret-123", "https://api.example.test"),
  );
  const downloads = new DownloadSessionAdminUseCase(
    new InMemoryDownloadSessionRepository(),
    new MediaIngestionDeliveryGateway(projects, photos, storage, permanent),
    () => new Date(),
    undefined,
    undefined,
    undefined,
    features,
  );
  const openLink = () => downloads.open({ projectId: project.id.toString(), clientName: "Elena" });
  return { request, openLink };
}

describe("plan limits", () => {
  it("stops a Starter shoot at 80 photos", async () => {
    const { request } = await world("STARTER", 79);
    assert.ok((await request()).isSuccess, "the 80th photo still fits");
    const over = await request();
    assert.ok(over.isFailure);
    assert.equal(over.getError().code, "CONFLICT");
    assert.match(over.getError().message, /80 photos per shoot/);
  });

  it("applies the same 80-photo limit to the free trial", async () => {
    const { request } = await world("TRIAL", 80);
    assert.ok((await request()).isFailure);
  });

  it("lets a Studio shoot grow past 80 photos", async () => {
    const { request } = await world("STUDIO", 200);
    assert.ok((await request()).isSuccess);
  });

  it("keeps client download links for Studio and above", async () => {
    const starter = await world("STARTER");
    const refused = await starter.openLink();
    assert.ok(refused.isFailure);
    assert.match(refused.getError().message, /Studio plan/);

    assert.ok((await (await world("STUDIO")).openLink()).isSuccess);
    assert.ok((await (await world("STUDIO_PRO")).openLink()).isSuccess);
  });
});

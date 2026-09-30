import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { Studio } from "../src/modules/identity/domain/studio";
import { Subscription } from "../src/modules/identity/domain/subscription";
import { Project } from "../src/modules/media-ingestion/domain/project";
import type { PlanCode } from "../src/modules/identity/domain/plan";
import { StudioAdministrationUseCase } from "../src/modules/identity/application/use-cases/studio-administration.use-case";
import { SharpLogoProcessor } from "../src/modules/identity/infrastructure/branding/sharp-logo-processor";
import { SubscriptionStudioBrandingDirectory } from "../src/modules/identity/infrastructure/branding/subscription-branding-directory";
import {
  InMemoryProjectRepository,
  InMemoryStudioMemberRepository,
  InMemoryStudioRepository,
  InMemorySubscriptionRepository,
} from "./support/in-memory";

async function world(plan: PlanCode) {
  const studios = new InMemoryStudioRepository();
  const subscriptions = new InMemorySubscriptionRepository();
  const projects = new InMemoryProjectRepository();
  const { studio } = Studio.create({ name: "Golden Hour", ownerEmail: "ana@studio.ro" });
  await studios.save(studio);
  const subscription = Subscription.startDefault(studio.id);
  subscription.assignPlan(plan);
  await subscriptions.save(subscription);
  const project = Project.create({ studioId: studio.id, name: "Wedding", type: "WEDDING" });
  await projects.save(project);
  const administration = new StudioAdministrationUseCase(studios, subscriptions, new InMemoryStudioMemberRepository(), new SharpLogoProcessor());
  const branding = new SubscriptionStudioBrandingDirectory(projects, studios, subscriptions);
  return { studioId: studio.id.toString(), projectId: project.id.toString(), administration, branding, subscription, subscriptions };
}

async function pngDataUrl(width: number, height: number): Promise<string> {
  const png = await sharp({ create: { width, height, channels: 4, background: { r: 200, g: 80, b: 30, alpha: 1 } } }).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

describe("client branding", () => {
  it("is a Studio Pro feature", async () => {
    const w = await world("STUDIO");
    const result = await w.administration.setBranding(w.studioId, "OWNER", { displayName: "GH", accent: "#123456", logo: null });
    assert.equal(result.getError().code, "CONFLICT");
  });

  it("only the owner may change it", async () => {
    const w = await world("STUDIO_PRO");
    const result = await w.administration.setBranding(w.studioId, "EDITOR", { displayName: "GH", accent: null, logo: null });
    assert.equal(result.getError().code, "FORBIDDEN");
  });

  it("stores a shrunk PNG logo and shows it on the shoot's client pages", async () => {
    const w = await world("STUDIO_PRO");
    const result = await w.administration.setBranding(w.studioId, "OWNER", {
      displayName: "Golden Hour Studio",
      accent: "#1f6f5c",
      logo: await pngDataUrl(2400, 800),
    });
    const stored = result.getValue().studio.branding;
    assert.equal(stored?.accent, "#1f6f5c");
    const meta = await sharp(Buffer.from(stored!.logo!.split(",")[1]!, "base64")).metadata();
    assert.ok(meta.width! <= 600 && meta.height! <= 200, `logo is ${meta.width}×${meta.height}`);

    assert.deepEqual(await w.branding.forProject(w.projectId), { name: "Golden Hour Studio", accent: "#1f6f5c", logo: stored!.logo });
  });

  it("refuses files that are not images, and never takes SVG", async () => {
    const w = await world("STUDIO_PRO");
    const svg = `data:image/svg+xml;base64,${Buffer.from("<svg onload='alert(1)'/>").toString("base64")}`;
    const result = await w.administration.setBranding(w.studioId, "OWNER", { displayName: "", accent: null, logo: svg });
    assert.equal(result.getError().code, "VALIDATION_ERROR");
  });

  it("disappears from client pages when the studio leaves Studio Pro", async () => {
    const w = await world("STUDIO_PRO");
    await w.administration.setBranding(w.studioId, "OWNER", { displayName: "GH", accent: "#123456", logo: null });
    w.subscription.assignPlan("STUDIO");
    await w.subscriptions.save(w.subscription);
    assert.equal(await w.branding.forProject(w.projectId), null);
  });
});

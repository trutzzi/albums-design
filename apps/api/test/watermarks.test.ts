import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { PdfAlbumRenderer } from "../src/modules/export-print/infrastructure/rendering/pdf-album-renderer";
import { findPrintProfile } from "../src/modules/export-print/domain/print-profile";
import type { RenderableAlbum } from "../src/modules/export-print/application/ports/album-pdf-renderer";
import { SubscriptionPlanFeatureDirectory } from "../src/modules/identity/infrastructure/gateways/subscription-plan-features";
import { Subscription } from "../src/modules/identity/domain/subscription";
import { Project } from "../src/modules/media-ingestion/domain/project";
import { InMemoryProjectRepository, InMemorySubscriptionRepository } from "./support/in-memory";

async function photo(): Promise<Uint8Array> {
  return sharp({ create: { width: 600, height: 400, channels: 3, background: { r: 120, g: 90, b: 60 } } })
    .jpeg()
    .toBuffer();
}

function album(watermark?: string): RenderableAlbum {
  return {
    id: "album-1",
    title: "Ana & Mihai",
    watermark,
    format: { pageWidthMm: 200, pageHeightMm: 200, bleedMm: 3 },
    spreads: [
      {
        templateId: "hero-full-bleed",
        placements: [
          { slotId: "hero", photoId: "p1", crop: { x: 0, y: 0, width: 1, height: 1 }, treatment: "COLOR" },
        ],
      },
    ],
  };
}

describe("export watermark", () => {
  it("draws the watermark only when the album carries one", async () => {
    const image = await photo();
    const renderer = new PdfAlbumRenderer({ resolve: async () => image });
    const profile = findPrintProfile("client-proof-150")!;

    // The watermark is the only text the renderer ever draws, so a font on the page means it is there.
    const fontsOnFirstPage = async (bytes: Uint8Array) => {
      const page = (await PDFDocument.load(bytes)).getPage(0);
      const fonts = page.node.Resources()?.lookup(PDFName.of("Font"));
      return fonts instanceof PDFDict ? fonts.keys().length : 0;
    };

    assert.equal(await fontsOnFirstPage((await renderer.render(album(), profile)).bytes), 0);
    assert.ok((await fontsOnFirstPage((await renderer.render(album("AlbumFlow · trial"), profile)).bytes)) > 0);
  });
});

describe("plan features by shoot", () => {
  async function setup(plan: "TRIAL" | "STARTER" | "STUDIO") {
    const projects = new InMemoryProjectRepository();
    const subscriptions = new InMemorySubscriptionRepository();
    const studioId = UniqueEntityId.create();
    const project = Project.create({ studioId, name: "Wedding", type: "WEDDING", eventDate: new Date("2026-06-20") });
    await projects.save(project);
    const subscription = Subscription.startTrial(studioId);
    if (plan !== "TRIAL") subscription.changePlan(plan);
    await subscriptions.save(subscription);
    return new SubscriptionPlanFeatureDirectory(projects, subscriptions).forProject(project.id.toString());
  }

  it("watermarks trial proofs and exports", async () => {
    assert.deepEqual(await setup("TRIAL"), { watermarkDrafts: true, watermarkExports: true });
  });

  it("watermarks Starter proofs but never its exports", async () => {
    assert.deepEqual(await setup("STARTER"), { watermarkDrafts: true, watermarkExports: false });
  });

  it("leaves the Studio plan clean", async () => {
    assert.deepEqual(await setup("STUDIO"), { watermarkDrafts: false, watermarkExports: false });
  });

  it("never watermarks when the shoot cannot be found", async () => {
    const directory = new SubscriptionPlanFeatureDirectory(
      new InMemoryProjectRepository(),
      new InMemorySubscriptionRepository(),
    );
    assert.deepEqual(await directory.forProject(UniqueEntityId.create().toString()), {
      watermarkDrafts: false,
      watermarkExports: false,
    });
  });
});

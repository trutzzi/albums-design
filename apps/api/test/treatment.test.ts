import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Album } from "../src/modules/album-composition/domain/album";
import { PdfAlbumRenderer } from "../src/modules/export-print/infrastructure/rendering/pdf-album-renderer";
import { findPrintProfile } from "../src/modules/export-print/domain/print-profile";
import type { PhotoResolver } from "../src/modules/export-print/application/ports/album-pdf-renderer";
import { AlbumCompositionExportGateway } from "../src/modules/export-print/infrastructure/gateways/album-gateway";
import { InMemoryAlbumRepository } from "./support/in-memory";

const FULL = { x: 0, y: 0, width: 1, height: 1 };

function albumWith(treatment: "COLOR" | "BLACK_WHITE"): Album {
  return Album.create({
    projectId: UniqueEntityId.create(),
    title: "Treatment test",
    spreads: [
      {
        templateId: "single-centred",
        placements: [{ slotId: "centre", photoId: "photo-1", crop: FULL, treatment }],
      },
    ],
  });
}

/** A saturated image, so a grayscale pass has something obvious to strip. */
async function vividPhoto(): Promise<Buffer> {
  const width = 600;
  const height = 400;
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      data[i] = (x * 255) / width;
      data[i + 1] = (y * 255) / height;
      data[i + 2] = ((x + y) % 255);
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
}

describe("black and white treatment", () => {
  let photo: Buffer;
  let resolver: PhotoResolver;

  before(async () => {
    photo = await vividPhoto();
    resolver = { resolve: async () => photo };
  });

  it("survives a template change, because it describes the spread not the photo", () => {
    const album = albumWith("BLACK_WHITE");
    album.changeTemplate(0, "quad");
    for (const placement of album.spreads[0]?.placements ?? []) {
      assert.equal(placement.treatment, "BLACK_WHITE");
    }
  });

  it("survives swapping the photo underneath it", () => {
    const album = albumWith("BLACK_WHITE");
    album.swapPhoto(0, "centre", "photo-2");
    assert.equal(album.spreads[0]?.placements[0]?.treatment, "BLACK_WHITE");
    // ...while the crop, which belonged to the old photo, is reset.
    assert.deepEqual(album.spreads[0]?.placements[0]?.crop, FULL);
  });

  it("applies to every slot when set at spread level", () => {
    const album = albumWith("COLOR");
    album.changeTemplate(0, "six-up");
    album.setSpreadTreatment(0, "BLACK_WHITE");
    assert.equal(
      album.spreads[0]?.placements.every((p) => p.treatment === "BLACK_WHITE"),
      true,
    );
  });

  it("reaches the export gateway rather than being dropped at the boundary", async () => {
    const albums = new InMemoryAlbumRepository();
    const album = albumWith("BLACK_WHITE");
    await albums.save(album);

    const renderable = await new AlbumCompositionExportGateway(albums).load(album.id.toString());
    assert.equal(renderable?.spreads[0]?.placements[0]?.treatment, "BLACK_WHITE");
  });

  it("produces a genuinely different PDF from the colour version", async () => {
    const profile = findPrintProfile("client-proof-150");
    assert.ok(profile);
    const renderer = new PdfAlbumRenderer(resolver);

    const colour = await renderer.render(
      { id: "a", title: "t", format: { pageWidthMm: 200, pageHeightMm: 200, bleedMm: 0 }, spreads: [{ templateId: "single-centred", placements: [{ slotId: "centre", photoId: "p", crop: FULL, treatment: "COLOR" }] }] },
      profile,
    );
    const mono = await renderer.render(
      { id: "a", title: "t", format: { pageWidthMm: 200, pageHeightMm: 200, bleedMm: 0 }, spreads: [{ templateId: "single-centred", placements: [{ slotId: "centre", photoId: "p", crop: FULL, treatment: "BLACK_WHITE" }] }] },
      profile,
    );

    assert.equal(await pageCount(colour.bytes), 1);
    assert.equal(await pageCount(mono.bytes), 1);
    // Stripping chroma from a saturated image always shrinks the encoded JPEG.
    assert.ok(
      mono.bytes.byteLength < colour.bytes.byteLength,
      `expected the monochrome PDF to be smaller: ${mono.bytes.byteLength} vs ${colour.bytes.byteLength}`,
    );
  });
});

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

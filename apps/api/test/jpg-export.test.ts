import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { DEFAULT_STYLE } from "@albumflow/contracts";
import { JpegAlbumRenderer } from "../src/modules/export-print/infrastructure/rendering/jpeg-album-renderer";
import { PdfAlbumRenderer } from "../src/modules/export-print/infrastructure/rendering/pdf-album-renderer";
import { AlbumFonts, RasterFont } from "../src/modules/export-print/infrastructure/rendering/album-fonts";
import { findPrintProfile } from "../src/modules/export-print/domain/print-profile";
import { ExportJob } from "../src/modules/export-print/domain/export-job";
import { RunExportUseCase, downloadName } from "../src/modules/export-print/application/use-cases/run-export.use-case";
import type { RenderableAlbum } from "../src/modules/export-print/application/ports/album-pdf-renderer";
import { InMemoryExportJobRepository, InMemoryObjectStorage } from "../src/dev/in-memory-adapters";
import { RecordingLogger } from "./support/recording-logger";

const PROFILE = findPrintProfile("lab-standard-300")!;
const FULL = { x: 0, y: 0, width: 1, height: 1 };
const RED = { r: 220, g: 20, b: 20 };

async function photo(colour: { r: number; g: number; b: number }): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({ create: { width: 1200, height: 800, channels: 3, background: colour } })
      .jpeg()
      .toBuffer(),
  );
}

async function world() {
  const red = await photo(RED);
  const photos = { resolve: async (id: string) => (id === "red" ? red : undefined) };
  const album: RenderableAlbum = {
    id: UniqueEntityId.create().toString(),
    title: "Luiza & Adrian — Album",
    format: { pageWidthMm: 250, pageHeightMm: 250, bleedMm: 3 },
    style: { ...DEFAULT_STYLE, background: "#f4efe6" },
    cover: { layout: "text", photoId: null, crop: FULL, title: "Luiza & Adrian", subtitle: "12 · 09 · 2026" },
    spreads: [
      {
        templateId: "hero-full-bleed",
        placements: [{ slotId: "hero", photoId: "red", crop: FULL, treatment: "COLOR" }],
      },
      {
        templateId: "single-right-page",
        placements: [{ slotId: "plate", photoId: "red", crop: FULL, treatment: "BLACK_WHITE" }],
        texts: [
          {
            id: "t",
            text: "Bună dimineața, Ștefan",
            x: 0.06,
            y: 0.4,
            width: 0.4,
            height: 0.2,
            size: "heading",
            align: "left",
          },
        ],
      },
    ],
  };
  return { photos, album };
}

/** The entries of a ZIP whose files are stored, read from its central directory. */
function unzipStored(zip: Buffer): Map<string, Buffer> {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const entries = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extra = zip.readUInt16LE(at + 30);
    const comment = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString("utf8", at + 46, at + 46 + nameLength);
    const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    entries.set(name, zip.subarray(dataStart, dataStart + size));
    at += 46 + nameLength + extra + comment;
  }
  return entries;
}

describe("the JPG export", () => {
  it("makes one full-quality sRGB JPG per spread plus the cover, at print size with bleed", async () => {
    const { photos, album } = await world();
    const folder = await mkdtemp(join(tmpdir(), "jpg-test-"));
    try {
      const path = join(folder, "album.zip");
      const { fileCount } = await new JpegAlbumRenderer(photos).renderZip(album, PROFILE, path);
      const files = unzipStored(await readFile(path));
      assert.equal(fileCount, 3);
      assert.deepEqual([...files.keys()], ["00_cover.jpg", "01.jpg", "02.jpg"]);

      const spread = await sharp(files.get("01.jpg")!).metadata();
      // 2 × 250 mm + 2 × 3 mm bleed wide, 250 + 6 mm high, at 300 dpi.
      assert.equal(spread.format, "jpeg");
      assert.equal(spread.width, Math.round((506 / 25.4) * 300));
      assert.equal(spread.height, Math.round((256 / 25.4) * 300));
      assert.equal(spread.density, 300);
      assert.equal(spread.chromaSubsampling, "4:4:4");
      assert.ok(spread.icc, "the sRGB profile is embedded");

      const cover = await sharp(files.get("00_cover.jpg")!).metadata();
      assert.equal(cover.width, Math.round((256 / 25.4) * 300));
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it("paints what the layout says: the full-bleed photo, the paper colour, the words", async () => {
    const { photos, album } = await world();
    const folder = await mkdtemp(join(tmpdir(), "jpg-test-"));
    try {
      const path = join(folder, "album.zip");
      await new JpegAlbumRenderer(photos).renderZip(album, PROFILE, path);
      const files = unzipStored(await readFile(path));
      const pixel = async (name: string, x: number, y: number) => {
        const { data } = await sharp(files.get(name)!)
          .extract({ left: x, top: y, width: 1, height: 1 })
          .raw()
          .toBuffer({ resolveWithObject: true });
        return [data[0]!, data[1]!, data[2]!];
      };
      const near = (actual: number[], expected: number[]) =>
        actual.every((value, index) => Math.abs(value - expected[index]!) <= 6);

      // Spread 1 is one photo to the paper's edge, bleed included.
      assert.ok(near(await pixel("01.jpg", 2, 2), [RED.r, RED.g, RED.b]));
      // Spread 2: paper colour in the corner, a grey (black-and-white) photo on the right page.
      assert.ok(near(await pixel("02.jpg", 20, 20), [0xf4, 0xef, 0xe6]));
      const [r, g, b] = await pixel("02.jpg", Math.round(5976 * 0.75), 1500);
      assert.ok(Math.abs(r - g) <= 3 && Math.abs(g - b) <= 3 && r < 200, `expected grey, got ${r},${g},${b}`);
      // The heading: dark ink somewhere inside its box on the paper.
      const box = await sharp(files.get("02.jpg")!)
        .extract({ left: 400, top: 1250, width: 2000, height: 450 })
        .raw()
        .toBuffer();
      let darkest = 255;
      for (let i = 0; i < box.length; i += 3) darkest = Math.min(darkest, box[i]!);
      assert.ok(darkest < 120, "the words are drawn");
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it("measures words exactly as the PDF does, so lines wrap the same in both", async () => {
    const pdfFonts = new AlbumFonts(await PDFDocument.create());
    for (const [face, size] of [
      ["serif", "body"],
      ["sans", "heading"],
    ] as const) {
      const pdfFont = await pdfFonts.get(face, size);
      const raster = await RasterFont.load(face, size);
      for (const text of ["Luiza & Adrian", "Bună dimineața, Ștefan — țară", "AVA fi"]) {
        assert.ok(Math.abs(pdfFont.widthOfTextAtSize(text, 31) - raster.widthOfTextAtSize(text, 31)) < 1e-6, text);
      }
    }
  });

  it("is chosen per export: a JPG export is stored as a named ZIP, a default one stays a PDF", async () => {
    const { photos, album } = await world();
    const jobs = new InMemoryExportJobRepository();
    const storage = new InMemoryObjectStorage();
    const gateway = { load: async () => album, markExported: async () => {} };
    const run = new RunExportUseCase(
      jobs,
      gateway,
      new PdfAlbumRenderer(photos),
      storage,
      new JpegAlbumRenderer(photos),
    );

    const jpg = ExportJob.request({
      albumId: UniqueEntityId.create(album.id),
      printProfileId: PROFILE.id,
      format: "JPG_ZIP",
    });
    const pdf = ExportJob.request({ albumId: UniqueEntityId.create(album.id), printProfileId: PROFILE.id });
    await jobs.save(jpg);
    await jobs.save(pdf);

    const jpgDone = (await run.execute(jpg.id.toString())).getValue();
    assert.equal(jpgDone.status, "READY", jpgDone.failureReason);
    assert.equal(jpgDone.format, "JPG_ZIP");
    assert.equal(jpgDone.pageCount, 3);
    assert.match(jpgDone.storageKey ?? "", /\/luiza-adrian-album-jpg\.zip$/);
    assert.equal((await storage.read(jpgDone.storageKey!)).byteLength, jpgDone.byteSize);

    const pdfDone = (await run.execute(pdf.id.toString())).getValue();
    assert.equal(pdfDone.format, "PDF");
    assert.match(pdfDone.storageKey ?? "", /\.pdf$/);
  });

  it("fails the export cleanly when a page cannot be rendered, leaving nothing half-written", async () => {
    const { album } = await world();
    const broken = {
      resolve: async (): Promise<Uint8Array | undefined> => {
        throw new Error("storage unreachable");
      },
    };
    const jobs = new InMemoryExportJobRepository();
    const storage = new InMemoryObjectStorage();
    const logger = new RecordingLogger();
    const run = new RunExportUseCase(
      jobs,
      { load: async () => album, markExported: async () => {} },
      new PdfAlbumRenderer(broken),
      storage,
      new JpegAlbumRenderer(broken),
      logger,
    );
    const job = ExportJob.request({
      albumId: UniqueEntityId.create(album.id),
      printProfileId: PROFILE.id,
      format: "JPG_ZIP",
    });
    await jobs.save(job);
    const done = (await run.execute(job.id.toString())).getValue();
    assert.equal(done.status, "FAILED");
    assert.equal(done.failureReason, "storage unreachable");
    assert.equal(done.storageKey, undefined);
    const logged = logger.entries.find((entry) => entry.level === "error");
    assert.equal(logged?.message, "album export failed");
    assert.equal(logged?.context?.["exportJobId"], job.id.toString());
    assert.equal(logged?.context?.["format"], "JPG_ZIP");
  });

  it("removes a stored file whose job could not be saved, and keeps a finished export when only the album's status fails", async () => {
    const { photos, album } = await world();
    const jobs = new InMemoryExportJobRepository();
    const storage = new InMemoryObjectStorage();
    const logger = new RecordingLogger();
    let refuseSave = false;
    const save = jobs.save.bind(jobs);
    jobs.save = async (job) => {
      if (refuseSave && job.status === "READY") throw new Error("database down");
      await save(job);
    };
    let markExportedFails = false;
    const run = new RunExportUseCase(
      jobs,
      {
        load: async () => album,
        markExported: async () => {
          if (markExportedFails) throw new Error("album table locked");
        },
      },
      new PdfAlbumRenderer(photos),
      storage,
      new JpegAlbumRenderer(photos),
      logger,
    );

    refuseSave = true;
    const lost = ExportJob.request({ albumId: UniqueEntityId.create(album.id), printProfileId: PROFILE.id });
    await jobs.save(lost);
    const failed = (await run.execute(lost.id.toString())).getValue();
    assert.equal(failed.status, "FAILED");
    await assert.rejects(storage.read(`exports/${album.id}/${lost.id.toString()}.pdf`));
    // Nothing on the failed job still points at the removed file.
    assert.deepEqual([failed.storageKey, failed.byteSize, failed.pageCount], [undefined, undefined, undefined]);

    refuseSave = false;
    markExportedFails = true;
    const kept = ExportJob.request({ albumId: UniqueEntityId.create(album.id), printProfileId: PROFILE.id });
    await jobs.save(kept);
    const ready = (await run.execute(kept.id.toString())).getValue();
    assert.equal(ready.status, "READY");
    assert.ok(logger.entries.some((entry) => entry.message === "album not marked as exported"));
  });

  it("ends with the file system's error, instead of hanging or crashing, when the ZIP cannot be written", async () => {
    const { photos, album } = await world();
    const unwritable = join(tmpdir(), `no-such-folder-${Date.now()}`, "album.zip");
    await assert.rejects(new JpegAlbumRenderer(photos).renderZip(album, PROFILE, unwritable), { code: "ENOENT" });
  });

  it("names the download after the album, in letters any lab's system accepts", () => {
    assert.equal(downloadName("Luiza & Adrian — Album"), "luiza-adrian-album");
    assert.equal(downloadName("Nuntă Ștefan și Ioana"), "nunta-stefan-si-ioana");
    assert.equal(downloadName("!!!"), "album");
  });
});

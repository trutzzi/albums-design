import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import Fastify from "fastify";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { sameAlbumShape } from "@albumflow/contracts";
import { Album, AlbumLockedError, AlbumShapeError, FULL_CROP } from "../src/modules/album-composition/domain/album";
import { ResizeAlbumUseCase } from "../src/modules/album-composition/application/use-cases/resize-album/resize-album.use-case";
import { CopyAlbumAtSizeUseCase } from "../src/modules/album-composition/application/use-cases/copy-album/copy-album.use-case";
import { registerAlbumCompositionRoutes } from "../src/modules/album-composition/interface/http/routes";
import type { AlbumQuotaPolicy } from "../src/modules/album-composition/application/ports/directories";
import { InMemoryAlbumRepository } from "./support/in-memory";

const SQUARE_25 = { pageWidthMm: 250, pageHeightMm: 250, bleedMm: 3 };
const SQUARE_30 = { pageWidthMm: 300, pageHeightMm: 300 };

function makeAlbum(): Album {
  return Album.create({
    projectId: UniqueEntityId.create(),
    title: "Luiza & Adrian",
    format: SQUARE_25,
    spreads: [
      {
        templateId: "hero-full-bleed",
        placements: [
          {
            slotId: "hero",
            photoId: "photo-1",
            crop: { ...FULL_CROP },
            treatment: "COLOR",
            frame: { x: 0.1, y: 0.1, width: 0.6, height: 0.8 },
          },
        ],
      },
    ],
  });
}

const projects = (studioId = "studio-1") => ({
  findProject: async (projectId: string) => ({ projectId, studioId, name: "Luiza & Adrian" }),
});

function quota(allowed = true): AlbumQuotaPolicy & { created: string[] } {
  const created: string[] = [];
  return {
    created,
    ensureCanCreateAlbum: async () => (allowed ? { allowed: true } : { allowed: false, reason: "Plan limit." }),
    recordAlbumCreated: async (studioId) => {
      created.push(studioId);
    },
  };
}

describe("the same album shape", () => {
  it("is the ratio, within a hair; size alone never matters", () => {
    assert.ok(sameAlbumShape({ pageWidthMm: 250, pageHeightMm: 250 }, SQUARE_30));
    assert.ok(sameAlbumShape({ pageWidthMm: 300, pageHeightMm: 210 }, { pageWidthMm: 400, pageHeightMm: 281 }));
    assert.ok(!sameAlbumShape({ pageWidthMm: 250, pageHeightMm: 250 }, { pageWidthMm: 300, pageHeightMm: 210 }));
  });
});

describe("resizing an album", () => {
  it("changes the print size and keeps the design and the bleed exactly", () => {
    const album = makeAlbum();
    const before = structuredClone(album.spreads);
    album.resize(SQUARE_30);
    assert.deepEqual(album.format, { pageWidthMm: 300, pageHeightMm: 300, bleedMm: 3 });
    assert.deepEqual(album.spreads, before);
  });

  it("keeps the shape exact, so many small resizes can never stretch it", () => {
    const album = Album.create({
      projectId: UniqueEntityId.create(),
      title: "Landscape",
      format: { pageWidthMm: 300, pageHeightMm: 210, bleedMm: 3 },
      spreads: [],
    });
    // Each step asks for a height 0.9% too tall: inside the tolerance, every time.
    for (let width = 310; width <= 600; width += 10)
      album.resize({ pageWidthMm: width, pageHeightMm: width * 0.7 * 1.009 });
    assert.equal(album.format.pageWidthMm, 600);
    assert.equal(album.format.pageHeightMm, 420);
  });

  it("refuses another shape, and an approved album", () => {
    const album = makeAlbum();
    assert.throws(() => album.resize({ pageWidthMm: 300, pageHeightMm: 210 }), AlbumShapeError);
    album.submitForReview();
    album.approve();
    assert.throws(() => album.resize(SQUARE_30), AlbumLockedError);
  });

  it("answers through the use case: saved, a shape error, a lock, and a missing album", async () => {
    const albums = new InMemoryAlbumRepository();
    const album = makeAlbum();
    await albums.save(album);
    const resize = new ResizeAlbumUseCase(albums);

    const done = await resize.execute({ albumId: album.id.toString(), ...SQUARE_30 });
    assert.ok(done.isSuccess);
    assert.equal((await albums.findById(album.id))?.format.pageWidthMm, 300);

    const wrongShape = await resize.execute({ albumId: album.id.toString(), pageWidthMm: 300, pageHeightMm: 200 });
    assert.equal(wrongShape.getError().code, "VALIDATION_ERROR");

    album.submitForReview();
    album.approve();
    const locked = await resize.execute({ albumId: album.id.toString(), pageWidthMm: 200, pageHeightMm: 200 });
    assert.equal(locked.getError().code, "CONFLICT");

    const missing = await resize.execute({ albumId: UniqueEntityId.create().toString(), ...SQUARE_30 });
    assert.equal(missing.getError().code, "NOT_FOUND");
  });
});

describe("copying an album at another size", () => {
  it("makes an independent draft, even from an approved album, and counts it against the plan", async () => {
    const albums = new InMemoryAlbumRepository();
    const original = makeAlbum();
    original.submitForReview();
    original.approve();
    await albums.save(original);
    const plan = quota();
    const copy = new CopyAlbumAtSizeUseCase(albums, projects(), plan);

    const result = await copy.execute({ albumId: original.id.toString(), pageWidthMm: 200, pageHeightMm: 200 });
    assert.ok(result.isSuccess);
    const made = result.getValue();
    assert.notEqual(made.id.toString(), original.id.toString());
    assert.equal(made.status, "DRAFT");
    assert.equal(made.title, "Luiza & Adrian — 20×20 cm");
    assert.deepEqual(made.format, { pageWidthMm: 200, pageHeightMm: 200, bleedMm: 3 });
    assert.deepEqual(made.spreads, original.spreads);
    assert.deepEqual(plan.created, ["studio-1"]);

    // Nothing shared: editing the copy leaves the approved original alone.
    made.setTreatment(0, "hero", "BLACK_WHITE");
    assert.equal(original.spreads[0]!.placements[0]!.treatment, "COLOR");
    assert.equal((await albums.findByProjectId(original.projectId)).length, 2);
  });

  it("takes a given title, and refuses another shape, a full plan and a missing album", async () => {
    const albums = new InMemoryAlbumRepository();
    const original = makeAlbum();
    await albums.save(original);
    const id = original.id.toString();

    const titled = await new CopyAlbumAtSizeUseCase(albums, projects(), quota()).execute({
      albumId: id,
      ...SQUARE_30,
      title: "For the parents",
    });
    assert.equal(titled.getValue().title, "For the parents");

    const shape = await new CopyAlbumAtSizeUseCase(albums, projects(), quota()).execute({
      albumId: id,
      pageWidthMm: 300,
      pageHeightMm: 200,
    });
    assert.equal(shape.getError().code, "VALIDATION_ERROR");

    const full = quota(false);
    const refused = await new CopyAlbumAtSizeUseCase(albums, projects(), full).execute({ albumId: id, ...SQUARE_30 });
    assert.equal(refused.getError().code, "CONFLICT");
    assert.deepEqual(full.created, []);

    const missing = await new CopyAlbumAtSizeUseCase(albums, projects(), quota()).execute({
      albumId: UniqueEntityId.create().toString(),
      ...SQUARE_30,
    });
    assert.equal(missing.getError().code, "NOT_FOUND");

    const noProject = await new CopyAlbumAtSizeUseCase(albums, { findProject: async () => undefined }, quota()).execute(
      { albumId: id, ...SQUARE_30 },
    );
    assert.equal(noProject.getError().code, "NOT_FOUND");
  });
});

describe("the album size over HTTP", () => {
  it("resizes with PUT /albums/:id/format and copies with POST /albums/:id/copies", async () => {
    const albums = new InMemoryAlbumRepository();
    const album = makeAlbum();
    await albums.save(album);
    const app = Fastify();
    registerAlbumCompositionRoutes(app, {
      albums,
      resizeAlbum: new ResizeAlbumUseCase(albums),
      copyAlbum: new CopyAlbumAtSizeUseCase(albums, projects(), quota()),
      // Not used by these routes.
      suggestLayouts: {} as never,
      generateAlbum: {} as never,
      editAlbum: {} as never,
      deleteAlbum: {} as never,
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const send = (method: string, path: string, body: unknown) =>
      fetch(`${base}${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

    const resized = await send("PUT", `/albums/${album.id.toString()}/format`, SQUARE_30);
    assert.equal(resized.status, 200);
    assert.equal(((await resized.json()) as { format: { pageWidthMm: number } }).format.pageWidthMm, 300);

    const stretched = await send("PUT", `/albums/${album.id.toString()}/format`, {
      pageWidthMm: 300,
      pageHeightMm: 200,
    });
    assert.equal(stretched.status, 422);

    const copied = await send("POST", `/albums/${album.id.toString()}/copies`, { pageWidthMm: 200, pageHeightMm: 200 });
    assert.equal(copied.status, 201);
    const copy = (await copied.json()) as { id: string; status: string };
    assert.notEqual(copy.id, album.id.toString());
    assert.equal(copy.status, "DRAFT");

    await app.close();
  });
});

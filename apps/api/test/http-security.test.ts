import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it, before } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { registerStudioAuth } from "../src/interface/auth";
import { registerTenancyGuard } from "../src/interface/tenancy";
import { Studio } from "../src/modules/identity/domain/studio";
import { Project } from "../src/modules/media-ingestion/domain/project";
import { Album } from "../src/modules/album-composition/domain/album";
import {
  InMemoryAlbumRepository,
  InMemoryExportJobRepository,
  InMemoryPhotoRepository,
  InMemoryProjectRepository,
  InMemoryStudioRepository,
} from "./support/in-memory";

describe("HTTP security boundary", () => {
  let app: FastifyInstance;
  let keyA: string;
  let keyB: string;
  let projectA: Project;
  let projectB: Project;
  let albumB: Album;
  let studioA: Studio;
  let studioB: Studio;

  before(async () => {
    const studios = new InMemoryStudioRepository();
    const projects = new InMemoryProjectRepository();
    const photos = new InMemoryPhotoRepository();
    const albums = new InMemoryAlbumRepository();
    const exportJobs = new InMemoryExportJobRepository();

    const a = Studio.create({ name: "Studio A", ownerEmail: "a@example.com" });
    const b = Studio.create({ name: "Studio B", ownerEmail: "b@example.com" });
    studioA = a.studio;
    studioB = b.studio;
    keyA = a.apiKey;
    keyB = b.apiKey;
    await studios.save(studioA);
    await studios.save(studioB);

    projectA = Project.create({ studioId: studioA.id, name: "A wedding", type: "WEDDING" });
    projectB = Project.create({ studioId: studioB.id, name: "B wedding", type: "WEDDING" });
    await projects.save(projectA);
    await projects.save(projectB);

    albumB = Album.create({
      projectId: projectB.id,
      title: "B album",
      spreads: [{ templateId: "single-centred", placements: [] }],
    });
    await albums.save(albumB);

    app = Fastify();
    registerStudioAuth(app, studios);
    registerTenancyGuard(app, { projects, photos, albums, exportJobs });

    // Stand-ins for the real routes: the guards run before any of them.
    app.get("/projects/:projectId/photos", async () => ({ ok: true }));
    app.get("/albums/:albumId", async () => ({ ok: true }));
    app.get("/studios/:studioId", async () => ({ ok: true }));
    app.post("/studios", async () => ({ ok: true }));
    app.get("/albums/:albumId/comments", async () => ({ ok: true }));
    app.post("/albums/:albumId/comments/:commentId/resolve", async () => ({ ok: true }));
    app.get("/review/:token", async () => ({ ok: true }));
    app.get("/plans", async () => ({ ok: true }));
    await app.ready();
  });

  const auth = (key: string) => ({ authorization: `Bearer ${key}` });

  it("rejects a protected route with no key", async () => {
    const response = await app.inject({ method: "GET", url: `/projects/${projectA.id}/photos` });
    assert.equal(response.statusCode, 401);
  });

  it("rejects an unknown key", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/projects/${projectA.id}/photos`,
      headers: auth("af_not_a_real_key"),
    });
    assert.equal(response.statusCode, 401);
  });

  it("allows a studio to reach its own project", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/projects/${projectA.id}/photos`,
      headers: auth(keyA),
    });
    assert.equal(response.statusCode, 200);
  });

  it("hides another studio's project behind a 404", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/projects/${projectB.id}/photos`,
      headers: auth(keyA),
    });
    assert.equal(response.statusCode, 404);
  });

  it("hides another studio's album", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/albums/${albumB.id}`,
      headers: auth(keyA),
    });
    assert.equal(response.statusCode, 404);

    const owner = await app.inject({
      method: "GET",
      url: `/albums/${albumB.id}`,
      headers: auth(keyB),
    });
    assert.equal(owner.statusCode, 200);
  });

  it("does not leak what a client wrote to a different studio", async () => {
    const read = await app.inject({
      method: "GET",
      url: `/albums/${albumB.id}/comments`,
      headers: auth(keyA),
    });
    assert.equal(read.statusCode, 404);

    const resolve = await app.inject({
      method: "POST",
      url: `/albums/${albumB.id}/comments/${randomUUID()}/resolve`,
      headers: auth(keyA),
    });
    assert.equal(resolve.statusCode, 404);

    // The owning studio still gets through.
    const owner = await app.inject({
      method: "GET",
      url: `/albums/${albumB.id}/comments`,
      headers: auth(keyB),
    });
    assert.equal(owner.statusCode, 200);
  });

  it("does not expose another studio's billing overview", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/studios/${studioB.id}`,
      headers: auth(keyA),
    });
    assert.equal(response.statusCode, 404);
  });

  it("still requires a key for a studio overview", async () => {
    const response = await app.inject({ method: "GET", url: `/studios/${studioA.id}` });
    assert.equal(response.statusCode, 401);
  });

  it("leaves onboarding and the client review portal public", async () => {
    assert.equal((await app.inject({ method: "POST", url: "/studios" })).statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: "/review/sometoken" })).statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: "/plans" })).statusCode, 200);
  });

  it("returns 404 for a project that does not exist at all", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/projects/${UniqueEntityId.create().toString()}/photos`,
      headers: auth(keyA),
    });
    assert.equal(response.statusCode, 404);
  });
});

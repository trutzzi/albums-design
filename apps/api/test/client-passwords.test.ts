import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import Fastify from "fastify";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { Project } from "../src/modules/media-ingestion/domain/project";
import { ReviewSession } from "../src/modules/review-collaboration/domain/review-session";
import { ClientAccessService } from "../src/modules/review-collaboration/application/services/client-access.service";
import { OpenReviewSessionUseCase } from "../src/modules/review-collaboration/application/use-cases/open-review-session.use-case";
import { ReviewPortalUseCase } from "../src/modules/review-collaboration/application/use-cases/review-portal.use-case";
import { ReviewAccessUseCase } from "../src/modules/review-collaboration/application/use-cases/review-access.use-case";
import { AlbumFeedbackUseCase } from "../src/modules/review-collaboration/application/use-cases/album-feedback.use-case";
import { DownloadSessionAdminUseCase } from "../src/modules/review-collaboration/application/use-cases/download-session-admin.use-case";
import { DownloadPortalUseCase } from "../src/modules/review-collaboration/application/use-cases/download-portal.use-case";
import { MediaIngestionDeliveryGateway } from "../src/modules/review-collaboration/infrastructure/gateways/delivery-gateway";
import { registerReviewRoutes } from "../src/modules/review-collaboration/interface/http/routes";
import { PickSession } from "../src/modules/review-collaboration/domain/pick-session";
import { PickSessionAdminUseCase } from "../src/modules/review-collaboration/application/use-cases/open-pick-session.use-case";
import { PickPortalUseCase } from "../src/modules/review-collaboration/application/use-cases/pick-portal.use-case";
import { registerPickRoutes } from "../src/modules/review-collaboration/interface/http/pick-routes";
import type { PickGateway } from "../src/modules/review-collaboration/application/ports/pick-gateway";
import { registerDownloadRoutes } from "../src/modules/review-collaboration/interface/http/download-routes";
import type { AlbumGateway, ReviewNotifier } from "../src/modules/review-collaboration/application/ports/album-gateway";
import { AttemptLimiter } from "../src/shared-kernel/attempt-limiter";
import { generateAccessPassword, normalizeAccessPassword } from "../src/shared-kernel/access-code";
import { ClientGrantSigner } from "../src/shared-kernel/client-grant";
import { SecretBox } from "../src/shared-kernel/secret-box";
import {
  InMemoryDownloadSessionRepository,
  InMemoryObjectStorage,
  InMemoryPhotoRepository,
  InMemoryPickSessionRepository,
  InMemoryProjectRepository,
  InMemoryReviewSessionRepository,
} from "./support/in-memory";

const SECRET = "test-secret-test-secret-test-secret-123";

describe("SecretBox", () => {
  const box = new SecretBox(SECRET);

  it("round-trips a value and never produces the same text twice", () => {
    const a = box.seal('{"token":"abc","password":"K7M2Q-X9PTA"}');
    const b = box.seal('{"token":"abc","password":"K7M2Q-X9PTA"}');
    assert.notEqual(a, b);
    assert.equal(box.open(a), '{"token":"abc","password":"K7M2Q-X9PTA"}');
    assert.ok(!a.includes("K7M2Q"), "the stored form does not contain the password");
  });

  it("refuses a value that was altered, cut short, or sealed with another key", () => {
    const sealed = box.seal("secret");
    const [v, iv, tag, data] = sealed.split(".");
    assert.equal(box.open([v, iv, tag, Buffer.from("tampered").toString("base64url")].join(".")), undefined);
    assert.equal(box.open(`${v}.${iv}.${tag}`), undefined);
    assert.equal(box.open("garbage"), undefined);
    assert.equal(new SecretBox("another-secret-another-secret-another-1").open(sealed), undefined);
    assert.equal(box.open(sealed), "secret");
    void data;
  });
});

describe("generated passwords", () => {
  it("are readable and unambiguous: 10 characters in two groups, never 0/O/1/I/L", () => {
    for (let i = 0; i < 200; i++) {
      const password = generateAccessPassword();
      assert.match(password, /^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
    }
  });

  it("differ from one link to the next", () => {
    assert.equal(new Set(Array.from({ length: 100 }, generateAccessPassword)).size, 100);
  });

  it("ignore case, dashes and spaces when typed", () => {
    assert.equal(normalizeAccessPassword(" k7m2q x9pta "), "K7M2QX9PTA");
    assert.equal(normalizeAccessPassword("K7M2Q-X9PTA"), "K7M2QX9PTA");
  });
});

describe("AttemptLimiter", () => {
  it("locks a key after the allowed failures, and unlocks after the window", () => {
    let now = 0;
    const limiter = new AttemptLimiter(3, 60_000, () => now);
    for (let i = 0; i < 2; i++) limiter.recordFailure("k");
    assert.equal(limiter.lockedFor("k"), 0);
    limiter.recordFailure("k");
    assert.ok(limiter.lockedFor("k") > 0);
    now = 61_000;
    assert.equal(limiter.lockedFor("k"), 0);
  });

  it("keeps keys apart and forgets on success", () => {
    const limiter = new AttemptLimiter(1);
    limiter.recordFailure("a");
    assert.ok(limiter.lockedFor("a") > 0);
    assert.equal(limiter.lockedFor("b"), 0);
    limiter.reset("a");
    assert.equal(limiter.lockedFor("a"), 0);
  });
});

describe("ClientGrantSigner", () => {
  const signer = new ClientGrantSigner(SECRET);

  it("is bound to one link and one kind", () => {
    const grant = signer.sign("review", "session-1");
    assert.ok(signer.verify(grant, "review", "session-1"));
    assert.equal(signer.verify(grant, "review", "session-2"), false);
    assert.equal(signer.verify(grant, "download", "session-1"), false, "an album grant cannot open a download");
  });

  it("rejects nothing, garbage, and grants signed with another secret", () => {
    assert.equal(signer.verify(undefined, "review", "s"), false);
    assert.equal(signer.verify("a.b.c", "review", "s"), false);
    assert.equal(new ClientGrantSigner("other-secret-other-secret-other-12345").verify(signer.sign("review", "s"), "review", "s"), false);
  });
});

function makeAccess(limiter = new AttemptLimiter()) {
  return new ClientAccessService(new SecretBox(SECRET), new ClientGrantSigner(SECRET), limiter);
}

describe("ClientAccessService", () => {
  const link = (over: { passwordHash?: string; sealedSecret?: string } = {}) => ({
    id: UniqueEntityId.create(),
    passwordHash: over.passwordHash,
    sealedSecret: over.sealedSecret,
  });

  it("issues a password, lets the studio read it back, and accepts it however it is typed", async () => {
    const access = makeAccess();
    const issued = await access.issue("the-url-token");
    const protectedLink = link(issued);

    assert.deepEqual(access.reveal(protectedLink), { token: "the-url-token", password: issued.password });
    for (const typed of [issued.password, issued.password.toLowerCase(), issued.password.replace("-", " ")]) {
      assert.ok((await access.unlock("download", protectedLink, typed)).isSuccess, typed);
    }
    assert.equal((await access.unlock("download", protectedLink, "WRONG-GUESS")).getError().code, "INVALID_PASSWORD");
  });

  it("locks out guessing, and a correct password later is refused until the lock passes", async () => {
    const access = makeAccess(new AttemptLimiter(3, 60_000));
    const issued = await access.issue("t");
    const protectedLink = link(issued);
    for (let i = 0; i < 3; i++) await access.unlock("review", protectedLink, `nope-${i}`);
    const locked = await access.unlock("review", protectedLink, issued.password);
    assert.equal(locked.getError().code, "TOO_MANY_ATTEMPTS");
  });

  it("stores no plain password: only a hash to check and an encrypted copy", async () => {
    const issued = await makeAccess().issue("t");
    assert.ok(!issued.passwordHash.includes(issued.password.replace("-", "")));
    assert.ok(!issued.sealedSecret.includes(issued.password));
  });

  it("leaves a link from before passwords existed open, and admits it has nothing to reveal", async () => {
    const access = makeAccess();
    const legacy = link();
    assert.ok(access.authorize("download", legacy, undefined).isSuccess);
    assert.equal(access.reveal(legacy), undefined);
  });
});

/** ------------------------------------------------------------------ album review */
const ALBUM_ID = "11111111-1111-4111-8111-111111111111";
const album = { id: ALBUM_ID, title: "Album", status: "IN_REVIEW", format: { pageWidthMm: 300, pageHeightMm: 300, bleedMm: 3 }, spreads: [] };
const albumGateway: AlbumGateway = {
  load: async (id) => (id === ALBUM_ID ? album : undefined),
  markInReview: async () => {},
  markApproved: async () => {},
  markChangesRequested: async () => {},
};
const notifier: ReviewNotifier = { clientDecided: async () => {} };

async function reviewApp(withPasswords: boolean) {
  const sessions = new InMemoryReviewSessionRepository();
  const access = withPasswords ? makeAccess() : undefined;
  const open = new OpenReviewSessionUseCase(sessions, albumGateway, access);
  const app = Fastify();
  registerReviewRoutes(app, {
    openReviewSession: open,
    reviewPortal: new ReviewPortalUseCase(sessions, albumGateway, notifier, access),
    albumFeedback: new AlbumFeedbackUseCase(sessions),
    sessions,
    ...(access ? { reviewAccess: new ReviewAccessUseCase(sessions, access) } : {}),
  });
  const opened = (await open.execute({ albumId: ALBUM_ID, clientName: "Elena" })).getValue();
  return { app, sessions, opened };
}

describe("album review links with a password", () => {
  it("gives every new link a generated password, returned once to the studio", async () => {
    const { opened } = await reviewApp(true);
    assert.match(opened.password!, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  });

  it("turns away every client action until the password is entered", async () => {
    const { app, opened } = await reviewApp(true);
    for (const request of [
      { method: "GET" as const, url: `/review/${opened.token}` },
      { method: "POST" as const, url: `/review/${opened.token}/comments`, payload: { spreadIndex: 0, body: "hi" } },
      { method: "POST" as const, url: `/review/${opened.token}/decision`, payload: { decision: "APPROVED" } },
    ]) {
      const response = await app.inject(request);
      assert.equal(response.statusCode, 401, `${request.method} ${request.url}`);
      assert.equal(response.json().code, "PASSWORD_REQUIRED");
    }
  });

  it("opens with the right password, and a wrong one is refused with a clear error", async () => {
    const { app, opened } = await reviewApp(true);
    const wrong = await app.inject({ method: "POST", url: `/review/${opened.token}/unlock`, payload: { password: "WRONG-WRONG" } });
    assert.equal(wrong.statusCode, 401);
    assert.equal(wrong.json().code, "INVALID_PASSWORD");

    const right = await app.inject({ method: "POST", url: `/review/${opened.token}/unlock`, payload: { password: opened.password!.toLowerCase() } });
    assert.equal(right.statusCode, 200);
    const grant = right.json().grant as string;

    const view = await app.inject({ method: "GET", url: `/review/${opened.token}`, headers: { "x-access-grant": grant } });
    assert.equal(view.statusCode, 200);
    assert.equal(view.json().album.title, "Album");
    const decided = await app.inject({
      method: "POST", url: `/review/${opened.token}/decision`, headers: { "x-access-grant": grant }, payload: { decision: "APPROVED" },
    });
    assert.equal(decided.statusCode, 200);
  });

  it("answers 429 with Retry-After after too many wrong passwords", async () => {
    const { app, opened } = await reviewApp(true);
    let last;
    for (let i = 0; i < 9; i++) last = await app.inject({ method: "POST", url: `/review/${opened.token}/unlock`, payload: { password: `nope-${i}` } });
    assert.equal(last!.statusCode, 429);
    assert.ok(Number(last!.headers["retry-after"]) > 0);
    const rightNow = await app.inject({ method: "POST", url: `/review/${opened.token}/unlock`, payload: { password: opened.password } });
    assert.equal(rightNow.statusCode, 429, "even the right password waits out the lock");
  });

  it("does not accept another link's grant", async () => {
    const { app, opened } = await reviewApp(true);
    const other = await reviewApp(true);
    const grant = (await other.app.inject({ method: "POST", url: `/review/${other.opened.token}/unlock`, payload: { password: other.opened.password } })).json().grant;
    const response = await app.inject({ method: "GET", url: `/review/${opened.token}`, headers: { "x-access-grant": grant } });
    assert.equal(response.statusCode, 401);
  });

  it("lets the studio read the link and password again — and only for that album", async () => {
    const { app, sessions, opened } = await reviewApp(true);
    const shown = await app.inject({ method: "GET", url: `/albums/${ALBUM_ID}/review-sessions/${opened.sessionId}/access` });
    assert.equal(shown.statusCode, 200);
    assert.deepEqual(shown.json(), { token: opened.token, password: opened.password });

    const wrongAlbum = await app.inject({ method: "GET", url: `/albums/${UniqueEntityId.create()}/review-sessions/${opened.sessionId}/access` });
    assert.equal(wrongAlbum.statusCode, 404);

    void sessions;
  });

  it("marks a protected link in the studio's list", async () => {
    const { app, sessions, opened } = await reviewApp(true);
    const stored = [...sessions.items.values()][0]!;
    const albumId = stored.albumId.toString();
    const list = await app.inject({ method: "GET", url: `/albums/${albumId}/review-sessions` });
    assert.equal(list.json()[0]?.passwordProtected, true);
    void opened;
  });

  it("leaves links created before passwords existed working, and says they cannot be shown again", async () => {
    const sessions = new InMemoryReviewSessionRepository();
    const access = makeAccess();
    const { session, token } = ReviewSession.open({ albumId: UniqueEntityId.create("00000000-0000-4000-8000-000000000001"), clientName: "Old" });
    await sessions.save(session);
    const app = Fastify();
    registerReviewRoutes(app, {
      openReviewSession: new OpenReviewSessionUseCase(sessions, albumGateway, access),
      reviewPortal: new ReviewPortalUseCase(sessions, { ...albumGateway, load: async () => album }, notifier, access),
      albumFeedback: new AlbumFeedbackUseCase(sessions),
      sessions,
      reviewAccess: new ReviewAccessUseCase(sessions, access),
    });
    assert.equal((await app.inject({ method: "GET", url: `/review/${token}` })).statusCode, 200);
    const details = await app.inject({ method: "GET", url: `/albums/00000000-0000-4000-8000-000000000001/review-sessions/${session.id.toString()}/access` });
    assert.equal(details.statusCode, 409);
  });
});

/** ------------------------------------------------------------------ downloads */
async function downloadApp() {
  const staging = new InMemoryObjectStorage();
  const photos = new InMemoryPhotoRepository();
  const projects = new InMemoryProjectRepository();
  const sessions = new InMemoryDownloadSessionRepository();
  const project = Project.create({ studioId: UniqueEntityId.create(), name: "Elena & Radu", type: "WEDDING" });
  await projects.save(project);

  const bytes = Buffer.from("full size original ".repeat(40));
  const photo = Photo.requestUpload({ projectId: project.id, studioId: project.studioId, fileName: "a.jpg", mimeType: "image/jpeg", byteSize: bytes.byteLength });
  staging.upload(photo.storageKey.toString(), new Uint8Array(bytes));
  photo.markUploaded({ byteSize: bytes.byteLength });
  await photos.save(photo);

  const gateway = new MediaIngestionDeliveryGateway(projects, photos, staging);
  const access = makeAccess();
  const gallery = {
    listPhotos: async () => [{ id: photo.id.toString(), fileName: "a.jpg", previewUrl: "https://x/preview.jpg", thumbnailUrl: "https://x/thumb.jpg" }],
    countProcessing: async () => 0,
  };
  const admin = new DownloadSessionAdminUseCase(sessions, gateway, () => new Date(), access);
  const app = Fastify();
  registerDownloadRoutes(app, {
    downloadAdmin: admin,
    downloadPortal: new DownloadPortalUseCase(sessions, gateway, { photosDownloaded: async () => {} }, () => {}, () => new Date(), access, gallery),
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const opened = (await admin.open({ projectId: project.id.toString(), clientName: "Elena" })).getValue();
  return { app, base, opened, project, sessions, bytes };
}

describe("download links with a password", () => {
  it("hides the gallery and the zip until the password is entered", async () => {
    const { app, base, opened } = await downloadApp();
    const view = await fetch(`${base}/download/${opened.token}`);
    assert.equal(view.status, 401);
    assert.equal((await view.json()).code, "PASSWORD_REQUIRED");
    assert.equal((await fetch(`${base}/download/${opened.token}/photos.zip`)).status, 401);
    await app.close();
  });

  it("shows the browsable display copies (never originals) once unlocked, and downloads with the grant in the link", async () => {
    const { app, base, opened, bytes } = await downloadApp();
    const unlocked = await fetch(`${base}/download/${opened.token}/unlock`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: opened.password }),
    });
    assert.equal(unlocked.status, 200);
    const { grant } = await unlocked.json();

    const view = await (await fetch(`${base}/download/${opened.token}`, { headers: { "x-access-grant": grant } })).json();
    assert.equal(view.photoCount, 1);
    assert.equal(view.photos.length, 1);
    assert.equal(view.photos[0].thumbnailUrl, "https://x/thumb.jpg");
    assert.ok(!JSON.stringify(view).includes("storageKey"));

    // A plain <a href> cannot send a header, so the zip link carries the grant.
    const zip = await fetch(`${base}/download/${opened.token}/photos.zip?grant=${encodeURIComponent(grant)}`);
    assert.equal(zip.status, 200);
    const body = Buffer.from(await zip.arrayBuffer());
    assert.ok(body.includes(bytes), "the original is inside the archive");
    await app.close();
  });

  it("refuses a wrong password and does not reveal whether the link exists elsewhere", async () => {
    const { app, base, opened } = await downloadApp();
    const wrong = await fetch(`${base}/download/${opened.token}/unlock`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "WRONG-WRONG" }),
    });
    assert.equal(wrong.status, 401);
    assert.equal((await wrong.json()).code, "INVALID_PASSWORD");
    const unknown = await fetch(`${base}/download/not-a-real-token-value/unlock`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "x" }),
    });
    assert.equal(unknown.status, 404);
    await app.close();
  });

  it("lets the studio read the link and password again, only for that project", async () => {
    const { app, base, opened, project } = await downloadApp();
    const shown = await fetch(`${base}/projects/${project.id.toString()}/download-sessions/${opened.sessionId}/access`);
    assert.deepEqual(await shown.json(), { token: opened.token, password: opened.password });
    const stranger = await fetch(`${base}/projects/${UniqueEntityId.create().toString()}/download-sessions/${opened.sessionId}/access`);
    assert.equal(stranger.status, 404);

    const list = await (await fetch(`${base}/projects/${project.id.toString()}/download-sessions`)).json();
    assert.equal(list[0].passwordProtected, true);
    await app.close();
  });

  it("keeps a legacy passwordless link open", async () => {
    const { app, base, project, sessions } = await downloadApp();
    const { DownloadSession } = await import("../src/modules/review-collaboration/domain/download-session");
    const { session, token } = DownloadSession.open({ projectId: project.id, clientName: "Old" });
    await sessions.save(session);
    assert.equal((await fetch(`${base}/download/${token}`)).status, 200);
    const details = await fetch(`${base}/projects/${project.id.toString()}/download-sessions/${session.id.toString()}/access`);
    assert.equal(details.status, 409);
    await app.close();
  });
});

/** ------------------------------------------------------------------ photo selection (picks) */
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const PHOTO_A = "33333333-3333-4333-8333-333333333333";

async function pickApp(options: { passwords?: boolean } = {}) {
  const passwords = options.passwords ?? true;
  const sessions = new InMemoryPickSessionRepository();
  const access = passwords ? makeAccess() : undefined;
  const gateway: PickGateway = {
    loadProject: async (id) => (id === PROJECT_ID ? { id, name: "Elena & Radu" } : undefined),
    listPhotos: async () => [{ id: PHOTO_A, fileName: "a.jpg", previewUrl: "https://x/p.jpg", thumbnailUrl: "https://x/t.jpg" }],
    hasPhoto: async (_project, photo) => photo === PHOTO_A,
    countProcessing: async () => 0,
  };
  const submitted: unknown[] = [];
  const admin = new PickSessionAdminUseCase(sessions, gateway, access);
  const app = Fastify();
  registerPickRoutes(app, {
    pickAdmin: admin,
    pickPortal: new PickPortalUseCase(sessions, gateway, { picksSubmitted: async (p) => void submitted.push(p) }, access),
  });
  const opened = (await admin.open({ projectId: PROJECT_ID, clientName: "Elena" })).getValue();
  return { app, sessions, opened, submitted };
}

describe("photo selection links with a password", () => {
  const json = { "content-type": "application/json" };

  it("gives a new selection link a generated password, returned once to the studio", async () => {
    const { opened } = await pickApp();
    assert.match(opened.password!, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  });

  it("turns away viewing, picking and submitting until the password is entered", async () => {
    const { app, opened } = await pickApp();
    for (const request of [
      { method: "GET" as const, url: `/pick/${opened.token}` },
      { method: "PUT" as const, url: `/pick/${opened.token}/photos/${PHOTO_A}`, payload: { picked: true } },
      { method: "POST" as const, url: `/pick/${opened.token}/submit` },
    ]) {
      const response = await app.inject(request);
      assert.equal(response.statusCode, 401, `${request.method} ${request.url}`);
      assert.equal(response.json().code, "PASSWORD_REQUIRED");
    }
  });

  it("lets the client through with the password, and the whole pick-and-submit flow works behind it", async () => {
    const { app, opened, submitted } = await pickApp();
    const wrong = await app.inject({ method: "POST", url: `/pick/${opened.token}/unlock`, headers: json, payload: { password: "WRONG-WRONG" } });
    assert.equal(wrong.json().code, "INVALID_PASSWORD");

    const right = await app.inject({ method: "POST", url: `/pick/${opened.token}/unlock`, headers: json, payload: { password: opened.password!.toLowerCase() } });
    assert.equal(right.statusCode, 200);
    const headers = { "x-access-grant": right.json().grant as string };

    assert.equal((await app.inject({ method: "GET", url: `/pick/${opened.token}`, headers })).json().photos.length, 1);
    // Step 1: mark it. Step 2: it fits, so it arrives chosen and can be sent.
    assert.equal((await app.inject({ method: "PUT", url: `/pick/${opened.token}/photos/${PHOTO_A}`, headers, payload: { picked: true } })).statusCode, 200);
    assert.equal((await app.inject({ method: "POST", url: `/pick/${opened.token}/stage`, headers, payload: { stage: "FINAL" } })).statusCode, 200);
    assert.equal((await app.inject({ method: "POST", url: `/pick/${opened.token}/submit`, headers })).json().status, "SUBMITTED");
    assert.equal(submitted.length, 1, "the studio is only notified for a genuine, authorised submission");
  });

  it("never notifies the studio for an attempt that was not authorised", async () => {
    const { app, opened, submitted } = await pickApp();
    await app.inject({ method: "PUT", url: `/pick/${opened.token}/photos/${PHOTO_A}`, payload: { picked: true } });
    await app.inject({ method: "POST", url: `/pick/${opened.token}/submit` });
    assert.equal(submitted.length, 0);
  });

  it("locks out password guessing with 429", async () => {
    const { app, opened } = await pickApp();
    let last;
    for (let i = 0; i < 9; i++) last = await app.inject({ method: "POST", url: `/pick/${opened.token}/unlock`, headers: json, payload: { password: `nope-${i}` } });
    assert.equal(last!.statusCode, 429);
    assert.ok(Number(last!.headers["retry-after"]) > 0);
  });

  it("does not accept a grant issued for an album review or a download", async () => {
    const { app, opened } = await pickApp();
    const signer = new ClientGrantSigner(SECRET);
    for (const kind of ["review", "download"] as const) {
      const response = await app.inject({
        method: "GET",
        url: `/pick/${opened.token}`,
        headers: { "x-access-grant": signer.sign(kind, opened.sessionId) },
      });
      assert.equal(response.statusCode, 401, `${kind} grant for the very same id must not open a selection link`);
    }
  });

  it("lets the studio read the link and password again, only for that project, and flags it in the list", async () => {
    const { app, opened } = await pickApp();
    const shown = await app.inject({ method: "GET", url: `/projects/${PROJECT_ID}/pick-sessions/${opened.sessionId}/access` });
    assert.deepEqual(shown.json(), { token: opened.token, password: opened.password });

    const stranger = await app.inject({ method: "GET", url: `/projects/${UniqueEntityId.create()}/pick-sessions/${opened.sessionId}/access` });
    assert.equal(stranger.statusCode, 404);

    const list = await app.inject({ method: "GET", url: `/projects/${PROJECT_ID}/pick-sessions` });
    assert.equal(list.json()[0].passwordProtected, true);
  });

  it("leaves a selection link created before passwords existed working, and says it cannot be shown again", async () => {
    const { app, sessions } = await pickApp({ passwords: false });
    const { session, token } = PickSession.open({ projectId: UniqueEntityId.create(PROJECT_ID), clientName: "Old" });
    await sessions.save(session);
    assert.equal((await app.inject({ method: "GET", url: `/pick/${token}` })).statusCode, 200);

    const withAccess = await pickApp();
    const legacy = PickSession.open({ projectId: UniqueEntityId.create(PROJECT_ID), clientName: "Old" });
    await withAccess.sessions.save(legacy.session);
    const details = await withAccess.app.inject({ method: "GET", url: `/projects/${PROJECT_ID}/pick-sessions/${legacy.session.id.toString()}/access` });
    assert.equal(details.statusCode, 409);
    assert.equal((await withAccess.app.inject({ method: "GET", url: `/pick/${legacy.token}` })).statusCode, 200, "a legacy link stays open");
  });
});

import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import Fastify from "fastify";
import { SMTPServer } from "smtp-server";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { Project } from "../src/modules/media-ingestion/domain/project";
import { StudioMember } from "../src/modules/identity/domain/studio-member";
import { DownloadSession } from "../src/modules/review-collaboration/domain/download-session";
import { DownloadSessionAdminUseCase } from "../src/modules/review-collaboration/application/use-cases/download-session-admin.use-case";
import {
  DownloadPortalUseCase,
  slugify,
  uniqueEntryNames,
} from "../src/modules/review-collaboration/application/use-cases/download-portal.use-case";
import { StudioEmailNotifier, enPhotos, formatBytes, roPhotos } from "../src/modules/review-collaboration/application/services/studio-email-notifier";
import {
  CompositePickNotifier,
  IdentityStudioContacts,
  MediaIngestionDeliveryGateway,
} from "../src/modules/review-collaboration/infrastructure/gateways/delivery-gateway";
import { registerDownloadRoutes } from "../src/modules/review-collaboration/interface/http/download-routes";
import { PurgeExpiredOriginalsUseCase } from "../src/modules/media-ingestion/application/use-cases/purge-expired-originals/purge-expired-originals.use-case";
import { PromoteSelectedPhotosUseCase } from "../src/modules/media-ingestion/application/use-cases/promote-selected/promote-selected.use-case";
import { AlbumCompositionPlacementDirectory } from "../src/modules/media-ingestion/infrastructure/gateways/album-placement-gateway";
import { ExportPrintDeliveryDirectory } from "../src/modules/media-ingestion/infrastructure/gateways/delivery-gateway";
import { ReviewCollaborationDownloadHolds } from "../src/modules/media-ingestion/infrastructure/gateways/download-hold-gateway";
import { ExportJob } from "../src/modules/export-print/domain/export-job";
import { SmtpEmailSender, parseSender } from "../src/infrastructure/email/smtp-email-sender";
import { buildEmailSender } from "../src/infrastructure/email/build-email-sender";
import { LoggingEmailSender } from "../src/infrastructure/email/logging-email-sender";
import { MediaUrlSigner } from "../src/infrastructure/storage/media-url-signer";
import { InMemoryStorageProvider } from "../src/dev/in-memory-storage-provider";
import { loadEnv } from "../src/shared-kernel/env";
import type { EmailMessage, EmailSender } from "../src/shared-kernel/email";
import type { DownloadNotifier } from "../src/modules/review-collaboration/application/ports/delivery-gateway";
import {
  InMemoryAlbumRepository,
  InMemoryDownloadSessionRepository,
  InMemoryExportJobRepository,
  InMemoryObjectStorage,
  InMemoryPhotoRepository,
  InMemoryProjectRepository,
  InMemoryStudioMemberRepository,
  InMemoryStudioRepository,
} from "./support/in-memory";
import { Studio } from "../src/modules/identity/domain/studio";

const DAY = 24 * 60 * 60 * 1000;

async function world() {
  const staging = new InMemoryObjectStorage();
  const permanent = new InMemoryStorageProvider(
    new MediaUrlSigner("test-secret-test-secret-test-secret-123", "https://api.example.test"),
  );
  const photos = new InMemoryPhotoRepository();
  const projects = new InMemoryProjectRepository();
  const members = new InMemoryStudioMemberRepository();
  const sessions = new InMemoryDownloadSessionRepository();

  const studio = UniqueEntityId.create();
  const project = Project.create({ studioId: studio, name: "Elena & Radu", type: "WEDDING" });
  await projects.save(project);
  await members.save(StudioMember.invite({ studioId: studio, email: "owner@studio.ro", name: "Owner", role: "OWNER" }));
  await members.save(StudioMember.invite({ studioId: studio, email: "editor@studio.ro", name: "Editor", role: "EDITOR" }));

  const contents = new Map<string, Buffer>();
  async function addPhoto(name: string, options: { purged?: boolean; stored?: boolean } = {}) {
    const bytes = Buffer.from(`original bytes of ${name} `.repeat(50));
    const photo = Photo.requestUpload({
      projectId: project.id,
      studioId: project.studioId,
      fileName: name,
      mimeType: "image/jpeg",
      byteSize: bytes.byteLength,
    });
    photo.markUploaded({ byteSize: bytes.byteLength });
    if (!options.purged) staging.upload(photo.storageKey.toString(), new Uint8Array(bytes));
    if (options.stored) {
      await permanent.upload(photo.storageKey.toString(), bytes, { contentType: "image/jpeg" });
      photo.markFullResStored(new Date());
    }
    if (options.purged) photo.markStagedOriginalPurged(new Date());
    await photos.save(photo);
    contents.set(name, bytes);
    return photo;
  }

  const gateway = new MediaIngestionDeliveryGateway(projects, photos, staging, permanent);
  const sent: EmailMessage[] = [];
  const sender: EmailSender = { id: "test", send: async (message) => void sent.push(message) };
  const email = new StudioEmailNotifier(sender, new IdentityStudioContacts(projects, members), "https://app.example.test", () => {});
  return { staging, permanent, photos, projects, members, sessions, project, addPhoto, gateway, sent, sender, email, contents };
}

const noopNotifier: DownloadNotifier = { photosDownloaded: async () => {} };

describe("DownloadSession", () => {
  const open = (ttlDays?: number) =>
    DownloadSession.open({ projectId: UniqueEntityId.create(), clientName: "Elena", ...(ttlDays ? { ttlDays } : {}) }).session;

  it("is available for 30 days by default", () => {
    const session = open();
    assert.equal(session.daysLeft(), 30);
    assert.ok(session.isActive());
    assert.doesNotThrow(() => session.assertDownloadable());
  });

  it("honours a custom period and rounds a partial day up", () => {
    const session = open(7);
    assert.equal(session.daysLeft(), 7);
    const almostOver = new Date(session.expiresAt.getTime() - 60 * 60 * 1000);
    assert.equal(session.daysLeft(almostOver), 1);
  });

  it("stops working when it expires, and says so", () => {
    const session = open(1);
    const later = new Date(session.expiresAt.getTime() + 1000);
    assert.equal(session.isActive(later), false);
    assert.throws(() => session.assertDownloadable(later), /expired/);
    assert.equal(session.daysLeft(later), 0);
  });

  it("stops working when revoked, and never comes back", () => {
    const session = open();
    session.revoke();
    assert.throws(() => session.assertDownloadable(), /no longer active/);
  });

  it("counts downloads and remembers the first and last", () => {
    const session = open();
    const first = new Date("2026-01-01T10:00:00Z");
    const second = new Date("2026-01-05T10:00:00Z");
    session.recordDownload(first);
    session.recordDownload(second);
    assert.equal(session.downloadCount, 2);
    assert.equal(session.firstDownloadedAt?.toISOString(), first.toISOString());
    assert.equal(session.lastDownloadedAt?.toISOString(), second.toISOString());
  });

  it("stores only a hash of the token", () => {
    const { session, token } = DownloadSession.open({ projectId: UniqueEntityId.create(), clientName: "E" });
    assert.notEqual(session.tokenHash, token);
  });
});

describe("zip entry naming", () => {
  it("keeps distinct names and numbers the duplicates", () => {
    assert.deepEqual(uniqueEntryNames(["a.jpg", "b.jpg", "A.JPG", "a.jpg"]), ["a.jpg", "b.jpg", "A (2).JPG", "a (3).jpg"]);
  });

  it("never lets a name climb out of the archive", () => {
    assert.deepEqual(uniqueEntryNames(["../../etc/passwd", "dir\\evil.jpg", ""]), [".._.._etc_passwd".replace(/^\.+/, ""), "dir_evil.jpg", "photo"]);
  });

  it("makes a safe ASCII file name from a shoot title", () => {
    assert.equal(slugify("Elena & Radu — Nuntă"), "elena-radu-nunta");
    assert.equal(slugify("???"), "album");
  });
});

describe("delivery gateway — what can actually be handed over", () => {
  it("offers staged originals and long-term originals, and counts the ones that are gone", async () => {
    const w = await world();
    await w.addPhoto("staged.jpg");
    await w.addPhoto("kept.jpg", { purged: true, stored: true });
    await w.addPhoto("gone.jpg", { purged: true });
    const { available, missing } = await w.gateway.listDeliverable(w.project.id.toString());

    assert.deepEqual(available.map((p) => p.fileName).sort(), ["kept.jpg", "staged.jpg"]);
    assert.equal(missing, 1);
    for (const photo of available) assert.deepEqual(await photo.read(), w.contents.get(photo.fileName));
  });

  it("ignores uploads that never finished", async () => {
    const w = await world();
    const pending = Photo.requestUpload({
      projectId: w.project.id,
      studioId: w.project.studioId,
      fileName: "pending.jpg",
      mimeType: "image/jpeg",
      byteSize: 10,
    });
    await w.photos.save(pending);
    const { available, missing } = await w.gateway.listDeliverable(w.project.id.toString());
    assert.equal(available.length + missing, 0);
  });
});

describe("photographer's download-link administration", () => {
  it("creates a 30-day link and reports what it covers, including originals already gone", async () => {
    const w = await world();
    await w.addPhoto("a.jpg");
    await w.addPhoto("gone.jpg", { purged: true });
    const admin = new DownloadSessionAdminUseCase(w.sessions, w.gateway);

    const opened = (await admin.open({ projectId: w.project.id.toString(), clientName: "Elena" })).getValue();
    assert.equal(opened.photoCount, 1);
    assert.equal(opened.missingCount, 1);
    const days = (new Date(opened.expiresAt).getTime() - Date.now()) / DAY;
    assert.ok(days > 29.9 && days <= 30);
  });

  it("lists links with a derived EXPIRED status and the download history", async () => {
    const w = await world();
    let now = new Date();
    const admin = new DownloadSessionAdminUseCase(w.sessions, w.gateway, () => now);
    await admin.open({ projectId: w.project.id.toString(), clientName: "Elena", ttlDays: 5 });

    assert.equal((await admin.list(w.project.id.toString()))[0]?.status, "ACTIVE");
    now = new Date(now.getTime() + 6 * DAY);
    const expired = (await admin.list(w.project.id.toString()))[0]!;
    assert.equal(expired.status, "EXPIRED");
    assert.equal(expired.downloadCount, 0);
    assert.equal(expired.lastDownloadedAt, null);
  });

  it("will not let another shoot's id revoke a link", async () => {
    const w = await world();
    const admin = new DownloadSessionAdminUseCase(w.sessions, w.gateway);
    const opened = (await admin.open({ projectId: w.project.id.toString(), clientName: "E" })).getValue();
    const stranger = UniqueEntityId.create().toString();
    assert.equal((await admin.revoke(stranger, opened.sessionId)).getError().code, "NOT_FOUND");
    assert.equal((await admin.revoke(w.project.id.toString(), opened.sessionId)).getValue().status, "REVOKED");
  });

  it("refuses a shoot that does not exist", async () => {
    const w = await world();
    const admin = new DownloadSessionAdminUseCase(w.sessions, w.gateway);
    assert.equal((await admin.open({ projectId: UniqueEntityId.create().toString(), clientName: "X" })).getError().code, "NOT_FOUND");
  });
});

describe("client download portal", () => {
  async function opened(w: Awaited<ReturnType<typeof world>>, notifier: DownloadNotifier = noopNotifier, ttlDays?: number) {
    const admin = new DownloadSessionAdminUseCase(w.sessions, w.gateway);
    const link = (await admin.open({ projectId: w.project.id.toString(), clientName: "Elena", ...(ttlDays ? { ttlDays } : {}) })).getValue();
    return { link, portal: new DownloadPortalUseCase(w.sessions, w.gateway, notifier, () => {}) };
  }

  it("tells the client what they are getting and for how long", async () => {
    const w = await world();
    await w.addPhoto("a.jpg");
    await w.addPhoto("b.jpg");
    const { link, portal } = await opened(w);

    const view = (await portal.view(link.token)).getValue();
    assert.equal(view.projectName, "Elena & Radu");
    assert.equal(view.photoCount, 2);
    assert.equal(view.daysLeft, 30);
    assert.equal(view.totalBytes, [...w.contents.values()].reduce((sum, b) => sum + b.byteLength, 0));
  });

  it("refuses an unknown, revoked or expired link", async () => {
    const w = await world();
    await w.addPhoto("a.jpg");
    const { link, portal } = await opened(w);
    assert.equal((await portal.view("not-a-real-token-value")).getError().code, "NOT_FOUND");

    const session = [...w.sessions.items.values()][0]!;
    session.revoke();
    const revoked = await portal.view(link.token);
    assert.equal(revoked.getError().code, "CONFLICT");
    assert.match(revoked.getError().message, /no longer active/);

    const w2 = await world();
    await w2.addPhoto("a.jpg");
    const second = await opened(w2, noopNotifier, 1);
    [...w2.sessions.items.values()][0]!.recordDownload();
    const later = new DownloadPortalUseCase(w2.sessions, w2.gateway, noopNotifier, () => {}, () => new Date(Date.now() + 2 * DAY));
    const expired = await later.prepare(second.link.token);
    assert.equal(expired.getError().code, "CONFLICT");
    assert.match(expired.getError().message, /expired/);
  });

  it("counts a download and tells the studio only when it completes", async () => {
    const w = await world();
    await w.addPhoto("a.jpg");
    await w.addPhoto("b.jpg");
    const told: Parameters<DownloadNotifier["photosDownloaded"]>[0][] = [];
    const { link, portal } = await opened(w, { photosDownloaded: async (p) => void told.push(p) });

    const prepared = (await portal.prepare(link.token)).getValue();
    assert.equal(prepared.fileName, "elena-radu-photos.zip");
    assert.equal(prepared.entries.length, 2);
    assert.equal(told.length, 0, "preparing is not downloading");
    assert.equal([...w.sessions.items.values()][0]!.downloadCount, 0);

    await prepared.complete();
    assert.equal(told.length, 1);
    assert.equal(told[0]?.photoCount, 2);
    assert.equal(told[0]?.downloadNumber, 1);
    assert.equal([...w.sessions.items.values()][0]!.downloadCount, 1);

    await (await portal.prepare(link.token)).getValue().complete();
    assert.equal(told[1]?.downloadNumber, 2, "a repeat download is announced as such");
  });

  it("never fails the client's download because the studio could not be told", async () => {
    const w = await world();
    await w.addPhoto("a.jpg");
    const logged: string[] = [];
    const admin = new DownloadSessionAdminUseCase(w.sessions, w.gateway);
    const link = (await admin.open({ projectId: w.project.id.toString(), clientName: "E" })).getValue();
    const portal = new DownloadPortalUseCase(
      w.sessions,
      w.gateway,
      { photosDownloaded: async () => { throw new Error("mail server down"); } },
      (message) => logged.push(message),
    );
    const prepared = (await portal.prepare(link.token)).getValue();
    await assert.doesNotReject(prepared.complete());
    assert.equal(logged.length, 1);
  });

  it("has nothing to download when every original is gone", async () => {
    const w = await world();
    await w.addPhoto("gone.jpg", { purged: true });
    const { link, portal } = await opened(w);
    assert.equal((await portal.prepare(link.token)).getError().code, "CONFLICT");
  });
});

/** Reads a stored-method ZIP from its central directory — enough to check names and bytes without a zip library. */
function readZip(zip: Buffer): Map<string, Buffer> {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  assert.ok(eocd >= 0, "not a zip: no end-of-central-directory record");
  const count = zip.readUInt16LE(eocd + 10);
  let cursor = zip.readUInt32LE(eocd + 16);
  const entries = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    assert.equal(zip.readUInt32LE(cursor), 0x02014b50);
    const method = zip.readUInt16LE(cursor + 10);
    const size = zip.readUInt32LE(cursor + 20);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString();
    assert.equal(method, 0, "photos are stored, not recompressed");
    const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    entries.set(name, zip.subarray(dataStart, dataStart + size));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

describe("download routes — the ZIP itself", () => {
  async function serve(w: Awaited<ReturnType<typeof world>>, notifier: DownloadNotifier) {
    const app = Fastify();
    const admin = new DownloadSessionAdminUseCase(w.sessions, w.gateway);
    registerDownloadRoutes(app, {
      downloadAdmin: admin,
      downloadPortal: new DownloadPortalUseCase(w.sessions, w.gateway, notifier, () => {}),
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const link = (await admin.open({ projectId: w.project.id.toString(), clientName: "Elena" })).getValue();
    return { app, base, link };
  }

  it("delivers a real zip whose files are byte-identical to the originals, then reports it", async () => {
    const w = await world();
    await w.addPhoto("IMG_0001.jpg");
    await w.addPhoto("IMG_0001.jpg");
    await w.addPhoto("kept.jpg", { purged: true, stored: true });
    const told: unknown[] = [];
    const { app, base, link } = await serve(w, { photosDownloaded: async (p) => void told.push(p) });

    const response = await fetch(`${base}/download/${link.token}/photos.zip`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/zip");
    assert.match(response.headers.get("content-disposition") ?? "", /attachment; filename="elena-radu-photos\.zip"/);
    const entries = readZip(Buffer.from(await response.arrayBuffer()));

    assert.deepEqual([...entries.keys()].sort(), ["IMG_0001 (2).jpg", "IMG_0001.jpg", "kept.jpg"]);
    assert.deepEqual(entries.get("kept.jpg"), w.contents.get("kept.jpg"), "a long-term original is in the zip too");
    assert.deepEqual(entries.get("IMG_0001.jpg"), w.contents.get("IMG_0001.jpg"));

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(told.length, 1);
    await app.close();
  });

  it("serves the view, and turns a bad link into a clear error", async () => {
    const w = await world();
    await w.addPhoto("a.jpg");
    const { app, base, link } = await serve(w, noopNotifier);

    const view = await (await fetch(`${base}/download/${link.token}`)).json();
    assert.equal(view.photoCount, 1);
    assert.equal(view.daysLeft, 30);
    assert.equal((await fetch(`${base}/download/unknown-token-value`)).status, 404);
    assert.equal((await fetch(`${base}/download/unknown-token-value/photos.zip`)).status, 404);

    [...w.sessions.items.values()][0]!.revoke();
    const revoked = await fetch(`${base}/download/${link.token}/photos.zip`);
    assert.equal(revoked.status, 409);
    await app.close();
  });

  it("does not count a download the client abandoned halfway", async () => {
    const w = await world();
    for (let i = 0; i < 6; i++) await w.addPhoto(`p${i}.jpg`);
    const told: unknown[] = [];
    const { app, base, link } = await serve(w, { photosDownloaded: async (p) => void told.push(p) });

    const controller = new AbortController();
    const response = await fetch(`${base}/download/${link.token}/photos.zip`, { signal: controller.signal });
    const reader = response.body!.getReader();
    await reader.read();
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 150));

    assert.equal(told.length, 0);
    assert.equal([...w.sessions.items.values()][0]!.downloadCount, 0);
    await app.close();
  });
});

describe("emails to the studio", () => {
  it("tells the owners — not the editors — when a client downloads, in English and Romanian", async () => {
    const w = await world();
    await w.email.photosDownloaded({
      projectId: w.project.id.toString(),
      sessionId: "s",
      clientName: "Elena",
      photoCount: 120,
      byteSize: 512 * 1024 * 1024,
      downloadNumber: 1,
    });
    assert.equal(w.sent.length, 1);
    const mail = w.sent[0]!;
    assert.deepEqual(mail.to, ["owner@studio.ro"]);
    assert.match(mail.subject, /a descărcat fotografiile \/ downloaded the photos/);
    assert.match(mail.text, /RO: Elena a descărcat toate fotografiile/);
    assert.match(mail.text, /EN: Elena has downloaded all the photos for "Elena & Radu": 120 photos, 512\.0 MB/);
    assert.match(mail.text, /https:\/\/app\.example\.test\/projects\//);
  });

  it("says when it is a repeat download", async () => {
    const w = await world();
    await w.email.photosDownloaded({ projectId: w.project.id.toString(), sessionId: "s", clientName: "E", photoCount: 1, byteSize: 1, downloadNumber: 3 });
    assert.match(w.sent[0]!.text, /a 3-a oară/);
    assert.match(w.sent[0]!.text, /download #3/);
  });

  it("tells the owners when a client sends their picks", async () => {
    const w = await world();
    await w.email.picksSubmitted({ projectId: w.project.id.toString(), sessionId: "s", clientName: "Elena", photoIds: ["a", "b", "c"] });
    const mail = w.sent[0]!;
    assert.deepEqual(mail.to, ["owner@studio.ro"]);
    assert.match(mail.subject, /a trimis selecția foto \/ sent their photo selection/);
    assert.match(mail.text, /3 fotografii/);
    assert.match(mail.text, /3 photos/);
  });

  it("escapes what a client typed before putting it in the HTML part", async () => {
    const w = await world();
    await w.email.picksSubmitted({
      projectId: w.project.id.toString(),
      sessionId: "s",
      clientName: `<img src=x onerror=alert(1)>`,
      photoIds: ["a"],
    });
    assert.ok(!w.sent[0]!.html!.includes("<img"));
    assert.ok(w.sent[0]!.html!.includes("&lt;img"));
  });

  it("never throws into the client's request when mail fails, and says nothing when there is no owner", async () => {
    const w = await world();
    const logged: string[] = [];
    const failing = new StudioEmailNotifier(
      { id: "x", send: async () => { throw new Error("smtp down"); } },
      new IdentityStudioContacts(w.projects, w.members),
      "https://app.example.test",
      (message) => logged.push(message),
    );
    await assert.doesNotReject(failing.picksSubmitted({ projectId: w.project.id.toString(), sessionId: "s", clientName: "E", photoIds: ["a"] }));
    assert.equal(logged.length, 1);

    const noOwner = new StudioEmailNotifier(
      w.sender,
      { forProject: async () => ({ projectName: "x", ownerEmails: [] }) },
      "https://app.example.test",
      (message) => logged.push(message),
    );
    await noOwner.picksSubmitted({ projectId: "p", sessionId: "s", clientName: "E", photoIds: ["a"] });
    assert.equal(w.sent.length, 0);
    assert.match(logged.at(-1)!, /no owner email/);
  });

  it("uses the owner email shown in Studio settings, once even if an owner member has the same address", async () => {
    const w = await world();
    const studios = new InMemoryStudioRepository();
    const { studio } = Studio.create({ name: "Golden Hour", ownerEmail: "Trutzzi@Yahoo.ro" });
    await studios.save(studio);
    const project = Project.create({ studioId: studio.id, name: "Shoot", type: "WEDDING" });
    await w.projects.save(project);
    await w.members.save(StudioMember.invite({ studioId: studio.id, email: "trutzzi@yahoo.ro", name: "Owner", role: "OWNER" }));
    await w.members.save(StudioMember.invite({ studioId: studio.id, email: "second-owner@studio.ro", name: "Second", role: "OWNER" }));
    await w.members.save(StudioMember.invite({ studioId: studio.id, email: "viewer@studio.ro", name: "Viewer", role: "VIEWER" }));

    const contacts = await new IdentityStudioContacts(w.projects, w.members, studios).forProject(project.id.toString());
    assert.deepEqual(contacts?.ownerEmails, ["Trutzzi@Yahoo.ro", "second-owner@studio.ro"]);
  });

  it("lets one failing notifier not stop the next", async () => {
    const calls: string[] = [];
    const composite = new CompositePickNotifier(
      [
        { picksSubmitted: async () => { throw new Error("boom"); } },
        { picksSubmitted: async () => void calls.push("second") },
      ],
      () => {},
    );
    await composite.picksSubmitted({ projectId: "p", sessionId: "s", clientName: "E", photoIds: [] });
    assert.deepEqual(calls, ["second"]);
  });

  it("counts photos in correct English and Romanian", () => {
    assert.equal(enPhotos(1), "1 photo");
    assert.equal(enPhotos(2), "2 photos");
    assert.equal(roPhotos(1), "1 fotografie");
    assert.equal(roPhotos(3), "3 fotografii");
    assert.equal(roPhotos(19), "19 fotografii");
    assert.equal(roPhotos(20), "20 de fotografii");
    assert.equal(roPhotos(120), "120 de fotografii");
    assert.equal(roPhotos(101), "101 fotografii");
  });

  it("formats sizes for people", () => {
    assert.equal(formatBytes(500), "1 KB");
    assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
    assert.equal(formatBytes(3 * 1024 * 1024 * 1024), "3.00 GB");
  });
});

describe("the configured sender address", () => {
  it("reads every shape MAIL_FROM is written in", () => {
    assert.deepEqual(parseSender("AlbumFlow <app@studio.ro>"), { name: "AlbumFlow", address: "app@studio.ro" });
    assert.deepEqual(parseSender("app@studio.ro"), { address: "app@studio.ro" });
    assert.deepEqual(parseSender('"AlbumFlow" <app@studio.ro>'), { name: "AlbumFlow", address: "app@studio.ro" });
    assert.deepEqual(parseSender("  AlbumFlow Studio <app@studio.ro>  "), {
      name: "AlbumFlow Studio",
      address: "app@studio.ro",
    });
  });

  it("recovers an address whose angle brackets were eaten on the way to the server", () => {
    // What production actually had. Sent as-is it becomes "AlbumFlow app"@studio.ro,
    // which strict receivers reject with 501 and the mail bounces.
    assert.deepEqual(parseSender("AlbumFlow app@studio.ro"), { name: "AlbumFlow", address: "app@studio.ro" });
  });
});

describe("real SMTP delivery", () => {
  it("sends a message through an actual SMTP conversation, with login", async () => {
    const received: { from: string; to: string[]; raw: string; user?: string }[] = [];
    const server = new SMTPServer({
      authOptional: false,
      allowInsecureAuth: true,
      disabledCommands: ["STARTTLS"],
      onAuth(auth, _session, callback) {
        if (auth.username === "notify@studio.ro" && auth.password === "app-password") callback(null, { user: auth.username });
        else callback(new Error("Invalid login"));
      },
      onData(stream, session, callback) {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("end", () => {
          received.push({
            from: session.envelope.mailFrom ? session.envelope.mailFrom.address : "",
            to: session.envelope.rcptTo.map((r) => r.address),
            raw: Buffer.concat(chunks).toString(),
            ...(session.user ? { user: String(session.user) } : {}),
          });
          callback();
        });
      },
    });
    server.listen(0, "127.0.0.1");
    await once(server.server, "listening");
    const port = (server.server.address() as AddressInfo).port;

    try {
      const sender = new SmtpEmailSender({
        host: "127.0.0.1",
        port,
        secure: false,
        user: "notify@studio.ro",
        password: "app-password",
        from: "AlbumFlow <notify@studio.ro>",
      });
      const w = await world();
      const notifier = new StudioEmailNotifier(sender, new IdentityStudioContacts(w.projects, w.members), "https://app.example.test", (m) => assert.fail(m));
      await notifier.photosDownloaded({
        projectId: w.project.id.toString(),
        sessionId: "s",
        clientName: "Elena",
        photoCount: 10,
        byteSize: 1024 * 1024,
        downloadNumber: 1,
      });

      assert.equal(received.length, 1);
      assert.equal(received[0]?.from, "notify@studio.ro");
      assert.deepEqual(received[0]?.to, ["owner@studio.ro"]);
      assert.equal(received[0]?.user, "notify@studio.ro");
      assert.match(received[0]!.raw, /Subject: =\?UTF-8\?|Subject: Elena/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("puts a bare address in the envelope even when MAIL_FROM is malformed", async () => {
    const received: { from: string; to: string[] }[] = [];
    const server = new SMTPServer({
      authOptional: true,
      allowInsecureAuth: true,
      disabledCommands: ["STARTTLS"],
      onData(stream, session, callback) {
        stream.on("data", () => {});
        stream.on("end", () => {
          received.push({
            from: session.envelope.mailFrom ? session.envelope.mailFrom.address : "",
            to: session.envelope.rcptTo.map((r) => r.address),
          });
          callback();
        });
      },
    });
    server.listen(0, "127.0.0.1");
    await once(server.server, "listening");
    try {
      const sender = new SmtpEmailSender({
        host: "127.0.0.1",
        port: (server.server.address() as AddressInfo).port,
        secure: false,
        user: undefined,
        password: undefined,
        // The broken shape, exactly as production had it.
        from: "AlbumFlow app@studio.ro",
      });
      await sender.send({ to: ["couple@example.com"], subject: "s", text: "t" });
      assert.equal(received[0]?.from, "app@studio.ro", "the envelope sender is a plain address");
      assert.deepEqual(received[0]?.to, ["couple@example.com"]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("surfaces a wrong password to the caller of the raw sender, so the notifier can log it", async () => {
    const server = new SMTPServer({
      authOptional: false,
      allowInsecureAuth: true,
      disabledCommands: ["STARTTLS"],
      onAuth(_auth, _session, callback) {
        callback(new Error("Invalid login"));
      },
    });
    server.listen(0, "127.0.0.1");
    await once(server.server, "listening");
    try {
      const sender = new SmtpEmailSender({
        host: "127.0.0.1",
        port: (server.server.address() as AddressInfo).port,
        secure: false,
        user: "x",
        password: "wrong",
        from: "a@b.ro",
      });
      await assert.rejects(sender.send({ to: ["o@studio.ro"], subject: "s", text: "t" }));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe("email settings", () => {
  const base = {
    DATABASE_URL: "x", REDIS_URL: "x", S3_ENDPOINT: "x", S3_BUCKET: "x",
    S3_ACCESS_KEY_ID: "x", S3_SECRET_ACCESS_KEY: "x", JWT_SECRET: "x".repeat(32),
  };

  it("defaults to logging only, so nothing sends mail unless configured", () => {
    assert.equal(buildEmailSender(loadEnv(base)).id, "log");
    assert.ok(buildEmailSender(loadEnv(base)) instanceof LoggingEmailSender);
  });

  it("builds an SMTP sender from settings, and refuses a half-configured one", () => {
    const configured = loadEnv({ ...base, EMAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.example.test", MAIL_FROM: "a@b.ro" });
    assert.equal(configured.SMTP_PORT, 587);
    assert.equal(configured.SMTP_SECURE, false);
    assert.equal(buildEmailSender(configured).id, "smtp");
    assert.equal(loadEnv({ ...base, EMAIL_PROVIDER: "smtp", SMTP_HOST: "h", MAIL_FROM: "a@b.ro", SMTP_SECURE: "true" }).SMTP_SECURE, true);
    assert.throws(() => buildEmailSender(loadEnv({ ...base, EMAIL_PROVIDER: "smtp" })), /SMTP_HOST, MAIL_FROM/);
  });

  it("refuses to try a login with no password, since a server would lock repeated failures out", () => {
    const noPassword = loadEnv({ ...base, EMAIL_PROVIDER: "smtp", SMTP_HOST: "h", MAIL_FROM: "a@b.ro", SMTP_USER: "app@x.ro" });
    assert.throws(() => buildEmailSender(noPassword), /SMTP_PASSWORD is empty/);
    const ok = loadEnv({ ...base, EMAIL_PROVIDER: "smtp", SMTP_HOST: "h", MAIL_FROM: "a@b.ro", SMTP_USER: "app@x.ro", SMTP_PASSWORD: "p" });
    assert.equal(buildEmailSender(ok).id, "smtp");
  });
});

describe("originals are kept while a download link is active", () => {
  async function sweep(w: Awaited<ReturnType<typeof world>>, now: Date) {
    const albums = new InMemoryAlbumRepository();
    const exportJobs = new InMemoryExportJobRepository();
    const { Album } = await import("../src/modules/album-composition/domain/album");
    const album = Album.create({ projectId: w.project.id, title: "A", spreads: [] });
    await albums.save(album);
    await exportJobs.save(
      ExportJob.reconstitute(
        {
          albumId: album.id, printProfileId: "lab-standard-300", status: "READY", storageKey: "exports/x.pdf",
          byteSize: 1, pageCount: 1, failureReason: undefined,
          requestedAt: new Date(now.getTime() - 40 * DAY), completedAt: new Date(now.getTime() - 40 * DAY),
        },
        UniqueEntityId.create(),
      ),
    );
    const placements = new AlbumCompositionPlacementDirectory(albums);
    return new PurgeExpiredOriginalsUseCase(
      w.projects, w.photos, w.staging,
      new ExportPrintDeliveryDirectory(exportJobs, albums),
      placements,
      new PromoteSelectedPhotosUseCase(w.photos, w.staging, w.permanent, placements),
      30,
      () => now,
      undefined,
      new ReviewCollaborationDownloadHolds(w.sessions),
    );
  }

  it("skips the shoot while a link is active, and sweeps it once the link is revoked", async () => {
    const w = await world();
    const photo = await w.addPhoto("a.jpg");
    await new (await import("../src/modules/media-ingestion/application/use-cases/generate-derivatives/generate-derivatives.use-case")).GenerateDerivativesUseCase(
      w.photos, w.staging, { resize: async (b: Buffer) => b } as never, w.permanent,
    ).execute({ photoId: photo.id.toString() }).catch(() => undefined);
    const admin = new DownloadSessionAdminUseCase(w.sessions, w.gateway);
    const link = (await admin.open({ projectId: w.project.id.toString(), clientName: "E" })).getValue();

    const now = new Date();
    const held = await (await sweep(w, now)).execute();
    assert.equal(held.projectsOnHold, 1);
    assert.equal(held.purged, 0);
    assert.ok(w.staging.objects.has(photo.storageKey.toString()), "the original is still there for the client");

    await admin.revoke(w.project.id.toString(), link.sessionId);
    const released = await (await sweep(w, now)).execute();
    assert.equal(released.projectsOnHold, 0);
  });

  it("stops holding once the link has expired", async () => {
    const w = await world();
    await w.addPhoto("a.jpg");
    const admin = new DownloadSessionAdminUseCase(w.sessions, w.gateway);
    await admin.open({ projectId: w.project.id.toString(), clientName: "E", ttlDays: 1 });
    const later = new Date(Date.now() + 3 * DAY);
    const summary = await (await sweep(w, later)).execute();
    assert.equal(summary.projectsOnHold, 0);
  });
});

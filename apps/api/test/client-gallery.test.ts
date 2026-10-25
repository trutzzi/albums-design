import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { Project } from "../src/modules/media-ingestion/domain/project";
import { Studio } from "../src/modules/identity/domain/studio";
import { Subscription } from "../src/modules/identity/domain/subscription";
import { StudioAdministrationUseCase } from "../src/modules/identity/application/use-cases/studio-administration.use-case";
import { SubscriptionStudioBrandingDirectory } from "../src/modules/identity/infrastructure/branding/subscription-branding-directory";
import { PickSession } from "../src/modules/review-collaboration/domain/pick-session";
import { chooseCover, storySections } from "../src/modules/review-collaboration/domain/client-gallery";
import { DownloadSessionAdminUseCase } from "../src/modules/review-collaboration/application/use-cases/download-session-admin.use-case";
import { DownloadPortalUseCase } from "../src/modules/review-collaboration/application/use-cases/download-portal.use-case";
import { MediaIngestionDeliveryGateway } from "../src/modules/review-collaboration/infrastructure/gateways/delivery-gateway";
import { registerDownloadRoutes } from "../src/modules/review-collaboration/interface/http/download-routes";
import {
  DEFAULT_CLIENT_STYLE,
  clientStyleSchema,
  readClientStyle,
  studioBrandingSchema,
  withOverride,
} from "@albumflow/contracts";
import type { PhotoTraits, PhotoTraitsDirectory } from "../src/shared-kernel/photo-traits";
import type { PickablePhoto } from "../src/modules/review-collaboration/application/ports/pick-gateway";
import { RecordingLogger } from "./support/recording-logger";
import { silentLogger } from "../src/shared-kernel/logger";
import { NO_WATERMARKS, type PlanFeatureDirectory } from "../src/shared-kernel/plan-features";
import {
  InMemoryDownloadSessionRepository,
  InMemoryObjectStorage,
  InMemoryPhotoRepository,
  InMemoryPickSessionRepository,
  InMemoryProjectRepository,
  InMemoryStudioMemberRepository,
  InMemoryStudioRepository,
  InMemorySubscriptionRepository,
} from "./support/in-memory";

const noopNotifier = { photosDownloaded: async () => {} };

function shot(id: string, width: number | null = 1200, height: number | null = 800) {
  return { id, width, height };
}

describe("arranging the delivery gallery", () => {
  const traits = new Map<string, PhotoTraits>([
    ["prep", { category: "PREPARATION", score: 95 }],
    ["wide", { category: "COUPLE", score: 80 }],
    ["tall", { category: "COUPLE", score: 80 }],
    ["face", { category: "PORTRAIT", score: 99 }],
    ["vows", { category: "CEREMONY", score: 70 }],
  ]);
  const photos = [shot("prep"), shot("wide"), shot("tall", 800, 1200), shot("face"), shot("vows")];

  it("keeps the photographer's cover while that photo is still in the gallery", () => {
    assert.equal(chooseCover(photos, traits, "vows"), "vows");
    assert.equal(chooseCover(photos, traits, "deleted-photo"), "tall");
  });

  it("prefers a couple shot over a better portrait, and an upright one on a tie", () => {
    assert.equal(chooseCover(photos, traits), "tall");
  });

  it("falls back to a portrait, then the best analysed photo, then the first photo", () => {
    assert.equal(chooseCover([shot("prep"), shot("face")], traits), "face");
    assert.equal(chooseCover([shot("prep"), shot("vows")], traits), "prep");
    assert.equal(chooseCover([shot("new-1"), shot("new-2")], traits), "new-1");
    assert.equal(chooseCover([], traits), null);
  });

  it("lists each chapter once, in the order of the day", () => {
    assert.deepEqual(storySections([...photos, shot("unanalysed"), shot("prep")], traits), [
      "PREPARATION",
      "COUPLE",
      "PORTRAIT",
      "CEREMONY",
    ]);
  });
});

async function world() {
  const staging = new InMemoryObjectStorage();
  const photos = new InMemoryPhotoRepository();
  const projects = new InMemoryProjectRepository();
  const sessions = new InMemoryDownloadSessionRepository();
  const picks = new InMemoryPickSessionRepository();
  const eventDate = new Date("2026-06-06T00:00:00.000Z");
  const project = Project.create({
    studioId: UniqueEntityId.create(),
    name: "Andreea & Bogdan",
    type: "WEDDING",
    eventDate,
  });
  await projects.save(project);

  const traits = new Map<string, PhotoTraits>();
  async function addPhoto(name: string, category?: string, score = 50) {
    const bytes = Buffer.from(`bytes of ${name}`);
    const photo = Photo.requestUpload({
      projectId: project.id,
      studioId: project.studioId,
      fileName: name,
      mimeType: "image/jpeg",
      byteSize: bytes.byteLength,
    });
    photo.markUploaded({ byteSize: bytes.byteLength });
    staging.upload(photo.storageKey.toString(), new Uint8Array(bytes));
    await photos.save(photo);
    if (category) traits.set(photo.id.toString(), { category, score });
    return photo.id.toString();
  }

  const traitsDirectory: PhotoTraitsDirectory = { forProject: async () => traits };
  const gateway = new MediaIngestionDeliveryGateway(projects, photos, staging);
  // The display copies the client browses: one per photo, in upload order.
  const gallery = {
    listPhotos: async (): Promise<PickablePhoto[]> =>
      (await photos.findByProjectId(project.id)).map((photo) => ({
        id: photo.id.toString(),
        fileName: photo.fileName,
        previewUrl: `https://cdn.test/${photo.id.toString()}/preview.jpg`,
        thumbnailUrl: `https://cdn.test/${photo.id.toString()}/thumb.jpg`,
        width: 1200,
        height: 800,
      })),
    countProcessing: async () => 0,
  };
  const studioPro: PlanFeatureDirectory = { forProject: async () => ({ ...NO_WATERMARKS, clientBranding: true }) };
  const admin = new DownloadSessionAdminUseCase(
    sessions,
    gateway,
    () => new Date(),
    undefined,
    undefined,
    undefined,
    studioPro,
  );
  const link = (await admin.open({ projectId: project.id.toString(), clientName: "Andreea" })).getValue();
  const portal = (directory: PhotoTraitsDirectory = traitsDirectory, logger = silentLogger) =>
    new DownloadPortalUseCase(sessions, gateway, noopNotifier, logger, () => new Date(), undefined, gallery, {
      traits: directory,
      picks,
    });

  async function sendPicks(photoIds: string[], submittedAt?: Date) {
    const { session } = PickSession.open({ projectId: project.id, clientName: "Andreea" });
    for (const id of photoIds) session.setShortlisted(id, true);
    // With no limit the whole shortlist carries over as the final picks.
    session.goToFinal();
    session.submit();
    if (submittedAt) (session as unknown as { props: { submittedAt: Date } }).props.submittedAt = submittedAt;
    await picks.save(session);
  }

  return { project, eventDate, addPhoto, admin, link, portal, picks, sendPicks, sessions, photos, projects, gateway };
}

describe("the delivery gallery the client sees", () => {
  it("shows the event date, chapters, an automatic cover and the client's latest picks as favourites", async () => {
    const w = await world();
    const prep = await w.addPhoto("001.jpg", "PREPARATION", 90);
    const couple = await w.addPhoto("002.jpg", "COUPLE", 60);
    const loose = await w.addPhoto("003.jpg");
    await w.sendPicks([prep], new Date("2026-06-10T00:00:00Z"));
    await w.sendPicks([couple, loose], new Date("2026-06-12T00:00:00Z"));
    // An open selection the client has not sent is not a choice yet.
    const { session: draft } = PickSession.open({ projectId: w.project.id, clientName: "Andreea" });
    draft.setShortlisted(prep, true);
    await w.picks.save(draft);

    const view = (await w.portal().view(w.link.token)).getValue();
    assert.equal(view.eventDate, w.eventDate.toISOString());
    assert.deepEqual(view.sections, ["PREPARATION", "COUPLE"]);
    assert.deepEqual(
      view.photos.map((photo) => photo.section),
      ["PREPARATION", "COUPLE", null],
    );
    assert.equal(view.coverPhotoId, couple);
    assert.deepEqual(view.favoritePhotoIds.sort(), [couple, loose].sort());
  });

  it("tells the page how big each original is, so it can size each download", async () => {
    const w = await world();
    const kept = await w.addPhoto("001.jpg", "COUPLE");
    const gone = await w.addPhoto("002.jpg", "COUPLE");
    // Past the retention window, with no long-term copy: browsable, but in no download.
    const purged = (await w.photos.findById(UniqueEntityId.create(gone)))!;
    purged.markStagedOriginalPurged(new Date());
    await w.photos.save(purged);

    const view = (await w.portal().view(w.link.token)).getValue();
    const size = (id: string) => view.photos.find((photo) => photo.id === id)?.byteSize;
    assert.equal(size(kept), Buffer.byteLength("bytes of 001.jpg"));
    assert.equal(size(gone), null);
    assert.equal(view.totalBytes, Buffer.byteLength("bytes of 001.jpg"));
  });

  it("uses the photographer's chosen cover", async () => {
    const w = await world();
    const prep = await w.addPhoto("001.jpg", "PREPARATION");
    await w.addPhoto("002.jpg", "COUPLE");
    const chosen = await w.admin.chooseCover(w.project.id.toString(), w.link.sessionId, prep);
    assert.equal(chosen.getValue().coverPhotoId, prep);
    assert.equal((await w.portal().view(w.link.token)).getValue().coverPhotoId, prep);

    const reset = await w.admin.chooseCover(w.project.id.toString(), w.link.sessionId, null);
    assert.equal(reset.getValue().coverPhotoId, null);
  });

  it("still shows every photo, undivided, when the categories cannot be read", async () => {
    const w = await world();
    await w.addPhoto("001.jpg", "COUPLE");
    const logger = new RecordingLogger();
    const broken: PhotoTraitsDirectory = {
      forProject: async () => {
        throw new Error("database unavailable");
      },
    };
    const view = (await w.portal(broken, logger).view(w.link.token)).getValue();
    assert.equal(view.photos.length, 1);
    assert.deepEqual(view.sections, []);
    assert.ok(logger.entries.some((entry) => entry.level === "warn"));
  });
});

describe("downloading part of the gallery", () => {
  it("zips only the chapter, or only the favourites, and names the file after it", async () => {
    const w = await world();
    const prep = await w.addPhoto("001.jpg", "PREPARATION");
    await w.addPhoto("002.jpg", "COUPLE");
    const vows = await w.addPhoto("003.jpg", "CEREMONY");
    await w.sendPicks([prep, vows]);
    const portal = w.portal();

    const section = (await portal.prepare(w.link.token, { kind: "section", section: "COUPLE" })).getValue();
    assert.deepEqual(
      section.entries.map((entry) => entry.name),
      ["002.jpg"],
    );
    assert.equal(section.fileName, "andreea-bogdan-couple.zip");

    const favorites = (await portal.prepare(w.link.token, { kind: "favorites" })).getValue();
    assert.deepEqual(
      favorites.entries.map((entry) => entry.name),
      ["001.jpg", "003.jpg"],
    );
    assert.equal(favorites.fileName, "andreea-bogdan-favorites.zip");

    assert.equal((await portal.prepare(w.link.token)).getValue().entries.length, 3);
  });

  it("says so when there is nothing in the chosen part", async () => {
    const w = await world();
    await w.addPhoto("001.jpg", "COUPLE");
    const portal = w.portal();
    const favorites = await portal.prepare(w.link.token, { kind: "favorites" });
    assert.match(favorites.getError().message, /no favourite photos/);
    const section = await portal.prepare(w.link.token, { kind: "section", section: "RECEPTION" });
    assert.equal(section.getError().code, "CONFLICT");
  });

  it("reports a failed category read as an error, not as an empty chapter", async () => {
    const w = await world();
    await w.addPhoto("001.jpg", "COUPLE");
    const logger = new RecordingLogger();
    const broken: PhotoTraitsDirectory = {
      forProject: async () => {
        throw new Error("database unavailable");
      },
    };
    const section = await w.portal(broken, logger).prepare(w.link.token, { kind: "section", section: "COUPLE" });
    assert.match(section.getError().message, /could not prepare/);
    assert.ok(logger.entries.some((entry) => entry.level === "error"));
  });
});

describe("choosing the gallery cover", () => {
  it("never accepts another shoot's photo or another shoot's link", async () => {
    const w = await world();
    await w.addPhoto("001.jpg", "COUPLE");
    const other = Project.create({ studioId: UniqueEntityId.create(), name: "Other", type: "WEDDING" });
    await w.projects.save(other);
    const foreign = Photo.requestUpload({
      projectId: other.id,
      studioId: other.studioId,
      fileName: "x.jpg",
      mimeType: "image/jpeg",
      byteSize: 1,
    });
    await w.photos.save(foreign);

    const project = w.project.id.toString();
    assert.equal(
      (await w.admin.chooseCover(project, w.link.sessionId, foreign.id.toString())).getError().code,
      "NOT_FOUND",
    );
    assert.equal((await w.admin.chooseCover(other.id.toString(), w.link.sessionId, null)).getError().code, "NOT_FOUND");
  });
});

describe("download routes — gallery options", () => {
  async function server() {
    const w = await world();
    const prep = await w.addPhoto("001.jpg", "PREPARATION");
    await w.addPhoto("002.jpg", "COUPLE");
    const app = Fastify();
    registerDownloadRoutes(app, { downloadAdmin: w.admin, downloadPortal: w.portal() });
    return { w, app, prep };
  }

  it("downloads one chapter as its own zip", async () => {
    const { w, app } = await server();
    const response = await app.inject({
      method: "GET",
      url: `/download/${w.link.token}/photos.zip?scope=section&section=COUPLE`,
    });
    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["content-disposition"]), /andreea-bogdan-couple\.zip/);
  });

  it("refuses a chapter download that names no chapter, or a malformed one", async () => {
    const { w, app } = await server();
    for (const query of ["scope=section", "scope=section&section=../etc", "scope=everything"]) {
      const response = await app.inject({ method: "GET", url: `/download/${w.link.token}/photos.zip?${query}` });
      assert.notEqual(response.statusCode, 200, query);
    }
  });

  it("sets and clears the cover from the studio side", async () => {
    const { w, app, prep } = await server();
    const url = `/projects/${w.project.id.toString()}/download-sessions/${w.link.sessionId}/cover`;
    const set = await app.inject({ method: "PUT", url, payload: { photoId: prep } });
    assert.equal(set.statusCode, 200);
    assert.equal(set.json().coverPhotoId, prep);
    const cleared = await app.inject({ method: "PUT", url, payload: { photoId: null } });
    assert.equal(cleared.json().coverPhotoId, null);
  });
});

describe("the studio's contact card", () => {
  async function branding() {
    const studios = new InMemoryStudioRepository();
    const subscriptions = new InMemorySubscriptionRepository();
    const projects = new InMemoryProjectRepository();
    const { studio } = Studio.create({ name: "Artzz Foto", ownerEmail: "owner@artzz.ro" });
    await studios.save(studio);
    const subscription = Subscription.startDefault(studio.id);
    subscription.assignPlan("STUDIO_PRO");
    await subscriptions.save(subscription);
    const project = Project.create({ studioId: studio.id, name: "Wedding", type: "WEDDING" });
    await projects.save(project);
    return {
      studioId: studio.id.toString(),
      projectId: project.id.toString(),
      administration: new StudioAdministrationUseCase(studios, subscriptions, new InMemoryStudioMemberRepository()),
      directory: new SubscriptionStudioBrandingDirectory(projects, studios, subscriptions),
    };
  }

  it("shows the website, phone and email on the shoot's client pages, even with no other branding", async () => {
    const w = await branding();
    await w.administration.setBranding(w.studioId, "OWNER", {
      displayName: "",
      accent: null,
      logo: null,
      website: " https://artzz.ro ",
      phone: "+40 721 283 080",
      email: "hello@artzz.ro",
    });
    assert.deepEqual(await w.directory.forProject(w.projectId), {
      name: "Artzz Foto",
      accent: null,
      logo: null,
      website: "https://artzz.ro",
      phone: "+40 721 283 080",
      email: "hello@artzz.ro",
      style: DEFAULT_CLIENT_STYLE,
    });
  });

  it("clears the branding entirely once every field is emptied", async () => {
    const w = await branding();
    await w.administration.setBranding(w.studioId, "OWNER", {
      displayName: "",
      accent: null,
      logo: null,
      website: "https://artzz.ro",
    });
    await w.administration.setBranding(w.studioId, "OWNER", {
      displayName: "",
      accent: null,
      logo: null,
      website: "",
      phone: null,
    });
    assert.equal(await w.directory.forProject(w.projectId), null);
  });

  it("only accepts web links and phone-shaped numbers", () => {
    const base = { displayName: "A", accent: null, logo: null };
    assert.equal(studioBrandingSchema.safeParse({ ...base, website: "javascript:alert(1)" }).success, false);
    assert.equal(studioBrandingSchema.safeParse({ ...base, website: "https://artzz.ro/gallery" }).success, true);
    assert.equal(studioBrandingSchema.safeParse({ ...base, phone: "call me" }).success, false);
    assert.equal(studioBrandingSchema.safeParse({ ...base, phone: "+40 (721) 283-080" }).success, true);
    // Older studio pages send no contact fields at all.
    assert.equal(studioBrandingSchema.safeParse(base).success, true);
  });
});

describe("Studio Pro gallery style", () => {
  async function studio(plan: "STUDIO" | "STUDIO_PRO") {
    const studios = new InMemoryStudioRepository();
    const subscriptions = new InMemorySubscriptionRepository();
    const projects = new InMemoryProjectRepository();
    const { studio } = Studio.create({ name: "Artzz Foto", ownerEmail: "owner@artzz.ro" });
    await studios.save(studio);
    const subscription = Subscription.startDefault(studio.id);
    subscription.assignPlan(plan);
    await subscriptions.save(subscription);
    const project = Project.create({ studioId: studio.id, name: "Wedding", type: "WEDDING" });
    await projects.save(project);
    return {
      studioId: studio.id.toString(),
      projectId: project.id.toString(),
      administration: new StudioAdministrationUseCase(studios, subscriptions, new InMemoryStudioMemberRepository()),
      directory: new SubscriptionStudioBrandingDirectory(projects, studios, subscriptions),
    };
  }

  const style = clientStyleSchema.parse({
    titleFont: "cormorant",
    coverLayout: "full",
    theme: "cream",
    grid: "square",
    welcomeMessage: "Thank you for choosing us!",
    sectionNames: { COUPLE: "Ședința foto", RECEPTION: "La nași" },
    social: { instagram: "https://instagram.com/artzz" },
    watermark: { enabled: true, position: "tiled", opacity: 0.25 },
  });

  it("is saved by the owner and reaches the client pages, even with no other branding set", async () => {
    const w = await studio("STUDIO_PRO");
    const saved = await w.administration.setClientStyle(w.studioId, "OWNER", style);
    assert.equal(saved.getValue().studio.clientStyle.titleFont, "cormorant");
    const branding = await w.directory.forProject(w.projectId);
    assert.equal(branding?.name, "Artzz Foto");
    assert.deepEqual(branding?.style, style);
  });

  it("belongs to Studio Pro and to the owner", async () => {
    const studioPlan = await studio("STUDIO");
    assert.equal(
      (await studioPlan.administration.setClientStyle(studioPlan.studioId, "OWNER", style)).getError().code,
      "CONFLICT",
    );
    const pro = await studio("STUDIO_PRO");
    assert.equal((await pro.administration.setClientStyle(pro.studioId, "EDITOR", style)).getError().code, "FORBIDDEN");
  });

  it("fills in defaults and survives a stored shape from an older version", () => {
    assert.deepEqual(readClientStyle(null), DEFAULT_CLIENT_STYLE);
    assert.equal(readClientStyle({ titleFont: "cormorant" }).coverLayout, "split-left");
    assert.deepEqual(readClientStyle({ titleFont: "comic-sans" }), DEFAULT_CLIENT_STYLE);
  });

  it("refuses unsafe social links, unknown fonts and an over-strong watermark", () => {
    assert.equal(clientStyleSchema.safeParse({ social: { instagram: "javascript:alert(1)" } }).success, false);
    assert.equal(clientStyleSchema.safeParse({ titleFont: "comic-sans" }).success, false);
    assert.equal(clientStyleSchema.safeParse({ watermark: { enabled: true, opacity: 0.9 } }).success, false);
    assert.equal(clientStyleSchema.safeParse({ sectionNames: { "not a category": "x" } }).success, false);
  });

  it("lets one gallery change only the fields it sets", () => {
    const merged = withOverride(style, { coverLayout: "split-right", welcomeMessage: null });
    assert.equal(merged.coverLayout, "split-right");
    assert.equal(merged.welcomeMessage, null);
    assert.equal(merged.titleFont, "cormorant");
    assert.equal(withOverride(style, null), style);
  });
});

describe("restyling one gallery", () => {
  it("is shown on that gallery only, and can be undone", async () => {
    const w = await world();
    await w.addPhoto("001.jpg", "COUPLE");
    const branded = {
      ...w.gateway,
      loadProject: async (projectId: string) => ({
        ...(await w.gateway.loadProject(projectId))!,
        branding: {
          name: "Artzz Foto",
          accent: null,
          logo: null,
          website: null,
          phone: null,
          email: null,
          style: DEFAULT_CLIENT_STYLE,
        },
      }),
      listDeliverable: (projectId: string) => w.gateway.listDeliverable(projectId),
      hasPhoto: (projectId: string, photoId: string) => w.gateway.hasPhoto(projectId, photoId),
    };
    const portal = new DownloadPortalUseCase(w.sessions, branded, noopNotifier, silentLogger);
    const project = w.project.id.toString();

    const styled = await w.admin.restyle(project, w.link.sessionId, { coverLayout: "full", theme: "dark" });
    assert.deepEqual(styled.getValue().lookOverride, { coverLayout: "full", theme: "dark" });
    const view = (await portal.view(w.link.token)).getValue();
    assert.equal(view.branding?.style.coverLayout, "full");
    assert.equal(view.branding?.style.titleFont, "plex-serif");

    assert.equal((await w.admin.restyle(project, w.link.sessionId, null)).getValue().lookOverride, null);
    assert.equal((await portal.view(w.link.token)).getValue().branding?.style.coverLayout, "split-left");
  });

  it("is refused below Studio Pro, and for another shoot's link", async () => {
    const w = await world();
    const features = {
      forProject: async () => ({
        watermarkDrafts: false,
        watermarkExports: false,
        maxPhotosPerShoot: null,
        clientDownloadLinks: true,
        clientBranding: false,
      }),
    };
    const admin = new DownloadSessionAdminUseCase(
      w.sessions,
      w.gateway,
      () => new Date(),
      undefined,
      undefined,
      undefined,
      features,
    );
    const project = w.project.id.toString();
    assert.equal((await admin.restyle(project, w.link.sessionId, { theme: "dark" })).getError().code, "CONFLICT");
    // Clearing is always allowed, so a studio that left Studio Pro can tidy up.
    assert.equal((await admin.restyle(project, w.link.sessionId, null)).isSuccess, true);
    assert.equal(
      (await admin.restyle(UniqueEntityId.create().toString(), w.link.sessionId, null)).getError().code,
      "NOT_FOUND",
    );
  });

  it("is refused when the plan cannot be confirmed", async () => {
    const w = await world();
    const unwired = new DownloadSessionAdminUseCase(w.sessions, w.gateway);
    const project = w.project.id.toString();
    assert.equal((await unwired.restyle(project, w.link.sessionId, { theme: "dark" })).getError().code, "CONFLICT");
    const noSubscription = new DownloadSessionAdminUseCase(
      w.sessions,
      w.gateway,
      () => new Date(),
      undefined,
      undefined,
      undefined,
      { forProject: async () => NO_WATERMARKS },
    );
    assert.equal(
      (await noSubscription.restyle(project, w.link.sessionId, { theme: "dark" })).getError().code,
      "CONFLICT",
    );
  });

  it("is set through the studio's route and validated there", async () => {
    const w = await world();
    const app = Fastify();
    registerDownloadRoutes(app, { downloadAdmin: w.admin, downloadPortal: w.portal() });
    const url = `/projects/${w.project.id.toString()}/download-sessions/${w.link.sessionId}/look`;
    const ok = await app.inject({ method: "PUT", url, payload: { override: { grid: "square" } } });
    assert.equal(ok.statusCode, 200);
    assert.deepEqual(ok.json().lookOverride, { grid: "square" });
    const bad = await app.inject({ method: "PUT", url, payload: { override: { grid: "hexagons" } } });
    assert.notEqual(bad.statusCode, 200);
  });
});

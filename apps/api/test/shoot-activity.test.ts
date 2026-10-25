import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import Fastify from "fastify";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Album } from "../src/modules/album-composition/domain/album";
import { PickSession } from "../src/modules/review-collaboration/domain/pick-session";
import { ReviewSession } from "../src/modules/review-collaboration/domain/review-session";
import { DownloadSession } from "../src/modules/review-collaboration/domain/download-session";
import { SlideshowSession } from "../src/modules/review-collaboration/domain/slideshow-session";
import {
  ACTIVITY_LIMIT,
  ShootActivityUseCase,
  buildShootActivity,
} from "../src/modules/review-collaboration/application/use-cases/shoot-activity.use-case";
import { registerActivityRoutes } from "../src/modules/review-collaboration/interface/http/activity-routes";
import {
  InMemoryAlbumRepository,
  InMemoryDownloadSessionRepository,
  InMemoryPickSessionRepository,
  InMemoryReviewSessionRepository,
  InMemorySlideshowSessionRepository,
} from "./support/in-memory";

/** 1 October 2026 plus `days`, at noon — easy to read in failures. */
const day = (days: number) => new Date(Date.UTC(2026, 9, 1 + days, 12));
/** Domain objects stamp "now"; a test pins the moment it needs. */
const stamp = (entity: object, field: string, at: Date) => {
  (entity as unknown as { props: Record<string, unknown> }).props[field] = at;
};

describe("a shoot's activity", () => {
  it("reads the history from what the links already keep, newest first", () => {
    const projectId = UniqueEntityId.create();
    const album = Album.create({ projectId, title: "Main", spreads: [] });
    stamp(album, "createdAt", day(3));

    const { session: pick } = PickSession.open({ projectId, clientName: "Elena" });
    stamp(pick, "createdAt", day(0));
    pick.recordSent("elena@example.com", day(0));
    pick.setShortlisted("p1", true);
    pick.setShortlisted("p2", true);
    pick.goToFinal();
    pick.submit();
    stamp(pick, "submittedAt", day(2));

    const { session: review } = ReviewSession.open({ albumId: album.id, clientName: "Elena" });
    review.recordSent("elena@example.com", day(4));
    const first = review.addComment({ spreadIndex: 0, body: "Swap", authorName: "Elena" });
    const second = review.addComment({ spreadIndex: 1, body: "Brighter", authorName: "Elena" });
    first.createdAt = day(5);
    second.createdAt = day(6);

    const { session: download } = DownloadSession.open({ projectId, clientName: "Elena" });
    stamp(download, "createdAt", day(7));
    download.recordDownload(day(8));

    const events = buildShootActivity({
      albums: [album],
      picks: [pick],
      reviews: [review],
      downloads: [download],
      slideshows: [],
    });
    assert.deepEqual(
      events.map((event) => [event.kind, event.at.slice(0, 10), event.name, event.count]),
      [
        ["downloadFirst", "2026-10-09", "Elena", null],
        ["downloadCreated", "2026-10-08", "Elena", null],
        ["reviewNotes", "2026-10-07", "Elena", 2],
        ["reviewSent", "2026-10-05", "Elena", null],
        ["albumCreated", "2026-10-04", null, null],
        ["picksSubmitted", "2026-10-03", "Elena", 2],
        ["pickCreated", "2026-10-01", "Elena", null],
        ["pickSent", "2026-10-01", "Elena", null],
      ],
    );
  });

  it("adds the latest download only after the first, and slideshow views with their count", () => {
    const projectId = UniqueEntityId.create();
    const { session: download } = DownloadSession.open({ projectId, clientName: "Ana" });
    download.recordDownload(day(1));
    download.recordDownload(day(2));
    const { session: slideshow } = SlideshowSession.open({
      projectId,
      clientName: "Ana",
      source: "SHOOT",
      photoIds: ["a"],
    });
    slideshow.recordView(day(3));
    slideshow.recordView(day(4));

    const kinds = buildShootActivity({
      albums: [],
      picks: [],
      reviews: [],
      downloads: [download],
      slideshows: [slideshow],
    });
    const watched = kinds.find((event) => event.kind === "slideshowWatched");
    const latest = kinds.find((event) => event.kind === "downloadLatest");
    assert.equal(watched?.count, 2);
    assert.equal(latest?.count, 2);
    assert.equal(latest?.at.slice(0, 10), "2026-10-03");
  });

  it("keeps the list short", () => {
    const projectId = UniqueEntityId.create();
    const albums = Array.from({ length: 30 }, (_, index) => ({ createdAt: day(index) }));
    const events = buildShootActivity({ albums, picks: [], reviews: [], downloads: [], slideshows: [] });
    assert.equal(events.length, ACTIVITY_LIMIT);
    assert.equal(events[0]!.at.slice(0, 10), "2026-10-30");
    void projectId;
  });

  it("is served for a shoot over HTTP, reading every source", async () => {
    const albums = new InMemoryAlbumRepository();
    const picks = new InMemoryPickSessionRepository();
    const reviews = new InMemoryReviewSessionRepository();
    const downloads = new InMemoryDownloadSessionRepository();
    const slideshows = new InMemorySlideshowSessionRepository();
    const projectId = UniqueEntityId.create();
    const album = Album.create({ projectId, title: "Main", spreads: [] });
    await albums.save(album);
    const { session: review } = ReviewSession.open({ albumId: album.id, clientName: "Elena" });
    review.approve();
    await reviews.save(review);
    const { session: other } = PickSession.open({ projectId: UniqueEntityId.create(), clientName: "Someone else" });
    await picks.save(other);

    const app = Fastify();
    registerActivityRoutes(app, {
      shootActivity: new ShootActivityUseCase(albums, picks, reviews, downloads, slideshows),
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const events = (await (await fetch(`${base}/projects/${projectId.toString()}/activity`)).json()) as {
      kind: string;
      name: string | null;
    }[];
    assert.deepEqual(events.map((event) => event.kind).sort(), ["albumCreated", "reviewApproved"]);
    assert.ok(
      events.every((event) => event.name !== "Someone else"),
      "another shoot's links never appear",
    );
    await app.close();
  });
});

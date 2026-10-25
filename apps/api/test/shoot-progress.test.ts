import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Album } from "../src/modules/album-composition/domain/album";
import { Project } from "../src/modules/media-ingestion/domain/project";
import { PickSession } from "../src/modules/review-collaboration/domain/pick-session";
import { ReviewSession } from "../src/modules/review-collaboration/domain/review-session";
import { DownloadSession } from "../src/modules/review-collaboration/domain/download-session";
import { ReviewCollaborationShootProgress } from "../src/modules/media-ingestion/infrastructure/gateways/shoot-progress-gateway";
import { ListStudioProjectsUseCase } from "../src/modules/media-ingestion/application/use-cases/list-studio-projects/list-studio-projects.use-case";
import {
  InMemoryAlbumRepository,
  InMemoryDownloadSessionRepository,
  InMemoryObjectStorage,
  InMemoryPhotoRepository,
  InMemoryPickSessionRepository,
  InMemoryProjectRepository,
  InMemoryReviewSessionRepository,
} from "./support/in-memory";

const DAY = 24 * 60 * 60 * 1000;

async function world() {
  const projects = new InMemoryProjectRepository();
  const albums = new InMemoryAlbumRepository();
  const picks = new InMemoryPickSessionRepository();
  const downloads = new InMemoryDownloadSessionRepository();
  const reviews = new InMemoryReviewSessionRepository();
  const studioId = UniqueEntityId.create();
  // Every query the gateway makes, by repository, to prove the list stays batched.
  const calls: string[] = [];
  const counted = <T extends object>(name: string, repo: T): T =>
    new Proxy(repo, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver) as unknown;
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          calls.push(`${name}.${String(key)}`);
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
  const gateway = new ReviewCollaborationShootProgress(
    counted("albums", albums),
    counted("picks", picks),
    counted("downloads", downloads),
    counted("reviews", reviews),
  );

  async function addProject(name: string) {
    const project = Project.create({ studioId, name, type: "WEDDING" });
    await projects.save(project);
    return project;
  }
  return { projects, albums, picks, downloads, reviews, studioId, gateway, calls, addProject };
}

describe("where each shoot stands with its client", () => {
  it("gathers every shoot's albums and links in four queries, however many shoots", async () => {
    const w = await world();
    const elena = await w.addProject("Elena & Radu");
    const ana = await w.addProject("Ana & Mihai");
    const empty = await w.addProject("Empty shoot");

    const album = Album.create({ projectId: elena.id, title: "Main", spreads: [] });
    await w.albums.save(album);
    const { session: review } = ReviewSession.open({ albumId: album.id, clientName: "Elena" });
    review.addComment({ spreadIndex: 0, body: "Swap this one", authorName: "Elena" });
    const resolved = review.addComment({ spreadIndex: 1, body: "Brighter?", authorName: "Elena" });
    review.resolveComment(resolved.id);
    review.requestChanges();
    await w.reviews.save(review);

    const { session: pick } = PickSession.open({ projectId: elena.id, clientName: "Elena" });
    pick.setShortlisted("p1", true);
    pick.setShortlisted("p2", true);
    pick.goToFinal();
    pick.submit();
    await w.picks.save(pick);

    const { session: active } = DownloadSession.open({ projectId: ana.id, clientName: "Ana", ttlDays: 3 });
    active.recordDownload();
    await w.downloads.save(active);
    const { session: revoked } = DownloadSession.open({ projectId: ana.id, clientName: "Ana" });
    revoked.revoke();
    await w.downloads.save(revoked);

    const progress = await w.gateway.forProjects([elena, ana, empty].map((p) => p.id.toString()));

    assert.deepEqual(progress.get(elena.id.toString()), {
      albums: [{ id: album.id.toString(), status: album.status }],
      picks: [
        { status: "SUBMITTED", clientName: "Elena", pickedCount: 2, submittedAt: pick.submittedAt!.toISOString() },
      ],
      reviews: [{ status: "CHANGES_REQUESTED", openComments: 1 }],
      deliveries: [],
    });
    assert.deepEqual(progress.get(ana.id.toString())?.deliveries, [
      { status: "ACTIVE", downloadCount: 1, daysLeft: 3 },
      { status: "REVOKED", downloadCount: 0, daysLeft: 30 },
    ]);
    assert.deepEqual(progress.get(empty.id.toString()), { albums: [], picks: [], reviews: [], deliveries: [] });
    assert.deepEqual(w.calls.sort(), [
      "albums.statusesByProjectIds",
      "downloads.findByProjectIds",
      "picks.findByProjectIds",
      "reviews.findByAlbumIds",
    ]);
  });

  it("works out expiry from the clock, as the studio's link list does", async () => {
    const w = await world();
    const shoot = await w.addProject("Old shoot");
    const { session } = DownloadSession.open({ projectId: shoot.id, clientName: "Old", ttlDays: 1 });
    await w.downloads.save(session);
    const later = new ReviewCollaborationShootProgress(
      w.albums,
      w.picks,
      w.downloads,
      w.reviews,
      () => new Date(Date.now() + 2 * DAY),
    );
    const progress = await later.forProjects([shoot.id.toString()]);
    assert.deepEqual(progress.get(shoot.id.toString())?.deliveries, [
      { status: "EXPIRED", downloadCount: 0, daysLeft: 0 },
    ]);
  });

  it("asks nothing for an empty list", async () => {
    const w = await world();
    assert.equal((await w.gateway.forProjects([])).size, 0);
    assert.deepEqual(w.calls, []);
  });

  it("reaches the shoots list, and the list still works without it", async () => {
    const w = await world();
    const shoot = await w.addProject("Elena & Radu");
    const photos = new InMemoryPhotoRepository();
    const storage = new InMemoryObjectStorage();
    const withProgress = new ListStudioProjectsUseCase(
      w.projects,
      photos,
      w.albums,
      storage,
      undefined,
      undefined,
      w.gateway,
    );
    const [card] = await withProgress.execute(w.studioId.toString());
    assert.deepEqual(card!.progress, { albums: [], picks: [], reviews: [], deliveries: [] });
    assert.equal(card!.id, shoot.id.toString());

    const [plain] = await new ListStudioProjectsUseCase(w.projects, photos, w.albums, storage).execute(
      w.studioId.toString(),
    );
    assert.equal(plain!.progress, null);
  });
});

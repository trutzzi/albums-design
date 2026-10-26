import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProjectSummaryDTO } from "@albumflow/contracts";
import {
  attentionFor,
  byNextAction,
  filterCounts,
  filterOf,
  greetingKey,
  matchesFilter,
  stepsDone,
  workflowOf,
} from "./dashboard";

type Progress = NonNullable<ProjectSummaryDTO["progress"]>;

function shoot(
  progress: Partial<Progress> | null,
  photos = { photoCount: 100, processingCount: 0 },
): ProjectSummaryDTO {
  return {
    id: "s1",
    studioId: "st",
    name: "Elena & Radu",
    type: "WEDDING",
    eventDate: null,
    clientName: null,
    clientEmail: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    albumCount: progress?.albums?.length ?? 0,
    coverThumbnailUrl: null,
    ...photos,
    progress: progress && { albums: [], picks: [], reviews: [], deliveries: [], ...progress },
  } as ProjectSummaryDTO;
}

const submitted = {
  status: "SUBMITTED",
  clientName: "Elena",
  pickedCount: 64,
  submittedAt: "2026-10-20T00:00:00.000Z",
};
const open = { status: "OPEN", clientName: "Maria", pickedCount: 12, submittedAt: null };

describe("attentionFor", () => {
  it("puts requested changes first, opening the album the notes are on", () => {
    const item = attentionFor(
      shoot({
        albums: [{ id: "a1", status: "IN_REVIEW" }],
        picks: [submitted],
        reviews: [{ albumId: "a2", status: "CHANGES_REQUESTED", openComments: 3 }],
      }),
    );
    assert.deepEqual(item, { kind: "changes", count: 3, albumId: "a2" });
  });

  it("asks to generate the album once picks arrive and there is none", () => {
    assert.deepEqual(attentionFor(shoot({ picks: [submitted] })), { kind: "picks", name: "Elena", count: 64 });
    assert.equal(attentionFor(shoot({ picks: [submitted], albums: [{ id: "a1", status: "DRAFT" }] })), null);
  });

  it("asks to deliver an approved album that has no link yet", () => {
    assert.deepEqual(attentionFor(shoot({ albums: [{ id: "a1", status: "APPROVED" }] })), { kind: "deliver" });
    const linked = shoot({
      albums: [{ id: "a1", status: "APPROVED" }],
      deliveries: [{ status: "ACTIVE", downloadCount: 0, daysLeft: 20 }],
    });
    assert.equal(attentionFor(linked), null);
  });

  it("reminds about an unused download link that ends within three days", () => {
    const ending = shoot({ deliveries: [{ status: "ACTIVE", downloadCount: 0, daysLeft: 2 }] });
    assert.deepEqual(attentionFor(ending), { kind: "expiring", days: 2 });
    const used = shoot({ deliveries: [{ status: "ACTIVE", downloadCount: 1, daysLeft: 2 }] });
    assert.equal(attentionFor(used), null);
  });

  it("is quiet for a shoot with nothing waiting, or no progress at all", () => {
    assert.equal(attentionFor(shoot({})), null);
    assert.equal(attentionFor(shoot(null)), null);
  });
});

describe("filterOf and counts", () => {
  it("sorts shoots into waiting on you, with the client, and delivered", () => {
    const needs = shoot({ picks: [submitted] });
    const client = shoot({ picks: [open] });
    const delivered = shoot({ deliveries: [{ status: "ACTIVE", downloadCount: 2, daysLeft: 10 }] });
    const quiet = shoot({});
    assert.equal(filterOf(needs), "needs");
    assert.equal(filterOf(client), "client");
    assert.equal(filterOf(delivered), "delivered");
    assert.equal(filterOf(quiet), null);
    assert.deepEqual(filterCounts([needs, client, delivered, quiet]), { all: 4, needs: 1, client: 1, delivered: 1 });
    assert.ok(matchesFilter(quiet, "all"));
    assert.ok(!matchesFilter(quiet, "needs"));
  });
});

describe("the card's progress", () => {
  it("matches the shoot page's workflow, step by step", () => {
    const card = shoot({ picks: [submitted], albums: [{ id: "a1", status: "APPROVED" }] });
    assert.deepEqual(stepsDone(card), [true, true, true, false]);
    assert.equal(workflowOf(card).next.text.key, "project.next.deliver");
    assert.deepEqual(stepsDone(shoot({}, { photoCount: 10, processingCount: 4 })), [false, false, false, false]);
  });
});

describe("greetingKey", () => {
  it("follows the time of day", () => {
    assert.equal(greetingKey(new Date(2026, 9, 25, 8)), "projects.greeting.morning");
    assert.equal(greetingKey(new Date(2026, 9, 25, 14)), "projects.greeting.afternoon");
    assert.equal(greetingKey(new Date(2026, 9, 25, 21)), "projects.greeting.evening");
  });
});

describe("byNextAction", () => {
  it("puts what waits on you first, most urgent first, then the client's, then the rest, delivered last", () => {
    const named = (name: string, progress: Parameters<typeof shoot>[0]) => ({ ...shoot(progress), name });
    const delivered = named("delivered", { deliveries: [{ status: "ACTIVE", downloadCount: 2, daysLeft: 10 }] });
    const quiet = named("quiet", {});
    const withClient = named("with client", { picks: [open] });
    const picks = named("picks", { picks: [submitted] });
    const changes = named("changes", {
      reviews: [{ albumId: "a1", status: "CHANGES_REQUESTED", openComments: 2 }],
      albums: [{ id: "a1", status: "IN_REVIEW" }],
    });
    const sorted = byNextAction([delivered, quiet, withClient, picks, changes]);
    assert.deepEqual(
      sorted.map((item) => item.name),
      ["changes", "picks", "with client", "quiet", "delivered"],
    );
  });

  it("keeps the incoming order between shoots of the same rank", () => {
    const first = { ...shoot({}), name: "first" };
    const second = { ...shoot({}), name: "second" };
    assert.deepEqual(
      byNextAction([first, second]).map((item) => item.name),
      ["first", "second"],
    );
  });
});

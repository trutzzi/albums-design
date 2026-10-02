import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Result } from "@albumflow/domain-kernel";
import { Studio } from "../src/modules/identity/domain/studio";
import { StudioMember } from "../src/modules/identity/domain/studio-member";
import { Subscription } from "../src/modules/identity/domain/subscription";
import { Project } from "../src/modules/media-ingestion/domain/project";
import { Feedback } from "../src/modules/platform-admin/domain/feedback";
import { AdminAccess, StudioPlansUseCase } from "../src/modules/platform-admin/application/use-cases/admin.use-cases";
import {
  DeleteStudioUseCase,
  PurgeUnconfirmedSignupsUseCase,
} from "../src/modules/platform-admin/application/use-cases/studio-deletion.use-cases";
import { InMemoryFeedbackRepository } from "../src/modules/platform-admin/infrastructure/feedback-repositories";
import {
  InMemoryProjectRepository,
  InMemoryStudioMemberRepository,
  InMemoryStudioRepository,
  InMemorySubscriptionRepository,
} from "./support/in-memory";

const HOUR = 60 * 60 * 1000;

function world() {
  const studios = new InMemoryStudioRepository();
  const subscriptions = new InMemorySubscriptionRepository();
  const members = new InMemoryStudioMemberRepository();
  const projects = new InMemoryProjectRepository();
  const feedback = new InMemoryFeedbackRepository();
  const deletedShoots: string[] = [];
  const shoots = {
    execute: async ({ projectId }: { projectId: string }) => {
      deletedShoots.push(projectId);
      await projects.items.delete(projectId);
      return Result.success(undefined);
    },
  };
  const access = new AdminAccess(members, ["boss@albumflow.test"]);
  const deleteStudio = new DeleteStudioUseCase(studios, subscriptions, members, projects, shoots, feedback, access);

  async function studio(
    email: string,
    options: { confirmed?: boolean; signedUpHoursAgo?: number; shoots?: number } = {},
  ) {
    const { studio } = Studio.create({ name: email.split("@")[0]!, ownerEmail: email });
    await studios.save(studio);
    await subscriptions.save(Subscription.startDefault(studio.id));
    const member = StudioMember.signUp({ studioId: studio.id, email, name: "Owner", passwordHash: "x" });
    (member as unknown as { props: { invitedAt: Date } }).props.invitedAt = new Date(
      Date.now() - (options.signedUpHoursAgo ?? 1) * HOUR,
    );
    if (options.confirmed) member.markEmailVerified();
    await members.save(member);
    for (let index = 0; index < (options.shoots ?? 0); index++) {
      await projects.save(Project.create({ studioId: studio.id, name: `Shoot ${index}`, type: "WEDDING" }));
    }
    return studio;
  }
  return { studios, subscriptions, members, projects, feedback, deleteStudio, deletedShoots, studio };
}

describe("deleting a studio", () => {
  it("removes its shoots, feedback, members, subscription and the studio itself", async () => {
    const w = world();
    const target = await w.studio("spam@admin.com", { shoots: 2 });
    const keep = await w.studio("ana@studio.ro", { confirmed: true });
    await w.feedback.save(
      Feedback.submit({
        studioId: target.id.toString(),
        memberId: undefined,
        authorName: "x",
        authorEmail: "spam@admin.com",
        kind: "IDEA",
        message: "hi",
      }),
    );

    const result = await w.deleteStudio.execute(target.id.toString());
    assert.deepEqual(result.getValue(), { shootsDeleted: 2 });
    assert.equal(w.deletedShoots.length, 2);
    assert.equal(await w.studios.findById(target.id), undefined);
    assert.equal(await w.subscriptions.findByStudioId(target.id), undefined);
    assert.equal((await w.members.listByStudioId(target.id)).length, 0);
    assert.equal(w.feedback.items.size, 0);
    assert.ok(await w.studios.findById(keep.id), "other studios are untouched");
  });

  it("refuses to delete an admin's own studio", async () => {
    const w = world();
    const mine = await w.studio("boss@albumflow.test", { confirmed: true });
    const result = await w.deleteStudio.execute(mine.id.toString());
    assert.equal(result.getError().code, "CONFLICT");
    assert.ok(await w.studios.findById(mine.id));
  });
});

describe("the unconfirmed-signup sweep", () => {
  it("removes empty studios whose owner never confirmed within 48 hours", async () => {
    const w = world();
    const stale = await w.studio("bot1@admin.com", { signedUpHoursAgo: 60 });
    const fresh = await w.studio("new@studio.ro", { signedUpHoursAgo: 2 });
    const confirmed = await w.studio("ana@studio.ro", { confirmed: true, signedUpHoursAgo: 500 });
    const busy = await w.studio("busy@studio.ro", { signedUpHoursAgo: 60, shoots: 1 });

    const summary = await new PurgeUnconfirmedSignupsUseCase(w.members, w.projects, w.deleteStudio).execute();
    assert.deepEqual(summary, { deleted: 1, kept: 1 });
    assert.equal(await w.studios.findById(stale.id), undefined);
    assert.ok(await w.studios.findById(fresh.id), "still inside the 48 hours");
    assert.ok(await w.studios.findById(confirmed.id));
    assert.ok(await w.studios.findById(busy.id), "a studio that made something is left for a person to decide");
  });
});

describe("the admin studio list", () => {
  it("pages and searches instead of loading every studio", async () => {
    const w = world();
    for (let index = 0; index < 12; index++) await w.studio(`bot${index}@admin.com`);
    await w.studio("ana@studio.ro", { confirmed: true, shoots: 3 });
    const plans = new StudioPlansUseCase(w.studios, w.subscriptions, w.members, w.projects);

    const first = await plans.list({ page: 1, pageSize: 5 });
    assert.equal(first.studios.length, 5);
    assert.equal(first.total, 13);

    const found = await plans.list({ page: 1, pageSize: 5, search: "ANA@" });
    assert.equal(found.total, 1);
    assert.equal(found.studios[0]?.emailConfirmed, true);
    assert.equal(found.studios[0]?.shoots, 3);

    const bots = await plans.list({ page: 3, pageSize: 5, search: "admin.com" });
    assert.equal(bots.studios.length, 2);
    assert.equal(bots.studios[0]?.emailConfirmed, false);
  });
});

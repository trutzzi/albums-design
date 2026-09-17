import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { ReviewSession } from "../src/modules/review-collaboration/domain/review-session";
import { AlbumFeedbackUseCase } from "../src/modules/review-collaboration/application/use-cases/album-feedback.use-case";
import { InMemoryReviewSessionRepository } from "./support/in-memory";

const ALBUM = UniqueEntityId.create();

function sessionFor(clientName: string): ReviewSession {
  return ReviewSession.open({ albumId: ALBUM, clientName }).session;
}

async function repositoryWith(...sessions: ReviewSession[]) {
  const repository = new InMemoryReviewSessionRepository();
  for (const session of sessions) await repository.save(session);
  return repository;
}

describe("the photographer reading client feedback", () => {
  it("returns what the client actually wrote, not just a count", async () => {
    const session = sessionFor("Maria");
    session.addComment({
      spreadIndex: 3,
      slotId: "feature",
      body: "Can we use the other photo of my mother here?",
      authorName: "Maria",
    });
    const feedback = new AlbumFeedbackUseCase(await repositoryWith(session));

    const result = await feedback.list(ALBUM.toString());
    assert.ok(result.isSuccess);
    const [comment] = result.getValue().comments;

    assert.equal(comment?.body, "Can we use the other photo of my mother here?");
    assert.equal(comment?.spreadIndex, 3);
    assert.equal(comment?.slotId, "feature");
    assert.equal(comment?.clientName, "Maria");
    assert.equal(result.getValue().openCount, 1);
  });

  it("gathers every review link on the album, so a second client is not lost", async () => {
    const bride = sessionFor("Maria");
    const groom = sessionFor("Andrei");
    bride.addComment({ spreadIndex: 1, body: "Too dark", authorName: "Maria" });
    groom.addComment({ spreadIndex: 0, body: "Love this one", authorName: "Andrei" });

    const result = await new AlbumFeedbackUseCase(await repositoryWith(bride, groom)).list(
      ALBUM.toString(),
    );
    assert.ok(result.isSuccess);
    const value = result.getValue();

    assert.equal(value.comments.length, 2);
    assert.deepEqual(
      value.comments.map((comment) => comment.clientName).sort(),
      ["Andrei", "Maria"],
    );
    assert.equal(value.sessions.length, 2);
  });

  it("puts the work first: unresolved before done, then album order", async () => {
    const session = sessionFor("Maria");
    const first = session.addComment({ spreadIndex: 5, body: "five", authorName: "Maria" });
    session.addComment({ spreadIndex: 2, body: "two", authorName: "Maria" });
    session.addComment({ spreadIndex: 9, body: "nine", authorName: "Maria" });
    session.resolveComment(first.id);

    const result = await new AlbumFeedbackUseCase(await repositoryWith(session)).list(
      ALBUM.toString(),
    );
    assert.ok(result.isSuccess);
    assert.deepEqual(
      result.getValue().comments.map((comment) => comment.body),
      ["two", "nine", "five"],
    );
  });

  it("marks a comment done and reflects it in the counts", async () => {
    const session = sessionFor("Maria");
    const comment = session.addComment({ spreadIndex: 0, body: "Swap these", authorName: "Maria" });
    const repository = await repositoryWith(session);
    const feedback = new AlbumFeedbackUseCase(repository);

    const result = await feedback.resolve(ALBUM.toString(), comment.id);
    assert.ok(result.isSuccess);
    assert.equal(result.getValue().openCount, 0);
    assert.equal(result.getValue().resolvedCount, 1);
    assert.equal(result.getValue().comments[0]?.resolved, true);

    // Persisted, not merely returned.
    const reloaded = await feedback.list(ALBUM.toString());
    assert.equal(reloaded.getValue().openCount, 0);
  });

  it("still lets the photographer close a note after the client approved", async () => {
    const session = sessionFor("Maria");
    const comment = session.addComment({ spreadIndex: 0, body: "Tiny crop nit", authorName: "Maria" });
    session.approve();

    const result = await new AlbumFeedbackUseCase(await repositoryWith(session)).resolve(
      ALBUM.toString(),
      comment.id,
    );
    // Approval closes the client's ability to comment, not the photographer's
    // ability to tidy up afterwards.
    assert.ok(result.isSuccess);
    assert.equal(result.getValue().openCount, 0);
  });

  it("refuses a comment id that belongs to no review on this album", async () => {
    const result = await new AlbumFeedbackUseCase(await repositoryWith(sessionFor("Maria"))).resolve(
      ALBUM.toString(),
      UniqueEntityId.create().toString(),
    );
    assert.ok(result.isFailure);
    assert.equal(result.getError().code, "NOT_FOUND");
  });

  it("reports an album nobody has reviewed as empty rather than failing", async () => {
    const result = await new AlbumFeedbackUseCase(new InMemoryReviewSessionRepository()).list(
      ALBUM.toString(),
    );
    assert.ok(result.isSuccess);
    assert.deepEqual(result.getValue().comments, []);
    assert.equal(result.getValue().openCount, 0);
  });
});

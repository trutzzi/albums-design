import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { EmailMessage, EmailSender } from "../src/shared-kernel/email";
import { StudioMember } from "../src/modules/identity/domain/studio-member";
import { TestEmailUseCase } from "../src/modules/platform-admin/application/use-cases/test-email.use-case";
import { InMemoryStudioMemberRepository } from "../src/dev/in-memory-adapters";
import { RecordingLogger } from "./support/recording-logger";

async function setUp(sender: EmailSender, delivers = true) {
  const members = new InMemoryStudioMemberRepository();
  const me = StudioMember.invite({
    studioId: UniqueEntityId.create(),
    email: "owner@example.com",
    name: "Valentin",
    role: "OWNER",
  });
  await members.save(me);
  const logger = new RecordingLogger();
  return {
    memberId: me.id.toString(),
    logger,
    useCase: new TestEmailUseCase(sender, members, delivers, "app@example.com", logger),
  };
}

describe("the admin's test email", () => {
  it("goes to the admin asking, from the configured address", async () => {
    const sent: EmailMessage[] = [];
    const { useCase, memberId } = await setUp({ id: "smtp", send: async (message) => void sent.push(message) });
    const result = await useCase.send(memberId);
    assert.deepEqual(result.getValue(), { sentTo: "owner@example.com", from: "app@example.com" });
    assert.deepEqual(sent[0]?.to, ["owner@example.com"]);
  });

  it("says plainly when there is no mail server at all", async () => {
    const { useCase, memberId } = await setUp({ id: "log", send: async () => {} }, false);
    const result = await useCase.send(memberId);
    assert.equal(result.getError().code, "MESSAGE_NOT_SENT");
    assert.match(result.getError().message, /No mail server is configured/);
  });

  it("passes on the mail server's own answer, and logs it as an error", async () => {
    const { useCase, memberId, logger } = await setUp({
      id: "smtp",
      send: async () => {
        throw new Error("535 5.7.8 Authentication failed");
      },
    });
    const result = await useCase.send(memberId);
    assert.match(result.getError().message, /535 5\.7\.8 Authentication failed/);
    assert.equal(logger.entries.find((entry) => entry.level === "error")?.message, "test email not sent");
  });

  it("refuses an unknown member", async () => {
    const { useCase } = await setUp({ id: "smtp", send: async () => {} });
    assert.equal((await useCase.send(UniqueEntityId.create().toString())).getError().code, "NOT_FOUND");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StudioEmailNotifier } from "../src/modules/review-collaboration/application/services/studio-email-notifier";
import { ClientConfirmationMailer } from "../src/modules/review-collaboration/application/services/client-confirmation.mailer";
import { CompositeReviewNotifier } from "../src/modules/review-collaboration/infrastructure/gateways/delivery-gateway";
import type {
  ClientContact,
  ClientContactDirectory,
} from "../src/modules/review-collaboration/application/ports/client-contact";
import type { StudioContacts } from "../src/modules/review-collaboration/application/ports/delivery-gateway";
import type { EmailMessage, EmailSender } from "../src/shared-kernel/email";
import { RecordingLogger } from "./support/recording-logger";

function world(options: { clientEmail?: string | undefined; failSending?: boolean } = {}) {
  const sent: EmailMessage[] = [];
  const sender: EmailSender = {
    id: "test",
    send: async (message) => {
      if (options.failSending) throw new Error("smtp down");
      sent.push(message);
    },
  };
  const contact: ClientContact = {
    projectId: "p1",
    projectName: "Ana & Radu",
    name: "Ana",
    email: "clientEmail" in options ? options.clientEmail : "ana@client.ro",
  };
  const clients: ClientContactDirectory = {
    forProject: async () => contact,
    forAlbum: async (albumId) => (albumId === "a1" ? contact : undefined),
    remember: async () => {},
  };
  const studios: StudioContacts = {
    forProject: async () => ({
      projectName: "Ana & Radu",
      ownerEmails: ["owner@studio.ro"],
      studioName: "Golden Hour",
    }),
  };
  const logger = new RecordingLogger();
  return {
    sent,
    logger,
    studio: new StudioEmailNotifier(sender, studios, "https://app.example.test", logger, clients),
    client: new ClientConfirmationMailer(sender, clients, studios, logger),
  };
}

const decision = { albumId: "a1", clientName: "Ana", openComments: 0 };

describe("the photographer's email when a client decides on a proof", () => {
  it("says the album was approved and links to it", async () => {
    const w = world();
    await w.studio.clientDecided({ ...decision, decision: "APPROVED" });
    assert.equal(w.sent.length, 1);
    assert.deepEqual(w.sent[0]!.to, ["owner@studio.ro"]);
    assert.match(w.sent[0]!.subject, /approved the album — Ana & Radu/);
    assert.match(w.sent[0]!.text, /https:\/\/app\.example\.test\/albums\/a1/);
  });

  it("says changes were asked for, with how many notes are open", async () => {
    const w = world();
    await w.studio.clientDecided({ ...decision, decision: "CHANGES_REQUESTED", openComments: 3 });
    assert.match(w.sent[0]!.subject, /asked for changes/);
    assert.match(w.sent[0]!.text, /3 open comments/);
  });

  it("sends nothing for an album it cannot trace to a shoot", async () => {
    const w = world();
    await w.studio.clientDecided({ ...decision, albumId: "gone", decision: "APPROVED" });
    assert.equal(w.sent.length, 0);
  });
});

describe("the client's confirmation", () => {
  it("confirms the picks arrived, signed by the studio and answered by it", async () => {
    const w = world();
    await w.client.picksSubmitted({ projectId: "p1", sessionId: "s", clientName: "Ana", photoIds: ["x", "y"] });
    assert.deepEqual(w.sent[0]!.to, ["ana@client.ro"]);
    assert.equal(w.sent[0]!.replyTo, "owner@studio.ro");
    assert.match(w.sent[0]!.text, /Golden Hour has received your selection: 2 photos/);
  });

  it("thanks the client for an approval and for a change request", async () => {
    const w = world();
    await w.client.clientDecided({ ...decision, decision: "APPROVED" });
    await w.client.clientDecided({ ...decision, decision: "CHANGES_REQUESTED" });
    assert.match(w.sent[0]!.subject, /Album approved/);
    assert.match(w.sent[1]!.subject, /Your changes were sent/);
  });

  it("stays quiet when the shoot has no client email", async () => {
    const w = world({ clientEmail: undefined });
    await w.client.clientDecided({ ...decision, decision: "APPROVED" });
    assert.equal(w.sent.length, 0);
    assert.equal(w.logger.problems.length, 0);
  });

  it("never fails the client's action when mail is down, and reports it", async () => {
    const w = world({ failSending: true });
    await assert.doesNotReject(w.client.clientDecided({ ...decision, decision: "APPROVED" }));
    assert.equal(w.logger.problems[0]?.level, "error");
  });
});

describe("CompositeReviewNotifier", () => {
  it("lets one failing notifier not stop the next", async () => {
    const calls: string[] = [];
    const composite = new CompositeReviewNotifier(
      [
        { clientDecided: async () => Promise.reject(new Error("boom")) },
        { clientDecided: async () => void calls.push("second") },
      ],
      new RecordingLogger(),
    );
    await composite.clientDecided({ ...decision, decision: "APPROVED" });
    assert.deepEqual(calls, ["second"]);
  });
});

describe("emails personalised to what the studio's plan includes", () => {
  const pixel =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

  function mailer(branding: { name: string; accent: string | null; logo: string | null } | null) {
    const sent: EmailMessage[] = [];
    const contact = { projectId: "p1", projectName: "Ana & Radu", name: "Ana", email: "ana@client.ro" };
    const client = new ClientConfirmationMailer(
      { id: "test", send: async (message) => void sent.push(message) },
      { forProject: async () => contact, forAlbum: async () => contact, remember: async () => {} },
      {
        forProject: async () => ({
          projectName: "Ana & Radu",
          ownerEmails: ["owner@studio.ro"],
          studioName: "Golden Hour",
        }),
      },
      new RecordingLogger(),
      { forProject: async () => branding },
    );
    return { sent, client };
  }

  it("sends a white-label studio's email as the studio, in its colour and with its logo, never naming AlbumFlow", async () => {
    const { sent, client } = mailer({ name: "Golden Hour Studio", accent: "#2255aa", logo: pixel });
    await client.clientDecided({ ...decision, decision: "APPROVED" });
    const [message] = sent;
    assert.equal(message?.senderName, "Golden Hour Studio");
    assert.equal(message?.inlineImages?.[0]?.contentType, "image/png");
    assert.match(message?.html ?? "", /src="cid:studio-logo"/);
    assert.match(message?.html ?? "", /#2255aa/);
    assert.doesNotMatch(message?.html ?? "", /AlbumFlow/);
  });

  it("names the studio first on other plans, with a quiet AlbumFlow footer", async () => {
    const { sent, client } = mailer(null);
    await client.clientDecided({ ...decision, decision: "APPROVED" });
    assert.equal(sent[0]?.senderName, "Golden Hour via AlbumFlow");
    assert.equal(sent[0]?.inlineImages, undefined);
    assert.match(sent[0]?.html ?? "", /Sent with AlbumFlow/);
  });
});

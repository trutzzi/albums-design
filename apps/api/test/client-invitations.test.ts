import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Project } from "../src/modules/media-ingestion/domain/project";
import { ClientInvitationMailer } from "../src/modules/review-collaboration/application/services/client-invitation.mailer";
import { ClientLinkInvitations } from "../src/modules/review-collaboration/application/services/client-link-invitations";
import { ProjectClientContactDirectory } from "../src/modules/review-collaboration/infrastructure/gateways/client-contact-gateway";
import { PickSessionAdminUseCase } from "../src/modules/review-collaboration/application/use-cases/open-pick-session.use-case";
import { ClientAccessService } from "../src/modules/review-collaboration/application/services/client-access.service";
import { SecretBox } from "../src/shared-kernel/secret-box";
import { ClientGrantSigner } from "../src/shared-kernel/client-grant";
import type { EmailMessage, EmailSender } from "../src/shared-kernel/email";
import type { PickGateway } from "../src/modules/review-collaboration/application/ports/pick-gateway";
import type { StudioContacts } from "../src/modules/review-collaboration/application/ports/delivery-gateway";
import { InMemoryAlbumRepository, InMemoryPickSessionRepository, InMemoryProjectRepository } from "./support/in-memory";

const SECRET = "test-secret-test-secret-test-secret-123";
const ORIGIN = "https://app.example.test";

function mailbox() {
  const sent: EmailMessage[] = [];
  let fail: string | undefined;
  const sender: EmailSender = {
    id: "test",
    send: async (message) => {
      if (fail) throw new Error(fail);
      sent.push(message);
    },
  };
  return { sent, sender, breakIt: (reason: string) => (fail = reason), fix: () => (fail = undefined) };
}

async function world(options: { clientName?: string; clientEmail?: string } = {}) {
  const projects = new InMemoryProjectRepository();
  const albums = new InMemoryAlbumRepository();
  const sessions = new InMemoryPickSessionRepository();
  const project = Project.create({
    studioId: UniqueEntityId.create(),
    name: "Elena & Radu",
    type: "WEDDING",
    ...(options.clientName ? { clientName: options.clientName } : {}),
    ...(options.clientEmail ? { clientEmail: options.clientEmail } : {}),
  });
  await projects.save(project);

  const post = mailbox();
  const contacts = new ProjectClientContactDirectory(projects, albums);
  const studios: StudioContacts = {
    forProject: async () => ({ projectName: "Elena & Radu", ownerEmails: ["studio@example.ro"] }),
  };
  const invitations = new ClientLinkInvitations(
    new ClientInvitationMailer(post.sender),
    contacts,
    studios,
    ORIGIN,
    () => {},
  );
  const gateway: PickGateway = {
    loadProject: async (id) => (id === project.id.toString() ? { id, name: "Elena & Radu" } : undefined),
    listPhotos: async () => [],
    hasPhoto: async () => true,
    countProcessing: async () => 0,
  };
  const admin = new PickSessionAdminUseCase(
    sessions,
    gateway,
    new ClientAccessService(new SecretBox(SECRET), new ClientGrantSigner(SECRET)),
    invitations,
    contacts,
  );
  return { projects, project, sessions, post, contacts, invitations, admin };
}

describe("the invitation email itself", () => {
  const post = mailbox();
  const mailer = new ClientInvitationMailer(post.sender);
  const base = {
    to: "elena@example.com",
    clientName: "Elena",
    projectName: "Elena & Radu",
    url: `${ORIGIN}/pick/tok123`,
    password: "K7M2Q-X9PTA",
    language: "en" as const,
  };

  it("carries the link and the password, and explains the two steps", async () => {
    await mailer.send({ ...base, kind: "pick" });
    const mail = post.sent.at(-1)!;
    assert.deepEqual(mail.to, ["elena@example.com"]);
    assert.match(mail.subject, /Choose your photos — Elena & Radu/);
    assert.match(mail.text, /Hi Elena!/);
    assert.ok(mail.text.includes(base.url));
    assert.ok(mail.text.includes("K7M2Q-X9PTA"));
    assert.match(mail.text, /Step 1:.*no limit/s);
    assert.match(mail.text, /Step 2:/);
  });

  it("says something different for a review and for a download, with the deadline", async () => {
    await mailer.send({ ...base, kind: "review", url: `${ORIGIN}/review/tok` });
    assert.match(post.sent.at(-1)!.subject, /album is ready/i);
    assert.match(post.sent.at(-1)!.text, /Approve album/);

    await mailer.send({
      ...base,
      kind: "download",
      url: `${ORIGIN}/download/tok`,
      availableUntil: new Date("2026-10-20T00:00:00Z"),
    });
    const mail = post.sent.at(-1)!;
    assert.match(mail.subject, /ready to download/i);
    assert.match(mail.text, /20 October 2026/);
    assert.match(mail.text, /permanently deleted/);
  });

  it("writes in Romanian when asked, with the Romanian date", async () => {
    await mailer.send({
      ...base,
      kind: "download",
      language: "ro",
      availableUntil: new Date("2026-10-20T00:00:00Z"),
    });
    const mail = post.sent.at(-1)!;
    assert.match(mail.subject, /gata de descărcat/);
    assert.match(mail.text, /Salut, Elena!/);
    assert.match(mail.text, /20 octombrie 2026/);
    assert.ok(!/Hi Elena/.test(mail.text), "one language, not both");
  });

  it("leaves the password out when the link has none", async () => {
    await mailer.send({ ...base, kind: "pick", password: undefined });
    const mail = post.sent.at(-1)!;
    assert.ok(mail.text.includes(base.url));
    assert.ok(!/Password/.test(mail.text));
  });

  it("escapes what the photographer typed before putting it in the HTML", async () => {
    await mailer.send({ ...base, kind: "pick", clientName: '<img src=x onerror=alert(1)>' });
    const mail = post.sent.at(-1)!;
    assert.ok(!mail.html!.includes("<img src=x"));
    assert.ok(mail.html!.includes("&lt;img"));
  });

  it("is a branded message: the logo, the studio's name, and one clear button", async () => {
    await mailer.send({
      ...base,
      kind: "pick",
      logoUrl: "https://app.example.test/logo-full.png",
      studioName: "Golden Hour Photography",
    });
    const html = post.sent.at(-1)!.html!;
    assert.match(html, /<img src="https:\/\/app\.example\.test\/logo-full\.png"/);
    assert.ok(html.includes("Golden Hour Photography"));
    assert.match(html, /<a href="https:\/\/app\.example\.test\/pick\/tok123"[^>]*>Open your gallery<\/a>/);
    // The link is repeated as text, for clients that strip the button.
    assert.ok(html.split("https://app.example.test/pick/tok123").length - 1 >= 2);
    assert.ok(html.includes("K7M2Q-X9PTA"));
  });

  it("still reads properly with no logo and no studio name", async () => {
    await mailer.send({ ...base, kind: "pick" });
    const html = post.sent.at(-1)!.html!;
    assert.ok(!html.includes("<img"));
    assert.ok(html.includes("Hi Elena!"));
    assert.ok(html.includes(base.url));
  });

  it("points replies at the photographer, not the sending mailbox", async () => {
    await mailer.send({ ...base, kind: "pick", replyTo: "studio@example.ro" });
    assert.equal(post.sent.at(-1)!.replyTo, "studio@example.ro");
  });
});

describe("the shoot remembers its client", () => {
  it("stores the name and address the first time a link is made", async () => {
    const w = await world();
    await w.admin.open({
      projectId: w.project.id.toString(),
      clientName: "Elena",
      clientEmail: "elena@example.com",
    });
    const project = await w.projects.findById(w.project.id);
    assert.equal(project?.clientName, "Elena");
    assert.equal(project?.clientEmail, "elena@example.com");
  });

  it("prefills the next link, so it is typed once per shoot", async () => {
    const w = await world({ clientName: "Elena", clientEmail: "elena@example.com" });
    const opened = await w.admin.open({ projectId: w.project.id.toString(), clientName: "", sendEmail: true });
    assert.equal(opened.getValue().emailSentTo, "elena@example.com");
    assert.equal(w.post.sent.at(-1)!.text.includes("Hi Elena!"), true);
  });

  it("updates the shoot when the photographer corrects the address", async () => {
    const w = await world({ clientName: "Elena", clientEmail: "old@example.com" });
    await w.admin.open({
      projectId: w.project.id.toString(),
      clientName: "Elena & Radu",
      clientEmail: "new@example.com",
    });
    const project = await w.projects.findById(w.project.id);
    assert.equal(project?.clientEmail, "new@example.com");
    assert.equal(project?.clientName, "Elena & Radu");
  });

  it("never wipes what it knows when a link is made without an address", async () => {
    const w = await world({ clientName: "Elena", clientEmail: "elena@example.com" });
    await w.admin.open({ projectId: w.project.id.toString(), clientName: "Elena" });
    const project = await w.projects.findById(w.project.id);
    assert.equal(project?.clientEmail, "elena@example.com");
  });
});

describe("sending a link to the client", () => {
  it("only sends when the photographer asked", async () => {
    const w = await world({ clientEmail: "elena@example.com" });
    await w.admin.open({ projectId: w.project.id.toString(), clientName: "Elena" });
    assert.equal(w.post.sent.length, 0, "an address on file is not permission to email");

    const opened = await w.admin.open({ projectId: w.project.id.toString(), clientName: "Elena", sendEmail: true });
    assert.equal(w.post.sent.length, 1);
    assert.equal(opened.getValue().emailSentTo, "elena@example.com");
  });

  it("emails the very link and password the client needs", async () => {
    const w = await world();
    const opened = (
      await w.admin.open({
        projectId: w.project.id.toString(),
        clientName: "Elena",
        clientEmail: "elena@example.com",
        sendEmail: true,
      })
    ).getValue();
    const mail = w.post.sent.at(-1)!;
    assert.ok(mail.text.includes(`${ORIGIN}/pick/${opened.token}`));
    assert.ok(mail.text.includes(opened.password!));
  });

  it("records who it went to, so a resend is a conscious choice", async () => {
    const w = await world();
    const opened = (
      await w.admin.open({
        projectId: w.project.id.toString(),
        clientName: "Elena",
        clientEmail: "elena@example.com",
        sendEmail: true,
      })
    ).getValue();
    const listed = (await w.admin.list(w.project.id.toString()))[0]!;
    assert.equal(listed.lastSentTo, "elena@example.com");
    assert.ok(listed.lastSentAt);
    void opened;
  });

  it("keeps the link when the mail server refuses, and says why", async () => {
    const w = await world();
    w.post.breakIt("mailbox unavailable");
    const opened = (
      await w.admin.open({
        projectId: w.project.id.toString(),
        clientName: "Elena",
        clientEmail: "elena@example.com",
        sendEmail: true,
      })
    ).getValue();

    assert.ok(opened.token, "the link exists and works");
    assert.equal(opened.emailSentTo, undefined);
    assert.match(opened.emailError ?? "", /mailbox unavailable/);
    assert.equal((await w.admin.list(w.project.id.toString()))[0]?.lastSentTo, null, "not recorded as sent");
  });

  it("resends an existing link to the same address, or a corrected one", async () => {
    const w = await world();
    const opened = (
      await w.admin.open({
        projectId: w.project.id.toString(),
        clientName: "Elena",
        clientEmail: "elena@example.com",
        sendEmail: true,
      })
    ).getValue();

    const again = await w.admin.sendInvitation(w.project.id.toString(), opened.sessionId);
    assert.equal(again.getValue().lastSentTo, "elena@example.com");
    assert.ok(w.post.sent.at(-1)!.text.includes(opened.token), "the same link, not a new one");

    const elsewhere = await w.admin.sendInvitation(w.project.id.toString(), opened.sessionId, {
      email: "radu@example.com",
      language: "ro",
    });
    assert.equal(elsewhere.getValue().lastSentTo, "radu@example.com");
    assert.match(w.post.sent.at(-1)!.text, /Salut, Elena!/);
  });

  it("asks for an address when nothing is known, and refuses another shoot's link", async () => {
    const w = await world();
    const opened = (await w.admin.open({ projectId: w.project.id.toString(), clientName: "Elena" })).getValue();

    const noAddress = await w.admin.sendInvitation(w.project.id.toString(), opened.sessionId);
    assert.equal(noAddress.getError().code, "VALIDATION_ERROR");

    const stranger = await w.admin.sendInvitation(UniqueEntityId.create().toString(), opened.sessionId);
    assert.equal(stranger.getError().code, "NOT_FOUND");
  });

  it("cannot email a link whose details were never stored", async () => {
    const w = await world({ clientEmail: "elena@example.com" });
    // No access service: the link has no sealed copy, so its token cannot be recovered.
    const plain = new PickSessionAdminUseCase(
      w.sessions,
      {
        loadProject: async (id) => ({ id, name: "Elena & Radu" }),
        listPhotos: async () => [],
        hasPhoto: async () => true,
        countProcessing: async () => 0,
      },
      undefined,
      w.invitations,
      w.contacts,
    );
    const opened = (await plain.open({ projectId: w.project.id.toString(), clientName: "Elena" })).getValue();
    const result = await plain.sendInvitation(w.project.id.toString(), opened.sessionId);
    assert.equal(result.getError().code, "CONFLICT");
    assert.match(result.getError().message, /created before/);
  });

  it("says so plainly when the server has no email configured", async () => {
    const w = await world({ clientEmail: "elena@example.com" });
    const noMail = new PickSessionAdminUseCase(w.sessions, {
      loadProject: async (id) => ({ id, name: "x" }),
      listPhotos: async () => [],
      hasPhoto: async () => true,
      countProcessing: async () => 0,
    });
    const opened = (await noMail.open({ projectId: w.project.id.toString(), clientName: "Elena" })).getValue();
    const result = await noMail.sendInvitation(w.project.id.toString(), opened.sessionId);
    assert.equal(result.getError().code, "CONFLICT");
    assert.match(result.getError().message, /not configured/);
  });
});

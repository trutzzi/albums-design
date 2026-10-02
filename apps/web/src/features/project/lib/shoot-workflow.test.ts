import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shootWorkflow, type ShootFacts } from "./shoot-workflow";

const empty: ShootFacts = { uploaded: 0, analysed: 0, albums: [], picks: [], deliveries: [] };

describe("where a shoot stands", () => {
  it("asks for photos first", () => {
    const { steps, next } = shootWorkflow(empty);
    assert.equal(steps.photos.done, false);
    assert.equal(next.text.key, "project.next.upload");
    assert.deepEqual(next.actions, ["addPhotos"]);
  });

  it("reports analysis progress while photos are prepared", () => {
    const { steps, next } = shootWorkflow({ ...empty, uploaded: 10, analysed: 4 });
    assert.deepEqual(steps.photos.status, { key: "project.step.photos.processing", params: { done: 4, total: 10 } });
    assert.deepEqual(next.actions, ["toSelection"]);
  });

  it("offers picks or the album once every photo is ready", () => {
    const { steps, next } = shootWorkflow({ ...empty, uploaded: 10, analysed: 10 });
    assert.equal(steps.photos.done, true);
    assert.deepEqual(next.actions, ["toSelection", "toAlbum"]);
  });

  it("waits on the client, then points at their picks", () => {
    const waiting = shootWorkflow({
      ...empty,
      uploaded: 5,
      analysed: 5,
      picks: [{ status: "OPEN", clientName: "Ana" }],
    });
    assert.deepEqual(waiting.next.text, { key: "project.next.waitingPicks", params: { name: "Ana" } });
    const received = shootWorkflow({
      ...empty,
      uploaded: 5,
      analysed: 5,
      picks: [{ status: "SUBMITTED", clientName: "Ana" }],
    });
    assert.equal(received.steps.selection.done, true);
    assert.deepEqual(received.next.actions, ["seePicks"]);
  });

  it("opens the first album until it is approved, then asks for delivery", () => {
    const drafting = shootWorkflow({ ...empty, uploaded: 5, analysed: 5, albums: [{ id: "a1", status: "DRAFT" }] });
    assert.equal(drafting.next.albumId, "a1");
    assert.deepEqual(drafting.next.actions, ["openAlbum"]);
    const approved = shootWorkflow({ ...empty, uploaded: 5, analysed: 5, albums: [{ id: "a1", status: "APPROVED" }] });
    assert.equal(approved.steps.album.done, true);
    assert.deepEqual(approved.next.actions, ["toDelivery"]);
  });

  it("is done once the client has downloaded", () => {
    const { steps, next } = shootWorkflow({
      ...empty,
      uploaded: 5,
      analysed: 5,
      deliveries: [{ status: "ACTIVE", downloadCount: 1 }],
    });
    assert.equal(steps.delivery.done, true);
    assert.equal(next.text.key, "project.next.done");
    assert.deepEqual(next.actions, []);
  });
});

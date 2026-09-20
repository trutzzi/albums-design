import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runWithLimit, sortFilesByName } from "./upload-queue";

describe("sortFilesByName", () => {
  it("orders by the numbers in the name, ignoring case", () => {
    const names = ["IMG_10.jpg", "img_2.JPG", "IMG_1.jpg", "IMG_100.jpg"].map((name) => ({ name }));
    assert.deepEqual(sortFilesByName(names).map((f) => f.name), ["IMG_1.jpg", "img_2.JPG", "IMG_10.jpg", "IMG_100.jpg"]);
  });
  it("does not change the list it is given", () => {
    const files = [{ name: "b" }, { name: "a" }];
    sortFilesByName(files);
    assert.equal(files[0]?.name, "b");
  });
});

describe("runWithLimit", () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("never runs more than the limit at once, and runs every item", async () => {
    let active = 0, peak = 0;
    const done: number[] = [];
    await runWithLimit(Array.from({ length: 20 }, (_, i) => i), 4, async (i) => {
      active++; peak = Math.max(peak, active);
      await sleep(3);
      active--; done.push(i);
    });
    assert.equal(peak, 4);
    assert.equal(done.length, 20);
  });

  it("starts items in the order given", async () => {
    const started: number[] = [];
    await runWithLimit([0, 1, 2, 3, 4, 5], 2, async (i) => { started.push(i); await sleep(1); });
    assert.deepEqual(started, [0, 1, 2, 3, 4, 5]);
  });

  it("copes with no items and a limit larger than the list", async () => {
    await runWithLimit([], 6, async () => { throw new Error("never"); });
    let ran = 0;
    await runWithLimit([1, 2], 50, async () => { ran++; });
    assert.equal(ran, 2);
  });
});

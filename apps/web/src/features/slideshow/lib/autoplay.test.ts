import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { playback, shouldAdvance, wrapIndex } from "./autoplay";

describe("wrapIndex", () => {
  it("loops past either end", () => {
    assert.equal(wrapIndex(5, 5), 0);
    assert.equal(wrapIndex(-1, 5), 4);
    assert.equal(wrapIndex(12, 5), 2);
  });

  it("is 0 for an empty slideshow rather than NaN", () => {
    assert.equal(wrapIndex(3, 0), 0);
  });
});

describe("playback", () => {
  const playing = { index: 0, playing: true };

  it("advances on the clock only while playing", () => {
    assert.deepEqual(playback(playing, { type: "tick" }, 3), { index: 1, playing: true });
    const paused = { index: 1, playing: false };
    assert.equal(playback(paused, { type: "tick" }, 3), paused);
  });

  it("steps by hand whether playing or paused, wrapping around", () => {
    assert.equal(playback({ index: 2, playing: false }, { type: "next" }, 3).index, 0);
    assert.equal(playback(playing, { type: "previous" }, 3).index, 2);
  });

  it("toggles play and pause without moving", () => {
    assert.deepEqual(playback(playing, { type: "toggle" }, 3), { index: 0, playing: false });
  });

  it("jumps to a photo, kept in range", () => {
    assert.equal(playback(playing, { type: "go", index: 7 }, 3).index, 1);
  });
});

describe("shouldAdvance", () => {
  it("runs the clock only when playing, visible and with somewhere to go", () => {
    const state = { index: 0, playing: true };
    assert.equal(shouldAdvance(state, { hidden: false, count: 3 }), true);
    assert.equal(shouldAdvance(state, { hidden: true, count: 3 }), false, "a hidden tab never advances");
    assert.equal(shouldAdvance(state, { hidden: false, count: 1 }), false);
    assert.equal(shouldAdvance({ ...state, playing: false }, { hidden: false, count: 3 }), false);
  });
});

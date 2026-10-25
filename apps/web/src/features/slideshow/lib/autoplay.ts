/**
 * The slideshow's playback rules, kept free of React and timers so they can be tested:
 * where each control goes, and when the clock may advance.
 */
export interface PlaybackState {
  index: number;
  /** What the viewer chose with the play/pause button. */
  playing: boolean;
}

export type PlaybackAction =
  { type: "tick" } | { type: "next" } | { type: "previous" } | { type: "toggle" } | { type: "go"; index: number };

/** Wraps both ways, so the slideshow loops like a frame on the mantelpiece. */
export function wrapIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

export function playback(state: PlaybackState, action: PlaybackAction, count: number): PlaybackState {
  switch (action.type) {
    case "tick":
      return state.playing ? { ...state, index: wrapIndex(state.index + 1, count) } : state;
    case "next":
      return { ...state, index: wrapIndex(state.index + 1, count) };
    case "previous":
      return { ...state, index: wrapIndex(state.index - 1, count) };
    case "toggle":
      return { ...state, playing: !state.playing };
    case "go":
      return { ...state, index: wrapIndex(action.index, count) };
  }
}

/**
 * Whether the clock should run. A hidden tab never advances (the viewer would come back
 * to a random photo), and one photo has nowhere to go.
 */
export function shouldAdvance(state: PlaybackState, conditions: { hidden: boolean; count: number }): boolean {
  return state.playing && !conditions.hidden && conditions.count > 1;
}

/** Preview URLs live for an hour; refetch comfortably before, so a slideshow on a TV never shows a broken image. */
export const VIEW_REFRESH_MS = 45 * 60 * 1000;
/** How long the controls stay up after the last touch or mouse move. */
export const CONTROLS_HIDE_MS = 3000;

/**
 * A broken image is most often an expired URL, which a refetch fixes. A photo that is
 * broken for good would refetch on every showing, so each photo gets at most one retry
 * per window. Records the retry in `lastRetry` when it allows one.
 */
export const IMAGE_RETRY_WINDOW_MS = 5 * 60 * 1000;
export function shouldRetryImage(photoId: string, now: number, lastRetry: Map<string, number>): boolean {
  const last = lastRetry.get(photoId);
  if (last !== undefined && now - last < IMAGE_RETRY_WINDOW_MS) return false;
  lastRetry.set(photoId, now);
  return true;
}

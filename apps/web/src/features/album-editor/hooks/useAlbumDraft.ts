import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AlbumDTO, AlbumEditInput, Crop, SlotFrame, TextBlockDTO } from "@albumflow/contracts";
import { editAlbum } from "@/shared/api";

type Spread = AlbumDTO["spreads"][number];
type Timer = ReturnType<typeof setTimeout> | null;

function updateSpread(album: AlbumDTO, spreadIndex: number, change: (spread: Spread) => Spread): AlbumDTO {
  return { ...album, spreads: album.spreads.map((spread, index) => (index === spreadIndex ? change(spread) : spread)) };
}

/**
 * The album as the editor shows it, and every way it changes.
 *
 * Edits go to the server one command at a time; continuous ones (a crop or frame being
 * dragged, a caption being typed) update a local draft on every frame and reach the
 * server once they settle. Undo and redo replay snapshots the server confirmed.
 */
export function useAlbumDraft(albumId: string, album: AlbumDTO | undefined) {
  const queryClient = useQueryClient();
  // Dragging updates 60x a second; the server only needs the frame you settle on.
  const [draft, setDraft] = useState<AlbumDTO | null>(null);

  // Undo/redo history: every spreads snapshot the server has confirmed, so
  // stepping back or forward replays a real prior state rather than a local
  // guess — kept as a ref (not state) because it must be read at the moment a
  // new edit lands, not at whatever point the closure that captured it was
  // created.
  const draftRef = useRef<AlbumDTO | null>(null);
  const [past, setPast] = useState<Spread[][]>([]);
  const [future, setFuture] = useState<Spread[][]>([]);

  useEffect(() => {
    if (album) {
      draftRef.current = album;
      setDraft(album);
    }
  }, [album]);

  // Switching to a different album entirely starts its history fresh.
  useEffect(() => {
    draftRef.current = null;
    setPast([]);
    setFuture([]);
  }, [albumId]);

  // Records a server-confirmed edit: pushes the state it replaced onto the
  // undo stack and clears redo, since a fresh edit invalidates whatever could
  // have been replayed forward. Undo/redo themselves bypass this — they
  // manage the stacks directly so replaying history doesn't get recorded
  // as a new entry in it.
  const applyUpdate = useCallback((updated: AlbumDTO) => {
    const previous = draftRef.current;
    if (previous) setPast((stack) => [...stack, previous.spreads]);
    setFuture([]);
    draftRef.current = updated;
    setDraft(updated);
  }, []);

  /** For every mutation that returns the edited album: cache it and record it in the history. */
  const commit = useCallback(
    (updated: AlbumDTO) => {
      queryClient.setQueryData(["album", albumId], updated);
      applyUpdate(updated);
    },
    [queryClient, albumId, applyUpdate],
  );

  const edit = useMutation({
    mutationFn: (command: AlbumEditInput) => editAlbum(albumId, command),
    onSuccess: (updated) => {
      commit(updated);
      void queryClient.invalidateQueries({ queryKey: ["albums", updated.projectId] });
    },
  });

  // Every memoised child takes callbacks from here, so they must keep the same
  // identity across renders. The mutation object does not, so route through a ref.
  const editRef = useRef(edit.mutate);
  editRef.current = edit.mutate;
  const runEdit = useCallback((command: AlbumEditInput) => editRef.current(command), []);

  const historyMove = useRef<{ direction: "undo" | "redo"; leaving: Spread[] } | null>(null);
  const restoreSpreads = useMutation({
    mutationFn: (spreads: Spread[]) => editAlbum(albumId, { type: "RESTORE_SPREADS", spreads }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["album", albumId], updated);
      draftRef.current = updated;
      setDraft(updated);
      const pending = historyMove.current;
      historyMove.current = null;
      if (!pending) return;
      if (pending.direction === "undo") {
        setPast((stack) => stack.slice(0, -1));
        setFuture((stack) => [...stack, pending.leaving]);
      } else {
        setFuture((stack) => stack.slice(0, -1));
        setPast((stack) => [...stack, pending.leaving]);
      }
    },
  });

  const undo = useCallback(() => {
    const previous = past[past.length - 1];
    const leaving = draftRef.current;
    if (!previous || !leaving || restoreSpreads.isPending) return;
    historyMove.current = { direction: "undo", leaving: leaving.spreads };
    restoreSpreads.mutate(previous);
  }, [past, restoreSpreads]);

  const redo = useCallback(() => {
    const next = future[future.length - 1];
    const leaving = draftRef.current;
    if (!next || !leaving || restoreSpreads.isPending) return;
    historyMove.current = { direction: "redo", leaving: leaving.spreads };
    restoreSpreads.mutate(next);
  }, [future, restoreSpreads]);

  // One timer per kind of continuous edit, so settling a crop never cancels a pending frame.
  const pendingCrop = useRef<Timer>(null);
  const pendingFrame = useRef<Timer>(null);
  const pendingFrames = useRef<Timer>(null);
  const pendingText = useRef<Timer>(null);
  const sendWhenSettled = useCallback(
    (timer: { current: Timer }, send: () => void, commitNow: boolean, delayMs: number) => {
      if (timer.current) clearTimeout(timer.current);
      if (commitNow) send();
      else timer.current = setTimeout(send, delayMs);
    },
    [],
  );

  const changeCrop = useCallback(
    (spreadIndex: number, slotId: string, crop: Crop, commitNow: boolean) => {
      setDraft((current) =>
        current &&
        updateSpread(current, spreadIndex, (spread) => ({
          ...spread,
          placements: spread.placements.map((placement) => (placement.slotId === slotId ? { ...placement, crop } : placement)),
        })),
      );
      sendWhenSettled(pendingCrop, () => runEdit({ type: "SET_CROP", spreadIndex, slotId, crop }), commitNow, 400);
    },
    [runEdit, sendWhenSettled],
  );

  const changeFrame = useCallback(
    (spreadIndex: number, slotId: string, frame: SlotFrame, commitNow: boolean) => {
      setDraft((current) =>
        current &&
        updateSpread(current, spreadIndex, (spread) => ({
          ...spread,
          placements: spread.placements.map((placement) => (placement.slotId === slotId ? { ...placement, frame } : placement)),
        })),
      );
      sendWhenSettled(pendingFrame, () => runEdit({ type: "SET_FRAME", spreadIndex, slotId, frame }), commitNow, 400);
    },
    [runEdit, sendWhenSettled],
  );

  const changeFrames = useCallback(
    (spreadIndex: number, frames: { slotId: string; frame: SlotFrame }[], commitNow: boolean) => {
      const bySlot = new Map(frames.map((entry) => [entry.slotId, entry.frame]));
      setDraft((current) =>
        current &&
        updateSpread(current, spreadIndex, (spread) => ({
          ...spread,
          placements: spread.placements.map((placement) => {
            const frame = bySlot.get(placement.slotId);
            return frame ? { ...placement, frame } : placement;
          }),
        })),
      );
      sendWhenSettled(pendingFrames, () => runEdit({ type: "SET_FRAMES", spreadIndex, frames }), commitNow, 400);
    },
    [runEdit, sendWhenSettled],
  );

  // Like crops and frames: the draft follows every keystroke and drag frame, the server
  // gets the block once it settles.
  const changeText = useCallback(
    (spreadIndex: number, block: TextBlockDTO, commitNow: boolean) => {
      setDraft((current) =>
        current &&
        updateSpread(current, spreadIndex, (spread) => ({
          ...spread,
          texts: (spread.texts ?? []).map((item) => (item.id === block.id ? block : item)),
        })),
      );
      sendWhenSettled(pendingText, () => runEdit({ type: "SET_TEXT_BLOCK", spreadIndex, block }), commitNow, 600);
    },
    [runEdit, sendWhenSettled],
  );

  /** A removed block must not be re-sent by a keystroke still waiting to settle. */
  const removeText = useCallback(
    (spreadIndex: number, blockId: string) => {
      if (pendingText.current) clearTimeout(pendingText.current);
      runEdit({ type: "REMOVE_TEXT_BLOCK", spreadIndex, blockId });
    },
    [runEdit],
  );

  return {
    current: draft ?? album,
    edit,
    runEdit,
    commit,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    restoreSpreads,
    changeCrop,
    changeFrame,
    changeFrames,
    changeText,
    removeText,
  };
}

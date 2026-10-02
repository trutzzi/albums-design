const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** File-name order as a person expects it: IMG_2 before IMG_10, case ignored. */
export function sortFilesByName<T extends { name: string }>(files: T[]): T[] {
  return [...files].sort((a, b) => collator.compare(a.name, b.name));
}

/**
 * Runs `task` over `items` with at most `limit` in flight, starting them in the given
 * order. Starting everything at once (the old behaviour) opens hundreds of simultaneous
 * connections, finishes files in whatever order the network chooses, and floods the
 * server with confirmations. A failing task never stops the others; `task` is expected
 * to handle its own errors.
 */
export async function runWithLimit<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
  /** When this is aborted, nothing further is started; whatever is in flight finishes or fails on its own. */
  signal?: AbortSignal,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      if (signal?.aborted) return;
      const item = items[next++]!;
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
}

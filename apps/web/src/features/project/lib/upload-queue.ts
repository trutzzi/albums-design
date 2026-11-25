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

/** How a file is recognised as one already in the shoot: name and size, as the server checks. */
export function fileKey(name: string, byteSize: number): string {
  return `${name}\u0000${byteSize}`;
}

/**
 * Splits a drop into files to upload and files to skip: those already in the shoot, and
 * repeats within the drop itself. Done before the plan limit trims the batch, so a folder
 * of mostly existing photos does not use up the room meant for its few new ones.
 */
export function splitDuplicates<T extends { name: string; size: number }>(
  files: readonly T[],
  existing: ReadonlySet<string>,
): { fresh: T[]; duplicates: T[] } {
  const seen = new Set(existing);
  const fresh: T[] = [];
  const duplicates: T[] = [];
  for (const file of files) {
    const key = fileKey(file.name, file.size);
    if (seen.has(key)) duplicates.push(file);
    else {
      seen.add(key);
      fresh.push(file);
    }
  }
  return { fresh, duplicates };
}

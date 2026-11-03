/** "850 KB", "24.6 MB", "1.2 GB": an export's size the way a person reads it. */
export function formatFileSize(bytes: number, locale: string): string {
  const units = [
    ["GB", 1024 ** 3],
    ["MB", 1024 ** 2],
  ] as const;
  for (const [unit, size] of units) {
    if (bytes >= size) {
      return `${(bytes / size).toLocaleString(locale, { maximumFractionDigits: 1 })} ${unit}`;
    }
  }
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString(locale)} KB`;
}

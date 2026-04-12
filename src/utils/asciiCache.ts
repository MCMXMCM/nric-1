export interface AsciiCacheEntry {
  ascii: string;
  timestamp: number;
}

export type AsciiCacheMap = Record<string, AsciiCacheEntry>;

export const ASCII_CACHE_MAX_ENTRIES = 180;
export const ASCII_CACHE_MAX_CHARS = 900_000;

export function addAsciiCacheEntry(
  prev: AsciiCacheMap,
  key: string,
  ascii: string,
  options?: {
    maxEntries?: number;
    maxChars?: number;
    now?: number;
  }
): AsciiCacheMap {
  const maxEntries = options?.maxEntries ?? ASCII_CACHE_MAX_ENTRIES;
  const maxChars = options?.maxChars ?? ASCII_CACHE_MAX_CHARS;
  const now = options?.now ?? Date.now();

  const next: AsciiCacheMap = {
    ...prev,
    [key]: { ascii, timestamp: now },
  };

  const entries = Object.entries(next);
  if (entries.length === 0) return next;

  entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
  const result: AsciiCacheMap = {};
  let totalChars = 0;
  let kept = 0;

  for (const [entryKey, entry] of entries) {
    if (kept >= maxEntries) break;
    const nextChars = totalChars + (entry?.ascii?.length ?? 0);
    if (nextChars > maxChars && kept > 0) break;
    result[entryKey] = entry;
    kept += 1;
    totalChars = nextChars;
  }

  return result;
}

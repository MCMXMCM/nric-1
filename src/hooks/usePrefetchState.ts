

interface PrefetchState {
  prefetchedImages: Set<string>;
  prefetchedMetadata: Set<string>;
  prefetchedThreads: Set<string>;
  isImagePrefetched: (url: string) => boolean;
  isMetadataPrefetched: (pubkey: string) => boolean;
  isThreadPrefetched: (noteId: string) => boolean;
  addPrefetchedImage: (url: string) => void;
  addPrefetchedMetadata: (pubkey: string) => void;
  addPrefetchedThread: (noteId: string) => void;
}

const PREFETCH_TTL_MS = 20 * 60 * 1000;
const MAX_PREFETCHED_IMAGES = 1200;
const MAX_PREFETCHED_METADATA = 1800;
const MAX_PREFETCHED_THREADS = 1000;

const prefetchedImageTouchedAt = new Map<string, number>();
const prefetchedMetadataTouchedAt = new Map<string, number>();
const prefetchedThreadTouchedAt = new Map<string, number>();

function prunePrefetchSet(
  set: Set<string>,
  touchedAt: Map<string, number>,
  maxEntries: number
): void {
  const now = Date.now();
  for (const [key, ts] of touchedAt.entries()) {
    if (now - ts > PREFETCH_TTL_MS) {
      touchedAt.delete(key);
      set.delete(key);
    }
  }
  if (set.size <= maxEntries) return;
  const oldest = Array.from(touchedAt.entries()).sort((a, b) => a[1] - b[1]);
  const pruneCount = set.size - maxEntries;
  for (let i = 0; i < pruneCount && i < oldest.length; i += 1) {
    const key = oldest[i][0];
    touchedAt.delete(key);
    set.delete(key);
  }
}

function isPrefetched(
  set: Set<string>,
  touchedAt: Map<string, number>,
  key: string
): boolean {
  const ts = touchedAt.get(key);
  if (!ts) return false;
  if (Date.now() - ts > PREFETCH_TTL_MS) {
    touchedAt.delete(key);
    set.delete(key);
    return false;
  }
  touchedAt.set(key, Date.now());
  return set.has(key);
}

function addPrefetched(
  set: Set<string>,
  touchedAt: Map<string, number>,
  key: string,
  maxEntries: number
): void {
  const now = Date.now();
  set.add(key);
  touchedAt.set(key, now);
  prunePrefetchSet(set, touchedAt, maxEntries);
}

// Global prefetch state - shared across the app
const globalPrefetchState: PrefetchState = {
  prefetchedImages: new Set<string>(),
  prefetchedMetadata: new Set<string>(),
  prefetchedThreads: new Set<string>(),
  isImagePrefetched: (url: string) =>
    isPrefetched(globalPrefetchState.prefetchedImages, prefetchedImageTouchedAt, url),
  isMetadataPrefetched: (pubkey: string) =>
    isPrefetched(globalPrefetchState.prefetchedMetadata, prefetchedMetadataTouchedAt, pubkey),
  isThreadPrefetched: (noteId: string) =>
    isPrefetched(globalPrefetchState.prefetchedThreads, prefetchedThreadTouchedAt, noteId),
  addPrefetchedImage: (url: string) =>
    addPrefetched(
      globalPrefetchState.prefetchedImages,
      prefetchedImageTouchedAt,
      url,
      MAX_PREFETCHED_IMAGES
    ),
  addPrefetchedMetadata: (pubkey: string) =>
    addPrefetched(
      globalPrefetchState.prefetchedMetadata,
      prefetchedMetadataTouchedAt,
      pubkey,
      MAX_PREFETCHED_METADATA
    ),
  addPrefetchedThread: (noteId: string) =>
    addPrefetched(
      globalPrefetchState.prefetchedThreads,
      prefetchedThreadTouchedAt,
      noteId,
      MAX_PREFETCHED_THREADS
    ),
};

export function usePrefetchState(): PrefetchState {
  return globalPrefetchState;
}

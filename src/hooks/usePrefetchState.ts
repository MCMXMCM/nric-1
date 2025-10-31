

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

// Global prefetch state - shared across the app
const globalPrefetchState: PrefetchState = {
  prefetchedImages: new Set<string>(),
  prefetchedMetadata: new Set<string>(),
  prefetchedThreads: new Set<string>(),
  isImagePrefetched: (url: string) => globalPrefetchState.prefetchedImages.has(url),
  isMetadataPrefetched: (pubkey: string) => globalPrefetchState.prefetchedMetadata.has(pubkey),
  isThreadPrefetched: (noteId: string) => globalPrefetchState.prefetchedThreads.has(noteId),
  addPrefetchedImage: (url: string) => globalPrefetchState.prefetchedImages.add(url),
  addPrefetchedMetadata: (pubkey: string) => globalPrefetchState.prefetchedMetadata.add(pubkey),
  addPrefetchedThread: (noteId: string) => globalPrefetchState.prefetchedThreads.add(noteId),
};

export function usePrefetchState(): PrefetchState {
  return globalPrefetchState;
}

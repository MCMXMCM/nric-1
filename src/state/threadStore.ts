import { create } from "zustand";
import type { Note } from "../types/nostr/types";

export interface ThreadStoreState {
  // Per-root state: key is rootId
  threads: Record<
    string,
    {
      // Notes indexed by id
      notesById: Map<string, Note>;
      // NIP-10 immediate children mapping: parentId -> sorted childIds[]
      childrenIdMap: Record<string, string[]>;
      // Direct replies to the current parent, sorted
      directChildrenIds: string[];
      // Current parent being displayed (can differ from rootId)
      currentParentId: string | null;
      // Loading and pagination state
      status: {
        isLoading: boolean;
        hasMore: boolean;
        lastUpdated: number;
      };
      // Pagination frontier for incremental loads
      frontier: {
        lastSeenCreatedAt: number | null;
        lastSeenIds: Set<string>;
      };
    }
  >;
}

export interface ThreadStoreActions {
  // Initialize or reset a thread
  initThread: (rootId: string, parentId: string) => void;
  // Ingest raw events into notesById; does not update structure (worker does that)
  ingestNotes: (rootId: string, notes: Note[]) => void;
  // Apply patch from worker: update childrenIdMap and recompute directChildrenIds
  applyWorkerPatch: (
    rootId: string,
    patch: {
      updatedChildren: Record<string, string[]>;
      notes: Note[];
    }
  ) => void;
  // Change which note is the current parent (navigation)
  setCurrentParentId: (rootId: string, parentId: string) => void;
  // Mark loading state
  setLoading: (rootId: string, isLoading: boolean) => void;
  // Mark whether more data is available
  setHasMore: (rootId: string, hasMore: boolean) => void;
  // Update pagination frontier
  setFrontier: (
    rootId: string,
    lastSeenCreatedAt: number | null,
    lastSeenIds: Set<string>
  ) => void;
}

export interface ThreadStoreSelectors {
  // Get parent note by rootId, currentParentId
  selectParent: (rootId: string) => Note | null;
  // Get direct replies (sorted children of current parent)
  selectDirectReplies: (rootId: string) => Note[];
  // Get children of a specific note id
  selectChildren: (rootId: string, noteId: string) => Note[];
  // Get full structure map
  selectStructure: (rootId: string) => Map<string, Note[]> | null;
  // Get thread status
  selectStatus: (rootId: string) => ThreadStoreState["threads"][string]["status"];
  // Get raw state for a root
  selectThreadState: (
    rootId: string
  ) => ThreadStoreState["threads"][string] | null;
}

type ThreadStore = ThreadStoreState & ThreadStoreActions & ThreadStoreSelectors;

const DEFAULT_STATUS: ThreadStoreState["threads"][string]["status"] = {
  isLoading: false,
  hasMore: false,
  lastUpdated: 0,
};

const initializeThreadState = (
  parentId: string
): ThreadStoreState["threads"][string] => ({
  notesById: new Map(),
  childrenIdMap: {},
  directChildrenIds: [],
  currentParentId: parentId,
  status: {
    isLoading: false,
    hasMore: true,
    lastUpdated: 0,
  },
  frontier: {
    lastSeenCreatedAt: null,
    lastSeenIds: new Set(),
  },
});

export const useThreadStore = create<ThreadStore>((set, get) => ({
  threads: {},

  initThread: (rootId, parentId) => {
    set((state) => ({
      threads: {
        ...state.threads,
        [rootId]: initializeThreadState(parentId),
      },
    }));
  },

  ingestNotes: (rootId, notes) => {
    set((state) => {
      const thread = state.threads[rootId];
      if (!thread) return state;

      const updated = new Map(thread.notesById);
      for (const note of notes) {
        updated.set(note.id, note);
      }

      return {
        threads: {
          ...state.threads,
          [rootId]: {
            ...thread,
            notesById: updated,
          },
        },
      };
    });
  },

  applyWorkerPatch: (rootId, patch) => {
    set((state) => {
      const thread = state.threads[rootId];
      if (!thread) return state;

      // Merge notes
      const updated = new Map(thread.notesById);
      for (const note of patch.notes) {
        updated.set(note.id, note);
      }

      // Merge childrenIdMap
      const mergedMap = { ...thread.childrenIdMap };
      for (const [parentId, childIds] of Object.entries(patch.updatedChildren)) {
        mergedMap[parentId] = childIds;
      }

      // Recompute directChildrenIds from current parent
      const currentParentId = thread.currentParentId || rootId;
      const directChildrenIds = mergedMap[currentParentId] || [];

      return {
        threads: {
          ...state.threads,
          [rootId]: {
            ...thread,
            notesById: updated,
            childrenIdMap: mergedMap,
            directChildrenIds,
          },
        },
      };
    });
  },

  setCurrentParentId: (rootId, parentId) => {
    set((state) => {
      const thread = state.threads[rootId];
      if (!thread) return state;

      // Recompute directChildrenIds for the new parent
      const directChildrenIds = thread.childrenIdMap[parentId] || [];

      return {
        threads: {
          ...state.threads,
          [rootId]: {
            ...thread,
            currentParentId: parentId,
            directChildrenIds,
          },
        },
      };
    });
  },

  setLoading: (rootId, isLoading) => {
    set((state) => {
      const thread = state.threads[rootId];
      if (!thread) return state;

      return {
        threads: {
          ...state.threads,
          [rootId]: {
            ...thread,
            status: {
              ...thread.status,
              isLoading,
            },
          },
        },
      };
    });
  },

  setHasMore: (rootId, hasMore) => {
    set((state) => {
      const thread = state.threads[rootId];
      if (!thread) return state;

      return {
        threads: {
          ...state.threads,
          [rootId]: {
            ...thread,
            status: {
              ...thread.status,
              hasMore,
            },
          },
        },
      };
    });
  },

  setFrontier: (rootId, lastSeenCreatedAt, lastSeenIds) => {
    set((state) => {
      const thread = state.threads[rootId];
      if (!thread) return state;

      return {
        threads: {
          ...state.threads,
          [rootId]: {
            ...thread,
            frontier: {
              lastSeenCreatedAt,
              lastSeenIds,
            },
          },
        },
      };
    });
  },

  // Selectors
  selectParent: (rootId) => {
    const state = get();
    const thread = state.threads[rootId];
    if (!thread || !thread.currentParentId) return null;
    return thread.notesById.get(thread.currentParentId) || null;
  },

  selectDirectReplies: (rootId) => {
    const state = get();
    const thread = state.threads[rootId];
    if (!thread) return [];
    return (thread.directChildrenIds || [])
      .map((id) => thread.notesById.get(id))
      .filter((n): n is Note => Boolean(n));
  },

  selectChildren: (rootId, noteId) => {
    const state = get();
    const thread = state.threads[rootId];
    if (!thread) return [];
    const childIds = thread.childrenIdMap[noteId] || [];
    return childIds
      .map((id) => thread.notesById.get(id))
      .filter((n): n is Note => Boolean(n));
  },

  selectStructure: (rootId) => {
    const state = get();
    const thread = state.threads[rootId];
    if (!thread) return null;

    const map = new Map<string, Note[]>();
    for (const [parentId, childIds] of Object.entries(thread.childrenIdMap)) {
      const children = childIds
        .map((id) => thread.notesById.get(id))
        .filter((n): n is Note => Boolean(n));
      if (children.length > 0) {
        map.set(parentId, children);
      }
    }
    return map;
  },

  selectStatus: (rootId) => {
    const state = get();
    const thread = state.threads[rootId];
    if (!thread) {
      return DEFAULT_STATUS;
    }
    return thread.status;
  },

  selectThreadState: (rootId) => {
    const state = get();
    return state.threads[rootId] || null;
  },
}));

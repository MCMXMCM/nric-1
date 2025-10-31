import React, {
  useCallback,
  useRef,
  useEffect,
  useState,
  useContext,
  useMemo,
} from "react";
import { useParams, useNavigate, useLocation } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { getGlobalRelayPool } from "../utils/nostr/relayConnectionPool";
import type { Note } from "../types/nostr/types";
import { nip19 } from "nostr-tools";
// import { formatRelativeTime } from "../utils/nostr/utils";
// import NoteContentRenderer from "./NoteContentRenderer";
import { useNostrifyThreadGlobal } from "../hooks/useNostrifyThreadGlobal";
import { useNostrifyNote } from "../hooks/useNostrifyThread";
import { useScrollRestoration } from "../hooks/useScrollRestoration";
// import { CommentDisplayName } from "./thread/CommentDisplayName";
// import { LikeButton } from "./thread/LikeButton";
// import LoadingTextMultiLine from "./ui/LoadingTextMultiLine";
import ThreadHeader from "./ThreadHeader";
import { useUIStore } from "./lib/useUIStore";
import { useRelayManager } from "../hooks/useRelayManager";
import { useDisplayNames } from "../hooks/useDisplayNames";
import { NostrContext } from "../contexts/NostrContext";
import { useUserContactsContext } from "../contexts/UserContactsContext";
import { useUniversalHashtagHandler } from "../utils/hashtagNavigation";
import ThreadLoading from "./thread/ThreadLoading";
import MainNote from "./thread/MainNote";
// import NestedReplies from "./thread/NestedReplies";
import CommentsList from "./thread/CommentsList";
import { ThreadWithHotkeys } from "./thread/ThreadWithHotkeys";
import { buildFlattenedThread } from "../utils/thread/flatten";
import { CACHE_KEYS } from "../utils/cacheKeys";
import ThreadSummary from "./thread/ThreadSummary";

const ThreadPage: React.FC = () => {
  const { noteId } = useParams({ strict: false }) as { noteId: string };
  const navigate = useNavigate();
  const location = useLocation();
  const { pubkey, nostrClient } = useContext(NostrContext) as any;
  const { relayUrls } = useRelayManager({
    nostrClient,
    initialRelays: [],
    pubkeyHex: pubkey,
  });
  const { getDisplayNameForPubkey } = useDisplayNames(relayUrls);
  const { useAscii, useColor, imageMode } = useUIStore((s) => ({
    useAscii: s.useAscii,
    useColor: s.useColor,
    imageMode: s.imageMode,
  }));

  // Get user's contacts for outbox model routing
  // UserContactsContext should always be available since it's provided in App.tsx
  const userContactsContext = useUserContactsContext();

  const contactPubkeys = useMemo(() => {
    // Only include contact pubkeys when user is logged in and has contacts
    if (
      !pubkey ||
      !userContactsContext?.contacts ||
      userContactsContext.contacts.length === 0
    ) {
      return [];
    }
    return userContactsContext.contacts
      .map((c: any) => c.pubkey)
      .filter(Boolean);
  }, [pubkey, userContactsContext?.contacts]);

  // Decode NIP-19 note ID to hex (handle both bech32 and hex formats)
  const hexNoteId = useMemo(() => {
    if (!noteId) return null;

    // If it's already hex format (64 characters), return as-is
    if (noteId.length === 64 && /^[a-fA-F0-9]+$/.test(noteId)) {
      return noteId;
    }

    // Otherwise, try to decode as bech32
    try {
      const decoded = nip19.decode(noteId);
      if (decoded.type === "note" && typeof decoded.data === "string") {
        return decoded.data;
      }
    } catch (error) {
      console.warn("Failed to decode note ID:", error);
    }

    // Fallback: return the original noteId
    return noteId;
  }, [noteId]);

  // Universal hashtag click handler - navigates to main feed with hashtag filter
  const handleHashtagClick = useUniversalHashtagHandler();

  const containerRef = useRef<HTMLDivElement>(null);
  const [uiStateHydrated, setUiStateHydrated] = useState<boolean>(false);
  const queryClient = useQueryClient();

  const isMobileLayout = window.innerWidth <= 768;

  // Initialize pool
  const poolRef = useRef<ReturnType<typeof getGlobalRelayPool> | null>(null);
  useEffect(() => {
    poolRef.current = getGlobalRelayPool();
  }, [relayUrls]);

  // Note: normalizeRelayUrl function removed - no longer needed with Nostrify

  // Note: buildAugmentedRelays function removed - no longer needed with Nostrify

  // Check if we have a cached note from navigation state
  const navigationState = location.state as any;
  const cachedNoteFromState = navigationState?.cachedNote || null;
  const focusedReplyIdFromState: string | null =
    navigationState?.focusedReplyId || null;
  const rootThreadIdFromState: string | null =
    navigationState?.rootThreadId || null;
  const forceScrollTopFromState: boolean = !!navigationState?.forceScrollTop;

  // Use global thread tree for optimized loading with persistent navigation
  const {
    data: allNotes = [],
    isLoading: isLoadingComments,
    fetchNextPage,
    hasNextPage,
    threadStructure,
    discoveredRootId,
  } = useNostrifyThreadGlobal({
    parentEventId: hexNoteId || noteId,
    rootThreadId: rootThreadIdFromState || undefined,
    relayUrls,
    enabled: true,
    pageSize: 20,
    maxDepth: 3,
    mutedPubkeys: [],
    contactPubkeys: contactPubkeys, // Include contacts for outbox model routing
  });

  // Enable scroll restoration only after UI state is hydrated and comments are available/loading is settled
  useScrollRestoration(containerRef, `thread:${noteId}`, {
    enabled: uiStateHydrated && !isLoadingComments && !forceScrollTopFromState,
  });

  // If navigation requested a scroll-to-top (e.g., via parent/root), force it after hydration
  useEffect(() => {
    if (!forceScrollTopFromState) return;
    if (!uiStateHydrated) return;
    try {
      const el = containerRef.current as unknown as HTMLElement | null;
      if (el) {
        // Temporarily disable smooth behavior for immediate jump
        const prev = (el.style as any).scrollBehavior || "";
        try {
          el.style.setProperty("scroll-behavior", "auto", "important");
        } catch {}
        el.scrollTop = 0;
        try {
          if (prev) el.style.setProperty("scroll-behavior", prev);
          else el.style.removeProperty("scroll-behavior");
        } catch {}
      }
    } catch {}
    // Clear the flag from history state so subsequent renders restore normally
    try {
      navigate({
        to: location.pathname,
        replace: true,
        state: { ...(navigationState || {}), forceScrollTop: false } as any,
      });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiStateHydrated, forceScrollTopFromState, noteId]);

  // Get parent note using Nostrify, fall back to cached note from navigation state when unavailable
  const {
    note: fetchedParentNote,
    isLoading: isLoadingParentNote,
    error: parentNoteError,
  } = useNostrifyNote({
    noteId: hexNoteId || noteId,
    relayUrls,
    enabled: true,
  });
  // Fallback: if no fetched/cached parent yet, try query cache to avoid transient not-found
  const parentFromCache = useMemo(() => {
    const id = (hexNoteId || noteId) as string;
    try {
      return queryClient.getQueryData<Note>(CACHE_KEYS.NOTE(id)) || null;
    } catch {
      return null;
    }
  }, [queryClient, hexNoteId, noteId]);
  const currentParentNote =
    fetchedParentNote ?? cachedNoteFromState ?? parentFromCache;

  // Normalize parent note for rendering to handle cached stubs ({ id } only)
  const safeParentNote: Note | null = useMemo(() => {
    if (!currentParentNote) return null;
    const n: any = currentParentNote as any;
    return {
      id: n.id,
      content: typeof n.content === "string" ? n.content : "",
      pubkey: typeof n.pubkey === "string" ? n.pubkey : "",
      created_at: typeof n.created_at === "number" ? n.created_at : 0,
      kind: typeof n.kind === "number" ? n.kind : 1,
      tags: Array.isArray(n.tags) ? n.tags : [],
      imageUrls: Array.isArray(n.imageUrls) ? n.imageUrls : [],
      videoUrls: Array.isArray(n.videoUrls) ? n.videoUrls : [],
      receivedAt: typeof n.receivedAt === "number" ? n.receivedAt : Date.now(),
    } as Note;
  }, [currentParentNote]);

  // Check if parent note was not found after loading completed
  // Only show "note not found" if we've actually tried to fetch and failed
  // Don't show it if we're still loading or if there's a cached note from navigation
  // Add a delay before showing error to handle slower mobile connections
  const [showNoteNotFound, setShowNoteNotFound] = useState(false);

  // MediaGallery state and handlers
  const [asciiCache, setAsciiCache] = useState<
    Record<string, { ascii: string; timestamp: number }>
  >({});

  const handleAsciiRendered = useCallback((url: string, ascii: string) => {
    setAsciiCache((prev) => ({
      ...prev,
      [url]: { ascii, timestamp: Date.now() },
    }));
  }, []);

  const handleMediaLoadError = useCallback((url: string) => {
    console.warn(`Failed to load media: ${url}`);
  }, []);

  const handleImageDimensionsLoaded = useCallback(
    (
      _noteId: string,
      imageUrl: string,
      dimensions: { width: number; height: number }
    ) => {
      // Optional: store dimensions for layout calculations
      console.log(`Image dimensions loaded for ${imageUrl}:`, dimensions);
    },
    []
  );

  useEffect(() => {
    // Only show not found when:
    // - parent fetch finished
    // - no parent from fetch, state, or cache
    // - and we also don't have any thread data yet (comments/allNotes/threadStructure)
    const noThreadData =
      (!Array.isArray(allNotes) || allNotes.length === 0) &&
      (!threadStructure || threadStructure.size === 0);
    const shouldShowError =
      !isLoadingParentNote &&
      !currentParentNote &&
      !parentNoteError &&
      noThreadData;

    if (shouldShowError) {
      const timer = setTimeout(() => {
        setShowNoteNotFound(true);
      }, 2500);
      return () => clearTimeout(timer);
    } else {
      setShowNoteNotFound(false);
    }
  }, [
    isLoadingParentNote,
    currentParentNote,
    parentNoteError,
    allNotes,
    threadStructure,
  ]);

  const parentNoteNotFound = showNoteNotFound;

  // If we navigated from a reply, fetch it directly so we can guarantee it appears
  const { note: focusedReplyNote } = useNostrifyNote({
    noteId: focusedReplyIdFromState || "",
    relayUrls,
    enabled: Boolean(focusedReplyIdFromState),
  });

  // Prefer id-based caches (LEVEL1 + NESTED) when available; fallback to threadStructure
  const { comments, resolvedThreadStructure, childrenIdMap } = useMemo(() => {
    const parentId = (hexNoteId || noteId) as string;

    // Try LEVEL1 ids first
    const level1Data = queryClient.getQueryData(
      CACHE_KEYS.THREAD.LEVEL1(parentId)
    ) as any | undefined;
    const level1Ids: string[] = Array.isArray(level1Data?.directChildrenIds)
      ? (level1Data!.directChildrenIds as string[])
      : [];

    // Reconstruct comments from ids using global note cache
    const notesFromIds: Note[] = level1Ids
      .map((id) => queryClient.getQueryData<Note>(CACHE_KEYS.NOTE(id)))
      .filter((n): n is Note => Boolean(n));

    // Build resolved thread structure from id-based nested cache if available
    let structure: Map<string, Note[]> | undefined = undefined;
    let childrenIdMapLocal: Record<string, string[]> | undefined = undefined;
    if (level1Ids.length > 0) {
      // Build a deterministic frontier key by sorting by created_at then id when possible
      const sortedIdsForKey = (() => {
        if (notesFromIds.length > 0) {
          return [
            ...new Set(
              [...notesFromIds]
                .sort(
                  (a, b) =>
                    a.created_at - b.created_at || a.id.localeCompare(b.id)
                )
                .map((n) => n.id)
            ),
          ];
        }
        // Fallback to lexicographic sort if note metadata isn't available yet
        return [...level1Ids].sort();
      })();
      const frontierKey = sortedIdsForKey.join(",");
      const nestedData = queryClient.getQueryData(
        CACHE_KEYS.THREAD.NESTED(parentId, 3, frontierKey)
      ) as any | undefined;

      if (nestedData && nestedData.childrenIdMap) {
        structure = new Map<string, Note[]>();
        const idMap: Record<string, string[]> = nestedData.childrenIdMap || {};
        childrenIdMapLocal = idMap;
        for (const pid of Object.keys(idMap)) {
          const childIds = idMap[pid] || [];
          const childNotes: Note[] = childIds
            .map((cid) => queryClient.getQueryData<Note>(CACHE_KEYS.NOTE(cid)))
            .filter((n): n is Note => Boolean(n))
            .sort((a, b) => a.created_at - b.created_at);
          if (childNotes.length > 0) {
            structure.set(pid, childNotes);
          }
        }
      }
    }

    // Get direct replies to the parent note from thread structure
    let directReplies: Note[] = [];
    if (notesFromIds.length > 0) {
      directReplies = [...notesFromIds].sort(
        (a, b) => a.created_at - b.created_at
      );
    } else if (threadStructure && currentParentNote) {
      directReplies = threadStructure.get(currentParentNote.id) || [];
    }

    // Augment direct replies by scanning all notes for immediate parent e-tags
    // This ensures sibling replies consistently appear regardless of navigation path
    if (allNotes.length > 0) {
      const eTaggedDirect = allNotes
        .filter((n) => {
          if (!Array.isArray(n.tags)) return false;
          const eTags = n.tags.filter(
            (t: any) => Array.isArray(t) && t[0] === "e"
          );
          // Determine immediate parent according to NIP-10
          const replyTag = eTags.find((t: any) => t[3] === "reply");
          const immediateParentId = replyTag
            ? replyTag[1]
            : eTags.length === 1
              ? eTags[0][1]
              : null;
          return immediateParentId === parentId;
        })
        .sort((a, b) => a.created_at - b.created_at);

      if (eTaggedDirect.length > 0) {
        const byId = new Map<string, Note>();
        [...directReplies, ...eTaggedDirect].forEach((n) => byId.set(n.id, n));
        directReplies = Array.from(byId.values()).sort(
          (a, b) => a.created_at - b.created_at
        );
      }
    }

    // Derive a children structure map from allNotes using NIP-10 immediate parent logic
    // This fills gaps before threadStructure/nested cache are available on first render
    let derivedStructure: Map<string, Note[]> | undefined = undefined;
    if (Array.isArray(allNotes) && allNotes.length > 0) {
      const tempMap = new Map<string, Note[]>();
      for (const n of allNotes) {
        if (!Array.isArray((n as any).tags)) continue;
        const eTags = (n as any).tags.filter(
          (t: any) => Array.isArray(t) && t[0] === "e"
        );
        const replyTag = eTags.find((t: any) => t[3] === "reply");
        const immediateParentId = replyTag
          ? replyTag[1]
          : eTags.length === 1
            ? eTags[0][1]
            : null;
        if (!immediateParentId) continue;
        const arr = tempMap.get(immediateParentId) || [];
        arr.push(n);
        tempMap.set(immediateParentId, arr);
      }
      // Sort each children array by created_at ascending for deterministic order
      for (const [pid, list] of tempMap.entries()) {
        tempMap.set(
          pid,
          [...list]
            .filter((n) => !!n && typeof n.created_at === "number")
            .sort((a, b) => a.created_at - b.created_at)
        );
      }
      if (tempMap.size > 0) derivedStructure = tempMap;
    }

    // SOLUTION 3: Ensure all NIP-10 parent-child relationships are captured
    // This is a safety net to catch any relationships missed by the tree reconstruction
    // Especially important after navigation when a nested reply becomes the main note
    const ensureCompleteRelationships = (
      notes: Note[]
    ): Map<string, Note[]> => {
      const structure = new Map<string, Note[]>();

      // Pass through all notes and build parent→children mapping using NIP-10 logic
      for (const note of notes) {
        if (!Array.isArray(note.tags)) continue;

        const eTags = note.tags.filter(
          (t: any) => Array.isArray(t) && t[0] === "e"
        );

        // Determine immediate parent according to NIP-10 standard
        const replyTag = eTags.find((t: any) => t[3] === "reply");
        const immediateParentId = replyTag
          ? replyTag[1]
          : eTags.length === 1
            ? eTags[0][1]
            : null;

        if (!immediateParentId) continue;

        const children = structure.get(immediateParentId) || [];

        // Avoid duplicates
        if (!children.find((c) => c.id === note.id)) {
          children.push(note);
        }

        structure.set(immediateParentId, children);
      }

      // Sort each group by creation time for deterministic ordering
      for (const children of structure.values()) {
        children.sort((a, b) => a.created_at - b.created_at);
      }

      return structure;
    };

    // Build complete structure from all available notes
    const completeStructure = ensureCompleteRelationships(allNotes);

    // Merge all sources to ensure we have all relationships
    // Priority: derivedStructure (from threadStructure) > completeStructure (from allNotes)
    if (derivedStructure && derivedStructure.size > 0) {
      for (const [parentId, children] of completeStructure) {
        if (!derivedStructure.has(parentId)) {
          // Add missing parent mappings
          derivedStructure.set(parentId, children);
        } else {
          // Merge children and deduplicate
          const existing = derivedStructure.get(parentId)!;
          const byId = new Map<string, Note>();

          existing.forEach((n) => byId.set(n.id, n));
          children.forEach((n) => byId.set(n.id, n));

          const merged = Array.from(byId.values()).sort(
            (a, b) => a.created_at - b.created_at
          );

          if (merged.length > 0) {
            derivedStructure.set(parentId, merged);
          }
        }
      }
    } else if (completeStructure.size > 0) {
      // If we don't have derivedStructure yet, use the complete one
      derivedStructure = completeStructure;
    }

    // Merge derivedStructure with cache-based structure when available
    if (derivedStructure) {
      if (!structure || structure.size === 0) {
        structure = new Map<string, Note[]>(derivedStructure);
      } else {
        for (const [pid, derivedChildren] of derivedStructure.entries()) {
          const existing = structure.get(pid) || [];
          const byId = new Map<string, Note>();
          existing.forEach((n) => byId.set(n.id, n));
          derivedChildren.forEach((n) => byId.set(n.id, n));
          const merged = Array.from(byId.values()).sort(
            (a, b) => a.created_at - b.created_at
          );
          if (merged.length > 0) structure.set(pid, merged);
        }
      }
      // Build a childrenIdMap from the merged structure to aid consumers
      if (!childrenIdMapLocal) {
        childrenIdMapLocal = {} as Record<string, string[]>;
      }
      for (const [pid, kids] of structure.entries()) {
        (childrenIdMapLocal as any)[pid] = kids.map((k) => k.id);
      }
    }

    // Ensure the focused reply is only included if it is a DIRECT reply to the current parent
    // This prevents nested replies from being duplicated as direct replies
    // We check for NIP-10 immediate parent using "reply" marker or single e-tag
    if (
      focusedReplyNote &&
      currentParentNote &&
      Array.isArray(focusedReplyNote.tags) &&
      !directReplies.some((n) => n.id === focusedReplyNote.id)
    ) {
      const eTags = focusedReplyNote.tags.filter(
        (t: any) => Array.isArray(t) && t[0] === "e"
      );

      // Determine immediate parent according to NIP-10:
      // 1. Tag with "reply" marker is the immediate parent
      // 2. If only one e-tag, that's the immediate parent
      // 3. Otherwise, it's a nested reply (don't add as direct reply)
      const replyTag = eTags.find((t: any) => t[3] === "reply");
      const immediateParentId = replyTag
        ? replyTag[1]
        : eTags.length === 1
          ? eTags[0][1]
          : null;

      // Only add if it's a direct reply to the current parent
      if (immediateParentId === currentParentNote.id) {
        directReplies = [...directReplies, focusedReplyNote];
        directReplies.sort((a, b) => a.created_at - b.created_at);
      }
    }

    // Prefer id-based rebuilt structure; fall back to provided threadStructure
    const finalStructure =
      structure && structure.size > 0 ? structure : threadStructure;

    return {
      comments: directReplies,
      resolvedThreadStructure: finalStructure,
      childrenIdMap: childrenIdMapLocal,
    };
  }, [
    threadStructure,
    currentParentNote,
    allNotes,
    focusedReplyNote,
    hexNoteId,
    noteId,
    queryClient,
  ]);

  // Manual pagination: user clicks a button to load more
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasNextPage) return;
    setIsLoadingMore(true);
    try {
      await fetchNextPage();
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasNextPage, fetchNextPage]);

  // Local display pagination: only show a subset (20 at a time)
  const THREAD_PAGE_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState<number>(() => {
    try {
      const raw = sessionStorage.getItem(`thread-pagination:${noteId}`);
      const parsed = raw ? parseInt(raw, 10) : THREAD_PAGE_SIZE;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : THREAD_PAGE_SIZE;
    } catch {
      return THREAD_PAGE_SIZE;
    }
  });
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`thread-pagination:${noteId}`);
      const parsed = raw ? parseInt(raw, 10) : THREAD_PAGE_SIZE;
      setVisibleCount(
        Number.isFinite(parsed) && parsed > 0 ? parsed : THREAD_PAGE_SIZE
      );
    } catch {
      setVisibleCount(THREAD_PAGE_SIZE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);
  useEffect(() => {
    try {
      sessionStorage.setItem(
        `thread-pagination:${noteId}`,
        String(visibleCount)
      );
    } catch {}
  }, [visibleCount, noteId]);

  const visibleComments = useMemo(() => {
    return comments.slice(0, Math.max(0, visibleCount));
  }, [comments, visibleCount]);

  // Determine the effective thread root ID for consistent state across navigation
  const effectiveThreadRootId =
    discoveredRootId || rootThreadIdFromState || hexNoteId || noteId;

  // State for nested replies functionality - now supports multiple levels
  // Use thread root ID instead of current noteId to maintain consistent state across navigation
  const [expandedNestedReplies, setExpandedNestedReplies] = useState<
    Set<string>
  >(() => {
    try {
      const raw = sessionStorage.getItem(`thread-ui:${effectiveThreadRootId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          collapsed?: string[];
          expanded?: string[];
          showFull?: boolean;
        };
        return new Set(parsed.expanded || []);
      }
    } catch {}
    // For desktop users, start with all replies expanded by default
    return new Set();
  });

  // State for collapsed notes - tracks which notes have their content minimized
  // Use thread root ID instead of current noteId to maintain consistent state across navigation
  const [collapsedNotes, setCollapsedNotes] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem(`thread-ui:${effectiveThreadRootId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          collapsed?: string[];
          expanded?: string[];
          showFull?: boolean;
        };
        return new Set(parsed.collapsed || []);
      }
    } catch {}
    return new Set();
  });

  // State for main note content expansion
  // Use thread root ID instead of current noteId to maintain consistent state across navigation
  const [showFullMainNoteContent, setShowFullMainNoteContent] = useState(() => {
    try {
      const raw = sessionStorage.getItem(`thread-ui:${effectiveThreadRootId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          collapsed?: string[];
          expanded?: string[];
          showFull?: boolean;
        };
        return !!parsed.showFull;
      }
    } catch {}
    return false;
  });

  // Detect quote repost for main note and load the quoted original content
  const mainNoteQTag = useMemo(() => {
    try {
      const tags: any[] = Array.isArray((safeParentNote as any)?.tags)
        ? ((safeParentNote as any).tags as any[]) || []
        : [];
      return tags.find((t) => Array.isArray(t) && t[0] === "q");
    } catch {
      return undefined;
    }
  }, [safeParentNote]);
  const isQuoteRepostMain = useMemo(
    () => Boolean(mainNoteQTag),
    [mainNoteQTag]
  );
  const repostTargetIdMain: string | null = useMemo(() => {
    if (!isQuoteRepostMain) return null;
    try {
      return (mainNoteQTag?.[1] as string) || null;
    } catch {
      return null;
    }
  }, [isQuoteRepostMain, mainNoteQTag]);

  const [mainRepostOriginal, setMainRepostOriginal] = useState<Note | null>(
    null
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isQuoteRepostMain || !repostTargetIdMain) {
        setMainRepostOriginal(null);
        return;
      }
      if (!nostrClient || !Array.isArray(relayUrls) || relayUrls.length === 0) {
        return;
      }
      try {
        const events: any[] = await nostrClient.querySync(relayUrls, {
          kinds: [1],
          ids: [repostTargetIdMain],
          limit: 1,
        } as any);
        if (cancelled) return;
        if (Array.isArray(events) && events.length > 0) {
          const ev: any = events[0];
          const mapped: Note = {
            id: ev.id,
            content: ev.content || "",
            pubkey: ev.pubkey,
            created_at: ev.created_at,
            kind: ev.kind,
            tags: ev.tags || [],
            imageUrls: [],
            videoUrls: [],
            receivedAt: Date.now(),
          };
          setMainRepostOriginal(mapped);
        } else {
          setMainRepostOriginal(null);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [isQuoteRepostMain, repostTargetIdMain, nostrClient, relayUrls]);

  // Reset UI state when parent note changes
  React.useEffect(() => {
    setUiStateHydrated(false);
    try {
      const raw = sessionStorage.getItem(`thread-ui:${effectiveThreadRootId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          collapsed?: string[];
          expanded?: string[];
          showFull?: boolean;
        };
        setExpandedNestedReplies(new Set(parsed.expanded || []));
        setCollapsedNotes(new Set(parsed.collapsed || []));
        setShowFullMainNoteContent(!!parsed.showFull);
        // Mark hydrated on next tick so scroll restoration can run after DOM updates
        setTimeout(() => setUiStateHydrated(true), 0);
        return;
      }
    } catch {}
    setExpandedNestedReplies(new Set());
    setCollapsedNotes(new Set());
    setShowFullMainNoteContent(false);
    setTimeout(() => setUiStateHydrated(true), 0);
  }, [effectiveThreadRootId]);

  // Smart initial expansion: On desktop, expand all replies up to maxDepth on first visit
  // This ensures nested content is always visible, including when navigating with [parent] button
  // On mobile, start collapsed for better performance
  useEffect(() => {
    // On mobile, keep everything collapsed by default
    if (isMobileLayout) return;

    // Wait for comments to be available
    if (comments.length === 0) return;

    // Check if there's cached state for this thread - if so, respect it
    try {
      const cachedState = sessionStorage.getItem(
        `thread-ui:${effectiveThreadRootId}`
      );
      if (cachedState) {
        // User has visited this thread before, cached state is already loaded
        return;
      }
    } catch {}

    // For first visit on desktop: expand all replies up to depth 3 (maxDepth - 1)
    // This ensures navigation with [parent] shows all nested content immediately
    const newSet = new Set<string>();

    const collectNoteIds = (
      noteId: string,
      currentDepth: number,
      maxDepth: number
    ) => {
      // Add this note to the set
      newSet.add(noteId);

      // Stop recursing if we've reached maxDepth
      if (currentDepth >= maxDepth) return;

      // Get children from thread structure
      const children = resolvedThreadStructure?.get(noteId) || [];

      // Recursively add children
      children.forEach((child) => {
        collectNoteIds(child.id, currentDepth + 1, maxDepth);
      });
    };

    // Expand all direct replies and their nested children up to depth 3
    comments.forEach((comment) => {
      collectNoteIds(comment.id, 1, 3);
    });

    if (newSet.size > 0) {
      setExpandedNestedReplies(new Set(newSet));
    }
  }, [comments, isMobileLayout, noteId, resolvedThreadStructure]); // Re-add resolvedThreadStructure dependency

  // Expand previously focused reply (from navigation state) when viewing its parent
  // Ensures its children are visible immediately on first render
  useEffect(() => {
    if (!focusedReplyIdFromState) return;
    if (!uiStateHydrated) return;
    if (expandedNestedReplies.has(focusedReplyIdFromState)) return;
    setExpandedNestedReplies((prev) =>
      new Set(prev).add(focusedReplyIdFromState)
    );
  }, [focusedReplyIdFromState, uiStateHydrated, expandedNestedReplies]);

  // Persist UI toggle state (collapsed/expanded and view-more) per thread
  // Use thread root ID instead of current noteId to maintain consistent state across navigation
  useEffect(() => {
    try {
      sessionStorage.setItem(
        `thread-ui:${effectiveThreadRootId}`,
        JSON.stringify({
          collapsed: Array.from(collapsedNotes),
          expanded: Array.from(expandedNestedReplies),
          showFull: showFullMainNoteContent,
        })
      );
      // Also persist a simple immutable snapshot to assist restoration timing
      sessionStorage.setItem(
        `thread-ui-hash:${effectiveThreadRootId}`,
        `${Array.from(collapsedNotes).join(",")}|${Array.from(
          expandedNestedReplies
        ).join(",")}|${showFullMainNoteContent ? 1 : 0}`
      );
    } catch {}
  }, [
    collapsedNotes,
    expandedNestedReplies,
    showFullMainNoteContent,
    effectiveThreadRootId,
  ]);

  // Note: fetchReplyCounts function removed - now using thread structure from Nostrify

  // Helper: focus thread on note
  const handleFocusThreadOnNote = useCallback(
    async (noteId: string) => {
      try {
        // Use the discovered root from the global thread tree
        // This ensures all navigation within a conversation uses the same root
        // ALWAYS pass the root to ensure the entire conversation shares one global tree
        const rootId =
          discoveredRootId || rootThreadIdFromState || hexNoteId || noteId;

        console.log(
          `[Thread Navigation] Navigating to ${noteId.slice(0, 8)} with root ${rootId.slice(0, 8)}`
        );

        // Always invalidate missing-data queries to ensure fresh data check
        // This fixes inconsistent behavior when navigating back and forth
        console.log("[Thread Navigation] Invalidating missing-data queries");
        queryClient.invalidateQueries({
          queryKey: ["thread", "missing-data"],
          exact: false,
        });

        // Determine if this navigation is to parent or root of current parent
        let forceScrollTop = false;
        try {
          const tags: any[] = Array.isArray((currentParentNote as any)?.tags)
            ? ((currentParentNote as any).tags as any[])
            : [];
          const eTags = tags.filter((t) => Array.isArray(t) && t[0] === "e");
          const replyTag = eTags.find((t: any) => t[3] === "reply");
          const rootTag = eTags.find((t: any) => t[3] === "root");
          const parentId =
            (replyTag && replyTag[1]) ||
            (eTags.length === 1 ? eTags[0][1] : null);
          const rootTagId = rootTag?.[1];
          if (noteId && (noteId === parentId || noteId === rootTagId)) {
            forceScrollTop = true;
          }
        } catch {}

        // Navigate to the new thread URL with proper browser history
        navigate({
          to: `/thread/${noteId}`,
          replace: false, // Create proper browser history entry
          state: {
            // ALWAYS pass rootThreadId to ensure all notes in conversation use same tree
            // This prevents the bug where navigating to parent creates separate tree
            // without children of the previous main note
            rootThreadId: rootId,
            // When moving thread focus from within a thread, preserve context by marking
            // the current note as the focused reply in the next view
            focusedReplyId:
              (currentParentNote && currentParentNote.id) || undefined,
            // Force scroll to top when jumping to parent/root
            forceScrollTop: forceScrollTop || undefined,
            // Store navigation path for potential breadcrumb or back navigation
            navigationPath: [
              ...(navigationState?.navigationPath || []),
              hexNoteId || noteId,
            ].filter(Boolean),
          } as any,
        });
      } catch (error) {
        console.error("Error navigating to note:", error);
      }
    },
    [
      navigate,
      currentParentNote,
      discoveredRootId,
      rootThreadIdFromState,
      hexNoteId,
      noteId,
      navigationState,
      queryClient,
    ]
  );

  // Note: fetchNestedReplies function removed - now using thread structure from Nostrify

  // Helper: toggle nested replies visibility
  const toggleNestedReplies = useCallback(
    (commentId: string) => {
      const isExpanded = expandedNestedReplies.has(commentId);

      if (isExpanded) {
        // Collapse
        setExpandedNestedReplies((prev) => {
          const newSet = new Set(prev);
          newSet.delete(commentId);
          return newSet;
        });
      } else {
        // Expand - data is already available from thread structure
        setExpandedNestedReplies((prev) => new Set(prev).add(commentId));
      }
    },
    [expandedNestedReplies]
  );

  // Helper: toggle note content collapse/expand
  const toggleNoteCollapse = useCallback((noteId: string) => {
    setCollapsedNotes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(noteId)) {
        newSet.delete(noteId);
      } else {
        newSet.add(noteId);
      }
      return newSet;
    });
  }, []);

  // Wait for DOM nodes to be present before enabling hotkey system (first-load reliability)
  useEffect(() => {
    if (isMobileLayout) return;
    // Reset readiness when navigating to a new thread id

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 40; // ~2s worst case (40 * 50ms)

    const checkReady = () => {
      if (cancelled) return;
      // Only start checking once UI state is hydrated to avoid false negatives
      if (!uiStateHydrated) {
        attempts += 1;
        if (attempts <= maxAttempts) setTimeout(checkReady, 50);
        return;
      }

      const elements = document.querySelectorAll("[data-index][data-note-id]");
      const hasVisible = Array.from(elements).some((el) => {
        const htmlEl = el as HTMLElement;
        const rect = htmlEl.getBoundingClientRect();
        return (
          rect.height > 0 &&
          rect.width > 0 &&
          (htmlEl as any).offsetParent !== null
        );
      });

      if (hasVisible) {
        // Hotkeys are ready
      } else if (attempts < maxAttempts) {
        attempts += 1;
        setTimeout(checkReady, 50);
      } else {
        // Fail-open after max attempts to avoid locking out hotkeys
      }
    };

    // Start checking soon after this render cycle
    const start = setTimeout(checkReady, 0);
    return () => {
      cancelled = true;
      clearTimeout(start);
    };
  }, [
    isMobileLayout,
    noteId,
    uiStateHydrated,
    comments.length,
    safeParentNote?.id,
  ]);

  // Hotkey navigation removed - was causing infinite loops with focus state updates

  // Helper: render nested replies with recursive support for multiple levels
  // const renderNestedReplies = useCallback(
  //   (commentId: string, depth: number = 1) => null,
  //   []
  // );

  // Note: previously had a separate render helper for comments; now inline-rendered

  // Show loading only when nothing to render yet (no parent and no replies data)
  // If we have replies or a cached parent, render skeleton content instead of full-page loader
  if (
    !currentParentNote &&
    (!Array.isArray(allNotes) || allNotes.length === 0)
  ) {
    return <ThreadLoading isMobile={isMobileLayout} noteId={noteId} />;
  }

  // Build flattened index for navigation across nested replies
  const getFocusedNote = () => {
    try {
      // Prefer element with .focused and visible
      const focusedCandidates = document.querySelectorAll(
        "[data-index][data-note-id].focused"
      );
      let focusedElement: Element | null = null;
      for (const candidate of Array.from(focusedCandidates)) {
        const htmlEl = candidate as HTMLElement;
        const rect = htmlEl.getBoundingClientRect();
        if (rect.height > 0 && rect.width > 0 && htmlEl.offsetParent !== null) {
          focusedElement = candidate;
          break;
        }
      }
      if (!focusedElement) {
        focusedElement = document.querySelector("[data-index][data-note-id]");
      }
      if (!focusedElement) return null;

      const idx = parseInt(
        focusedElement.getAttribute("data-index") || "-1",
        10
      );
      if (
        Number.isNaN(idx) ||
        idx < 0 ||
        idx >= (flattened.nodes ? flattened.nodes.length : 0)
      ) {
        return null;
      }
      return flattened.nodes[idx]?.note || null;
    } catch {
      return null;
    }
  };
  // Navigation simplified: only main note + top-level replies
  const flattened = buildFlattenedThread({
    parent: currentParentNote,
    topLevelReplies: visibleComments || comments,
    includeNested: false,
  });
  const totalItemsForHotkeys = 1 + ((visibleComments || comments)?.length || 0);

  return (
    <ThreadWithHotkeys
      totalItems={totalItemsForHotkeys}
      enabled={!isMobileLayout}
      isLoadingComments={isLoadingComments}
      onLink={() => {
        const note = getFocusedNote();
        if (!note?.id) return;
        try {
          const encoded = nip19.noteEncode(note.id);
          const shareUrl = `${window.location.origin}/thread/${encoded}`;
          if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(shareUrl).catch(() => {});
          } else {
            window.open(shareUrl, "_blank", "noopener,noreferrer");
          }
        } catch {
          // Fallback: navigate to thread route
          navigate({ to: `/thread/${note.id}` });
        }
      }}
      onReply={() => {
        const note = getFocusedNote();
        if (!note?.id) return;
        const currentParams = new URLSearchParams(location.search);
        currentParams.set("reply", note.id);
        navigate({
          to: location.pathname,
          search: Object.fromEntries(currentParams),
          replace: true,
        });
      }}
      onLike={() => {
        // Try to click a like button within the focused element
        const focused = document.querySelector(
          "[data-index][data-note-id].focused"
        ) as HTMLElement | null;
        if (!focused) return;
        const likeButton =
          focused.querySelector(
            '[data-action="like"], [data-like-button], button[aria-label*="Like" i], button[title*="Like" i]'
          ) || null;
        if (likeButton) (likeButton as HTMLElement).click();
      }}
      onBookmark={() => {
        // Try to click a bookmark button within the focused element
        const focused = document.querySelector(
          "[data-index][data-note-id].focused"
        ) as HTMLElement | null;
        if (!focused) return;
        const bookmarkButton =
          focused.querySelector(
            '[data-action="bookmark"], [data-bookmark-button], button[aria-label*="Bookmark" i], button[title*="Bookmark" i]'
          ) || null;
        if (bookmarkButton) (bookmarkButton as HTMLElement).click();
      }}
      onCollapse={() => {
        const note = getFocusedNote();
        if (!note?.id) return;
        toggleNoteCollapse(note.id);
      }}
      onFocusThread={() => {
        const note = getFocusedNote();
        if (!note?.id) return;
        handleFocusThreadOnNote(note.id);
      }}
      onScrollToParent={() => {
        const focused = getFocusedNote();
        if (!focused) return;

        // If focused is the main note and it has a parent, navigate to parent
        if (currentParentNote && focused.id === currentParentNote.id) {
          try {
            const eTags = (currentParentNote.tags || []).filter(
              (t: any) => Array.isArray(t) && t[0] === "e"
            );
            const replyTag = eTags.find((t: any) => t[3] === "reply");
            const rootTag = eTags.find((t: any) => t[3] === "root");
            const parentId =
              (replyTag && replyTag[1]) ||
              (eTags.length === 1 ? eTags[0][1] : null) ||
              (rootTag?.[1] && rootTag[1] !== currentParentNote.id
                ? rootTag[1]
                : null);

            if (parentId) {
              handleFocusThreadOnNote(parentId);
              return;
            }
          } catch {}
        }

        // Otherwise, scroll current parent into view
        if (currentParentNote) {
          document
            .getElementById(`note-${currentParentNote.id}`)
            ?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
        }
      }}
      onBackToFeed={() => {
        try {
          const s: any = { ...(window.history.state || {}) };
          s.fromThread = true;
          // Hint to feed restoration that scroll restore has happened
          s.scrollRestored = true;
          window.history.replaceState(s, "");
        } catch {}
        navigate({ to: "/" });
      }}
      onHelpToggle={() => {
        // The ThreadWithHotkeys component will handle showing the modal
      }}
      onEscape={() => {
        // The ThreadWithHotkeys component will handle closing the modal
      }}
    >
      <div
        className="nostr-feed"
        style={{
          width: "100%",
          height: "100%",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--app-bg-color)",
          overflow: "hidden",
        }}
      >
        {/* Header - Fixed at top, outside scrollable area */}
        <div
          style={{
            width: "100%",
            maxWidth: isMobileLayout ? "100%" : "1000px",
            margin: isMobileLayout ? "0" : "0 auto",
            backgroundColor: "var(--app-bg-color)",
            flex: "0 0 auto",
          }}
        >
          <div
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: "1000px",
              }}
            >
              <ThreadHeader isMobile={isMobileLayout} noteId={noteId} />
            </div>
          </div>
        </div>

        {/* Scrollable content area */}
        <div
          style={{
            width: "100%",
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            ref={containerRef}
            style={{
              padding: isMobileLayout ? "0 0.5rem" : "0 1rem",
              paddingBottom: isMobileLayout
                ? "calc(15dvh + var(--safe-area-inset-bottom))"
                : "2rem",
              width: "100%",
              margin: "0 auto",
            }}
          >
            <div
              style={{
                width: "100%",
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                boxSizing: "border-box",
                backgroundColor: "var(--app-bg-color)",
              }}
            >
              <div
                style={{
                  width: "100%",
                  position: "relative",
                  height: isMobileLayout ? "auto" : "100%",
                  touchAction: isMobileLayout ? "pan-y pinch-zoom" : "auto",
                  cursor: isMobileLayout ? "auto" : "auto",
                  willChange: "transform",
                  overflow: "visible",
                }}
              >
                <div
                  style={{
                    display: isMobileLayout ? "block" : "grid",
                    gridTemplateColumns: isMobileLayout ? "1fr" : "240px 1fr",
                    alignItems: "start",
                    gap: isMobileLayout ? 0 : "0",
                    width: "100%",
                    maxWidth: isMobileLayout ? "100%" : "1000px",
                    margin: isMobileLayout ? "0" : "0 auto",
                  }}
                >
                  {!isMobileLayout && (
                    <div
                      style={{
                        position: "sticky",
                        top: 0,
                        alignSelf: "start",
                        maxHeight: "100vh",
                        overflowY: "auto",
                        overflowX: "hidden",
                      }}
                    >
                      <ThreadSummary
                        parentNote={safeParentNote}
                        directReplies={comments}
                        threadStructure={
                          // Prefer threadStructure from hook if resolvedThreadStructure is empty
                          (resolvedThreadStructure &&
                          resolvedThreadStructure.size > 0
                            ? resolvedThreadStructure
                            : threadStructure) as any
                        }
                        getDisplayNameForPubkey={getDisplayNameForPubkey}
                        isMobileLayout={isMobileLayout}
                        relayUrls={relayUrls}
                        expandedNestedReplies={expandedNestedReplies}
                        navigate={navigate}
                        isLoading={isLoadingComments}
                      />
                    </div>
                  )}

                  <div style={{ width: "100%", minWidth: 0 }}>
                    {/* Error message when parent note is not found */}
                    {parentNoteNotFound && (
                      <div
                        style={{
                          width: "100%",
                          padding: isMobileLayout ? "1rem" : "2rem",
                          textAlign: "center",
                          color: "var(--app-text-secondary)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "1.25rem",
                            marginBottom: "0.5rem",
                            color: "var(--text-color)",
                          }}
                        >
                          Note not found
                        </div>
                        <div style={{ fontSize: "0.875rem" }}>
                          This note may have been deleted or is not available on
                          your connected relays.
                        </div>
                      </div>
                    )}

                    {/* Main Note (or placeholder when replies exist but parent not fetched yet) */}
                    {!parentNoteNotFound &&
                      (safeParentNote || comments.length > 0) && (
                        <MainNote
                          currentParentNote={safeParentNote}
                          hexNoteId={hexNoteId}
                          noteId={noteId}
                          isMobileLayout={isMobileLayout}
                          relayUrls={relayUrls}
                          getDisplayNameForPubkey={getDisplayNameForPubkey}
                          navigate={navigate}
                          handleHashtagClick={handleHashtagClick}
                          handleFocusThreadOnNote={handleFocusThreadOnNote}
                          collapsedNotes={collapsedNotes}
                          toggleNoteCollapse={toggleNoteCollapse}
                          showFullMainNoteContent={showFullMainNoteContent}
                          isQuoteRepostMain={isQuoteRepostMain}
                          mainRepostOriginal={mainRepostOriginal}
                          useAscii={useAscii}
                          useColor={useColor}
                          imageMode={imageMode}
                          asciiCache={asciiCache}
                          setFullScreenImage={() => {}}
                          onAsciiRendered={handleAsciiRendered}
                          onMediaLoadError={handleMediaLoadError}
                          onImageDimensionsLoaded={handleImageDimensionsLoaded}
                        />
                      )}

                    {/* Reply button for main parent note */}
                    {safeParentNote &&
                      !collapsedNotes.has(safeParentNote.id) && (
                        <div
                          style={{
                            width: "100%",
                            padding: isMobileLayout ? "0.25rem" : "1rem",
                            // paddingTop: "0.25rem",
                            textAlign: "left",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              gap: "0.5rem",
                              alignItems: "center",
                            }}
                          >
                            <button
                              onClick={() => {
                                const currentParams = new URLSearchParams(
                                  location.search
                                );
                                currentParams.set("reply", safeParentNote.id);
                                navigate({
                                  to: location.pathname,
                                  search: Object.fromEntries(currentParams),
                                  replace: true,
                                });
                              }}
                              style={{
                                backgroundColor: "transparent",
                                color: "var(--accent-color)",
                                border: "none",
                                padding: 0,
                                cursor: "pointer",
                                minHeight: "20px",
                                height: "20px",
                                fontSize: "0.875rem",
                                textDecoration: "none",
                              }}
                            >
                              reply
                            </button>

                            {/* View More/View Less buttons for long content */}
                            {(safeParentNote?.content?.length || 0) > 280 && (
                              <>
                                <span
                                  style={{
                                    color: "var(--text-color)",
                                    opacity: 0.3,
                                  }}
                                >
                                  |
                                </span>
                                <button
                                  onClick={() =>
                                    setShowFullMainNoteContent(
                                      !showFullMainNoteContent
                                    )
                                  }
                                  style={{
                                    backgroundColor: "transparent",
                                    color: "var(--text-color)",
                                    border: "none",
                                    padding: 0,
                                    minHeight: isMobileLayout ? "20px" : "auto",
                                    height: isMobileLayout ? "20px" : "auto",
                                    cursor: "pointer",
                                    fontSize: "0.875rem",
                                    textDecoration: "none",
                                  }}
                                >
                                  {showFullMainNoteContent
                                    ? "View Less"
                                    : "View More"}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                    {/* Comments Section */}
                    {!collapsedNotes.has(safeParentNote?.id || "") && (
                      <div
                        style={{
                          width: "100%",
                          padding: isMobileLayout ? "0" : "1rem",
                        }}
                      >
                        <CommentsList
                          isLoadingComments={isLoadingComments}
                          comments={comments}
                          visibleComments={visibleComments}
                          isMobileLayout={isMobileLayout}
                          relayUrls={relayUrls}
                          getDisplayNameForPubkey={
                            getDisplayNameForPubkey as any
                          }
                          navigate={navigate as any}
                          location={location as any}
                          currentParentNote={safeParentNote}
                          collapsedNotes={collapsedNotes}
                          toggleNoteCollapse={toggleNoteCollapse}
                          handleFocusThreadOnNote={handleFocusThreadOnNote}
                          useAscii={useAscii}
                          useColor={useColor}
                          imageMode={imageMode}
                          handleHashtagClick={handleHashtagClick}
                          expandedNestedReplies={expandedNestedReplies}
                          toggleNestedReplies={toggleNestedReplies}
                          threadStructure={
                            // Prefer threadStructure from hook if resolvedThreadStructure is empty
                            (resolvedThreadStructure &&
                            resolvedThreadStructure.size > 0
                              ? resolvedThreadStructure
                              : threadStructure) as any
                          }
                          childrenIdMap={childrenIdMap}
                          hasNextPage={hasNextPage}
                          THREAD_PAGE_SIZE={THREAD_PAGE_SIZE}
                          isLoadingMore={isLoadingMore}
                          handleLoadMore={handleLoadMore}
                          setVisibleCount={setVisibleCount}
                          allNotes={allNotes}
                          asciiCache={asciiCache}
                          setFullScreenImage={() => {}}
                          onAsciiRendered={handleAsciiRendered}
                          onMediaLoadError={handleMediaLoadError}
                          onImageDimensionsLoaded={handleImageDimensionsLoaded}
                        />
                      </div>
                    )}

                    {/* Loading indicator for infinite scroll */}
                    {isLoadingMore && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          marginTop: "1rem",
                          marginBottom: "1rem",
                        }}
                      >
                        <div
                          style={{
                            color: "var(--text-color-secondary)",
                            fontSize: "0.875rem",
                            opacity: 0.8,
                          }}
                        >
                          Loading more replies...
                        </div>
                      </div>
                    )}

                    {/* Mobile bottom padding */}
                    {isMobileLayout && (
                      <div
                        style={{
                          height: "10rem",
                          width: "100%",
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ThreadWithHotkeys>
  );
};

export default ThreadPage;

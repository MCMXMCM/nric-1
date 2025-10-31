import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useCallback, useMemo, useEffect } from 'react';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import type { Note } from '../types/nostr/types';
import { extractImageUrls, extractVideoUrls } from '../utils/nostr/utils';
import { CACHE_KEYS } from '../utils/cacheKeys';
import { nip19 } from 'nostr-tools';
import { DEFAULT_RELAY_URLS, PROFILE_RELAY_URLS } from '../utils/nostr/constants';
import { getOutboxRouter } from '../utils/nostr/outboxRouter';
import { useUIStore } from '../components/lib/useUIStore';

interface UseNostrifyThreadConfig {
  parentEventId: string;
  relayUrls: string[];
  enabled?: boolean;
  pageSize?: number;
  maxDepth?: number;
  mutedPubkeys?: string[];
}

interface UseNostrifyThreadResult {
  data: Note[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  hasNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  isFetchingNextPage: boolean;
  threadStructure: Map<string, Note[]>;
}

/**
 * Hook for fetching thread data using Nostrify
 */
export function useNostrifyThread(config: UseNostrifyThreadConfig): UseNostrifyThreadResult {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  // No outbox usage in this hook; avoid unused variable
  const {
    parentEventId,
    relayUrls: _relayUrls,
    enabled = true,
    pageSize = 20,
    maxDepth = 3,
    mutedPubkeys = []
  } = config;

  // Convert events to notes
  const processEvents = useCallback((events: NostrEvent[]): Note[] => {
    return events
      .filter(event => {
        // Mute filter only; allow empty-content events (e.g., quote reposts)
        if (mutedPubkeys.includes(event.pubkey)) return false;
        return true;
      })
      .map(event => {
        const imageUrls = extractImageUrls(event.content);
        const videoUrls = extractVideoUrls(event.content);
        
        return {
          id: event.id,
          pubkey: event.pubkey,
          content: event.content,
          created_at: event.created_at,
          kind: event.kind || 1,
          tags: event.tags || [],
          imageUrls,
          videoUrls,
          receivedAt: Date.now()
        };
      })
      .sort((a, b) => a.created_at - b.created_at); // Sort chronologically for threads
  }, [mutedPubkeys]);

  // Build thread structure
  const buildThreadStructure = useCallback((notes: Note[]): Map<string, Note[]> => {
    const structure = new Map<string, Note[]>();

    // Group notes by their parent event ID (do NOT require parent to exist in the set)
    notes.forEach(note => {
      const eTags = note.tags.filter(tag => tag[0] === 'e');
      if (eTags.length > 0) {
        let parentId: string | null = null;
        
        // Strategy 1: Look for 'reply' marker (NIP-10 standard)
        const replyTag = eTags.find(tag => tag.length > 3 && tag[3] === 'reply');
        if (replyTag) parentId = replyTag[1];
        
        // Strategy 2: If no reply tag, use NIP-10 positional logic
        if (!parentId) {
          if (eTags.length === 1) {
            // Single e tag - this is a direct reply to that note
            parentId = eTags[0][1];
          } else if (eTags.length >= 2) {
            // Multiple e tags - second one is usually the immediate parent
            // (first is often the root, second is the immediate parent)
            parentId = eTags[1][1];
          }
        }
        
        // Strategy 3: Fallback to first e tag if others don't work
        if (!parentId) {
          parentId = eTags[0][1];
        }
        
        // Add reply grouping even if parent isn't present in our fetched set
        if (parentId) {
          if (!structure.has(parentId)) {
            structure.set(parentId, []);
          }
          structure.get(parentId)!.push(note);
        }
      }
    });
    
    // Sort replies by creation time for each parent
    structure.forEach((replies) => {
      replies.sort((a, b) => a.created_at - b.created_at);
    });
    
    return structure;
  }, []);

  // Infinite query for paginated thread data
  const infiniteQuery = useInfiniteQuery({
    // Normalize key: avoid volatile relay arrays and muted lists
    queryKey: ['nostrify-thread', parentEventId, maxDepth],
    enabled: enabled && !!parentEventId,
    queryFn: async ({ pageParam }) => {
      if (!nostr) throw new Error('Nostrify not available');
      // Helper: fetch all replies for a frontier with pagination (shared by main and fallback paths)
      const fetchLevelReplies = async (frontierIds: string[]): Promise<Note[]> => {
        const collected: Note[] = [];
        const seen = new Set<string>();
        let until: number | undefined = undefined;
        const PAGE_LIMIT = 200;
        // Paginate backwards in time until exhausted
        while (true) {
          const filter: NostrFilter = { kinds: [1], '#e': frontierIds, limit: PAGE_LIMIT };
          if (until) filter.until = until;
          const events = await nostr.query([filter]);
          if (!events || events.length === 0) break;
          const notes = processEvents(events as NostrEvent[]);
          let added = 0;
          for (const n of notes) {
            if (seen.has(n.id)) continue;
            seen.add(n.id);
            collected.push(n);
            added++;
          }
          // Advance the window
          const minCreated = Math.min(...(events as NostrEvent[]).map(e => e.created_at || 0));
          const nextUntil = (minCreated || 0) - 1;
          if (events.length < PAGE_LIMIT) break;
          // If until would not progress, stop
          if (until !== undefined && nextUntil >= until) break;
          until = nextUntil;
          // If no new notes were added despite full page, still move window; if window stops progressing, loop will break
        }
        // Ensure chronological order
        collected.sort((a, b) => (a.created_at - b.created_at) || a.id.localeCompare(b.id));
        return collected;
      };
      
      if (!pageParam) {
        // First page: Fetch the complete thread tree
        try {
          // Strategy: Get all notes that are part of this thread
          // We'll use a broader search to capture the full thread tree
          
          // Step 1: Get the parent note first
          const parentEvent = await nostr.query([{
            kinds: [1],
            ids: [parentEventId],
            limit: 1
          }]);
          
          const parentNotes = processEvents(parentEvent);
          let allNotes = [...parentNotes];
          
          // Step 2: Get all notes that have the parent note ID in their e-tags
          // This captures direct replies and potentially some nested replies
          const directFilter: NostrFilter = {
            kinds: [1],
            '#e': [parentEventId],
            limit: 200 // Get more notes to capture the full thread
          };
          
          const directEvents = await nostr.query([directFilter]);
          const directNotes = processEvents(directEvents);
          
          // Merge notes, avoiding duplicates
          const existingIds = new Set(allNotes.map(note => note.id));
          let newDirectNotes = directNotes.filter(note => !existingIds.has(note.id));
          // If no direct notes returned, paginate starting from the parent to collect direct replies
          if (newDirectNotes.length === 0) {
            const fetchedDirect = await fetchLevelReplies([parentEventId]);
            if (fetchedDirect.length > 0) {
              // Merge and dedupe
              const seen = new Set(allNotes.map(n => n.id));
              for (const n of fetchedDirect) {
                if (!seen.has(n.id)) {
                  allNotes.push(n);
                  seen.add(n.id);
                }
              }
              newDirectNotes = fetchedDirect;
            }
          } else {
            allNotes = [...allNotes, ...newDirectNotes];
          }
          
          // Step 3: Recursively fetch nested replies up to maxDepth using paginated BFS
          let currentDepth = 1;
          // Start from direct replies only to avoid duplicating parent-level results
          let frontierIds = newDirectNotes.map(n => n.id);
          while (currentDepth < maxDepth && frontierIds.length > 0) {
            const levelReplies = await fetchLevelReplies(frontierIds);
            const existingIdsSet = new Set(allNotes.map(note => note.id));
            const newNestedNotes = levelReplies.filter(note => !existingIdsSet.has(note.id));
            if (newNestedNotes.length === 0) break;
            allNotes = [...allNotes, ...newNestedNotes];
            frontierIds = newNestedNotes.map(note => note.id);
            currentDepth++;
          }
          
          return {
            notes: allNotes,
            nextCursor: allNotes.length > 0 ? allNotes[allNotes.length - 1].created_at - 1 : undefined
          };
          
        } catch (error) {
          console.warn('Failed to fetch complete thread tree:', error);
          
          // Fallback to simple direct replies
          const fallbackFilter: NostrFilter = {
            kinds: [1],
            '#e': [parentEventId],
            limit: pageSize
          };
          
          const fallbackEvents = await nostr.query([fallbackFilter]);
          let fallbackNotes = processEvents(fallbackEvents);
          
          // Ensure we have the parent note
          const hasParentNote = fallbackNotes.some(note => note.id === parentEventId);
          if (!hasParentNote) {
            try {
              const parentEvent = await nostr.query([{
                kinds: [1],
                ids: [parentEventId],
                limit: 1
              }]);
              if (parentEvent.length > 0) {
                const parentNotes = processEvents(parentEvent);
                fallbackNotes = [...parentNotes, ...fallbackNotes];
              }
            } catch (error) {
              console.warn('Failed to fetch parent note:', error);
            }
          }
          
          // Try to expand nested replies up to maxDepth using paginated BFS even in fallback mode
          try {

            // Ensure we have direct replies: if none, start frontier from parent id
            if (fallbackNotes.length === 0) {
              const fetchedDirect = await fetchLevelReplies([parentEventId]);
              if (fetchedDirect.length > 0) {
                fallbackNotes = [...fetchedDirect];
              }
            }

            let currentDepth = 1;
            let frontierIds = fallbackNotes.filter(n => n.id !== parentEventId).map(n => n.id);
            while (currentDepth < maxDepth && frontierIds.length > 0) {
              const levelReplies = await fetchLevelReplies(frontierIds);
              const existingIdsSet = new Set(fallbackNotes.map(n => n.id));
              const newNested = levelReplies.filter(n => !existingIdsSet.has(n.id));
              if (newNested.length === 0) break;
              fallbackNotes = [...fallbackNotes, ...newNested];
              frontierIds = newNested.map(n => n.id);
              currentDepth++;
            }
          } catch (nestedErr) {
            console.warn('Fallback nested fetch failed:', nestedErr);
          }
          
          return {
            notes: fallbackNotes,
            nextCursor: fallbackEvents.length > 0 ? fallbackEvents[fallbackEvents.length - 1].created_at - 1 : undefined
          };
        }
      } else {
        // Subsequent pages: Use simpler pagination
        const filter: NostrFilter = {
          kinds: [1],
          '#e': [parentEventId],
          limit: pageSize,
          until: pageParam
        };
        
        const events = await nostr.query([filter]);
        const notes = processEvents(events);
        
        return {
          notes,
          nextCursor: events.length > 0 ? events[events.length - 1].created_at - 1 : undefined
        };
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as number | undefined,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Flatten all pages into a single array
  const allNotes = useMemo(() => {
    const pages = infiniteQuery.data?.pages || [];
    const byId = new Map<string, Note>();
    for (const page of pages) {
      for (const note of page.notes) {
        if (!byId.has(note.id)) {
          byId.set(note.id, note);
        }
      }
    }
    const unique = Array.from(byId.values());
    unique.sort((a, b) => (a.created_at - b.created_at) || a.id.localeCompare(b.id));
    return unique;
  }, [infiniteQuery.data]);

  // Write-through to global per-note cache so other views can reuse notes
  useEffect(() => {
    if (!allNotes || allNotes.length === 0) return;
    for (const note of allNotes) {
      queryClient.setQueryData(CACHE_KEYS.NOTE(note.id), note);
    }
  }, [allNotes, queryClient]);

  // Build thread structure
  const threadStructure = useMemo(() => {
    return buildThreadStructure(allNotes);
  }, [allNotes, buildThreadStructure]);

  // Populate id-based caches for LEVEL1 and NESTED while preserving note-based fields
  useEffect(() => {
    if (!parentEventId) return;
    // LEVEL1: direct replies to the parent (merge with previous to preserve optimistic items)
    const level1Notes: Note[] = threadStructure.get(parentEventId) || [];
    const level1Ids = level1Notes.map(n => n.id);
    try {
      queryClient.setQueryData(CACHE_KEYS.THREAD.LEVEL1(parentEventId), (prev: any) => {
        const prevIds: string[] = Array.isArray(prev?.directChildrenIds) ? prev.directChildrenIds as string[] : [];
        const prevNotes: Note[] = Array.isArray(prev?.directChildren) ? prev.directChildren as Note[] : [];
        // Merge ids and notes (prefer unique by id)
        const mergedIdsSet = new Set<string>([...prevIds, ...level1Ids]);
        const mergedIds = Array.from(mergedIdsSet);
        // Build a map for faster unique merge of notes
        const byId = new Map<string, Note>();
        for (const n of prevNotes) byId.set(n.id, n);
        for (const n of level1Notes) byId.set(n.id, n);
        const mergedNotes = mergedIds
          .map(id => byId.get(id))
          .filter((n): n is Note => Boolean(n))
          .sort((a, b) => a.created_at - b.created_at);
        return {
          ...(prev && typeof prev === 'object' ? prev : {}),
          directChildren: mergedNotes,
          directChildrenIds: mergedIds,
        };
      });
    } catch {}

    // NESTED: children-by-parent mapping, include ids alongside notes (merge with previous)
    const nextChildrenByParentId: Record<string, Note[]> = {};
    const nextChildrenIdMap: Record<string, string[]> = {};
    try {
      for (const [parentId, children] of threadStructure.entries()) {
        if (!children || children.length === 0) continue;
        nextChildrenByParentId[parentId] = children;
        nextChildrenIdMap[parentId] = children.map(c => c.id);
      }
      // Use deterministic frontier key: sort by created_at then id if available, otherwise lexicographic
      const frontierKey = (() => {
        if (level1Notes.length > 0) {
          const ordered = [...level1Notes]
            .sort((a, b) => (a.created_at - b.created_at) || a.id.localeCompare(b.id))
            .map(n => n.id);
          return Array.from(new Set(ordered)).join(',');
        }
        return [...level1Ids].sort().join(',');
      })();
      queryClient.setQueryData(
        CACHE_KEYS.THREAD.NESTED(parentEventId, maxDepth, frontierKey),
        (prev: any) => {
          const prevIdMap: Record<string, string[]> = prev && typeof prev === 'object' && prev.childrenIdMap ? prev.childrenIdMap as Record<string, string[]> : {};
          const prevNotesMap: Record<string, Note[]> = prev && typeof prev === 'object' && prev.childrenByParentId ? prev.childrenByParentId as Record<string, Note[]> : {};
          const mergedIdMap: Record<string, string[]> = { ...prevIdMap };
          const mergedNotesMap: Record<string, Note[]> = { ...prevNotesMap };
          // Merge current structure into previous maps
          for (const parentId of Object.keys(nextChildrenIdMap)) {
            const prevIds = Array.isArray(prevIdMap[parentId]) ? prevIdMap[parentId] : [];
            const nextIds = nextChildrenIdMap[parentId] || [];
            const idsSet = new Set<string>([...prevIds, ...nextIds]);
            mergedIdMap[parentId] = Array.from(idsSet);

            const prevChildren = Array.isArray(prevNotesMap[parentId]) ? prevNotesMap[parentId] : [];
            const nextChildren = nextChildrenByParentId[parentId] || [];
            const byId = new Map<string, Note>();
            for (const n of prevChildren) byId.set(n.id, n);
            for (const n of nextChildren) byId.set(n.id, n);
            mergedNotesMap[parentId] = Array.from(byId.values()).sort((a, b) => a.created_at - b.created_at);
          }

          return {
            ...(prev && typeof prev === 'object' ? prev : {}),
            childrenByParentId: mergedNotesMap,
            childrenIdMap: mergedIdMap,
          };
        }
      );
    } catch {}
  }, [threadStructure, parentEventId, maxDepth, queryClient]);

  return {
    data: allNotes,
    isLoading: infiniteQuery.isLoading,
    error: infiniteQuery.error,
    refetch: infiniteQuery.refetch,
    hasNextPage: infiniteQuery.hasNextPage,
    fetchNextPage: infiniteQuery.fetchNextPage,
    isFetchingNextPage: infiniteQuery.isFetchingNextPage,
    threadStructure
  };
}

/**
 * Hook for fetching a single note by ID
 */
export function useNostrifyNote(config: {
  noteId: string;
  relayUrls: string[];
  enabled?: boolean;
}) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const outboxModeEnabled = useUIStore((s) => s.outboxMode);
  const { noteId, relayUrls: _relayUrls, enabled = true } = config;

  const query = useQuery({
    // Normalize key: avoid volatile relay arrays
    queryKey: ['nostrify-note', noteId],
    enabled: enabled && !!noteId,
    queryFn: async () => {
      if (!nostr) throw new Error('Nostrify not available');
      // Retry a few times to rotate relay selection in the router
      let events = [] as NostrEvent[];
      for (let attempt = 0; attempt < 3; attempt++) {
        // Small stagger to allow router rotation
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, attempt === 1 ? 75 : 150));
        }
        const res = await nostr.query([{
          ids: [noteId],
          limit: 1
        }]);
        if (res.length > 0) {
          events = res as NostrEvent[];
          break;
        }
      }
      if (events.length === 0) {
        // Targeted fallback: try hints from nevent and a one-shot outbox discovery for the author
        try {
          const g: any = globalThis as any;
          // 1) If noteId is a bech32 nevent, push relay hints
          try {
            if (noteId && noteId.length > 0 && !/^[a-fA-F0-9]{64}$/.test(noteId)) {
              const decoded = nip19.decode(noteId);
              if (decoded.type === 'nevent') {
                const data: any = decoded.data as any;
                const tags: any[] = Array.isArray(data?.tags) ? data.tags : [];
                const hintedRelays: string[] = [];
                for (const t of tags) {
                  if (Array.isArray(t) && t[0] === 'relay' && t[1]) hintedRelays.push(String(t[1]));
                }
                if (hintedRelays.length > 0) {
                  if (!Array.isArray(g.__nostrifyRelayHintQueue)) g.__nostrifyRelayHintQueue = [];
                  g.__nostrifyRelayHintQueue.push(hintedRelays);
                }
                // 2) If author is present, run a focused outbox discovery for the author
                const author: string | undefined = typeof data?.author === 'string' ? data.author : undefined;
                if (author) {
                  const discoveryRelays = Array.from(new Set([...DEFAULT_RELAY_URLS, ...PROFILE_RELAY_URLS]));
                  try {
                    if (outboxModeEnabled) {
                      const router = getOutboxRouter();
                      await router.discoverOutboxEvents([author], discoveryRelays);
                    }
                  } catch {}
                }
              }
            }
          } catch {}

          // 3) Final retry after hints/discovery
          const retry = await nostr.query([{ ids: [noteId], limit: 1 }]);
          if (retry.length > 0) {
            events = retry as NostrEvent[];
          } else {
            return null;
          }
        } catch {
          return null;
        }
      }
      
      const event = events[0];
      const imageUrls = extractImageUrls(event.content);
      const videoUrls = extractVideoUrls(event.content);
      const note: Note = {
        id: event.id,
        pubkey: event.pubkey,
        content: event.content,
        created_at: event.created_at,
        kind: event.kind || 1,
        tags: event.tags || [],
        imageUrls,
        videoUrls,
        receivedAt: Date.now()
      };
      // Write-through to global per-note cache
      queryClient.setQueryData(CACHE_KEYS.NOTE(note.id), note);
      return note;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    // Serve immediately from global per-note cache when available
    initialData: () => queryClient.getQueryData<Note>(CACHE_KEYS.NOTE(noteId)) || undefined,
  });

  return {
    note: query.data || null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  };
}

/**
 * Hook for fetching notes by author
 */
export function useNostrifyAuthorNotes(config: {
  authorPubkey: string;
  relayUrls: string[];
  enabled?: boolean;
  pageSize?: number;
  since?: number;
  until?: number;
}) {
  const { nostr } = useNostr();
  const {
    authorPubkey,
    relayUrls,
    enabled = true,
    pageSize = 20,
    since,
    until
  } = config;

  const query = useQuery({
    queryKey: ['nostrify-author-notes', authorPubkey, relayUrls, since, until],
    enabled: enabled && !!authorPubkey,
    queryFn: async () => {
      if (!nostr) throw new Error('Nostrify not available');
      
      const filter: NostrFilter = {
        kinds: [1],
        authors: [authorPubkey],
        limit: pageSize
      };

      if (since) filter.since = since;
      if (until) filter.until = until;
      
      const events = await nostr.query([filter]);
      
      return events
        .filter(event => event.content && event.content.trim().length > 0)
        .map(event => {
          const imageUrls = extractImageUrls(event.content);
          const videoUrls = extractVideoUrls(event.content);
          
          return {
            id: event.id,
            pubkey: event.pubkey,
            content: event.content,
            created_at: event.created_at,
            kind: event.kind || 1,
            tags: event.tags || [],
            imageUrls,
            videoUrls,
            receivedAt: Date.now()
          };
        })
        .sort((a, b) => b.created_at - a.created_at);
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  });

  return {
    notes: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  };
}

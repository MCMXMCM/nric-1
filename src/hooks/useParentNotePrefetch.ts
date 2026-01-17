import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGlobalRelayPool } from '../utils/nostr/relayConnectionPool';
import { CACHE_KEYS } from '../utils/cacheKeys';
import type { Note } from '../types/nostr/types';
import type { Event, Filter } from 'nostr-tools';

interface UseParentNotePrefetchOptions {
  notes: Note[];
  relayUrls: string[];
  enabled?: boolean;
  prefetchWindow?: number;
  currentIndex?: number;
}

interface UseParentNotePrefetchResult {
  prefetchParentNotes: (note: Note) => Promise<void>;
  isParentNoteCached: (noteId: string) => boolean;
  activePrefetches: number;
}

/**
 * Hook to prefetch parent and root notes from note tags for faster thread navigation
 */
export function useParentNotePrefetch({
  notes,
  relayUrls,
  enabled = true,
  prefetchWindow = 5,
  currentIndex = 0
}: UseParentNotePrefetchOptions): UseParentNotePrefetchResult {
  const queryClient = useQueryClient();
  const activePrefetchesRef = useRef<Set<string>>(new Set());
  const poolRef = useRef<ReturnType<typeof getGlobalRelayPool> | null>(null);

  // Initialize pool
  useEffect(() => {
    if (!poolRef.current) {
      poolRef.current = getGlobalRelayPool();
    }
  }, []);

  // Helper to check if a note is already cached
  const isParentNoteCached = useCallback((noteId: string) => {
    const queryKey = CACHE_KEYS.NOTE(noteId);
    const queryData = queryClient.getQueryData(queryKey);
    return !!queryData;
  }, [queryClient]);

  // Extract parent and root note IDs from note tags
  const extractParentAndRootIds = useCallback((note: Note): { parentId?: string; rootId?: string } => {
    const eTags = (note.tags || []).filter(tag => Array.isArray(tag) && tag[0] === 'e');
    
    let parentId: string | undefined;
    let rootId: string | undefined;

    // Find reply and root tags
    const replyTag = eTags.find(tag => tag[3] === 'reply');
    const rootTag = eTags.find(tag => tag[3] === 'root');

    if (replyTag && replyTag[1]) {
      parentId = replyTag[1];
    }

    if (rootTag && rootTag[1]) {
      rootId = rootTag[1];
    }

    // Fallback to positional e-tags for backward compatibility
    if (!parentId && !rootId && eTags.length > 0) {
      // First e-tag is typically the root, second is the parent
      if (eTags.length === 1) {
        rootId = eTags[0][1];
      } else if (eTags.length >= 2) {
        rootId = eTags[0][1];
        parentId = eTags[1][1];
      }
    }

    return { parentId, rootId };
  }, []);

  // Prefetch a single note by ID
  const prefetchNoteById = useCallback(async (noteId: string): Promise<void> => {
    if (!enabled || !poolRef.current || !relayUrls.length || activePrefetchesRef.current.has(noteId)) {
      return;
    }

    // Check if already cached
    if (isParentNoteCached(noteId)) {
      return;
    }

    activePrefetchesRef.current.add(noteId);

    try {
      const filter: Filter = {
        kinds: [1],
        ids: [noteId],
        limit: 1
      };

      const events: Event[] = await poolRef.current.querySync(relayUrls, filter);
      
      if (events.length > 0) {
        const event = events[0];
        const note: Note = {
          id: event.id,
          pubkey: event.pubkey,
          content: event.content,
          created_at: event.created_at,
          kind: (event as any).kind,
          tags: event.tags || [],
          imageUrls: [],
          videoUrls: [],
          receivedAt: Date.now()
        };

        // Cache the note
        queryClient.setQueryData(CACHE_KEYS.NOTE(noteId), note);
        
        // Also prefetch parent note author metadata
        if (note.pubkey) {
          const metadataQueryKey = ['metadata', note.pubkey];
          queryClient.prefetchQuery({
            queryKey: metadataQueryKey,
            queryFn: async () => {
              const { fetchUserMetadata } = await import('../utils/profileMetadataUtils');
              return await fetchUserMetadata({ pubkeyHex: note.pubkey, relayUrls });
            },
            staleTime: 0,
            gcTime: 10 * 60 * 1000,
          }).catch(() => {
            // Ignore metadata prefetch errors
          });
        }
        
        console.log(`📋 Prefetched parent/root note: ${noteId.slice(0, 8)}`);
      }
    } catch (error) {
      console.warn(`Failed to prefetch parent note ${noteId.slice(0, 8)}:`, error);
    } finally {
      activePrefetchesRef.current.delete(noteId);
    }
  }, [enabled, relayUrls, isParentNoteCached, queryClient]);

  // Prefetch parent and root notes for a given note
  const prefetchParentNotes = useCallback(async (note: Note): Promise<void> => {
    if (!enabled || !note.tags || note.tags.length === 0) {
      return;
    }

    const { parentId, rootId } = extractParentAndRootIds(note);
    const noteIdsToPrefetch: string[] = [];

    // Add parent and root IDs if they exist and are different from the current note
    if (parentId && parentId !== note.id && !isParentNoteCached(parentId)) {
      noteIdsToPrefetch.push(parentId);
    }

    if (rootId && rootId !== note.id && rootId !== parentId && !isParentNoteCached(rootId)) {
      noteIdsToPrefetch.push(rootId);
    }

    // Prefetch all identified parent/root notes in parallel
    if (noteIdsToPrefetch.length > 0) {
      await Promise.all(
        noteIdsToPrefetch.map(noteId => prefetchNoteById(noteId))
      );
    }
  }, [enabled, extractParentAndRootIds, isParentNoteCached, prefetchNoteById]);

  // Get notes that need parent note prefetching
  const getNotesForParentPrefetch = useCallback(() => {
    if (!notes || notes.length === 0) return [];
    
    const startIndex = Math.max(0, currentIndex);
    const endIndex = Math.min(startIndex + prefetchWindow, notes.length);
    
    return notes.slice(startIndex, endIndex);
  }, [notes, currentIndex, prefetchWindow]);

  // Main prefetch effect
  useEffect(() => {
    if (!enabled || !notes || notes.length === 0) return;

    const notesToPrefetch = getNotesForParentPrefetch();
    if (notesToPrefetch.length === 0) return;

    // Prefetch parent notes for each note in parallel
    const prefetchPromises = notesToPrefetch.map(note => prefetchParentNotes(note));

    Promise.all(prefetchPromises).catch(error => {
      console.error('Error in parent note prefetch batch:', error);
    });
  }, [enabled, notes, currentIndex, prefetchWindow, getNotesForParentPrefetch, prefetchParentNotes]);

  // Cleanup function
  useEffect(() => {
    return () => {
      activePrefetchesRef.current.clear();
    };
  }, []);

  return {
    prefetchParentNotes,
    isParentNoteCached,
    activePrefetches: activePrefetchesRef.current.size
  };
}

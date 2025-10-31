import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Note } from '../types/nostr/types';
// removed unused extractImageUrls import after disabling image prefetch
import { usePrefetchState } from './usePrefetchState';
import { CACHE_KEYS } from '../utils/cacheKeys';
// removed unused mediaLoader import after disabling image prefetch
import { useParentNotePrefetch } from './useParentNotePrefetch';

interface UseEnhancedPrefetchOptions {
  notes: Note[];
  currentIndex: number;
  relayUrls: string[];
  enabled?: boolean;
  prefetchWindow?: number; // How many notes ahead to prefetch (default: 3)
  nostrClient?: any;
  myPubkey?: string; // For reaction prefetching (to track user's reactions)
}

/**
 * Enhanced prefetching hook that preloads images, metadata, replies, and reaction counts
 * for notes that are close to the user's current position
 */
export function useEnhancedPrefetch({
  notes,
  currentIndex,
  relayUrls,
  enabled = true,
  prefetchWindow = 3,
  nostrClient,
  myPubkey
}: UseEnhancedPrefetchOptions) {
  const queryClient = useQueryClient();
  const prefetchState = usePrefetchState();
  const activeImagePrefetchesRef = useRef<Set<string>>(new Set());
  const activeMetadataPrefetchesRef = useRef<Set<string>>(new Set());
  const activeThreadPrefetchesRef = useRef<Set<string>>(new Set());
  const activeReactionPrefetchesRef = useRef<Set<string>>(new Set());

  // Initialize parent note prefetching
  const {
    prefetchParentNotes,
    isParentNoteCached,
    activePrefetches: activeParentPrefetches
  } = useParentNotePrefetch({
    notes,
    relayUrls,
    enabled,
    prefetchWindow,
    currentIndex
  });

  // Helper to check if metadata is already cached
  const isMetadataCached = useCallback((pubkey: string) => {
    const queryKey = ['metadata', pubkey];
    const queryData = queryClient.getQueryData(queryKey);
    return !!queryData;
  }, [queryClient]);

  // Helper to check if thread is already cached
  const isThreadCached = useCallback((noteId: string) => {
    const queryKey = ['thread', 'level1', noteId];
    const queryData = queryClient.getQueryData(queryKey);
    return !!queryData;
  }, [queryClient]);

  // Helper to check if reaction counts are already cached
  const isReactionCountsCached = useCallback((noteId: string) => {
    const queryKey = CACHE_KEYS.REACTION_COUNTS(noteId);
    const queryData = queryClient.getQueryData(queryKey);
    return !!queryData;
  }, [queryClient]);

  // Prefetch images for a note (disabled: batch prefetch removed)
  const prefetchImages = useCallback(async (_note: Note) => {
    return;
  }, []);

  // Prefetch metadata for a pubkey
  const prefetchMetadata = useCallback(async (pubkey: string) => {
    if (!enabled || !pubkey || isMetadataCached(pubkey) || 
        prefetchState.isMetadataPrefetched(pubkey) || 
        activeMetadataPrefetchesRef.current.has(pubkey)) {
      return;
    }

    activeMetadataPrefetchesRef.current.add(pubkey);

    try {
      const queryKey = ['metadata', pubkey];
      
      await queryClient.prefetchQuery({
        queryKey,
        queryFn: async () => {
          const { fetchUserMetadata } = await import('../utils/profileMetadataUtils');
          return await fetchUserMetadata({ pubkeyHex: pubkey, relayUrls });
        },
        staleTime: 0,
        gcTime: 10 * 60 * 1000, // 10 minutes
      });

      prefetchState.addPrefetchedMetadata(pubkey);
    } catch (error) {
      console.warn(`Failed to prefetch metadata for ${pubkey.slice(0, 8)}:`, error);
    } finally {
      activeMetadataPrefetchesRef.current.delete(pubkey);
    }
  }, [enabled, relayUrls, isMetadataCached, queryClient]);

  // Prefetch thread replies for a note
  const prefetchThread = useCallback(async (note: Note) => {
    if (!enabled || !nostrClient || !note.id || 
        isThreadCached(note.id) || 
        prefetchState.isThreadPrefetched(note.id) || 
        activeThreadPrefetchesRef.current.has(note.id)) {
      return;
    }

    activeThreadPrefetchesRef.current.add(note.id);

    try {
      const filter = {
        kinds: [1],
        "#e": [note.id],
        limit: 1000,
      } as any;

      const events = await nostrClient.querySync(relayUrls, filter);

      const directChildren: Note[] = [];
      for (const ev of events) {
        const eTags = (ev.tags || []).filter(
          (t: any) => Array.isArray(t) && t[0] === "e"
        );
        let isDirect = false;
        const replyTag = eTags.find((t: any) => t[3] === "reply");
        const rootTag = eTags.find((t: any) => t[3] === "root");
        
        // NIP-10: Direct replies to root should have ONLY "root" marker
        // Nested replies have BOTH "root" and "reply" markers
        if (replyTag && replyTag[1] === note.id) {
          // This is a direct reply to note.id (reply marker points to parent)
          isDirect = true;
        } else if (rootTag && rootTag[1] === note.id && !replyTag) {
          // This is a top-level reply to root (only root marker, no reply marker)
          isDirect = true;
        } else if (!replyTag && !rootTag) {
          // Fallback to positional e-tags for backward compatibility
          if (
            (eTags.length === 1 && eTags[0][1] === note.id) ||
            (eTags.length >= 2 && eTags[1][1] === note.id)
          ) {
            isDirect = true;
          }
        }
        if (!isDirect) continue;
        directChildren.push({
          id: ev.id,
          content: ev.content || "",
          pubkey: ev.pubkey,
          created_at: ev.created_at,
          tags: ev.tags || [],
          imageUrls: [],
          videoUrls: [],
          receivedAt: Date.now(),
        } as Note);
      }

      directChildren.sort(
        (a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id)
      );

      queryClient.setQueryData<{ directChildren: Note[] }>(
        ["thread", "level1", note.id],
        { directChildren }
      );

      prefetchState.addPrefetchedThread(note.id);
    } catch (error) {
      console.warn(`Failed to prefetch thread for ${note.id.slice(0, 8)}:`, error);
    } finally {
      activeThreadPrefetchesRef.current.delete(note.id);
    }
  }, [enabled, nostrClient, relayUrls, isThreadCached, queryClient]);

  // Prefetch reaction counts for a note
  const prefetchReactions = useCallback(async (note: Note) => {
    if (!enabled || !nostrClient || !note.id ||
        isReactionCountsCached(note.id) ||
        activeReactionPrefetchesRef.current.has(note.id)) {
      return;
    }

    activeReactionPrefetchesRef.current.add(note.id);

    try {
      const queryKey = CACHE_KEYS.REACTION_COUNTS(note.id);

      await queryClient.prefetchQuery({
        queryKey,
        queryFn: async () => {
          const filter = { kinds: [7], '#e': [note.id], limit: 1000 } as any;
          const events = await nostrClient.querySync(relayUrls, filter);

          const latestByReactor = new Map<string, any>();
          for (const ev of events) {
            const existing = latestByReactor.get(ev.pubkey);
            if (!existing || (ev.created_at || 0) > (existing.created_at || 0)) {
              latestByReactor.set(ev.pubkey, ev);
            }
          }

          let likeCount = 0;
          let dislikeCount = 0;
          let hasLikedByMe = false;
          let hasDislikedByMe = false;

          latestByReactor.forEach(ev => {
            const c = (ev.content || '').trim();
            if (c === '-') {
              dislikeCount++;
              if (ev.pubkey === myPubkey) hasDislikedByMe = true;
            } else if (c === '+' || c === '') {
              likeCount++;
              if (ev.pubkey === myPubkey) hasLikedByMe = true;
            }
            // other emojis ignored for now
          });

          return {
            likes: likeCount,
            dislikes: dislikeCount,
            total: likeCount, // UI requirement: show only '+' likes
            hasLikedByMe,
            hasDislikedByMe,
          };
        },
        staleTime: 30000, // 30 seconds
        gcTime: 5 * 60 * 1000, // 5 minutes
      });
    } catch (error) {
      console.warn(`Failed to prefetch reactions for ${note.id.slice(0, 8)}:`, error);
    } finally {
      activeReactionPrefetchesRef.current.delete(note.id);
    }
  }, [enabled, nostrClient, relayUrls, isReactionCountsCached, queryClient, myPubkey]);

  // Get notes that need prefetching based on current position
  const getNotesForPrefetch = useCallback(() => {
    if (!notes || notes.length === 0) return [];
    
    const startIndex = currentIndex + 1;
    const endIndex = Math.min(startIndex + prefetchWindow, notes.length);
    
    return notes.slice(startIndex, endIndex);
  }, [notes, currentIndex, prefetchWindow]);

  // Main prefetch effect
  useEffect(() => {
    if (!enabled || !notes || notes.length === 0) return;

    const notesToPrefetch = getNotesForPrefetch();
    if (notesToPrefetch.length === 0) return;

    // Prefetch all data for each note in parallel
    const prefetchPromises = notesToPrefetch.map(async (note) => {
      try {
        // Prefetch images, metadata, thread, reactions, and parent notes in parallel for each note
        await Promise.all([
          prefetchImages(note),
          prefetchMetadata(note.pubkey),
          prefetchThread(note),
          prefetchReactions(note),
          prefetchParentNotes(note)
        ]);
      } catch (error) {
        console.warn(`Failed to prefetch data for note ${note.id.slice(0, 8)}:`, error);
      }
    });

    // Execute all prefetches
    Promise.all(prefetchPromises).catch(error => {
      console.error('Error in enhanced prefetch batch:', error);
    });
  }, [enabled, notes, currentIndex, prefetchWindow, getNotesForPrefetch, prefetchImages, prefetchMetadata, prefetchThread, prefetchReactions]);

  // Cleanup function
  useEffect(() => {
    return () => {
      activeImagePrefetchesRef.current.clear();
      activeMetadataPrefetchesRef.current.clear();
      activeThreadPrefetchesRef.current.clear();
      activeReactionPrefetchesRef.current.clear();
    };
  }, []);

  return {
    prefetchImages,
    prefetchMetadata,
    prefetchThread,
    prefetchReactions,
    prefetchParentNotes,
    isParentNoteCached,
    activeImagePrefetches: activeImagePrefetchesRef.current.size,
    activeMetadataPrefetches: activeMetadataPrefetchesRef.current.size,
    activeThreadPrefetches: activeThreadPrefetchesRef.current.size,
    activeReactionPrefetches: activeReactionPrefetchesRef.current.size,
    activeParentPrefetches,
    prefetchedImages: prefetchState.prefetchedImages.size,
    prefetchedMetadata: prefetchState.prefetchedMetadata.size,
    prefetchedThreads: prefetchState.prefetchedThreads.size,
  };
}

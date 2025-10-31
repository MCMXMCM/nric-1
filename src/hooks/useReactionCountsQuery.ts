import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { SimplePool, Event, Filter } from 'nostr-tools';
import { CACHE_KEYS } from '../utils/cacheKeys';

export interface ReactionCountsData {
  likes: number;
  dislikes: number;
  total: number;
  hasLikedByMe: boolean;
  hasDislikedByMe: boolean;
}

export interface ReactionCountsResult {
  data: ReactionCountsData | undefined;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<any>;
}

/**
 * Fetch reaction counts (kind 7) for a note using TanStack Query
 * Counts '+' or empty content as likes; '-' as dislikes.
 * Dedupe by reacting pubkey to prevent multiple counts from same author.
 */
export function useReactionCountsQuery(
  noteId: string | null | undefined,
  relayUrls: string[],
  pool: SimplePool | null,
  myPubkey?: string
): ReactionCountsResult {

  const fetchReactionCounts = useCallback(async (): Promise<ReactionCountsData> => {
    if (!noteId || !pool || relayUrls.length === 0) {
      return {
        likes: 0,
        dislikes: 0,
        total: 0,
        hasLikedByMe: false,
        hasDislikedByMe: false,
      };
    }

    const filter: Filter = { kinds: [7], '#e': [noteId], limit: 1000 } as any;
    const events: Event[] = await pool.querySync(relayUrls, filter);
    
    const latestByReactor = new Map<string, Event>();
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
      } else {
        // Count '+' or empty string (traditional likes) AND any emoji/content as likes per NIP-25
        likeCount++;
        if (ev.pubkey === myPubkey) hasLikedByMe = true;
      }
    });

    return {
      likes: likeCount,
      dislikes: dislikeCount,
      total: likeCount, // UI requirement: show only '+' likes
      hasLikedByMe,
      hasDislikedByMe,
    };
  }, [noteId, pool, relayUrls.join('|'), myPubkey]);

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: CACHE_KEYS.REACTION_COUNTS(noteId || ''),
    queryFn: fetchReactionCounts,
    enabled: Boolean(noteId && pool && relayUrls.length > 0),
    staleTime: 30000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    data,
    isLoading,
    error: error ? (error as Error).message : null,
    refetch,
  };
}

/**
 * Optimistically update reaction counts
 */
export function useOptimisticReactionUpdate() {
  const queryClient = useQueryClient();

  const updateOptimisticReaction = useCallback((
    noteId: string,
    reactionType: 'like' | 'dislike',
    action: 'add' | 'remove',
    _myPubkey: string
  ) => {
    const cacheKey = CACHE_KEYS.REACTION_COUNTS(noteId);
    const currentData = queryClient.getQueryData<ReactionCountsData>(cacheKey);
    
    if (!currentData) return;

    const updatedData: ReactionCountsData = { ...currentData };

    if (reactionType === 'like') {
      if (action === 'add') {
        updatedData.likes += 1;
        updatedData.total += 1;
        updatedData.hasLikedByMe = true;
        // Remove dislike if user had disliked
        if (updatedData.hasDislikedByMe) {
          updatedData.dislikes = Math.max(0, updatedData.dislikes - 1);
          updatedData.hasDislikedByMe = false;
        }
      } else {
        updatedData.likes = Math.max(0, updatedData.likes - 1);
        updatedData.total = Math.max(0, updatedData.total - 1);
        updatedData.hasLikedByMe = false;
      }
    } else if (reactionType === 'dislike') {
      if (action === 'add') {
        updatedData.dislikes += 1;
        updatedData.hasDislikedByMe = true;
        // Remove like if user had liked
        if (updatedData.hasLikedByMe) {
          updatedData.likes = Math.max(0, updatedData.likes - 1);
          updatedData.total = Math.max(0, updatedData.total - 1);
          updatedData.hasLikedByMe = false;
        }
      } else {
        updatedData.dislikes = Math.max(0, updatedData.dislikes - 1);
        updatedData.hasDislikedByMe = false;
      }
    }

    queryClient.setQueryData(cacheKey, updatedData);
  }, [queryClient]);

  const revertOptimisticReaction = useCallback((
    noteId: string,
    originalData: ReactionCountsData
  ) => {
    const cacheKey = CACHE_KEYS.REACTION_COUNTS(noteId);
    queryClient.setQueryData(cacheKey, originalData);
  }, [queryClient]);

  return {
    updateOptimisticReaction,
    revertOptimisticReaction,
  };
}

import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { SimplePool } from "nostr-tools";
import type { Filter, Event } from "nostr-tools";
import { CACHE_KEYS } from "../utils/cacheKeys";

export interface ReplyCountResult {
  count: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<any>;
}

/**
 * Fetch reply count for a note using TanStack Query
 * Queries for notes that reply to the given note ID
 */
export function useReplyCountQuery(
  noteId: string | null | undefined,
  relayUrls: string[],
  pool: SimplePool | null
): ReplyCountResult {

  const fetchReplyCount = useCallback(async (): Promise<number> => {
    if (!noteId || !pool || relayUrls.length === 0) {
      return 0;
    }

    // Query for notes that have this note as a parent (reply or root)
    const filter: Filter = { 
      kinds: [1], 
      '#e': [noteId], 
      limit: 1000 
    } as any;
    
    const events: Event[] = await pool.querySync(relayUrls, filter);
    
    // Filter to only count actual replies (not reposts or other interactions)
    let replyCount = 0;
    
    for (const event of events) {
      // Skip empty content (likely reposts or reactions)
      if (!event.content || event.content.trim().length === 0) {
        continue;
      }
      
      // Check if this is a reply to our note
      const eTags = event.tags?.filter(tag => Array.isArray(tag) && tag[0] === 'e') || [];
      const replyTag = eTags.find((t: any) => t[3] === 'reply' && t[1] === noteId);
      const rootTag = eTags.find((t: any) => t[3] === 'root' && t[1] === noteId);
      
      // Count if it's a direct reply or if it's part of a thread with this note as root
      if (replyTag || rootTag) {
        replyCount++;
      }
    }

    return replyCount;
  }, [noteId, pool, relayUrls.join('|')]);

  const {
    data: count = 0,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: CACHE_KEYS.REPLY_COUNT(noteId || ''),
    queryFn: fetchReplyCount,
    enabled: Boolean(noteId && pool && relayUrls.length > 0),
    staleTime: 60000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    count,
    isLoading,
    error: error ? (error as Error).message : null,
    refetch,
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SimplePool, Event, Filter } from 'nostr-tools';

export interface ReactionCountsResult {
  likes: number;
  dislikes: number;
  total: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  hasLikedByMe: boolean;
}

/**
 * Fetch reaction counts (kind 7) for a note. Counts '+' or empty content as likes; '-' as dislikes.
 * Dedupe by reacting pubkey to prevent multiple counts from same author.
 */
export function useReactionCounts(
  noteId: string | null | undefined,
  relayUrls: string[],
  pool: SimplePool | null,
  myPubkey?: string
): ReactionCountsResult {
  const [likes, setLikes] = useState<number>(0);
  const [dislikes, setDislikes] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetchedRef = useRef<number>(0);
  const [hasLikedByMe, setHasLikedByMe] = useState<boolean>(false);

  // UI requirement: show only '+' likes; do not include emojis or other reactions in totals
  const total = useMemo(() => likes, [likes]);

  const run = useCallback(async () => {
    if (!noteId || !pool || relayUrls.length === 0) {
      setLikes(0);
      setDislikes(0);
      setError(null);
      setHasLikedByMe(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    
    // Ensure minimum loading duration for better UX
    const startTime = Date.now();
    const minLoadingDuration = 200; // 200ms minimum
    
    try {
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
      latestByReactor.forEach(ev => {
        const c = (ev.content || '').trim();
        if (c === '-') dislikeCount++;
        else if (c === '+' || c === '') likeCount++;
        // other emojis ignored for now
      });
      setLikes(likeCount);
      setDislikes(dislikeCount);
      if (myPubkey) {
        const mine = latestByReactor.get(myPubkey);
        const c = (mine?.content || '').trim();
        setHasLikedByMe(Boolean(mine && (c === '+' || c === '')));
      } else {
        setHasLikedByMe(false);
      }
      lastFetchedRef.current = Date.now();
      
      // Ensure minimum loading duration
      const elapsed = Date.now() - startTime;
      if (elapsed < minLoadingDuration) {
        await new Promise(resolve => setTimeout(resolve, minLoadingDuration - elapsed));
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load reactions');
      
      // Still respect minimum duration even on error
      const elapsed = Date.now() - startTime;
      if (elapsed < minLoadingDuration) {
        await new Promise(resolve => setTimeout(resolve, minLoadingDuration - elapsed));
      }
    } finally {
      setIsLoading(false);
    }
  }, [noteId, pool, relayUrls.join('|'), myPubkey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await run();
    })();
    return () => { cancelled = true; };
  }, [run]);

  return { likes, dislikes, total, isLoading, error, refetch: run, hasLikedByMe } as any;
}



import { useEffect, useRef, useCallback } from "react";
import type { Event as NostrEvent, Filter } from "nostr-tools";
import type { Note } from "../types/nostr/types";
import { useQueryClient } from "@tanstack/react-query";
import { CACHE_KEYS } from "../utils/cacheKeys";

interface UseNostrFeedThreadPrefetchProps {
  isNoteRoute: boolean;
  nostrClient: any;
  readRelays: string[];
  state: any;
}

export const useNostrFeedThreadPrefetch = ({
  isNoteRoute,
  nostrClient,
  readRelays,
  state,
}: UseNostrFeedThreadPrefetchProps) => {
  const queryClient = useQueryClient();
  const prefetchedThreadIdsRef = useRef<Set<string>>(new Set());
  const prefetchQueueRef = useRef<string[]>([]);
  const prefetchGenRef = useRef<number>(0);
  const isPrefetchingRef = useRef<boolean>(false);
  const idleThreadPrefetchHandleRef = useRef<number | null>(null);

  const requestIdle = useCallback((cb: () => void) => {
    try {
      const anyWin: any = window as any;
      if (typeof anyWin.requestIdleCallback === "function") {
        return anyWin.requestIdleCallback(cb);
      }
    } catch {}
    return window.setTimeout(cb, 200);
  }, []);

  // Prefetch threads in ascending index order beyond currentIndex, in batches of 10
  useEffect(() => {
    if (isNoteRoute) return;
    const pool = nostrClient;
    const relays = readRelays;
    if (!pool || !Array.isArray(relays) || relays.length === 0) return;
    if (!Array.isArray(state.notes) || state.notes.length === 0) return;

    // Build ordered queue: (currentIndex+1 .. end)
    const nextIds: string[] = [];
    for (let i = state.currentIndex + 1; i < state.notes.length; i++) {
      const nid = (state.notes[i] as any)?.id;
      if (!nid) continue;
      if (prefetchedThreadIdsRef.current.has(nid)) continue;
      nextIds.push(nid);
    }
    prefetchQueueRef.current = nextIds;
    prefetchGenRef.current += 1;
    const myGen = prefetchGenRef.current;

    const prefetchOne = async (noteId: string) => {
      if (!noteId || prefetchedThreadIdsRef.current.has(noteId)) return;
      prefetchedThreadIdsRef.current.add(noteId);
      try {
        const filter: Filter = {
          kinds: [1],
          "#e": [noteId],
          limit: 1000,
        } as any;
        const events: NostrEvent[] = await pool.querySync(relays, filter);

        const directChildren: Note[] = [];
        for (const ev of events) {
          const eTags = (ev.tags || []).filter(
            (t) => Array.isArray(t) && t[0] === "e"
          );
          let isDirect = false;
          const replyTag = eTags.find((t) => t[3] === "reply");
          const rootTag = eTags.find((t) => t[3] === "root");
          
          // NIP-10: Direct replies to root should have ONLY "root" marker
          // Nested replies have BOTH "root" and "reply" markers
          if (replyTag && replyTag[1] === noteId) {
            // This is a direct reply to noteId (reply marker points to parent)
            isDirect = true;
          } else if (rootTag && rootTag[1] === noteId && !replyTag) {
            // This is a top-level reply to root (only root marker, no reply marker)
            isDirect = true;
          } else if (!replyTag && !rootTag) {
            // Fallback to positional e-tags for backward compatibility
            if (
              (eTags.length === 1 && eTags[0][1] === noteId) ||
              (eTags.length >= 2 && eTags[1][1] === noteId)
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
          CACHE_KEYS.THREAD.LEVEL1(noteId),
          { directChildren }
        );
        // Note: Removed duplicate IndexedDB storage - TanStack Query already caches notes
      } catch (_e) {
        // ignore
      }
    };

    const processQueue = async () => {
      if (isPrefetchingRef.current) return;
      isPrefetchingRef.current = true;
      try {
        while (prefetchQueueRef.current.length > 0) {
          if (prefetchGenRef.current !== myGen) break; // queue rebuilt
          const batch = prefetchQueueRef.current.splice(0, 10);
          for (const nid of batch) {
            if (prefetchGenRef.current !== myGen) break;
            await prefetchOne(nid);
          }
        }
      } finally {
        isPrefetchingRef.current = false;
      }
    };

    // Kick off processing during idle period
    if (idleThreadPrefetchHandleRef.current != null) {
      try {
        window.cancelIdleCallback?.(idleThreadPrefetchHandleRef.current as any);
      } catch {}
      try {
        clearTimeout(idleThreadPrefetchHandleRef.current as any);
      } catch {}
      idleThreadPrefetchHandleRef.current = null;
    }
    idleThreadPrefetchHandleRef.current = requestIdle(() => {
      processQueue();
    }) as unknown as number;
  }, [
    nostrClient,
    readRelays,
    state.currentIndex,
    state.notes.length,
    isNoteRoute,
  ]);
};

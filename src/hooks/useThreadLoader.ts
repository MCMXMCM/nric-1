import { useEffect, useRef } from "react";
import { useThreadStore } from "../state/threadStore";
import { processEventsInWorker } from "../workers/threadWorkerBridge";
import type { Note } from "../types/nostr/types";

interface UseThreadLoaderProps {
  rootId: string;
  parentId: string;
  relayUrls: string[];
  nostrClient: any;
  enabled?: boolean;
  maxFetch?: number; // max events to fetch per batch
  timeBudget?: number; // ms per relay batch
}

export function useThreadLoader({
  rootId,
  parentId,
  relayUrls,
  nostrClient,
  enabled = true,
  maxFetch = 200,
  timeBudget = 3000,
}: UseThreadLoaderProps) {
  const loaderRef = useRef<{
    abortController: AbortController;
  }>({ abortController: new AbortController() });

  const ingestNotes = useThreadStore((s) => s.ingestNotes);
  const applyWorkerPatch = useThreadStore((s) => s.applyWorkerPatch);
  const initThread = useThreadStore((s) => s.initThread);
  const setLoading = useThreadStore((s) => s.setLoading);
  const setHasMore = useThreadStore((s) => s.setHasMore);

  useEffect(() => {
    if (!enabled || !rootId || !relayUrls.length || !nostrClient) return;

    // Initialize thread state only if missing (preserve cache)
    const existing = useThreadStore.getState().threads[rootId];
    if (!existing) {
      initThread(rootId, parentId);
    }

    // Cancel any previous fetch
    loaderRef.current.abortController.abort();
    loaderRef.current.abortController = new AbortController();

    let isMounted = true;
    const controller = loaderRef.current.abortController;

    (async () => {
      // Avoid loading flicker when cached data exists
      const snapshot = useThreadStore.getState().threads[rootId];
      const hasCachedData = Boolean(
        snapshot &&
          ((snapshot.notesById && snapshot.notesById.size > 0) ||
            (snapshot.directChildrenIds && snapshot.directChildrenIds.length > 0))
      );
      if (!hasCachedData) setLoading(rootId, true);
      try {
        // Build event id list for root and parent
        const eventIds: string[] = [rootId];
        if (parentId !== rootId) eventIds.push(parentId);

        // Collect events from all relays with time budget
        const allEvents = new Map<string, any>();
        const seenIds = new Set<string>();

        for (const relayUrl of relayUrls) {
          if (controller.signal.aborted || !isMounted) break;

          try {
            const startTime = Date.now();

            // 1) Fetch the root/parent events by ID
            const rootAndParentEvents: any[] = await Promise.race([
              nostrClient.querySync([relayUrl], { ids: eventIds, limit: 10 } as any),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("Relay timeout")), timeBudget / 2)
              ),
            ]);

            if (Array.isArray(rootAndParentEvents)) {
              for (const event of rootAndParentEvents) {
                if (!seenIds.has(event.id)) {
                  allEvents.set(event.id, event);
                  seenIds.add(event.id);
                }
              }
            }

            // 2) Fetch replies to root/parent (NIP-10 immediate)
            const replyFilter: any = {
              kinds: [1],
              "#e": eventIds,
              limit: maxFetch,
            };

            const replyEvents: any[] = await Promise.race([
              nostrClient.querySync([relayUrl], replyFilter as any),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("Relay timeout")), timeBudget / 2)
              ),
            ]);

            if (Array.isArray(replyEvents)) {
              for (const event of replyEvents) {
                if (!seenIds.has(event.id)) {
                  allEvents.set(event.id, event);
                  seenIds.add(event.id);
                }
              }
            }

            const elapsed = Date.now() - startTime;
            if (elapsed > timeBudget * 0.9) {
              // If we're close to budget, stop iterating relays
              break;
            }
          } catch (err) {
            console.warn(`Relay fetch error from ${relayUrl}:`, err);
            // Continue to next relay
          }
        }

        if (!isMounted) return;

        // Convert to Note array
        const notes: Note[] = Array.from(allEvents.values()).map((event) => ({
          id: event.id,
          content: event.content || "",
          pubkey: event.pubkey,
          created_at: event.created_at,
          kind: event.kind,
          tags: event.tags || [],
          imageUrls: [],
          videoUrls: [],
          receivedAt: Date.now(),
        }));

        if (notes.length > 0) {
          // Ingest notes first
          ingestNotes(rootId, notes);

          // Process in worker for NIP-10 resolution
          try {
            const patch = await processEventsInWorker(
              notes.map((n) => ({
                id: n.id,
                pubkey: n.pubkey,
                created_at: n.created_at,
                kind: n.kind || 1,
                tags: n.tags,
                content: n.content,
              }))
            );

            if (isMounted) {
              applyWorkerPatch(rootId, patch);
            }
          } catch (err) {
            console.warn("Worker error:", err);
            // Continue anyway; notes are ingested
          }
        }

        if (isMounted) {
          // For now, assume there may be more (depends on pagination later)
          setHasMore(rootId, false);
        }
      } catch (err) {
        console.error("Thread loader error:", err);
      } finally {
        if (isMounted) {
          setLoading(rootId, false);
        }
      }
    })();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [
    rootId,
    parentId,
    relayUrls,
    nostrClient,
    enabled,
    maxFetch,
    timeBudget,
    ingestNotes,
    applyWorkerPatch,
    initThread,
    setLoading,
    setHasMore,
  ]);
}

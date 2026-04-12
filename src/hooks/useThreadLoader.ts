import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useThreadStore } from "../state/threadStore";
import { processEventsInWorker } from "../workers/threadWorkerBridge";
import { CACHE_KEYS } from "../utils/cacheKeys";
import type { Note } from "../types/nostr/types";
import { queryWithNostrifyPoolFallback } from "../utils/nostr/nostrifyPoolQuery";
import type { NostrFilter } from "@nostrify/nostrify";
import { startFeedMetric } from "../utils/nostr/feedPerformanceMetrics";

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
  maxFetch = 120,
  timeBudget = 1200,
}: UseThreadLoaderProps) {
  const loaderRef = useRef<{
    abortController: AbortController;
  }>({ abortController: new AbortController() });

  const queryClient = useQueryClient();
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
      const finishThreadMetric = startFeedMetric("thread_load", {
        rootId: rootId.slice(0, 8),
        parentId: parentId.slice(0, 8),
        relays: relayUrls.length,
      });
      const queryRelayUrls = relayUrls.slice(0, 8);
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

        // Check TanStack Query cache first for root/parent notes
        for (const eventId of eventIds) {
          const cached = queryClient.getQueryData<Note>(CACHE_KEYS.NOTE(eventId));
          if (cached) {
            // Convert cached Note to event format for consistency
            allEvents.set(eventId, {
              id: cached.id,
              content: cached.content,
              pubkey: cached.pubkey,
              created_at: cached.created_at,
              kind: cached.kind || 1,
              tags: cached.tags || [],
            });
            seenIds.add(eventId);
          }
        }

        // Determine which notes still need to be fetched from network
        const uncachedIds = eventIds.filter((id) => !seenIds.has(id));

        // Prefer Nostrify pool (via shared helper) with multi-relay legacy fallback, then per-relay if needed
        let nostrifyPoolSucceeded = false;
        let primaryFetchErrored = false;

        try {
          if (uncachedIds.length > 0) {
            const rootAndParentFilter: NostrFilter = {
              kinds: [1],
              ids: uncachedIds,
              limit: 10,
            };

            const rootAndParentEvents: any[] = await Promise.race([
              queryWithNostrifyPoolFallback([rootAndParentFilter], () =>
                nostrClient.querySync(queryRelayUrls, rootAndParentFilter as any)
              ),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("Relay timeout")), timeBudget)
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
          }

          const replyFilter: NostrFilter = {
            kinds: [1],
            "#e": eventIds,
            limit: maxFetch,
          };

          const replyEvents: any[] = await Promise.race([
            queryWithNostrifyPoolFallback([replyFilter], () =>
              nostrClient.querySync(queryRelayUrls, replyFilter as any)
            ),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Relay timeout")), timeBudget)
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

          nostrifyPoolSucceeded = true;
        } catch (err) {
          primaryFetchErrored = true;
          console.warn(
            "Primary thread fetch error, falling back to sequential relay queries:",
            err
          );
        }

        // Fallback: Sequential relay queries only when primary path errors.
        // Empty results are treated as valid and should not fan out to every relay.
        const sequentialRelayUrls = queryRelayUrls.slice(0, 3);
        if (!nostrifyPoolSucceeded && primaryFetchErrored) {
          for (const relayUrl of sequentialRelayUrls) {
            if (controller.signal.aborted || !isMounted) break;

            // Skip if we already have all the root/parent notes we need
            if (eventIds.every((id) => seenIds.has(id))) break;

            try {
              const startTime = Date.now();

              // 1) Fetch the root/parent events by ID (only uncached ones)
              const idsToFetch = uncachedIds.length > 0 ? uncachedIds : eventIds;
              if (idsToFetch.length > 0) {
                const rootAndParentEvents: any[] = await Promise.race([
                  nostrClient.querySync([relayUrl], { ids: idsToFetch, limit: 10 } as any),
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
              }

              // 2) Fetch replies to root/parent (NIP-10 immediate)
              // Always fetch replies even if we got root/parent from cache
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
          // Cache notes to TanStack Query cache for reuse across contexts
          for (const note of notes) {
            queryClient.setQueryData(CACHE_KEYS.NOTE(note.id), note);
          }

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
        finishThreadMetric({
          status: "ok",
          loadedEvents: allEvents.size,
          loadedNotes: notes.length,
        });
      } catch (err) {
        console.error("Thread loader error:", err);
        finishThreadMetric({
          status: "error",
          error: (err as Error)?.message ?? "unknown",
        });
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
    queryClient,
    ingestNotes,
    applyWorkerPatch,
    initThread,
    setLoading,
    setHasMore,
  ]);
}

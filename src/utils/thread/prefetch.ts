import type { Note } from "../../types/nostr/types";
import { useThreadStore } from "../../state/threadStore";
import { processEventsInWorker } from "../../workers/threadWorkerBridge";

export async function prefetchThread(opts: {
  rootId: string;
  parentId: string;
  relayUrls: string[];
  nostrClient: any;
  maxFetch?: number;
  timeBudget?: number;
}): Promise<void> {
  const { rootId, parentId, relayUrls, nostrClient } = opts;
  const maxFetch = opts.maxFetch ?? 120;
  const timeBudget = opts.timeBudget ?? 800;

  try {
    if (!rootId || !relayUrls?.length || !nostrClient) return;

    // Initialize if missing; do NOT change loading state
    const state = useThreadStore.getState();
    if (!state.threads[rootId]) {
      state.initThread(rootId, parentId);
    }

    const eventIds: string[] = [rootId];
    if (parentId !== rootId) eventIds.push(parentId);

    const allEvents = new Map<string, any>();
    const seenIds = new Set<string>();

    for (const relayUrl of relayUrls) {
      const startTime = Date.now();

      try {
        // 1) Fetch root/parent by ids
        const rootAndParent: any[] = await Promise.race([
          nostrClient.querySync([relayUrl], { ids: eventIds, limit: 10 } as any),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Relay timeout")), timeBudget / 2)
          ),
        ]);
        if (Array.isArray(rootAndParent)) {
          for (const ev of rootAndParent) {
            if (!seenIds.has(ev.id)) {
              allEvents.set(ev.id, ev);
              seenIds.add(ev.id);
            }
          }
        }

        // 2) Fetch replies to both
        const replyFilter: any = { kinds: [1], "#e": eventIds, limit: maxFetch };
        const replyEvents: any[] = await Promise.race([
          nostrClient.querySync([relayUrl], replyFilter as any),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Relay timeout")), timeBudget / 2)
          ),
        ]);
        if (Array.isArray(replyEvents)) {
          for (const ev of replyEvents) {
            if (!seenIds.has(ev.id)) {
              allEvents.set(ev.id, ev);
              seenIds.add(ev.id);
            }
          }
        }

        const elapsed = Date.now() - startTime;
        if (elapsed > timeBudget * 0.9) break;
      } catch {
        // silently continue
      }
    }

    if (allEvents.size === 0) return;

    const notes: Note[] = Array.from(allEvents.values()).map((ev) => ({
      id: ev.id,
      content: ev.content || "",
      pubkey: ev.pubkey,
      created_at: ev.created_at,
      kind: ev.kind,
      tags: ev.tags || [],
      imageUrls: [],
      videoUrls: [],
      receivedAt: Date.now(),
    }));

    if (notes.length === 0) return;

    // Ingest first to store
    useThreadStore.getState().ingestNotes(rootId, notes);

    // Build structure in worker
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
      useThreadStore.getState().applyWorkerPatch(rootId, patch);
    } catch {
      // ignore worker errors in prefetch
    }
  } catch {
    // swallow prefetch errors
  }
}

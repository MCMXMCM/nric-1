type MetricType =
  | "feed_query"
  | "feed_pagination"
  | "note_load"
  | "thread_load"
  | "scroll_restore"
  | "memory_cache";

interface MetricEntry {
  type: MetricType;
  durationMs: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface FeedPerfStore {
  entries: MetricEntry[];
}

const MAX_ENTRIES = 300;

function getStore(): FeedPerfStore | null {
  if (typeof window === "undefined" || !import.meta.env.DEV) return null;
  const globalWindow = window as typeof window & {
    __feedPerfMetrics?: FeedPerfStore;
  };
  if (!globalWindow.__feedPerfMetrics) {
    globalWindow.__feedPerfMetrics = { entries: [] };
  }
  return globalWindow.__feedPerfMetrics;
}

export function recordFeedMetric(
  type: MetricType,
  durationMs: number,
  metadata?: Record<string, unknown>
): void {
  const store = getStore();
  if (!store) return;
  store.entries.push({
    type,
    durationMs: Math.max(0, Math.round(durationMs)),
    timestamp: Date.now(),
    metadata,
  });
  if (store.entries.length > MAX_ENTRIES) {
    store.entries.splice(0, store.entries.length - MAX_ENTRIES);
  }
}

export function startFeedMetric(
  type: MetricType,
  metadata?: Record<string, unknown>
): (finalMetadata?: Record<string, unknown>) => void {
  const start = performance.now();
  return (finalMetadata?: Record<string, unknown>) => {
    recordFeedMetric(type, performance.now() - start, {
      ...metadata,
      ...finalMetadata,
    });
  };
}

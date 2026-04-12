import type { NostrFilter } from "@nostrify/nostrify";

/**
 * Single entry point for reads via the global Nostrify pool with safe fallback.
 * Avoids duplicating try/catch + "pool not ready" handling across hooks.
 */
export async function queryWithNostrifyPoolFallback<T = unknown>(
  filters: NostrFilter[],
  fallback: () => Promise<T[]>
): Promise<T[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pool: { query?: (f: NostrFilter[]) => Promise<T[]> } | undefined = (
    globalThis as any
  ).__nostrifyPool;
  if (!pool?.query) {
    return fallback();
  }
  try {
    return await pool.query(filters);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      /Nostrify pool not ready|not initialized|reset during query/i.test(msg)
    ) {
      return fallback();
    }
    throw e;
  }
}

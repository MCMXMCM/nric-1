import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type Event, type Filter } from 'nostr-tools';
import { decode as decodeInvoice } from 'light-bolt11-decoder';
import { getGlobalRelayPool } from '../utils/nostr/relayConnectionPool';
import { CACHE_KEYS } from '../utils/cacheKeys';

export interface ZapTotalsResult {
  totalMsats: number;
  totalSats: number;
}

interface UseZapTotalsQueryOptions {
  noteId: string | null | undefined;
  relayUrls: string[];
  noteAuthorPubkey?: string;
  enabled?: boolean;
}

/**
 * Parse millisatoshis from a zap receipt event
 * - Prefer `amount` tag (msats) when present per NIP-57 receipts.
 * - Fallback to parsing `bolt11` invoice amount if provided.
 */
function parseMsatsFromEvent(event: Event): number | null {
  try {
    // amount tag is msats if present
    const amountTag = event.tags.find(t => Array.isArray(t) && t[0] === 'amount');
    if (amountTag && amountTag[1]) {
      const asNum = Number(amountTag[1]);
      if (Number.isFinite(asNum) && asNum > 0) return asNum;
    }
    // fallback: parse bolt11
    const boltTag = event.tags.find(t => Array.isArray(t) && t[0] === 'bolt11');
    const invoice = boltTag?.[1];
    if (invoice) {
      const decoded: any = decodeInvoice(invoice);
      const topMsats = Number(decoded?.millisatoshis || decoded?.milliSatoshis || decoded?.msatoshi || decoded?.msats);
      if (Number.isFinite(topMsats) && topMsats > 0) return topMsats;
      const topSats = Number(decoded?.satoshis || decoded?.sats || decoded?.satoshi);
      if (Number.isFinite(topSats) && topSats > 0) return topSats * 1000;
      const sections: any[] = Array.isArray(decoded?.sections) ? decoded.sections : [];
      const msatsItem = sections.find((s: any) => s?.name === 'millisatoshis');
      if (msatsItem && msatsItem.value) {
        const msats = Number(msatsItem.value);
        if (Number.isFinite(msats) && msats > 0) return msats;
      }
      const satsItem = sections.find((s: any) => s?.name === 'satoshis' || s?.name === 'amount');
      if (satsItem && satsItem.value) {
        const sats = Number(satsItem.value);
        if (Number.isFinite(sats) && sats > 0) return sats * 1000;
      }
    }
  } catch (_e) {
    // ignore individual parse errors
  }
  return null;
}

/**
 * Fetch zap totals for a specific note
 */
async function fetchZapTotals(
  noteId: string,
  relayUrls: string[],
  noteAuthorPubkey?: string
): Promise<ZapTotalsResult> {
  const filter: Filter = {
    kinds: [9735],
    '#e': [noteId],
    limit: 1000,
  };
  
  const pool = getGlobalRelayPool();
  const events: Event[] = await pool.querySync(relayUrls, filter);
  
  // Deduplicate by id and sum
  const seen = new Set<string>();
  let sum = 0;
  let validZapCount = 0;
  
  for (const ev of events) {
    if (seen.has(ev.id)) continue;
    seen.add(ev.id);
    
    // Ensure p tag matches the note's author if provided
    if (noteAuthorPubkey) {
      const pTag = ev.tags.find(t => Array.isArray(t) && t[0] === 'p' && t[1]);
      if (!pTag || pTag[1] !== noteAuthorPubkey) {

        continue;
      }
    }
    
    const msats = parseMsatsFromEvent(ev);
    if (typeof msats === 'number' && Number.isFinite(msats) && msats > 0) {
      sum += msats;
      validZapCount++;

    } else {

    }
  }
  
  const result = {
    totalMsats: sum,
    totalSats: Math.floor(sum / 1000),
  };

  return result;
}

/**
 * Hook that manages zap totals fetching with TanStack Query
 * Uses unified cache key: ['zap-totals', noteId]
 * This enables zap totals reuse across different contexts
 */
export function useZapTotalsQuery({
  noteId,
  relayUrls,
  noteAuthorPubkey,
  enabled = true,
}: UseZapTotalsQueryOptions) {
  const queryClient = useQueryClient();
  const queryKey = noteId ? CACHE_KEYS.ZAP_TOTALS(noteId) : ['zap-totals', null];

  const queryEnabled = Boolean(noteId && relayUrls.length > 0 && enabled);
  // Debug logging removed - zap receipts working as expected

  return useQuery({
    queryKey,
    enabled: queryEnabled,
    queryFn: async () => {
      const result = await fetchZapTotals(
        noteId as string,
        relayUrls,
        noteAuthorPubkey
      );

      // Check if we have optimistic zap data in cache that should be preserved
      const cachedZapTotals = queryClient.getQueryData<ZapTotalsResult>(queryKey);
      if (cachedZapTotals && cachedZapTotals.totalSats > 0 && result.totalSats === 0) {
        // Preserve optimistic update when no receipts found on relays
        // This handles cases where Lightning wallets don't produce zap receipts

        return cachedZapTotals;
      }

      return result;
    },
    staleTime: 30 * 1000, // 30 seconds - zap totals can change frequently
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnMount: true,
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    // Show cached data immediately while fetching
    placeholderData: () => queryClient.getQueryData<ZapTotalsResult>(queryKey),
  });
}

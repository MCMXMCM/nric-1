import { useQuery } from '@tanstack/react-query';
import type { Event, Filter } from 'nostr-tools';
import { getGlobalRelayPool } from '../utils/nostr/relayConnectionPool';
import { CACHE_KEYS } from '../utils/cacheKeys';

export interface ZapReceiptParsed {
  id: string;
  createdAt: number;
  amountMsats: number;
  amountSats: number;
  zapperPubkey: string; // pubkey of the 9735 receipt author
  recipientPubkey?: string; // 'p' tag in 9735
  noteId?: string; // 'e' tag in 9735
  comment?: string; // content from embedded 9734 in description
}

/**
 * Extract msats from a zap receipt event: amount tag preferred, fallback to bolt11 if present
 */
function parseMsats(ev: Event): number | null {
  const amountTag = ev.tags.find(t => Array.isArray(t) && t[0] === 'amount');
  if (amountTag?.[1]) {
    const n = Number(amountTag[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  // Some receipts might not include amount; we ignore those for totals/comments display
  return null;
}

/**
 * Parse embedded 9734 from description tag JSON to extract comment content
 */
export function parseZapCommentFromReceipt(ev: Event): string | undefined {
  const descTag = ev.tags.find(t => Array.isArray(t) && t[0] === 'description');
  const json = descTag?.[1];
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json);
    // Expected shape is the signed 9734 event
    if (parsed && typeof parsed === 'object' && typeof parsed.content === 'string') {
      const content: string = parsed.content;
      return content || undefined;
    }
  } catch {
    // ignore invalid JSON
  }
  return undefined;
}

async function fetchZapReceipts(noteId: string, relayUrls: string[], noteAuthorPubkey?: string): Promise<ZapReceiptParsed[]> {
  const filter: Filter = {
    kinds: [9735],
    '#e': [noteId],
    limit: 1000,
  };
  const pool = getGlobalRelayPool();
  const events: Event[] = await pool.querySync(relayUrls, filter);
  const seen = new Set<string>();
  const out: ZapReceiptParsed[] = [];
  for (const ev of events) {
    if (seen.has(ev.id)) continue;
    seen.add(ev.id);
    if (noteAuthorPubkey) {
      const pTag = ev.tags.find(t => Array.isArray(t) && t[0] === 'p' && t[1]);
      if (!pTag || pTag[1] !== noteAuthorPubkey) continue;
    }
    const msats = parseMsats(ev);
    if (!msats || msats <= 0) continue;
    const eTag = ev.tags.find(t => Array.isArray(t) && t[0] === 'e' && t[1]);
    const pTag = ev.tags.find(t => Array.isArray(t) && t[0] === 'p' && t[1]);
    out.push({
      id: ev.id,
      createdAt: ev.created_at ?? 0,
      amountMsats: msats,
      amountSats: Math.floor(msats / 1000),
      zapperPubkey: ev.pubkey,
      recipientPubkey: pTag?.[1],
      noteId: eTag?.[1],
      comment: parseZapCommentFromReceipt(ev),
    });
  }
  // Sort newest first
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

interface UseZapReceiptsOptions {
  noteId: string | null | undefined;
  relayUrls: string[];
  noteAuthorPubkey?: string;
  enabled?: boolean;
}

export function useZapReceipts({ noteId, relayUrls, noteAuthorPubkey, enabled = true }: UseZapReceiptsOptions) {
  return useQuery({
    queryKey: noteId ? [...CACHE_KEYS.ZAP_TOTALS(noteId), 'receipts'] : ['zap-receipts', null],
    enabled: Boolean(noteId && relayUrls.length > 0 && enabled),
    queryFn: async () => {
      return await fetchZapReceipts(noteId as string, relayUrls, noteAuthorPubkey);
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
}



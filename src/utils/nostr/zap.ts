// Helper utilities for building compact NIP-57 zap requests
// Focus: cap relays and enforce encoded nostr payload size budgets

/**
 * Select a compact list of relays for the zap request.
 * Priority: recipient relays first (deduped), then connected relays, capped.
 */
export function capRelaysForZap(
  recipientRelays: string[] | undefined,
  connectedRelays: string[] | undefined,
  maxRelays: number = 3
): string[] {
  const uniq = new Set<string>();
  const push = (arr?: string[]) => {
    if (!arr) return;
    for (const url of arr) {
      if (uniq.size >= maxRelays) break;
      if (typeof url === "string" && url.startsWith("ws")) uniq.add(url);
    }
  };
  push(recipientRelays);
  push(connectedRelays);
  return Array.from(uniq);
}

/**
 * Compute the length of the encoded `nostr` query parameter for a zap event.
 * This mirrors how the request is built: JSON → encodeURIComponent
 */
export function encodedNostrParamLength(event: unknown): number {
  try {
    const encoded = encodeURIComponent(JSON.stringify(event));
    return encoded.length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * Return a new event with tags minimized to fit within a budget.
 * Strategy:
 *  1) If relays tag exists and too large, cap to first N (default 3)
 *  2) If still too large, remove relays tag entirely
 *  3) If still too large and lnurl tag exists, drop lnurl tag (per NIP-57 it's optional in the event)
 */
export function minimizeZapEventTags(
  event: any,
  options?: { budget?: number; relayCap?: number }
): any {
  const budget = options?.budget ?? 1800;
  const relayCap = options?.relayCap ?? 3;

  // Work on a shallow copy to avoid mutating the original
  let current = { ...event, tags: (event?.tags || []).map((t: any) => [...t]) };

  // Helper to replace a tag by name
  const setTag = (name: string, values: string[] | null) => {
    const idx = current.tags.findIndex((t: string[]) => t[0] === name);
    if (values === null) {
      if (idx >= 0) current.tags.splice(idx, 1);
      return;
    }
    const newTag = [name, ...values];
    if (idx >= 0) current.tags[idx] = newTag;
    else current.tags.push(newTag);
  };

  const lengthOk = () => encodedNostrParamLength(current) <= budget;

  // Step 1: cap relays if present
  const relaysIdx = current.tags.findIndex((t: string[]) => t[0] === "relays");
  if (relaysIdx >= 0) {
    const relays = (current.tags[relaysIdx] as string[]).slice(1);
    if (relays.length > relayCap) {
      setTag("relays", relays.slice(0, relayCap));
      if (lengthOk()) return current;
    }
  }

  // Step 2: remove relays if still over budget
  if (!lengthOk()) {
    setTag("relays", null);
    if (lengthOk()) return current;
  }

  // Step 3: remove lnurl if still over budget
  if (!lengthOk()) {
    setTag("lnurl", null);
    return current;
  }

  return current;
}

/**
 * Build the invoice URL used for fetching a zap invoice (LNURL callback).
 * Provided for testability and to keep logic consistent.
 */
export function buildInvoiceUrl(
  callbackUrl: string,
  amountMsat: number,
  signedZapEvent: unknown,
  lnurlBech32?: string,
  comment?: string,
  commentAllowed?: number
): string {
  const url = new URL(callbackUrl);
  url.searchParams.set("amount", String(amountMsat));
  url.searchParams.set("nostr", encodeURIComponent(JSON.stringify(signedZapEvent)));
  if (typeof comment === "string" && comment.length > 0 && (commentAllowed ?? 0) > 0) {
    url.searchParams.set("comment", comment);
  }
  if (lnurlBech32) {
    url.searchParams.set("lnurl", lnurlBech32);
  }
  return url.toString();
}

/**
 * Minimal, testable fetch helper: tries once with the provided signed event,
 * then retries once with a minimized event when response is not OK (e.g., 414).
 */
export async function fetchInvoiceWithRetry(options: {
  callbackUrl: string;
  amountMsat: number;
  signedEvent: unknown;
  lnurlBech32?: string;
  comment?: string;
  commentAllowed?: number;
  getMinimizedSignedEvent: () => Promise<unknown> | unknown;
  fetchImpl?: typeof fetch;
}): Promise<Response> {
  const {
    callbackUrl,
    amountMsat,
    signedEvent,
    lnurlBech32,
    comment,
    commentAllowed,
    getMinimizedSignedEvent,
    fetchImpl,
  } = options;

  const doFetch: typeof fetch = fetchImpl ?? fetch;

  let url = buildInvoiceUrl(
    callbackUrl,
    amountMsat,
    signedEvent,
    lnurlBech32,
    comment,
    commentAllowed
  );
  let res = await doFetch(url);
  if (res.ok) return res;

  const minimized = await getMinimizedSignedEvent();
  url = buildInvoiceUrl(callbackUrl, amountMsat, minimized, undefined, comment, commentAllowed);
  res = await doFetch(url);
  return res;
}



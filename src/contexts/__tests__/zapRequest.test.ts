import { describe, it, expect } from "vitest";
import {
  capRelaysForZap,
  encodedNostrParamLength,
  minimizeZapEventTags,
  buildInvoiceUrl,
  fetchInvoiceWithRetry,
} from "../../utils/nostr/zap";

describe("zap sizing helpers", () => {
  it("caps relays and preserves recipient priority", () => {
    const recipient = ["wss://a", "wss://b"];
    const connected = ["wss://c", "wss://b", "wss://d"]; // includes duplicate b
    const result = capRelaysForZap(recipient, connected, 3);
    expect(result).toEqual(["wss://a", "wss://b", "wss://c"]);
  });

  it("minimizes event tags under tight budget by dropping relays then lnurl", () => {
    const manyRelays = Array.from({ length: 10 }, (_, i) => `wss://r${i}.example.com`);
    const base = {
      kind: 9734,
      created_at: Math.floor(Date.now() / 1000),
      content: "A comment",
      tags: [["relays", ...manyRelays], ["lnurl", "lnurl1p...dummy"], ["p", "deadbeef" ]],
    };

    // Force aggressive minimization
    const minimized = minimizeZapEventTags(base, { budget: 200, relayCap: 3 });
    const tags = minimized.tags as string[][];
    // under very small budget, at least one of relays/lnurl should be removed
    const hasRelays = tags.some((t) => t[0] === "relays");
    const hasLnurl = tags.some((t) => t[0] === "lnurl");
    expect(hasRelays && hasLnurl).toBe(false);
    expect(encodedNostrParamLength(minimized)).toBeLessThanOrEqual(200);
  });
});

describe("invoice URL and retry behavior (helper)", () => {
  it("retries once with minimized event (drops lnurl) after non-OK response", async () => {
    const signed = { kind: 9734, tags: [["p", "deadbeef"], ["lnurl", "lnurl1p...X" ]] };
    const minimized = { kind: 9734, tags: [["p", "deadbeef"]] }; // no lnurl
    const calls: string[] = [];
    const OK = new Response("{}", { status: 200 });
    const FAIL = new Response("{}", { status: 414 });

    const fetchImpl = async (url: string): Promise<Response> => {
      calls.push(url);
      return calls.length === 1 ? FAIL : OK;
    };

    const res = await fetchInvoiceWithRetry({
      callbackUrl: "https://ln.example/.well-known/lnurlp/user",
      amountMsat: 21000,
      signedEvent: signed,
      lnurlBech32: "lnurl1p...X",
      getMinimizedSignedEvent: () => minimized,
      fetchImpl,
    });

    expect(res.ok).toBe(true);
    expect(calls.length).toBe(2);
    expect(calls[0]).toContain("lnurl=");
    expect(calls[1]).not.toContain("lnurl=");
    expect(calls[0]).toContain("nostr=");
    expect(calls[1]).toContain("nostr=");
  });
});



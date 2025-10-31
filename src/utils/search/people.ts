import { loadDisplayNamesFromStorage } from "../nostr/userDisplayNames";

// Basic cache-first people search using locally stored display names metadata
// Returns a ranked list of candidate pubkeys from cache
export function searchPeopleCached(queryRaw: string, limit: number = 20): string[] {
  const query = (queryRaw || "").trim().toLowerCase();
  if (!query) return [];

  const displayCache = loadDisplayNamesFromStorage();
  const results: Array<{ pubkey: string; score: number }> = [];

  Object.values(displayCache).forEach((entry) => {
    const dn = (entry.displayName || "").toLowerCase();
    const name = (entry.name || "").toLowerCase();
    let score = 0;
    if (dn === query) score += 100;
    else if (dn.includes(query)) score += 50;
    if (name === query) score += 40;
    else if (name.includes(query)) score += 20;

    if (score > 0) {
      results.push({ pubkey: entry.pubkey, score });
    }
  });

  // Simple ranking: higher score first; stable by pubkey
  results.sort((a, b) => b.score - a.score || a.pubkey.localeCompare(b.pubkey));

  return results.slice(0, limit).map((r) => r.pubkey);
}

export interface Nip05ResolveResult {
  pubkeyHex: string | null;
  error?: string;
}

// Resolve NIP-05 identifier (name@domain) to a pubkey using well-known endpoint
export async function resolveNip05(identifier: string): Promise<Nip05ResolveResult> {
  try {
    const [name, domain] = identifier.split("@");
    if (!name || !domain) return { pubkeyHex: null, error: "Invalid NIP-05" };
    const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { pubkeyHex: null, error: `HTTP ${res.status}` };
    const data = (await res.json()) as { names?: Record<string, string> };
    
    // NIP-05 spec: identifiers are case-insensitive
    // First try exact match, then try case-insensitive lookup
    let pk = data?.names?.[name];
    if (!pk) {
      // Case-insensitive lookup - find the key that matches (lowercased)
      const nameLower = name.toLowerCase();
      const matchingKey = Object.keys(data?.names || {}).find(
        (key) => key.toLowerCase() === nameLower
      );
      pk = matchingKey ? data?.names?.[matchingKey] : undefined;
    }
    
    if (pk && typeof pk === "string" && /^[0-9a-fA-F]{64}$/.test(pk)) {
      return { pubkeyHex: pk };
    }
    return { pubkeyHex: null, error: "Not found" };
  } catch (e) {
    return { pubkeyHex: null, error: (e as Error).message || "Failed" };
  }
}



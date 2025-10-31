import { nip19 } from "nostr-tools";

export type SearchEntityType =
  | "person"
  | "note"
  | "nip05"
  | "ambiguous_hex"
  | "unknown";

export type SearchEntitySubtype =
  | "npub"
  | "nprofile"
  | "note"
  | "nevent"
  | "hex"
  | "nip05";

export interface ParseResult {
  type: SearchEntityType;
  subtype?: SearchEntitySubtype;
  input: string;
  pubkeyHex?: string;
  npub?: string;
  noteIdHex?: string;
  relayHints?: string[];
}

function stripNostrPrefix(raw: string): string {
  return raw.startsWith("nostr:") ? raw.slice("nostr:".length) : raw;
}

function isHex64(s: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(s);
}

function isNip05Like(s: string): boolean {
  // Basic local@domain.tld pattern, allowing common characters
  if (!s || s.includes(" ")) return false;
  const at = s.indexOf("@");
  if (at <= 0 || at === s.length - 1) return false;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  if (!/^[a-zA-Z0-9._-]+$/.test(local)) return false;
  // Require at least a dot in domain for sanity
  if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) return false;
  return true;
}

export function parseSearchInput(inputRaw: string): ParseResult {
  const input = stripNostrPrefix((inputRaw || "").trim());
  if (input.length === 0) {
    return { type: "unknown", input };
  }

  // NIP-05
  if (isNip05Like(input)) {
    return { type: "nip05", subtype: "nip05", input };
  }

  // Bech32 types
  if (/^(npub|nprofile|note|nevent)1[ac-hj-np-z02-9]+$/i.test(input)) {
    try {
      const decoded = nip19.decode(input) as any;
      if (decoded.type === "npub" && typeof decoded.data === "string") {
        return {
          type: "person",
          subtype: "npub",
          input,
          pubkeyHex: decoded.data,
          npub: input,
        };
      }
      if (decoded.type === "nprofile" && decoded.data?.pubkey) {
        const relays: string[] = Array.isArray(decoded.data.relays)
          ? decoded.data.relays.filter((r: any) => typeof r === "string")
          : [];
        return {
          type: "person",
          subtype: "nprofile",
          input,
          pubkeyHex: decoded.data.pubkey as string,
          npub: nip19.npubEncode(decoded.data.pubkey as string),
          relayHints: relays,
        };
      }
      if (decoded.type === "note" && typeof decoded.data === "string") {
        return {
          type: "note",
          subtype: "note",
          input,
          noteIdHex: decoded.data,
        };
      }
      if (decoded.type === "nevent" && decoded.data?.id) {
        const relays: string[] = Array.isArray(decoded.data.relays)
          ? decoded.data.relays.filter((r: any) => typeof r === "string")
          : [];
        return {
          type: "note",
          subtype: "nevent",
          input,
          noteIdHex: decoded.data.id as string,
          relayHints: relays,
        };
      }
    } catch {
      // fall through to other checks
    }
  }

  // Hex key or note id (ambiguous)
  if (isHex64(input)) {
    return { type: "ambiguous_hex", subtype: "hex", input };
  }

  return { type: "unknown", input };
}



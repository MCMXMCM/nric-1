import { bech32 } from 'bech32';

/**
 * Decode a bech32-encoded LNURL (LUD-06) into its underlying HTTPS URL.
 * Accepts either lowercase or uppercase hrp (lnurl/ LNURL). Mixed case is invalid.
 */
export function decodeLnurlBech32(lnurlBech32: string): string {
  if (!lnurlBech32 || typeof lnurlBech32 !== 'string') {
    throw new Error('Invalid LNURL input');
  }
  // Only wrap the bech32 decode in try/catch so validation errors propagate
  let url: string;
  try {
    const decoded = bech32.decode(lnurlBech32, 2048);
    if (!decoded || !Array.isArray(decoded.words)) throw new Error('Invalid LNURL');
    const bytes = bech32.fromWords(decoded.words);
    url = new TextDecoder().decode(Uint8Array.from(bytes));
  } catch {
    throw new Error('Invalid LUD06 format');
  }
  // Basic validation: must be https URL per spec
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('LNURL must be https');
  return parsed.toString();
}

/**
 * Encode an HTTPS URL into bech32 LNURL (hrp 'lnurl').
 */
export function encodeLnurlBech32(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('LNURL must be https');
  const bytes = new TextEncoder().encode(parsed.toString());
  const words = bech32.toWords(Uint8Array.from(bytes));
  return bech32.encode('lnurl', words, 2048);
}

/**
 * Parse a Lightning address (LUD-16) into username and domain
 */
export function parseLightningAddress(lightningAddress: string): { username: string; domain: string } {
  if (!lightningAddress || typeof lightningAddress !== 'string') {
    throw new Error('Invalid Lightning address input');
  }

  const [username, domain] = lightningAddress.split('@');
  if (!username || !domain) {
    throw new Error('Invalid LUD16 format');
  }

  return { username, domain };
}

/**
 * Generate LNURLp endpoint URL from Lightning address
 */
export function getLnurlpEndpoint(lightningAddress: string): string {
  const { username, domain } = parseLightningAddress(lightningAddress);
  return `https://${domain}/.well-known/lnurlp/${username}`;
}



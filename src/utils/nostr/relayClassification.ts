/**
 * Utility functions for classifying relay types based on URL patterns and known characteristics
 */

// Known indexer relay patterns - these relays specialize in metadata and lists
const KNOWN_INDEXER_PATTERNS = [
  'relay.nostr.band',
  'purplepag.es',
  'search.nos.today',
  'relay.nos.social',
  'nostr.band',
  'nostr-relay.app',
  'relay.nostr.info',
  'index.nostr.land'
];

// Known general-purpose relay patterns that handle all event types
const KNOWN_GENERAL_PATTERNS = [
  'relay.damus.io',
  'nos.lol',
  'relay.snort.social',
  'relay.primal.net',
  'nostr.wine',
  'offchain.pub',
  'relay.current.fyi',
  'eden.nostr.land',
  'nostr.fmt.wiz.biz',
  'relay.orangepill.dev'
];

/**
 * Determines if a relay URL is likely an indexer relay based on known patterns
 */
export function isKnownIndexerRelay(url: string): boolean {
  const normalizedUrl = url.toLowerCase().replace(/^wss?:\/\//, '').replace(/\/$/, '');
  
  return KNOWN_INDEXER_PATTERNS.some(pattern => 
    normalizedUrl.includes(pattern.toLowerCase())
  );
}

/**
 * Determines if a relay URL is a known general-purpose relay
 */
export function isKnownGeneralRelay(url: string): boolean {
  const normalizedUrl = url.toLowerCase().replace(/^wss?:\/\//, '').replace(/\/$/, '');
  
  return KNOWN_GENERAL_PATTERNS.some(pattern => 
    normalizedUrl.includes(pattern.toLowerCase())
  );
}

/**
 * Classifies a relay's likely purpose based on URL and NIP-65 markers
 * Returns the appropriate RelayPermission type
 */
export function classifyRelayPermission(
  url: string,
  nip65Read: boolean,
  nip65Write: boolean,
  respectUserIntent = true // NEW PARAMETER
): 'read' | 'write' | 'readwrite' | 'indexer' {
  
  // NEW: If respecting user intent, honor NIP-65 markers first
  if (respectUserIntent) {
    // User explicitly set read and write permissions via NIP-65
    if (nip65Read && nip65Write) return 'readwrite';
    if (nip65Read && !nip65Write) return 'read';
    if (!nip65Read && nip65Write) return 'write';
    
    // If no markers were set (both false), fall through to URL-based classification
    // This handles the case where NIP-65 event has ["r", "url"] without markers
    if (!nip65Read && !nip65Write) {
      // No explicit markers - use URL-based classification as hint
      if (isKnownIndexerRelay(url)) return 'indexer';
      if (isKnownGeneralRelay(url)) return 'readwrite';
      return 'readwrite'; // Default for unknown relays
    }
  }
  
  // Original logic for backward compatibility
  if (isKnownIndexerRelay(url)) {
    return 'indexer';
  }
  
  if (isKnownGeneralRelay(url)) {
    if (nip65Read && nip65Write) return 'readwrite';
    if (nip65Read) return 'read';
    if (nip65Write) return 'write';
    return 'readwrite';
  }
  
  // For unknown relays, be conservative with NIP-65 markers
  if (!nip65Read && nip65Write) {
    return 'write';
  }
  
  if (nip65Read && nip65Write) return 'readwrite';
  if (nip65Read) return 'read';
  if (nip65Write) return 'write';
  
  return 'readwrite';
}

/**
 * Event kinds that indexer relays typically handle
 * These are core metadata and discovery events
 */
export const INDEXER_EVENT_KINDS = [
  0,     // Metadata (profiles)
  3,     // Contacts (follow lists)
  10002, // Relay list metadata (NIP-65)
];

/**
 * Event kinds that should NOT be sent to indexer relays
 */
export const NON_INDEXER_EVENT_KINDS = [
  1,     // Text note
  6,     // Repost
  7,     // Reaction
  9735,  // Zap
  1984,  // Reporting
];

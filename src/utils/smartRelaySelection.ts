import { fetchUserRelays } from './relayDiscoveryUtils';
import type { RelayPermission } from '../types/nostr/types';

// Common indexer relays as fallback
const COMMON_INDEXER_RELAYS = [
  'wss://purplepag.es',
  'wss://relay.nostr.band',
  'wss://search.nos.today',
  'wss://relay.snort.social',
  'wss://nos.lol'
];

export interface SmartRelaySelectionOptions {
  targetPubkeyHex: string;
  userRelayUrls: string[];
  userRelayPermissions: Map<string, RelayPermission>;
  maxRelays?: number;
}

export interface SmartRelaySelectionResult {
  relayUrls: string[];
  strategy: 'user-preferred' | 'user-indexer' | 'common-indexer';
  source: string;
}

/**
 * Smart relay selection strategy for fetching contacts data:
 * 1. First priority: Target user's preferred relays (from their NIP-65 relay list)
 * 2. Second priority: Indexer relays that the logged-in user has added
 * 3. Fallback: Common indexer relays like PurplePages
 */
export async function selectSmartRelaysForContacts(
  options: SmartRelaySelectionOptions
): Promise<SmartRelaySelectionResult> {
  const { targetPubkeyHex, userRelayUrls, userRelayPermissions, maxRelays = 5 } = options;

  try {
    // Strategy 1: Try to get target user's preferred relays
    console.log(`🎯 Smart relay selection: Fetching preferred relays for ${targetPubkeyHex.slice(0, 8)}...`);
    
    const userRelayResult = await fetchUserRelays({
      pubkeyHex: targetPubkeyHex,
      relayUrls: userRelayUrls, // Use current user's relays to discover target user's relays
    });

    if (userRelayResult.relays && userRelayResult.relays.length > 0) {
      // Filter to get read-capable relays from target user's preferred list
      const preferredRelays = userRelayResult.relays
        .filter(relay => relay.read !== false) // Include relays that can read (or undefined)
        .map(relay => relay.url)
        .slice(0, maxRelays);

      if (preferredRelays.length > 0) {
        console.log(`✅ Using target user's preferred relays:`, preferredRelays);
        return {
          relayUrls: preferredRelays,
          strategy: 'user-preferred',
          source: `Target user's NIP-65 relay list (${preferredRelays.length} relays)`
        };
      }
    }

    console.log(`⚠️ No preferred relays found for target user, trying indexer strategy...`);

    // Strategy 2: Use indexer relays that the logged-in user has added
    const userIndexerRelays = userRelayUrls.filter(url => {
      const permission = userRelayPermissions.get(url);
      return permission === 'indexer';
    });

    if (userIndexerRelays.length > 0) {
      const selectedIndexers = userIndexerRelays.slice(0, maxRelays);
      console.log(`✅ Using user's indexer relays:`, selectedIndexers);
      return {
        relayUrls: selectedIndexers,
        strategy: 'user-indexer',
        source: `Logged-in user's indexer relays (${selectedIndexers.length} relays)`
      };
    }

    console.log(`⚠️ No user indexer relays found, using common indexer fallback...`);

    // Strategy 3: Fallback to common indexer relays
    const fallbackRelays = COMMON_INDEXER_RELAYS.slice(0, maxRelays);
    console.log(`✅ Using common indexer relays:`, fallbackRelays);
    return {
      relayUrls: fallbackRelays,
      strategy: 'common-indexer',
      source: `Common indexer relays (${fallbackRelays.length} relays)`
    };

  } catch (error) {
    console.warn(`⚠️ Error in smart relay selection, using fallback:`, error);
    
    // Fallback to common indexer relays on error
    const fallbackRelays = COMMON_INDEXER_RELAYS.slice(0, maxRelays);
    return {
      relayUrls: fallbackRelays,
      strategy: 'common-indexer',
      source: `Error fallback to common indexer relays (${fallbackRelays.length} relays)`
    };
  }
}

/**
 * Get relay selection info for debugging/logging
 */
export function getRelaySelectionInfo(result: SmartRelaySelectionResult): string {
  return `${result.strategy}: ${result.source} - ${result.relayUrls.join(', ')}`;
}

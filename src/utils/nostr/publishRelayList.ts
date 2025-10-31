import { nip07SignEvent } from './nip07';
import { RelayConnectionPool } from './relayConnectionPool';
import type { RelayPermission } from '../../types/nostr/types';
import { filterRelaysByEventKind, filterRelaysByEventKindAndCapabilities } from './publish';
import type { RelayInfo } from './relayInfo';

/**
 * Publishes a NIP-65 relay list event (kind 10002) to broadcast user's relay preferences
 * Only users with signing capabilities (nsec/nip07) can publish relay lists
 */
export async function publishRelayList(params: {
  pool: RelayConnectionPool;
  relayUrls: string[];
  relayPermissions: Map<string, RelayPermission>;
  publishToRelays: string[];
  relayInfoMap?: Map<string, RelayInfo>;
}): Promise<{ id: string; event: any }> {
  const { pool, relayUrls, relayPermissions, publishToRelays } = params;

  if (!pool) {
    throw new Error('Nostr client not ready');
  }

  if (!Array.isArray(publishToRelays) || publishToRelays.length === 0) {
    throw new Error('No relays configured for publishing');
  }

  // Build relay tags according to NIP-65 spec
  const relayTags: string[][] = [];

  relayUrls.forEach(url => {
    const permission = relayPermissions.get(url) || 'readwrite';
    
    // NIP-65 format: ["r", "relay_url", "marker"]
    // marker can be "read", "write", or omitted (meaning both)
    if (permission === 'read') {
      relayTags.push(['r', url, 'read']);
    } else if (permission === 'write') {
      relayTags.push(['r', url, 'write']);
    } else if (permission === 'readwrite') {
      // Omit marker for readwrite (both read and write)
      relayTags.push(['r', url]);
    } else if (permission === 'indexer') {
      // NEW: Respect user's original intent for indexer relays
      // Don't force them to write-only - let user decide
      // Most indexer relays should be readwrite for metadata discovery
      relayTags.push(['r', url]); // No marker = both read and write
    }
  });

  // Add client tag
  relayTags.push(['client', 'NRIC-1']);

  // Create and sign the NIP-65 event
  const event = {
    kind: 10002,
    content: '',
    tags: relayTags,
  };

  const signed = await nip07SignEvent(event);

  // Filter publish relays based on event kind, permissions, and capabilities
  let filteredPublishRelays: string[];
  if (params.relayInfoMap) {
    // Use enhanced filtering with NIP-11 capabilities
    filteredPublishRelays = filterRelaysByEventKindAndCapabilities(
      publishToRelays, 
      relayPermissions, 
      params.relayInfoMap,
      10002
    );
  } else {
    // Fallback to basic permission filtering
    filteredPublishRelays = filterRelaysByEventKind(
      publishToRelays, 
      relayPermissions, 
      10002
    );
  }

  // Publish to filtered relays
  await pool.publish(filteredPublishRelays, signed);


  return { id: signed.id, event: signed };
}

/**
 * Checks if the current user can publish relay lists (has signing capability)
 */
export async function canPublishRelayList(): Promise<boolean> {
  // Check if NIP-07 extension is available
  if (typeof window !== 'undefined' && window.nostr?.signEvent) {
    return true;
  }

  // Check if we have an in-memory secret key (nsec login)
  try {
    // Dynamic import to avoid require() in browser environment
    const { getInMemorySecretKeyHex } = await import('./nip07');
    return !!getInMemorySecretKeyHex();
  } catch {
    return false;
  }
}

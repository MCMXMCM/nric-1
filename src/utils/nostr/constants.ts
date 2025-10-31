import type { RelayPermission } from '../../types/nostr/types';

// Database constants
export const DB_NAME = 'nostr-feed';
export const DB_VERSION = 9; // Incremented to add outbox stores

// Note: NOTES_STORE removed - using TanStack Query for note caching instead

// Note: CONTACTS_STORE removed - using TanStack Query for contact caching instead
// Note: ZAP_TOTALS_STORE removed - using TanStack Query for zap totals caching instead
export const KEYSTORE_STORE = 'keystore';
// Note: ASCII_CACHE_STORE removed - ASCII renderer now renders dynamically

// Outbox model stores
export const OUTBOX_EVENTS_STORE = 'outbox_events'; // NIP-65 relay list events
export const ROUTING_TABLE_STORE = 'routing_table'; // User -> relay mappings

// Default relay addresses for bootstrapping the application
export const DEFAULT_RELAY_URLS = [
  'wss://nos.lol',
  'wss://relay.damus.io', 
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://purplepag.es'
];

// Default permissions for each relay
export const DEFAULT_RELAY_PERMISSIONS = new Map<string, RelayPermission>([
  ['wss://nos.lol', 'readwrite'],
  ['wss://relay.damus.io', 'readwrite'],
  ['wss://relay.primal.net', 'readwrite'],
  ['wss://nostr.mom', 'write'],
  ['wss://purplepag.es', 'indexer']
]);

// Additional profile-specific relays that may be added dynamically
export const PROFILE_RELAY_URLS = [
  'wss://relay.snort.social'
];

// Legacy relay that was previously used (for backward compatibility)
export const LEGACY_RELAY_URLS = [
  'wss://nostr.wine'
];
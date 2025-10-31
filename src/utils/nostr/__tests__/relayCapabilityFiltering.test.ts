import { describe, it, expect, beforeEach } from 'vitest';
import { filterRelaysByEventKindAndCapabilities, filterRelaysByEventKind } from '../publish';
import type { RelayInfo } from '../relayInfo';
import type { RelayPermission } from '../../../types/nostr/types';

describe('Relay Capability Filtering', () => {
  let relayUrls: string[];
  let relayPermissions: Map<string, RelayPermission>;
  let relayInfoMap: Map<string, RelayInfo>;

  beforeEach(() => {
    relayUrls = [
      'wss://relay1.example.com',
      'wss://relay2.example.com',
      'wss://relay3.example.com',
      'wss://indexer.example.com',
      'wss://restricted.example.com'
    ];

    relayPermissions = new Map([
      ['wss://relay1.example.com', 'readwrite'],
      ['wss://relay2.example.com', 'write'],
      ['wss://relay3.example.com', 'read'],
      ['wss://indexer.example.com', 'indexer'],
      ['wss://restricted.example.com', 'readwrite']
    ]);

    relayInfoMap = new Map([
      ['wss://relay1.example.com', {
        name: 'General Relay 1',
        supported_nips: [1, 2, 7, 25, 51],
        limitation: {
          auth_required: false,
          payment_required: false,
          restricted_writes: false
        }
      }],
      ['wss://relay2.example.com', {
        name: 'General Relay 2',
        supported_nips: [1, 2, 7, 25, 51],
        limitation: {
          auth_required: false,
          payment_required: false,
          restricted_writes: false
        }
      }],
      ['wss://relay3.example.com', {
        name: 'Read Only Relay',
        supported_nips: [1, 2],
        limitation: {
          auth_required: false,
          payment_required: false,
          restricted_writes: false
        }
      }],
      ['wss://indexer.example.com', {
        name: 'Indexer Relay',
        supported_nips: [1, 2, 65],
        limitation: {
          auth_required: false,
          payment_required: false,
          restricted_writes: false
        }
      }],
      ['wss://restricted.example.com', {
        name: 'Restricted Relay',
        supported_nips: [1, 2], // Only supports basic NIPs
        limitation: {
          auth_required: false,
          payment_required: false,
          restricted_writes: true // This relay has restricted writes
        }
      }]
    ]);
  });

  describe('filterRelaysByEventKindAndCapabilities', () => {
    it('should filter out read-only relays for publishing', () => {
      const filtered = filterRelaysByEventKindAndCapabilities(
        relayUrls,
        relayPermissions,
        relayInfoMap,
        1 // Text note
      );

      expect(filtered).not.toContain('wss://relay3.example.com');
      expect(filtered).toContain('wss://relay1.example.com');
      expect(filtered).toContain('wss://relay2.example.com');
    });

    it('should respect indexer relay restrictions', () => {
      // Indexer relays should only receive specific event kinds (0, 3, 10002)
      const filtered = filterRelaysByEventKindAndCapabilities(
        relayUrls,
        relayPermissions,
        relayInfoMap,
        1 // Text note - not allowed for indexer
      );

      expect(filtered).not.toContain('wss://indexer.example.com');
    });

    it('should allow indexer relays for metadata events', () => {
      const filtered = filterRelaysByEventKindAndCapabilities(
        relayUrls,
        relayPermissions,
        relayInfoMap,
        0 // Metadata - allowed for indexer
      );

      expect(filtered).toContain('wss://indexer.example.com');
    });

    it('should filter out relays with restricted writes that don\'t support required NIP', () => {
      const filtered = filterRelaysByEventKindAndCapabilities(
        relayUrls,
        relayPermissions,
        relayInfoMap,
        7 // Reaction - requires NIP-25
      );

      // Restricted relay only supports NIPs 1 and 2, not 25
      expect(filtered).not.toContain('wss://restricted.example.com');
      expect(filtered).toContain('wss://relay1.example.com'); // Supports NIP-25
      expect(filtered).toContain('wss://relay2.example.com'); // Supports NIP-25
    });

    it('should allow relays with restricted writes that support required NIP', () => {
      const filtered = filterRelaysByEventKindAndCapabilities(
        relayUrls,
        relayPermissions,
        relayInfoMap,
        1 // Text note - requires NIP-1
      );

      // Restricted relay supports NIP-1, so it should be included
      expect(filtered).toContain('wss://restricted.example.com');
    });

    it('should handle relays without relay info gracefully', () => {
      const relayInfoMapEmpty = new Map<string, RelayInfo>();
      
      const filtered = filterRelaysByEventKindAndCapabilities(
        relayUrls,
        relayPermissions,
        relayInfoMapEmpty,
        1 // Text note
      );

      // Should fall back to basic permission filtering
      expect(filtered).not.toContain('wss://relay3.example.com'); // read-only
      expect(filtered).not.toContain('wss://indexer.example.com'); // indexer
      expect(filtered).toContain('wss://relay1.example.com'); // readwrite
      expect(filtered).toContain('wss://relay2.example.com'); // write
    });

    it('should provide fallback when all relays are filtered out', () => {
      // Create a scenario where all relays would be filtered out
      const allIndexerPermissions = new Map([
        ['wss://relay1.example.com', 'indexer'],
        ['wss://relay2.example.com', 'indexer'],
        ['wss://relay3.example.com', 'indexer']
      ]);

      const filtered = filterRelaysByEventKindAndCapabilities(
        relayUrls.slice(0, 3),
        allIndexerPermissions,
        relayInfoMap,
        1 // Text note - not allowed for indexer relays
      );

      // Should fall back to write/readwrite relays
      // Since all are indexer, should return empty array (no fallback available)
      expect(filtered).toEqual([]);
    });

    it('should handle different event kinds correctly', () => {
      // Test reactions (kind 7, requires NIP-25)
      const reactionFiltered = filterRelaysByEventKindAndCapabilities(
        relayUrls,
        relayPermissions,
        relayInfoMap,
        7
      );

      expect(reactionFiltered).toContain('wss://relay1.example.com'); // Supports NIP-25
      expect(reactionFiltered).toContain('wss://relay2.example.com'); // Supports NIP-25
      expect(reactionFiltered).not.toContain('wss://restricted.example.com'); // Doesn't support NIP-25

      // Test contacts (kind 3, requires NIP-2)
      const contactsFiltered = filterRelaysByEventKindAndCapabilities(
        relayUrls,
        relayPermissions,
        relayInfoMap,
        3
      );

      expect(contactsFiltered).toContain('wss://relay1.example.com'); // Supports NIP-2
      expect(contactsFiltered).toContain('wss://relay2.example.com'); // Supports NIP-2
      expect(contactsFiltered).toContain('wss://restricted.example.com'); // Supports NIP-2
    });
  });

  describe('Legacy filterRelaysByEventKind', () => {
    it('should maintain backward compatibility', () => {
      const filtered = filterRelaysByEventKind(
        relayUrls,
        relayPermissions,
        1 // Text note
      );

      expect(filtered).not.toContain('wss://relay3.example.com'); // read-only
      expect(filtered).not.toContain('wss://indexer.example.com'); // indexer
      expect(filtered).toContain('wss://relay1.example.com'); // readwrite
      expect(filtered).toContain('wss://relay2.example.com'); // write
    });

    it('should handle indexer relays correctly in legacy mode', () => {
      const filtered = filterRelaysByEventKind(
        relayUrls,
        relayPermissions,
        0 // Metadata - allowed for indexer
      );

      expect(filtered).toContain('wss://indexer.example.com');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty relay URLs array', () => {
      const filtered = filterRelaysByEventKindAndCapabilities(
        [],
        relayPermissions,
        relayInfoMap,
        1
      );

      expect(filtered).toEqual([]);
    });

    it('should handle missing permissions gracefully', () => {
      const emptyPermissions = new Map<string, RelayPermission>();
      
      const filtered = filterRelaysByEventKindAndCapabilities(
        relayUrls,
        emptyPermissions,
        relayInfoMap,
        1
      );

      // Should default to readwrite and apply capability filtering
      expect(filtered.length).toBeGreaterThan(0);
    });

    it('should handle unknown event kinds', () => {
      const filtered = filterRelaysByEventKindAndCapabilities(
        relayUrls,
        relayPermissions,
        relayInfoMap,
        99999 // Unknown event kind
      );

      // Should default to NIP-1 requirement
      expect(filtered).toContain('wss://relay1.example.com');
      expect(filtered).toContain('wss://relay2.example.com');
      expect(filtered).toContain('wss://restricted.example.com'); // Supports NIP-1
    });
  });

  describe('Authentication and payment requirements', () => {
    it('should log warnings for auth-required relays but still allow publishing', () => {
      const authRequiredRelayInfo = new Map([
        ['wss://auth.example.com', {
          name: 'Auth Required Relay',
          supported_nips: [1, 2],
          limitation: {
            auth_required: true,
            payment_required: false,
            restricted_writes: false
          }
        }]
      ]);

      const authPermissions = new Map([
        ['wss://auth.example.com', 'readwrite']
      ]);

      const filtered = filterRelaysByEventKindAndCapabilities(
        ['wss://auth.example.com'],
        authPermissions,
        authRequiredRelayInfo,
        1
      );

      // Should still include the relay (assumes user is authenticated)
      expect(filtered).toContain('wss://auth.example.com');
    });

    it('should log warnings for payment-required relays but still allow publishing', () => {
      const paymentRequiredRelayInfo = new Map([
        ['wss://payment.example.com', {
          name: 'Payment Required Relay',
          supported_nips: [1, 2],
          limitation: {
            auth_required: false,
            payment_required: true,
            restricted_writes: false
          }
        }]
      ]);

      const paymentPermissions = new Map([
        ['wss://payment.example.com', 'readwrite']
      ]);

      const filtered = filterRelaysByEventKindAndCapabilities(
        ['wss://payment.example.com'],
        paymentPermissions,
        paymentRequiredRelayInfo,
        1
      );

      // Should still include the relay (assumes user has paid access)
      expect(filtered).toContain('wss://payment.example.com');
    });
  });
});

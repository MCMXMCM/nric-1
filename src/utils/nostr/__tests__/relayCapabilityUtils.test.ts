import { describe, it, expect } from 'vitest';
import { 
  relaySupportsEventKind, 
  getRelayCapabilitySummary, 
  validateRelayForEventKind 
} from '../relayCapabilityUtils';
import type { RelayInfo } from '../relayInfo';
import type { RelayPermission } from '../../../types/nostr/types';

describe('Relay Capability Utils', () => {
  describe('relaySupportsEventKind', () => {
    it('should return true when relay has no restrictions', () => {
      const relayInfo: RelayInfo = {
        name: 'General Relay',
        supported_nips: [1, 2, 7, 25],
        limitation: {
          restricted_writes: false
        }
      };

      expect(relaySupportsEventKind('wss://relay.example.com', relayInfo, 1)).toBe(true);
      expect(relaySupportsEventKind('wss://relay.example.com', relayInfo, 7)).toBe(true);
    });

    it('should return true when relay info is undefined', () => {
      expect(relaySupportsEventKind('wss://relay.example.com', undefined, 1)).toBe(true);
      expect(relaySupportsEventKind('wss://relay.example.com', undefined, 999)).toBe(true);
    });

    it('should check supported NIPs when relay has restricted writes', () => {
      const relayInfo: RelayInfo = {
        name: 'Restricted Relay',
        supported_nips: [1, 2], // Only supports basic NIPs
        limitation: {
          restricted_writes: true
        }
      };

      expect(relaySupportsEventKind('wss://relay.example.com', relayInfo, 1)).toBe(true); // NIP-1
      expect(relaySupportsEventKind('wss://relay.example.com', relayInfo, 3)).toBe(true); // NIP-2
      expect(relaySupportsEventKind('wss://relay.example.com', relayInfo, 7)).toBe(false); // NIP-25
    });

    it('should return true when relay has restricted writes but no supported_nips listed', () => {
      const relayInfo: RelayInfo = {
        name: 'Restricted Relay',
        limitation: {
          restricted_writes: true
        }
      };

      expect(relaySupportsEventKind('wss://relay.example.com', relayInfo, 1)).toBe(true);
    });
  });

  describe('getRelayCapabilitySummary', () => {
    it('should return correct summary for read-only relay', () => {
      const summary = getRelayCapabilitySummary(
        'wss://relay.example.com',
        undefined,
        'read'
      );

      expect(summary.canPublish).toBe(false);
      expect(summary.restrictions).toContain('Read-only relay');
    });

    it('should return correct summary for write-enabled relay', () => {
      const relayInfo: RelayInfo = {
        name: 'General Relay',
        supported_nips: [1, 2, 7, 25]
      };

      const summary = getRelayCapabilitySummary(
        'wss://relay.example.com',
        relayInfo,
        'readwrite'
      );

      expect(summary.canPublish).toBe(true);
      expect(summary.restrictions).toEqual([]);
      expect(summary.supportedNips).toEqual([1, 2, 7, 25]);
    });

    it('should include authentication requirement in restrictions', () => {
      const relayInfo: RelayInfo = {
        name: 'Auth Required Relay',
        limitation: {
          auth_required: true
        }
      };

      const summary = getRelayCapabilitySummary(
        'wss://relay.example.com',
        relayInfo,
        'readwrite'
      );

      expect(summary.canPublish).toBe(true);
      expect(summary.restrictions).toContain('Requires authentication');
    });

    it('should include payment requirement in restrictions', () => {
      const relayInfo: RelayInfo = {
        name: 'Payment Required Relay',
        limitation: {
          payment_required: true
        }
      };

      const summary = getRelayCapabilitySummary(
        'wss://relay.example.com',
        relayInfo,
        'write'
      );

      expect(summary.canPublish).toBe(true);
      expect(summary.restrictions).toContain('Requires payment');
    });

    it('should include PoW requirement in restrictions', () => {
      const relayInfo: RelayInfo = {
        name: 'PoW Required Relay',
        limitation: {
          min_pow_difficulty: 16
        }
      };

      const summary = getRelayCapabilitySummary(
        'wss://relay.example.com',
        relayInfo,
        'readwrite'
      );

      expect(summary.canPublish).toBe(true);
      expect(summary.restrictions).toContain('Requires 16 bits PoW');
    });

    it('should include multiple restrictions', () => {
      const relayInfo: RelayInfo = {
        name: 'Restricted Relay',
        limitation: {
          auth_required: true,
          payment_required: true,
          restricted_writes: true,
          min_pow_difficulty: 20
        }
      };

      const summary = getRelayCapabilitySummary(
        'wss://relay.example.com',
        relayInfo,
        'readwrite'
      );

      expect(summary.canPublish).toBe(true);
      expect(summary.restrictions).toContain('Requires authentication');
      expect(summary.restrictions).toContain('Requires payment');
      expect(summary.restrictions).toContain('Restricted writes');
      expect(summary.restrictions).toContain('Requires 20 bits PoW');
    });

    it('should handle indexer permission correctly', () => {
      const summary = getRelayCapabilitySummary(
        'wss://relay.example.com',
        undefined,
        'indexer'
      );

      expect(summary.canPublish).toBe(true);
    });
  });

  describe('validateRelayForEventKind', () => {
    it('should return valid for readwrite relay with no restrictions', () => {
      const relayInfo: RelayInfo = {
        name: 'General Relay',
        supported_nips: [1, 2, 7, 25],
        limitation: {
          restricted_writes: false
        }
      };

      const result = validateRelayForEventKind(
        'wss://relay.example.com',
        relayInfo,
        'readwrite',
        1
      );

      expect(result.canHandle).toBe(true);
      expect(result.reasons).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should return invalid for read-only relay', () => {
      const result = validateRelayForEventKind(
        'wss://relay.example.com',
        undefined,
        'read',
        1
      );

      expect(result.canHandle).toBe(false);
      expect(result.reasons).toContain('Relay is read-only');
    });

    it('should return invalid for relay without write permissions', () => {
      const result = validateRelayForEventKind(
        'wss://relay.example.com',
        undefined,
        'read',
        1
      );

      expect(result.canHandle).toBe(false);
      expect(result.reasons).toContain('Relay is read-only');
    });

    it('should return invalid when relay doesn\'t support required NIP', () => {
      const relayInfo: RelayInfo = {
        name: 'Restricted Relay',
        supported_nips: [1, 2], // Doesn't support NIP-25
        limitation: {
          restricted_writes: true
        }
      };

      const result = validateRelayForEventKind(
        'wss://relay.example.com',
        relayInfo,
        'readwrite',
        7 // Reaction - requires NIP-25
      );

      expect(result.canHandle).toBe(false);
      expect(result.reasons).toContain('Relay does not support NIP-25 required for event kind 7');
    });

    it('should return valid when relay supports required NIP', () => {
      const relayInfo: RelayInfo = {
        name: 'Restricted Relay',
        supported_nips: [1, 2, 25], // Supports NIP-25
        limitation: {
          restricted_writes: true
        }
      };

      const result = validateRelayForEventKind(
        'wss://relay.example.com',
        relayInfo,
        'readwrite',
        7 // Reaction - requires NIP-25
      );

      expect(result.canHandle).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it('should include authentication warning', () => {
      const relayInfo: RelayInfo = {
        name: 'Auth Required Relay',
        limitation: {
          auth_required: true
        }
      };

      const result = validateRelayForEventKind(
        'wss://relay.example.com',
        relayInfo,
        'readwrite',
        1
      );

      expect(result.canHandle).toBe(true);
      expect(result.warnings).toContain('Relay requires authentication');
    });

    it('should include payment warning', () => {
      const relayInfo: RelayInfo = {
        name: 'Payment Required Relay',
        limitation: {
          payment_required: true
        }
      };

      const result = validateRelayForEventKind(
        'wss://relay.example.com',
        relayInfo,
        'readwrite',
        1
      );

      expect(result.canHandle).toBe(true);
      expect(result.warnings).toContain('Relay requires payment');
    });

    it('should include PoW warning', () => {
      const relayInfo: RelayInfo = {
        name: 'PoW Required Relay',
        limitation: {
          min_pow_difficulty: 16
        }
      };

      const result = validateRelayForEventKind(
        'wss://relay.example.com',
        relayInfo,
        'readwrite',
        1
      );

      expect(result.canHandle).toBe(true);
      expect(result.warnings).toContain('Relay requires 16 bits of PoW');
    });

    it('should include multiple warnings', () => {
      const relayInfo: RelayInfo = {
        name: 'Restricted Relay',
        limitation: {
          auth_required: true,
          payment_required: true,
          min_pow_difficulty: 20
        }
      };

      const result = validateRelayForEventKind(
        'wss://relay.example.com',
        relayInfo,
        'readwrite',
        1
      );

      expect(result.canHandle).toBe(true);
      expect(result.warnings).toContain('Relay requires authentication');
      expect(result.warnings).toContain('Relay requires payment');
      expect(result.warnings).toContain('Relay requires 20 bits of PoW');
    });

    it('should handle unknown event kinds by defaulting to NIP-1', () => {
      const relayInfo: RelayInfo = {
        name: 'Basic Relay',
        supported_nips: [1], // Only supports NIP-1
        limitation: {
          restricted_writes: true
        }
      };

      const result = validateRelayForEventKind(
        'wss://relay.example.com',
        relayInfo,
        'readwrite',
        99999 // Unknown event kind
      );

      expect(result.canHandle).toBe(true); // Should default to NIP-1 which is supported
    });
  });
});

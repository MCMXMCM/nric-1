import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchUserRelays, normalizeRelayUrl, deduplicateRelays, isValidRelayUrl } from '../relayDiscoveryUtils';

// Mock the global relay pool
vi.mock('../nostr/relayConnectionPool', () => ({
  getGlobalRelayPool: vi.fn(),
}));

import { getGlobalRelayPool } from '../nostr/relayConnectionPool';
const mockGetGlobalRelayPool = vi.mocked(getGlobalRelayPool);

describe('relayDiscoveryUtils', () => {
  let mockPool: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = {
      querySync: vi.fn(),
      close: vi.fn(),
    };
    mockGetGlobalRelayPool.mockReturnValue(mockPool);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchUserRelays', () => {
    const mockParams = {
      pubkeyHex: 'test-pubkey-hex',
      relayUrls: ['wss://relay.example.com'],
    };

    it('should fetch user relays from NIP-65 relay list events', async () => {
      const mockRelayListEvent = {
        kind: 10002,
        pubkey: 'test-pubkey-hex',
        created_at: 1234567890,
        tags: [
          ['r', 'wss://relay1.com'],
          ['r', 'wss://relay2.com', 'read'],
          ['r', 'wss://relay3.com', 'write'],
        ],
      };

      mockPool.querySync.mockResolvedValueOnce([mockRelayListEvent]);

      const result = await fetchUserRelays(mockParams);

      expect(result.relays).toHaveLength(3);
      expect(result.relays[0]).toEqual({
        url: 'wss://relay1.com',
        read: true,
        write: true,
        permission: 'readwrite',
      });
      expect(result.relays[1]).toEqual({
        url: 'wss://relay2.com',
        read: true,
        write: false,
        permission: 'read',
      });
      expect(result.relays[2]).toEqual({
        url: 'wss://relay3.com',
        read: false,
        write: true,
        permission: 'write',
      });
    });

    it('should fallback to recent events when no relay list events exist', async () => {
      const mockRecentEvents = [
        {
          kind: 1,
          pubkey: 'test-pubkey-hex',
          created_at: 1234567890,
          tags: [['relay', 'wss://fallback-relay.com']],
        },
      ];

      mockPool.querySync
        .mockResolvedValueOnce([]) // No relay list events
        .mockResolvedValueOnce(mockRecentEvents); // Recent events

      const result = await fetchUserRelays(mockParams);

      expect(result.relays).toHaveLength(2); // fallback relay + inferred relay
      expect(result.relays.some(r => r.url === 'wss://fallback-relay.com')).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      mockPool.querySync.mockRejectedValue(new Error('Network error'));

      const result = await fetchUserRelays(mockParams);

      expect(result.relays).toEqual([]);
      expect(result.error).toBe('Failed to load relay information');
    });

    it('should use the most recent relay list event', async () => {
      const olderEvent = {
        kind: 10002,
        pubkey: 'test-pubkey-hex',
        created_at: 1234567880,
        tags: [['r', 'wss://old-relay.com']],
      };

      const newerEvent = {
        kind: 10002,
        pubkey: 'test-pubkey-hex',
        created_at: 1234567890,
        tags: [['r', 'wss://new-relay.com']],
      };

      mockPool.querySync.mockResolvedValueOnce([olderEvent, newerEvent]);

      const result = await fetchUserRelays(mockParams);

      expect(result.relays).toHaveLength(1);
      expect(result.relays[0].url).toBe('wss://new-relay.com');
    });
  });

  describe('normalizeRelayUrl', () => {
    it('should add wss:// prefix when missing', () => {
      expect(normalizeRelayUrl('relay.example.com')).toBe('wss://relay.example.com');
    });

    it('should convert ws:// to wss:// for security', () => {
      expect(normalizeRelayUrl('ws://relay.example.com')).toBe('wss://relay.example.com');
    });

    it('should preserve wss:// prefix', () => {
      expect(normalizeRelayUrl('wss://relay.example.com')).toBe('wss://relay.example.com');
    });

    it('should remove trailing slashes', () => {
      expect(normalizeRelayUrl('wss://relay.example.com/')).toBe('wss://relay.example.com');
    });

    it('should preserve non-root paths', () => {
      expect(normalizeRelayUrl('wss://relay.example.com/path')).toBe('wss://relay.example.com/path');
    });

    it('should handle malformed URLs gracefully', () => {
      expect(normalizeRelayUrl('not-a-url')).toBe('not-a-url');
    });

    it('should normalize hostname to lowercase', () => {
      expect(normalizeRelayUrl('wss://RELAY.EXAMPLE.COM')).toBe('wss://relay.example.com');
    });
  });

  describe('deduplicateRelays', () => {
    it('should remove duplicate relay URLs', () => {
      const relays = [
        { url: 'wss://relay1.com', read: true, write: true },
        { url: 'wss://relay2.com', read: true, write: false },
        { url: 'wss://relay1.com', read: false, write: true },
      ];

      const result = deduplicateRelays(relays);

      expect(result).toHaveLength(2);
      expect(result.map(r => r.url)).toEqual(['wss://relay1.com', 'wss://relay2.com']);
    });

    it('should normalize URLs before deduplication', () => {
      const relays = [
        { url: 'relay1.com', read: true, write: true },
        { url: 'wss://relay1.com', read: true, write: false },
        { url: 'ws://relay1.com/', read: false, write: true },
      ];

      const result = deduplicateRelays(relays);

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('wss://relay1.com');
    });

    it('should filter out invalid URLs', () => {
      const relays = [
        { url: 'wss://valid-relay.com', read: true, write: true },
        { url: 'invalid url with spaces', read: true, write: false },
        { url: 'http://not-websocket.com', read: false, write: true },
      ];

      const result = deduplicateRelays(relays);

      // Should keep valid URLs and convert/normalize others
      expect(result.length).toBeGreaterThan(0);
      const validResult = result.find(r => r.url === 'wss://valid-relay.com');
      expect(validResult).toBeDefined();
    });
  });

  describe('isValidRelayUrl', () => {
    it('should validate wss:// URLs', () => {
      expect(isValidRelayUrl('wss://relay.example.com')).toBe(true);
    });

    it('should validate ws:// URLs', () => {
      expect(isValidRelayUrl('ws://relay.example.com')).toBe(true);
    });

    it('should reject http:// URLs', () => {
      expect(isValidRelayUrl('http://relay.example.com')).toBe(false);
    });

    it('should reject https:// URLs', () => {
      expect(isValidRelayUrl('https://relay.example.com')).toBe(false);
    });

    it('should reject malformed URLs', () => {
      expect(isValidRelayUrl('not-a-url')).toBe(false);
    });

    it('should reject empty URLs', () => {
      expect(isValidRelayUrl('')).toBe(false);
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { followUser, unfollowUser, checkIsFollowing } from '../profileFollowUtils';
import { nip07SignEvent } from '../nostr/nip07';
// Note: Removed custom IndexedDB contacts operations - using TanStack Query instead
import { normalizeToHex } from '../profileUtils';
import { getGlobalRelayPool } from '../nostr/relayConnectionPool';

// Mock dependencies
vi.mock('../nostr/nip07');
vi.mock('../nostr/hybridDbOperations');
vi.mock('../profileUtils');
vi.mock('../nostr/relayConnectionPool', () => ({
  getGlobalRelayPool: vi.fn(),
}));

const mockNip07SignEvent = vi.mocked(nip07SignEvent);
// Note: Removed mocks - using TanStack Query instead
const mockNormalizeToHex = vi.mocked(normalizeToHex);
const mockGetGlobalRelayPool = vi.mocked(getGlobalRelayPool);

describe('profileFollowUtils', () => {
  const mockNostrClient = {
    publish: vi.fn(),
  };

  const mockParams = {
    pubkeyHex: 'target-pubkey-hex',
    userPubkey: 'user-pubkey-hex',
    nip07Available: false,
    signInWithNip07: vi.fn(),
    nostrClient: mockNostrClient,
    relayUrls: ['wss://relay.example.com'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockNip07SignEvent.mockResolvedValue({
      id: 'test-event-id',
      pubkey: 'user-pubkey-hex',
      created_at: Math.floor(Date.now() / 1000),
      kind: 3,
      tags: [],
      content: '',
      sig: 'test-signature',
    });
    // Note: Removed contact mocks - using TanStack Query instead
    mockNostrClient.publish.mockResolvedValue();
    mockNormalizeToHex.mockImplementation((input) => {
      if (input === 'user-pubkey-hex') return 'user-pubkey-hex';
      if (input === 'target-pubkey-hex') return 'target-pubkey-hex';
      return null;
    });
    
    // Mock relay pool
    const mockPool = {
      querySync: vi.fn(),
    };
    mockGetGlobalRelayPool.mockReturnValue(mockPool as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('followUser', () => {
    it('should follow a user successfully', async () => {
      const result = await followUser(mockParams);

      expect(result.success).toBe(true);
      expect(mockNip07SignEvent).toHaveBeenCalledWith({
        kind: 3,
        content: '',
        tags: [['p', 'target-pubkey-hex', '', '']],
      });
      expect(mockNostrClient.publish).toHaveBeenCalledWith(
        mockParams.relayUrls,
        expect.any(Object)
      );
      // Note: Removed contact save expectation - using TanStack Query instead
    });

    it('should return success if already following', async () => {
      // Mock relay pool to return existing contacts
      const mockPool = mockGetGlobalRelayPool();
      mockPool.querySync.mockResolvedValue([{
        id: 'test-event-id',
        pubkey: 'user-pubkey-hex',
        created_at: Math.floor(Date.now() / 1000),
        kind: 3,
        tags: [['p', 'target-pubkey-hex', '', '']],
        content: '',
        sig: 'test-signature',
      }]);

      const result = await followUser(mockParams);

      expect(result.success).toBe(true);
      expect(result.wasAlreadyFollowing).toBe(true);
      expect(mockNip07SignEvent).not.toHaveBeenCalled();
      expect(mockNostrClient.publish).not.toHaveBeenCalled();
    });

    it('should handle missing user pubkey', async () => {
      const params = { ...mockParams, userPubkey: undefined };
      const result = await followUser(params);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Sign in required to follow users');
    });

    it('should handle missing relays', async () => {
      const params = { ...mockParams, relayUrls: [] };
      const result = await followUser(params);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No relays configured');
    });

    it('should prevent following yourself', async () => {
      const params = { ...mockParams, pubkeyHex: 'user-pubkey-hex' };
      const result = await followUser(params);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Can't follow yourself");
    });
  });

  describe('unfollowUser', () => {
    it('should unfollow a user successfully', async () => {
      // Mock relay pool to return existing contacts
      const mockPool = mockGetGlobalRelayPool();
      mockPool.querySync.mockResolvedValue([{
        id: 'test-event-id',
        pubkey: 'user-pubkey-hex',
        created_at: Math.floor(Date.now() / 1000),
        kind: 3,
        tags: [
          ['p', 'target-pubkey-hex', '', ''],
          ['p', 'other-pubkey-hex', '', '']
        ],
        content: '',
        sig: 'test-signature',
      }]);

      const result = await unfollowUser(mockParams);

      expect(result.success).toBe(true);
      expect(mockNip07SignEvent).toHaveBeenCalledWith({
        kind: 3,
        content: '',
        tags: [['p', 'other-pubkey-hex', '', '']],
      });
      expect(mockNostrClient.publish).toHaveBeenCalledWith(
        mockParams.relayUrls,
        expect.any(Object)
      );
      // Note: Removed contact save expectation - using TanStack Query instead
    });

    it('should return success if not following', async () => {
      // Mock relay pool to return no contacts
      const mockPool = mockGetGlobalRelayPool();
      mockPool.querySync.mockResolvedValue([]);

      const result = await unfollowUser(mockParams);

      expect(result.success).toBe(true);
      expect(result.wasNotFollowing).toBe(true);
      expect(mockNip07SignEvent).not.toHaveBeenCalled();
      expect(mockNostrClient.publish).not.toHaveBeenCalled();
    });

    it('should handle missing user pubkey', async () => {
      const params = { ...mockParams, userPubkey: undefined };
      const result = await unfollowUser(params);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Sign in required to unfollow users');
    });

    it('should handle missing relays', async () => {
      const params = { ...mockParams, relayUrls: [] };
      const result = await unfollowUser(params);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No relays configured');
    });

    it('should prevent unfollowing yourself', async () => {
      const params = { ...mockParams, pubkeyHex: 'user-pubkey-hex' };
      const result = await unfollowUser(params);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Can't unfollow yourself");
    });
  });

  describe('checkIsFollowing', () => {
    it('should return true when following', async () => {
      // Mock relay pool to return existing contacts
      const mockPool = mockGetGlobalRelayPool();
      mockPool.querySync.mockResolvedValue([{
        id: 'test-event-id',
        pubkey: 'user-pubkey-hex',
        created_at: Math.floor(Date.now() / 1000),
        kind: 3,
        tags: [['p', 'target-pubkey-hex', '', '']],
        content: '',
        sig: 'test-signature',
      }]);

      const result = await checkIsFollowing('target-pubkey-hex', 'user-pubkey-hex', mockParams.relayUrls);

      expect(result).toBe(true);
    });

    it('should return false when not following', async () => {
      // Mock relay pool to return different contacts
      const mockPool = mockGetGlobalRelayPool();
      mockPool.querySync.mockResolvedValue([{
        id: 'test-event-id',
        pubkey: 'user-pubkey-hex',
        created_at: Math.floor(Date.now() / 1000),
        kind: 3,
        tags: [['p', 'other-pubkey-hex', '', '']],
        content: '',
        sig: 'test-signature',
      }]);

      const result = await checkIsFollowing('target-pubkey-hex', 'user-pubkey-hex', mockParams.relayUrls);

      expect(result).toBe(false);
    });

    it('should return false for missing pubkeys', async () => {
      const result = await checkIsFollowing('', 'user-pubkey-hex');
      expect(result).toBe(false);

      const result2 = await checkIsFollowing('target-pubkey-hex', '');
      expect(result2).toBe(false);
    });
  });
});

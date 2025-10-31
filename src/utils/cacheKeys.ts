/**
 * Centralized cache key factory for consistent and optimized cache key management
 * This ensures all cache keys follow the same structure and hierarchy
 */

// Base cache key types
export const CACHE_KEYS = {
  // Individual data entities (global, relay-independent)
  NOTE: (noteId: string) => ['note', noteId] as const,
  METADATA: (pubkey: string) => ['metadata', pubkey] as const,
  CONTACTS: (pubkey: string) => ['contacts', pubkey] as const,
  ZAP_TOTALS: (noteId: string) => ['zap-totals', noteId] as const,
  REACTION_COUNTS: (noteId: string) => ['reaction-counts', noteId] as const,
  REPLY_COUNT: (noteId: string) => ['reply-count', noteId] as const,
  NIP05_VERIFICATION: (nip05Identifier: string, pubkey: string) => ['nip05-verification', nip05Identifier, pubkey] as const,
  
  // Feed-related queries (relay-dependent)
  FEED: {
    NOTES: (filterHash: string, relayKey: string, pageSize: number) => 
      ['feed', 'notes', filterHash, relayKey, pageSize] as const,
    FILTER: (filterHash: string) => ['feed', 'filter', filterHash] as const,
  },
  
  // Profile-related queries (relay-dependent)
  PROFILE: {
    METADATA: (pubkey: string) => ['profile', 'metadata', pubkey] as const, // Legacy - use METADATA instead
    NOTES: (pubkey: string, relayKey: string) => ['profile', 'notes', pubkey, relayKey] as const,
    CONTACTS: (mode: string, pubkey: string, relayKey: string) => 
      ['profile', 'contacts', mode, pubkey, relayKey] as const,
    CONTACTS_METADATA: (pubkeys: string[], relayKey: string) => 
      ['profile', 'contacts-metadata', pubkeys, relayKey] as const,
    MUTE_LIST: (pubkey: string, relayKey: string) => 
      ['profile', 'mute-list', pubkey, relayKey] as const,
  },
  
  // Thread-related queries (relay-dependent)
  THREAD: {
    LEVEL1: (parentNoteId: string) => ['thread', 'level1', parentNoteId, 'v2'] as const,
    NESTED: (parentNoteId: string, maxDepth: number, frontierKey: string) => 
      ['thread', 'nested', parentNoteId, maxDepth, frontierKey, 'v2'] as const,
    PATH: (parentNoteId: string) => ['thread', 'path', parentNoteId] as const,
    TREE: (parentNoteId: string) => ['thread', 'tree', parentNoteId] as const,
    COMMENT_IDS: (parentNoteId: string) => ['thread', 'comment-ids', parentNoteId] as const,
    COMMENT_NOTES: (parentNoteId: string) => ['thread', 'comment-notes', parentNoteId] as const,
    GLOBAL_TREE: (rootId: string) => ['thread', 'global-tree', rootId, 'v3'] as const,
  },
  
  // User preferences and settings (global)
  USER: {
    MUTE_LIST: (pubkey: string, relayUrls: string) => 
      ['user', 'mute-list', pubkey, relayUrls] as const,
    SETTINGS: (pubkey: string) => ['user', 'settings', pubkey] as const,
  },
  
  // Feed Buffer queries (relay-dependent, buffer-specific)
  FEED_BUFFER: {
    WINDOW: (filterHash: string, relayKey: string, bufferSize: number) =>
      ['feed-buffer', 'window', filterHash, relayKey, bufferSize] as const,
    METADATA: (pubkeys: string[], relayKey: string) =>
      ['feed-buffer', 'metadata', pubkeys, relayKey] as const,
    THREADS: (noteIds: string[], relayKey: string) =>
      ['feed-buffer', 'threads', noteIds, relayKey] as const,
  },

  // Utility queries
  UTILS: {
    DISPLAY_NAMES: () => ['utils', 'display-names'] as const,
    FEED_STATE: () => ['utils', 'feed-state'] as const,
  },
} as const

/**
 * Cache key matchers for invalidation patterns
 */
export const CACHE_MATCHERS = {
  // Match all note-related queries
  ALL_NOTES: () => ['note'] as const,
  
  // Match all metadata queries
  ALL_METADATA: () => ['metadata'] as const,
  
  // Match all feed queries
  ALL_FEED: () => ['feed'] as const,
  
  // Match all zap totals queries
  ALL_ZAP_TOTALS: () => ['zap-totals'] as const,
  
  // Match all reaction counts queries
  ALL_REACTION_COUNTS: () => ['reaction-counts'] as const,
  
  // Match all reply count queries
  ALL_REPLY_COUNTS: () => ['reply-count'] as const,
  
  // Match all profile queries for a specific user
  PROFILE_USER: (pubkey: string) => ['profile', pubkey] as const,
  
  // Match all thread queries for a specific note
  THREAD_NOTE: (noteId: string) => ['thread', noteId] as const,
  
  // Match all user queries
  ALL_USER: () => ['user'] as const,

  // Match all feed buffer queries
  ALL_FEED_BUFFER: () => ['feed-buffer'] as const,
} as const

/**
 * Helper functions for cache key operations
 */
export const cacheKeyUtils = {
  /**
   * Check if a query key matches a pattern
   */
  matches: (queryKey: readonly unknown[], pattern: readonly unknown[]): boolean => {
    if (queryKey.length < pattern.length) return false
    return pattern.every((part, index) => queryKey[index] === part)
  },
  
  /**
   * Extract the note ID from a note cache key
   */
  extractNoteId: (queryKey: readonly unknown[]): string | null => {
    if (queryKey[0] === 'note' && typeof queryKey[1] === 'string') {
      return queryKey[1]
    }
    return null
  },
  
  /**
   * Extract the pubkey from a metadata cache key
   */
  extractPubkey: (queryKey: readonly unknown[]): string | null => {
    if (queryKey[0] === 'metadata' && typeof queryKey[1] === 'string') {
      return queryKey[1]
    }
    return null
  },
  
  /**
   * Create a stable hash for arrays (used for relay keys, etc.)
   */
  hashArray: (arr: unknown[]): string => {
    return JSON.stringify([...arr].sort())
  },
} as const

/**
 * Type-safe cache key types
 */
export type NoteCacheKey = ReturnType<typeof CACHE_KEYS.NOTE>
export type MetadataCacheKey = ReturnType<typeof CACHE_KEYS.METADATA>
export type ZapTotalsCacheKey = ReturnType<typeof CACHE_KEYS.ZAP_TOTALS>
export type ReactionCountsCacheKey = ReturnType<typeof CACHE_KEYS.REACTION_COUNTS>
export type ReplyCountCacheKey = ReturnType<typeof CACHE_KEYS.REPLY_COUNT>
export type FeedNotesCacheKey = ReturnType<typeof CACHE_KEYS.FEED.NOTES>
export type ProfileNotesCacheKey = ReturnType<typeof CACHE_KEYS.PROFILE.NOTES>
export type ThreadLevel1CacheKey = ReturnType<typeof CACHE_KEYS.THREAD.LEVEL1>
export type FeedBufferWindowCacheKey = ReturnType<typeof CACHE_KEYS.FEED_BUFFER.WINDOW>
export type FeedBufferMetadataCacheKey = ReturnType<typeof CACHE_KEYS.FEED_BUFFER.METADATA>
export type FeedBufferThreadsCacheKey = ReturnType<typeof CACHE_KEYS.FEED_BUFFER.THREADS>

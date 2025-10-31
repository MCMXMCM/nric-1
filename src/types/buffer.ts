import type { Note, Metadata } from './nostr/types'
import type { FeedBufferWindowCacheKey, FeedBufferMetadataCacheKey, FeedBufferThreadsCacheKey } from '../utils/cacheKeys'

/**
 * Represents a single note in the buffer with its associated data
 */
export interface BufferNote {
  /** The note data */
  note: Note
  /** Whether this note's metadata has been prefetched */
  metadataLoaded: boolean
  /** Whether this note's threads have been prefetched */
  threadsLoaded: boolean
  /** Last accessed timestamp for LRU eviction */
  lastAccessed: number
  /** Distance from current position (for prefetch priority) */
  distanceFromCurrent: number
}

/**
 * Thread data for a note in the buffer
 */
export interface BufferThread {
  /** Parent note ID */
  parentNoteId: string
  /** Direct child comments/replies */
  comments: Note[]
  /** Total number of replies (may be more than cached) */
  totalReplies: number
  /** Last updated timestamp */
  lastUpdated: number
}

/**
 * Represents the current state of the feed buffer
 */
export interface BufferState {
  /** Notes currently in the buffer, indexed by global position */
  notes: Map<number, BufferNote>
  /** Metadata for notes in buffer, keyed by pubkey */
  metadata: Map<string, Metadata>
  /** Thread data for notes in buffer, keyed by note ID */
  threads: Map<string, BufferThread>
  /** Current position in the global feed */
  currentIndex: number
  /** Total known notes in the feed (may be Infinity if unknown) */
  totalNotes: number
  /** Whether we're at the beginning of the feed */
  atBeginning: boolean
  /** Whether we're at the end of the feed */
  atEnd: boolean
  /** Buffer configuration */
  config: BufferConfig
  /** Timestamp when buffer was last updated */
  lastUpdated: number
}

/**
 * Configuration for the feed buffer
 */
export interface BufferConfig {
  /** Number of notes to keep before current position */
  bufferSizeBefore: number
  /** Number of notes to keep after current position */
  bufferSizeAfter: number
  /** Minimum notes to prefetch ahead */
  prefetchThreshold: number
  /** Maximum notes to prefetch in a single batch */
  maxPrefetchBatch: number
  /** Time in ms to consider metadata/threads stale */
  staleThreshold: number
  /** Time in ms between prefetch operations */
  prefetchDebounce: number
}

/**
 * Default buffer configuration
 */
export const DEFAULT_BUFFER_CONFIG: BufferConfig = {
  bufferSizeBefore: 10,
  bufferSizeAfter: 10,
  prefetchThreshold: 3,
  maxPrefetchBatch: 5,
  staleThreshold: 5 * 60 * 1000, // 5 minutes
  prefetchDebounce: 200,
}

/**
 * Direction of buffer movement
 */
export const BufferDirection = {
  FORWARD: 'forward',
  BACKWARD: 'backward',
  NONE: 'none'
} as const

export type BufferDirectionType = typeof BufferDirection[keyof typeof BufferDirection]

/**
 * Result of a buffer operation
 */
export interface BufferOperationResult {
  success: boolean
  newIndex?: number
  notesAdded?: number
  notesRemoved?: number
  error?: string
}

/**
 * Cache keys for buffer data
 */
export interface BufferCacheKeys {
  window: FeedBufferWindowCacheKey
  metadata: FeedBufferMetadataCacheKey
  threads: FeedBufferThreadsCacheKey
}

/**
 * Statistics for buffer performance monitoring
 */
export interface BufferStats {
  totalNotes: number
  cachedNotes: number
  cachedMetadata: number
  cachedThreads: number
  prefetchOperations: number
  cacheHits: number
  cacheMisses: number
  memoryUsage: number // in bytes
  lastCleanup: number
}

/**
 * Events emitted by the buffer manager
 */
export const BufferEventType = {
  NOTE_ADDED: 'note_added',
  NOTE_REMOVED: 'note_removed',
  POSITION_CHANGED: 'position_changed',
  PREFETCH_STARTED: 'prefetch_started',
  PREFETCH_COMPLETED: 'prefetch_completed',
  CACHE_CLEANUP: 'cache_cleanup',
  BUFFER_EXPANDED: 'buffer_expanded',
  BUFFER_SHRUNK: 'buffer_shrunk'
} as const

export type BufferEventTypeType = typeof BufferEventType[keyof typeof BufferEventType]

export interface BufferEvent {
  type: BufferEventTypeType
  timestamp: number
  data?: any
}

/**
 * Options for buffer navigation
 */
export interface BufferNavigationOptions {
  /** Whether to prefetch after navigation */
  prefetch?: boolean
  /** Whether to allow expanding buffer if needed */
  allowExpansion?: boolean
  /** Custom prefetch threshold for this navigation */
  prefetchThreshold?: number
}

/**
 * Result of prefetch operation
 */
export interface PrefetchResult {
  notesFetched: number
  metadataFetched: number
  threadsFetched: number
  duration: number
  errors: string[]
}

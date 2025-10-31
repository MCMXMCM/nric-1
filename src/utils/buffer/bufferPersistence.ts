import type { BufferState, BufferNote } from '../../types/buffer'

/**
 * Persistence configuration for buffer state
 */
export interface BufferPersistenceConfig {
  /** Maximum age of persisted buffer data in milliseconds */
  maxAge: number
  /** Maximum number of notes to persist */
  maxNotes: number
  /** Whether to compress data before storing */
  compress: boolean
  /** Storage key prefix */
  storageKey: string
}

/**
 * Default persistence configuration
 */
export const DEFAULT_PERSISTENCE_CONFIG: BufferPersistenceConfig = {
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  maxNotes: 50, // Store up to 50 notes
  compress: false, // Compression disabled for simplicity
  storageKey: 'nostr-feed-buffer'
}

/**
 * Persisted buffer state structure
 */
export interface PersistedBufferState {
  /** Buffer notes data */
  notes: BufferNote[]
  /** Current index in the buffer */
  currentIndex: number
  /** Total number of notes in the feed */
  totalNotes: number
  /** Whether we're at the beginning of the feed */
  atBeginning: boolean
  /** Whether we're at the end of the feed */
  atEnd: boolean
  /** Timestamp when this state was persisted */
  timestamp: number
  /** Filter hash used for this buffer */
  filterHash: string
  /** Relay key used for this buffer */
  relayKey: string
}

/**
 * Buffer persistence manager
 */
export class BufferPersistenceManager {
  private config: BufferPersistenceConfig

  constructor(config: Partial<BufferPersistenceConfig> = {}) {
    this.config = { ...DEFAULT_PERSISTENCE_CONFIG, ...config }
  }

  /**
   * Save buffer state to persistent storage
   */
  async saveBufferState(
    bufferState: BufferState,
    filterHash: string,
    relayKey: string
  ): Promise<void> {
    try {
      const persistedState: PersistedBufferState = {
        notes: this.prepareNotesForPersistence(Array.from(bufferState.notes.values())),
        currentIndex: bufferState.currentIndex,
        totalNotes: bufferState.totalNotes,
        atBeginning: bufferState.atBeginning,
        atEnd: bufferState.atEnd,
        timestamp: Date.now(),
        filterHash,
        relayKey
      }

      const dataToStore = this.config.compress
        ? await this.compressData(persistedState)
        : JSON.stringify(persistedState)

      const storageKey = this.getStorageKey(filterHash, relayKey)
      localStorage.setItem(storageKey, dataToStore)

      console.log('[BufferPersistence] Saved buffer state:', {
        key: storageKey,
        notesCount: persistedState.notes.length,
        currentIndex: persistedState.currentIndex
      })
    } catch (error) {
      console.error('[BufferPersistence] Failed to save buffer state:', error)
    }
  }

  /**
   * Load buffer state from persistent storage
   */
  async loadBufferState(
    filterHash: string,
    relayKey: string
  ): Promise<PersistedBufferState | null> {
    try {
      const storageKey = this.getStorageKey(filterHash, relayKey)
      const storedData = localStorage.getItem(storageKey)

      if (!storedData) {
        console.log('[BufferPersistence] No persisted buffer state found for:', storageKey)
        return null
      }

      const parsedData = this.config.compress
        ? await this.decompressData(storedData)
        : JSON.parse(storedData)

      // Validate data structure and age
      if (!this.isValidPersistedState(parsedData)) {
        console.warn('[BufferPersistence] Invalid or expired persisted state, removing')
        localStorage.removeItem(storageKey)
        return null
      }

      console.log('[BufferPersistence] Loaded buffer state:', {
        key: storageKey,
        notesCount: parsedData.notes.length,
        currentIndex: parsedData.currentIndex,
        age: Date.now() - parsedData.timestamp
      })

      return parsedData
    } catch (error) {
      console.error('[BufferPersistence] Failed to load buffer state:', error)
      return null
    }
  }

  /**
   * Clear all persisted buffer states
   */
  async clearAllBufferStates(): Promise<void> {
    try {
      const keys = Object.keys(localStorage)
      const bufferKeys = keys.filter(key => key.startsWith(this.config.storageKey))

      bufferKeys.forEach(key => localStorage.removeItem(key))

      console.log('[BufferPersistence] Cleared all buffer states:', bufferKeys.length)
    } catch (error) {
      console.error('[BufferPersistence] Failed to clear buffer states:', error)
    }
  }

  /**
   * Clear expired buffer states
   */
  async clearExpiredStates(): Promise<void> {
    try {
      const keys = Object.keys(localStorage)
      const bufferKeys = keys.filter(key => key.startsWith(this.config.storageKey))
      // const now = Date.now()
      let clearedCount = 0

      for (const key of bufferKeys) {
        try {
          const storedData = localStorage.getItem(key)
          if (storedData) {
            const parsedData = this.config.compress
              ? await this.decompressData(storedData)
              : JSON.parse(storedData)

            if (!this.isValidPersistedState(parsedData)) {
              localStorage.removeItem(key)
              clearedCount++
            }
          }
        } catch (error) {
          // Remove corrupted data
          localStorage.removeItem(key)
          clearedCount++
        }
      }

      if (clearedCount > 0) {
        console.log('[BufferPersistence] Cleared expired buffer states:', clearedCount)
      }
    } catch (error) {
      console.error('[BufferPersistence] Failed to clear expired states:', error)
    }
  }

  /**
   * Get storage usage statistics
   */
  getStorageStats(): { totalKeys: number; totalSize: number; bufferKeys: number; bufferSize: number } {
    try {
      const keys = Object.keys(localStorage)
      const bufferKeys = keys.filter(key => key.startsWith(this.config.storageKey))

      let totalSize = 0
      let bufferSize = 0

      keys.forEach(key => {
        const value = localStorage.getItem(key)
        if (value) {
          totalSize += value.length
          if (key.startsWith(this.config.storageKey)) {
            bufferSize += value.length
          }
        }
      })

      return {
        totalKeys: keys.length,
        totalSize,
        bufferKeys: bufferKeys.length,
        bufferSize
      }
    } catch (error) {
      console.error('[BufferPersistence] Failed to get storage stats:', error)
      return { totalKeys: 0, totalSize: 0, bufferKeys: 0, bufferSize: 0 }
    }
  }

  /**
   * Prepare notes for persistence (limit count, clean up unnecessary data)
   */
  private prepareNotesForPersistence(notes: BufferNote[]): BufferNote[] {
    return notes
      .slice(0, this.config.maxNotes) // Limit number of notes
      .map(note => ({
        ...note,
        // Remove any non-serializable data if needed
        lastAccessed: note.lastAccessed // Keep for LRU purposes
      }))
  }

  /**
   * Generate storage key for specific filter/relay combination
   */
  private getStorageKey(filterHash: string, relayKey: string): string {
    return `${this.config.storageKey}-${filterHash}-${relayKey}`
  }

  /**
   * Validate persisted state structure and age
   */
  private isValidPersistedState(data: any): data is PersistedBufferState {
    if (!data ||
        typeof data !== 'object' ||
        !Array.isArray(data.notes) ||
        typeof data.currentIndex !== 'number' ||
        typeof data.timestamp !== 'number') {
      return false
    }

    // Check if data is too old
    const age = Date.now() - data.timestamp
    if (age > this.config.maxAge) {
      return false
    }

    return true
  }

  /**
   * Compress data before storing (placeholder - can be enhanced with actual compression)
   */
  private async compressData(data: PersistedBufferState): Promise<string> {
    // For now, just return JSON string
    // In a real implementation, you might use LZString or similar
    return JSON.stringify(data)
  }

  /**
   * Decompress data after loading (placeholder - can be enhanced with actual decompression)
   */
  private async decompressData(data: string): Promise<PersistedBufferState> {
    // For now, just parse JSON
    // In a real implementation, you might use LZString or similar
    return JSON.parse(data)
  }
}

/**
 * Singleton instance for easy access
 */
export const bufferPersistenceManager = new BufferPersistenceManager()

/**
 * Hook for buffer persistence operations
 */
export function useBufferPersistence() {
  return {
    saveBufferState: bufferPersistenceManager.saveBufferState.bind(bufferPersistenceManager),
    loadBufferState: bufferPersistenceManager.loadBufferState.bind(bufferPersistenceManager),
    clearAllBufferStates: bufferPersistenceManager.clearAllBufferStates.bind(bufferPersistenceManager),
    clearExpiredStates: bufferPersistenceManager.clearExpiredStates.bind(bufferPersistenceManager),
    getStorageStats: bufferPersistenceManager.getStorageStats.bind(bufferPersistenceManager)
  }
}

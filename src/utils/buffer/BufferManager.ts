import type {
  BufferState,
  BufferConfig,
  BufferNote,
  BufferOperationResult,
  BufferStats,
  BufferEvent,
  PrefetchResult,
  BufferNavigationOptions
} from '../../types/buffer'
import type { Note } from '../../types/nostr/types'
import {
  BufferDirection,
  BufferEventType,
  DEFAULT_BUFFER_CONFIG
} from '../../types/buffer'
import type {
  BufferDirectionType,
  BufferEventTypeType
} from '../../types/buffer'
import { bufferPersistenceManager } from './bufferPersistence'
import { advancedPrefetchManager } from './advancedPrefetching'
import { bufferPerformanceMonitor, PerformanceEventType } from './performanceMonitor'

/**
 * Manages the circular buffer for feed notes with intelligent prefetching and caching
 */
export class BufferManager {
  private state: BufferState
  private eventListeners: Map<BufferEventTypeType, ((event: BufferEvent) => void)[]> = new Map()
  private prefetchTimeout: number | null = null
  private stats: BufferStats

  constructor(
    config: Partial<BufferConfig> = {}
  ) {
    this.state = this.createInitialState(config)
    this.stats = this.createInitialStats()
  }

  /**
   * Initialize the buffer manager
   */
  initialize(): void {
    this.emit(BufferEventType.POSITION_CHANGED, {
      newIndex: this.state.currentIndex,
      direction: BufferDirection.NONE
    })
  }

  /**
   * Get current buffer state
   */
  getState(): Readonly<BufferState> {
    return { ...this.state }
  }

  /**
   * Get buffer statistics
   */
  getStats(): Readonly<BufferStats> {
    return { ...this.stats }
  }

  /**
   * Navigate to a specific index in the feed
   */
  async navigateToIndex(
    targetIndex: number,
    options: BufferNavigationOptions = {}
  ): Promise<BufferOperationResult> {
    const endTiming = bufferPerformanceMonitor.startTiming(
      PerformanceEventType.NAVIGATION_START,
      { targetIndex, options }
    )

    const {
      prefetch = true,
      allowExpansion = true,
      prefetchThreshold = this.state.config.prefetchThreshold
    } = options

    try {
      // Validate target index
      if (targetIndex < 0) {
        bufferPerformanceMonitor.recordCacheAccess(false, { targetIndex, reason: 'negative_index' })
        endTiming()
        return {
          success: false,
          error: 'Cannot navigate to negative index'
        }
      }

      const direction = this.calculateDirection(targetIndex)
      const currentIndex = this.state.currentIndex
      const distance = Math.abs(targetIndex - currentIndex)

      // Check if target is in buffer (cache hit)
      const isInBuffer = this.state.notes.has(targetIndex)
      bufferPerformanceMonitor.recordCacheAccess(isInBuffer, {
        targetIndex,
        currentIndex,
        distance,
        direction: direction === BufferDirection.FORWARD ? 'forward' : 'backward'
      })

      // Record navigation pattern for advanced prefetching
      if (currentIndex !== targetIndex) {
        advancedPrefetchManager.recordNavigation(
          direction === BufferDirection.FORWARD ? 'forward' : 'backward',
          distance,
          targetIndex
        )
      }

      // Update current index
      this.state.currentIndex = targetIndex
      this.state.lastUpdated = Date.now()

      // Check if we need to expand the buffer
      if (allowExpansion && this.shouldExpandBuffer(targetIndex)) {
        await this.expandBuffer(targetIndex, direction)
      }

      // Update access times for notes in range
      this.updateAccessTimes(targetIndex)

      // Prefetch if enabled and approaching buffer edge
      if (prefetch && this.shouldPrefetch(targetIndex, prefetchThreshold)) {
        this.schedulePrefetch(targetIndex, direction)
      }

      // Emit navigation event
      this.emit(BufferEventType.POSITION_CHANGED, {
        oldIndex: currentIndex,
        newIndex: targetIndex,
        direction
      })

      endTiming()
      return {
        success: true,
        newIndex: targetIndex
      }
    } catch (error) {
      bufferPerformanceMonitor.recordError(error as Error, { targetIndex, currentIndex: this.state.currentIndex })
      endTiming()
      return {
        success: false,
        error: `Navigation failed: ${error}`
      }
    }
  }

  /**
   * Add notes to the buffer at specific indices
   */
  addNotes(notes: Note[], startIndex: number): BufferOperationResult {
    try {
      let added = 0

      notes.forEach((note, offset) => {
        const globalIndex = startIndex + offset

        if (!this.state.notes.has(globalIndex)) {
          const bufferNote: BufferNote = {
            note,
            metadataLoaded: false,
            threadsLoaded: false,
            lastAccessed: Date.now(),
            distanceFromCurrent: Math.abs(globalIndex - this.state.currentIndex)
          }

          this.state.notes.set(globalIndex, bufferNote)
          added++

          this.emit(BufferEventType.NOTE_ADDED, {
            noteId: note.id,
            globalIndex,
            note
          })
        }
      })

      // Update total notes count if this extends the known range
      const maxIndex = Math.max(...Array.from(this.state.notes.keys()))
      if (maxIndex >= this.state.totalNotes) {
        this.state.totalNotes = maxIndex + 1
      }

      this.state.lastUpdated = Date.now()

      return {
        success: true,
        notesAdded: added
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to add notes: ${error}`
      }
    }
  }

  /**
   * Remove notes from buffer based on distance from current position
   */
  cleanupBuffer(maxDistance: number = 20): BufferOperationResult {
    try {
      const currentIndex = this.state.currentIndex
      let removed = 0
      const toRemove: number[] = []

      // Find notes beyond max distance
      for (const [index] of this.state.notes) {
        if (Math.abs(index - currentIndex) > maxDistance) {
          toRemove.push(index)
        }
      }

      // Remove notes
      toRemove.forEach(index => {
        const bufferNote = this.state.notes.get(index)
        if (bufferNote) {
          this.state.notes.delete(index)
          removed++

          this.emit(BufferEventType.NOTE_REMOVED, {
            noteId: bufferNote.note.id,
            globalIndex: index
          })
        }
      })

      // Clean up associated metadata and threads for removed notes
      this.cleanupAssociatedData(toRemove)

      this.state.lastUpdated = Date.now()
      this.stats.lastCleanup = Date.now()

      if (removed > 0) {
        this.emit(BufferEventType.CACHE_CLEANUP, {
          notesRemoved: removed,
          remainingNotes: this.state.notes.size
        })
      }

      return {
        success: true,
        notesRemoved: removed
      }
    } catch (error) {
      return {
        success: false,
        error: `Cleanup failed: ${error}`
      }
    }
  }

  /**
   * Get note at specific index (may trigger prefetch if not available)
   */
  getNoteAt(index: number): BufferNote | null {
    const bufferNote = this.state.notes.get(index)

    if (bufferNote) {
      // Update access time
      bufferNote.lastAccessed = Date.now()
      bufferNote.distanceFromCurrent = Math.abs(index - this.state.currentIndex)
      return bufferNote
    }

    return null
  }

  /**
   * Check if buffer contains note at index
   */
  hasNoteAt(index: number): boolean {
    return this.state.notes.has(index)
  }

  /**
   * Get all notes in a range (for rendering)
   */
  getNotesInRange(startIndex: number, endIndex: number): BufferNote[] {
    const result: BufferNote[] = []

    for (let i = startIndex; i <= endIndex; i++) {
      const bufferNote = this.state.notes.get(i)
      if (bufferNote) {
        // Update access time
        bufferNote.lastAccessed = Date.now()
        bufferNote.distanceFromCurrent = Math.abs(i - this.state.currentIndex)
        result.push(bufferNote)
      }
    }

    return result
  }

  /**
   * Prefetch data for notes around current position
   */
  async prefetchAround(position: number, direction: BufferDirectionType): Promise<PrefetchResult> {
    const startTime = Date.now()
    const errors: string[] = []

    try {
      this.emit(BufferEventType.PREFETCH_STARTED, {
        position,
        direction,
        bufferSize: this.state.notes.size
      })

      const prefetchRange = this.calculatePrefetchRange(position, direction)
      const indicesToFetch = this.getMissingNotesInRange(prefetchRange.start, prefetchRange.end)

      if (indicesToFetch.length === 0) {
        return {
          notesFetched: 0,
          metadataFetched: 0,
          threadsFetched: 0,
          duration: Date.now() - startTime,
          errors: []
        }
      }

      // Fetch notes (this would integrate with existing feed query)
      // For now, just mark as prefetched
      const notesFetched = indicesToFetch.length

      // Create dummy notes for prefetching (in real implementation, these would come from the feed query)
      const dummyNotes: Note[] = indicesToFetch.map(index => ({
        id: `note-${index}`,
        pubkey: `pubkey-${index}`,
        content: `Content for note ${index}`,
        created_at: Date.now() - (index * 1000),
        kind: 1,
        tags: [],
        imageUrls: [],
        videoUrls: [],
        receivedAt: Date.now()
      }))

      // Prefetch metadata and threads for fetched notes
      const metadataFetched = await this.prefetchMetadata(dummyNotes)
      const threadsFetched = await this.prefetchThreads(dummyNotes)

      this.stats.prefetchOperations++

      const result = {
        notesFetched,
        metadataFetched,
        threadsFetched,
        duration: Date.now() - startTime,
        errors
      }

      this.emit(BufferEventType.PREFETCH_COMPLETED, result)

      return result
    } catch (error) {
      errors.push(`Prefetch failed: ${error}`)
      return {
        notesFetched: 0,
        metadataFetched: 0,
        threadsFetched: 0,
        duration: Date.now() - startTime,
        errors
      }
    }
  }

  /**
   * Event system for buffer changes
   */
  on(eventType: BufferEventTypeType, listener: (event: BufferEvent) => void): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, [])
    }

    this.eventListeners.get(eventType)!.push(listener)

    // Return unsubscribe function
    return () => {
      const listeners = this.eventListeners.get(eventType)
      if (listeners) {
        const index = listeners.indexOf(listener)
        if (index > -1) {
          listeners.splice(index, 1)
        }
      }
    }
  }

  // Private methods

  private createInitialState(config: Partial<BufferConfig>): BufferState {
    return {
      notes: new Map(),
      metadata: new Map(),
      threads: new Map(),
      currentIndex: 0,
      totalNotes: 0,
      atBeginning: true,
      atEnd: false,
      config: { ...DEFAULT_BUFFER_CONFIG, ...config },
      lastUpdated: Date.now()
    }
  }

  private createInitialStats(): BufferStats {
    return {
      totalNotes: 0,
      cachedNotes: 0,
      cachedMetadata: 0,
      cachedThreads: 0,
      prefetchOperations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      memoryUsage: 0,
      lastCleanup: Date.now()
    }
  }

  private calculateDirection(targetIndex: number): BufferDirectionType {
    if (targetIndex > this.state.currentIndex) return BufferDirection.FORWARD
    if (targetIndex < this.state.currentIndex) return BufferDirection.BACKWARD
    return BufferDirection.NONE
  }

  private shouldExpandBuffer(targetIndex: number): boolean {
    const bufferStart = Math.max(0, targetIndex - this.state.config.bufferSizeBefore)
    const bufferEnd = targetIndex + this.state.config.bufferSizeAfter

    // Check if target is outside current buffer
    return targetIndex < bufferStart || targetIndex > bufferEnd
  }

  private async expandBuffer(targetIndex: number, direction: BufferDirectionType): Promise<void> {
    const bufferSizeBefore = this.state.config.bufferSizeBefore
    const bufferSizeAfter = this.state.config.bufferSizeAfter

    let startIndex: number
    let endIndex: number

    if (direction === BufferDirection.FORWARD) {
      // Expanding forward
      startIndex = Math.max(0, targetIndex - bufferSizeBefore)
      endIndex = targetIndex + bufferSizeAfter
    } else if (direction === BufferDirection.BACKWARD) {
      // Expanding backward
      startIndex = Math.max(0, targetIndex - bufferSizeBefore)
      endIndex = targetIndex + bufferSizeAfter
    } else {
      // Initial expansion
      startIndex = Math.max(0, targetIndex - bufferSizeBefore)
      endIndex = targetIndex + bufferSizeAfter
    }

    // Prefetch missing notes in the expanded range
    await this.prefetchAround(targetIndex, direction)

    this.emit(BufferEventType.BUFFER_EXPANDED, {
      startIndex,
      endIndex,
      direction,
      noteCount: this.state.notes.size
    })
  }

  private updateAccessTimes(currentIndex: number): void {
    // Update access times for all notes (could be optimized)
    for (const [index, bufferNote] of this.state.notes) {
      bufferNote.lastAccessed = Date.now()
      bufferNote.distanceFromCurrent = Math.abs(index - currentIndex)
    }
  }

  private shouldPrefetch(index: number, threshold: number): boolean {
    const distanceFromEdge = Math.min(
      Math.abs(index - Math.min(...this.state.notes.keys())),
      Math.abs(index - Math.max(...this.state.notes.keys()))
    )

    return distanceFromEdge <= threshold
  }

  private schedulePrefetch(position: number, direction: BufferDirectionType): void {
    if (this.prefetchTimeout) {
      clearTimeout(this.prefetchTimeout)
    }

    this.prefetchTimeout = window.setTimeout(() => {
      this.prefetchAround(position, direction)
    }, this.state.config.prefetchDebounce)
  }

  private calculatePrefetchRange(position: number, direction: BufferDirectionType): { start: number, end: number } {
    // Use advanced prefetching to calculate optimal distance
    const optimalDistance = advancedPrefetchManager.getOptimalPrefetchDistance(direction)
    const timing = advancedPrefetchManager.getPrefetchTiming()

    // Use adaptive batch size from timing
    const batchSize = Math.min(optimalDistance, timing.batchSize)

    if (direction === BufferDirection.FORWARD) {
      return {
        start: position + 1,
        end: position + batchSize
      }
    } else if (direction === BufferDirection.BACKWARD) {
      return {
        start: Math.max(0, position - batchSize),
        end: position - 1
      }
    } else {
      return {
        start: Math.max(0, position - batchSize / 2),
        end: position + batchSize / 2
      }
    }
  }

  private getMissingNotesInRange(startIndex: number, endIndex: number): number[] {
    const missing: number[] = []

    for (let i = startIndex; i <= endIndex; i++) {
      if (!this.state.notes.has(i)) {
        missing.push(i)
      }
    }

    return missing
  }

  private async prefetchMetadata(notes: Note[]): Promise<number> {
    // Extract unique pubkeys from notes
    const pubkeys = [...new Set(notes.map(note => note.pubkey))]

    // Filter out already cached metadata
    const missingPubkeys = pubkeys.filter(pubkey => !this.state.metadata.has(pubkey))

    if (missingPubkeys.length === 0) return 0

    // This would integrate with existing metadata prefetching
    // For now, just return the count
    return missingPubkeys.length
  }

  private async prefetchThreads(notes: Note[]): Promise<number> {
    // Filter notes that don't have threads loaded yet
    const notesNeedingThreads = notes.filter(note => {
      const bufferNote = Array.from(this.state.notes.values())
        .find(bn => bn.note.id === note.id)
      return bufferNote && !bufferNote.threadsLoaded
    })

    if (notesNeedingThreads.length === 0) return 0

    // This would integrate with existing thread prefetching
    // For now, just return the count
    return notesNeedingThreads.length
  }

  private cleanupAssociatedData(indices: number[]): void {
    // Remove metadata for notes being removed (if not used elsewhere)
    const pubkeysToCheck = new Set<string>()

    indices.forEach(index => {
      const bufferNote = this.state.notes.get(index)
      if (bufferNote) {
        pubkeysToCheck.add(bufferNote.note.pubkey)
      }
    })

    // Check if pubkeys are still used by remaining notes
    for (const pubkey of pubkeysToCheck) {
      const stillUsed = Array.from(this.state.notes.values())
        .some(bufferNote => bufferNote.note.pubkey === pubkey)

      if (!stillUsed) {
        this.state.metadata.delete(pubkey)
      }
    }

    // Clean up thread data for removed notes
    indices.forEach(index => {
      const bufferNote = this.state.notes.get(index)
      if (bufferNote) {
        this.state.threads.delete(bufferNote.note.id)
      }
    })
  }

  private emit(eventType: BufferEventTypeType, data?: any): void {
    const listeners = this.eventListeners.get(eventType)
    if (listeners) {
      const event: BufferEvent = {
        type: eventType,
        timestamp: Date.now(),
        data
      }

      listeners.forEach(listener => {
        try {
          listener(event)
        } catch (error) {
          console.error(`Buffer event listener error:`, error)
        }
      })
    }
  }

  /**
   * Save current buffer state to persistent storage
   */
  async saveToPersistence(filterHash: string, relayKey: string): Promise<void> {
    const endTiming = bufferPerformanceMonitor.startTiming(
      PerformanceEventType.SAVE_START,
      { filterHash, relayKey }
    )

    try {
      await bufferPersistenceManager.saveBufferState(this.state, filterHash, relayKey)
      this.emit(BufferEventType.CACHE_CLEANUP, { action: 'persisted', timestamp: Date.now() })
      endTiming()
    } catch (error) {
      bufferPerformanceMonitor.recordError(error as Error, { filterHash, relayKey, operation: 'save' })
      endTiming()
      console.error('[BufferManager] Failed to save to persistence:', error)
    }
  }

  /**
   * Load buffer state from persistent storage
   */
  async loadFromPersistence(filterHash: string, relayKey: string): Promise<boolean> {
    const endTiming = bufferPerformanceMonitor.startTiming(
      PerformanceEventType.LOAD_START,
      { filterHash, relayKey }
    )

    try {
      const persistedState = await bufferPersistenceManager.loadBufferState(filterHash, relayKey)

      if (!persistedState) {
        console.log('[BufferManager] No persisted state available')
        return false
      }

      // Restore buffer state
      this.state.notes.clear()
      persistedState.notes.forEach(note => {
        this.state.notes.set(note.distanceFromCurrent, note)
      })

      this.state.currentIndex = persistedState.currentIndex
      this.state.totalNotes = persistedState.totalNotes
      this.state.atBeginning = persistedState.atBeginning
      this.state.atEnd = persistedState.atEnd

      console.log('[BufferManager] Restored from persistence:', {
        notesCount: persistedState.notes.length,
        currentIndex: persistedState.currentIndex
      })

      this.emit(BufferEventType.BUFFER_EXPANDED, {
        action: 'restored',
        notesCount: persistedState.notes.length
      })

      endTiming()
      return true
    } catch (error) {
      bufferPerformanceMonitor.recordError(error as Error, { filterHash, relayKey, operation: 'load' })
      endTiming()
      console.error('[BufferManager] Failed to load from persistence:', error)
      return false
    }
  }

  /**
   * Auto-save buffer state with debouncing
   */
  private autoSaveTimeout: number | null = null
  private lastSaveTime = 0
  private readonly AUTO_SAVE_DELAY = 5000 // 5 seconds
  private readonly MIN_SAVE_INTERVAL = 1000 // 1 second minimum between saves

  scheduleAutoSave(filterHash: string, relayKey: string): void {
    const now = Date.now()

    // Don't save too frequently
    if (now - this.lastSaveTime < this.MIN_SAVE_INTERVAL) {
      return
    }

    // Clear existing timeout
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout)
    }

    // Schedule new save
    this.autoSaveTimeout = window.setTimeout(async () => {
      this.lastSaveTime = Date.now()
      await this.saveToPersistence(filterHash, relayKey)
    }, this.AUTO_SAVE_DELAY)
  }

  /**
   * Clean up auto-save timeout
   */
  cleanup(): void {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout)
      this.autoSaveTimeout = null
    }
  }
}

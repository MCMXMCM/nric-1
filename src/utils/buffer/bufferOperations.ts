import type { BufferNote, BufferOperationResult } from '../../types/buffer'
import type { Note } from '../../types/nostr/types'
import { BufferDirection } from '../../types/buffer'
import type { BufferManager } from './BufferManager'

/**
 * Basic buffer operations for feed management
 */
export class BufferOperations {
  private bufferManager: BufferManager

  constructor(bufferManager: BufferManager) {
    this.bufferManager = bufferManager
  }

  /**
   * Add a single note to the buffer at a specific index
   */
  addNote(note: Note, globalIndex: number): BufferOperationResult {
    return this.bufferManager.addNotes([note], globalIndex)
  }

  /**
   * Add multiple notes to the buffer starting at a specific index
   */
  addNotesBatch(notes: Note[], startIndex: number): BufferOperationResult {
    return this.bufferManager.addNotes(notes, startIndex)
  }

  /**
   * Get note at specific index if available in buffer
   */
  getNoteAt(index: number): BufferNote | null {
    return this.bufferManager.getNoteAt(index)
  }

  /**
   * Check if a note exists at the specified index
   */
  hasNoteAt(index: number): boolean {
    return this.bufferManager.hasNoteAt(index)
  }

  /**
   * Get notes in a range for rendering
   */
  getNotesInRange(startIndex: number, endIndex: number): BufferNote[] {
    return this.bufferManager.getNotesInRange(startIndex, endIndex)
  }

  /**
   * Navigate to a specific index with optional prefetching
   */
  async navigateToIndex(index: number, prefetch: boolean = true): Promise<BufferOperationResult> {
    return this.bufferManager.navigateToIndex(index, { prefetch })
  }

  /**
   * Navigate forward by specified steps
   */
  async navigateForward(steps: number = 1): Promise<BufferOperationResult> {
    return this.bufferManager.navigateToIndex(
      this.bufferManager.getState().currentIndex + steps,
      { prefetch: true }
    )
  }

  /**
   * Navigate backward by specified steps
   */
  async navigateBackward(steps: number = 1): Promise<BufferOperationResult> {
    return this.bufferManager.navigateToIndex(
      Math.max(0, this.bufferManager.getState().currentIndex - steps),
      { prefetch: true }
    )
  }

  /**
   * Clean up buffer by removing notes beyond specified distance
   */
  cleanupBuffer(maxDistance: number = 20): BufferOperationResult {
    return this.bufferManager.cleanupBuffer(maxDistance)
  }

  /**
   * Get current buffer state
   */
  getBufferState() {
    return this.bufferManager.getState()
  }

  /**
   * Get buffer statistics
   */
  getBufferStats() {
    return this.bufferManager.getStats()
  }

  /**
   * Prefetch data around current position
   */
  async prefetchAroundCurrent(): Promise<void> {
    const state = this.bufferManager.getState()
    await this.bufferManager.prefetchAround(state.currentIndex, BufferDirection.FORWARD)
  }

  /**
   * Check if buffer should expand for navigation to target index
   */
  shouldExpandForIndex(targetIndex: number): boolean {
    const state = this.bufferManager.getState()
    const bufferStart = Math.max(0, state.currentIndex - state.config.bufferSizeBefore)
    const bufferEnd = state.currentIndex + state.config.bufferSizeAfter

    return targetIndex < bufferStart || targetIndex > bufferEnd
  }

  /**
   * Get buffer coverage info for debugging
   */
  getBufferCoverage(): {
    currentIndex: number
    bufferStart: number
    bufferEnd: number
    notesInBuffer: number
    coverage: number // percentage of buffer that's filled
  } {
    const state = this.bufferManager.getState()
    const bufferStart = Math.max(0, state.currentIndex - state.config.bufferSizeBefore)
    const bufferEnd = state.currentIndex + state.config.bufferSizeAfter
    const bufferSize = bufferEnd - bufferStart + 1
    const notesInBuffer = state.notes.size

    return {
      currentIndex: state.currentIndex,
      bufferStart,
      bufferEnd,
      notesInBuffer,
      coverage: bufferSize > 0 ? (notesInBuffer / bufferSize) * 100 : 0
    }
  }
}

/**
 * Factory function to create buffer operations
 */
export function createBufferOperations(bufferManager: BufferManager): BufferOperations {
  return new BufferOperations(bufferManager)
}

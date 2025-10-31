import { type Event, type Filter } from 'nostr-tools'
import type { Note } from '../types/nostr/types'
import { getGlobalRelayPool } from './nostr/relayConnectionPool'

/**
 * Extract note IDs from events (lightweight operation)
 */
export function extractNoteIds(events: Event[]): string[] {
  return events.map(event => event.id)
}

/**
 * Convert events to Note objects
 */
export function eventsToNotes(events: Event[]): Note[] {
  return events.map(event => ({
    id: event.id,
    content: event.content || '',
    pubkey: event.pubkey,
    created_at: event.created_at,
    tags: event.tags || [],
    imageUrls: [],
    videoUrls: [],
    receivedAt: Date.now(),
  }))
}

/**
 * Fetch note IDs from relays (lightweight - just IDs, not full content)
 */
export async function fetchNoteIds(
  relayUrls: string[],
  filter: Filter
): Promise<string[]> {
  const pool = getGlobalRelayPool()
  try {
    const events: Event[] = await pool.querySync(relayUrls, filter)
    return extractNoteIds(events)
  } catch (error) {
    console.warn('Error fetching note IDs:', error)
    return []
  }
}

/**
 * Fetch full notes from relays and cache them individually
 */
export async function fetchAndCacheNotes(
  relayUrls: string[],
  filter: Filter,
  queryClient: any
): Promise<Note[]> {
  const pool = getGlobalRelayPool()
  try {
    const events: Event[] = await pool.querySync(relayUrls, filter)
    const notes = eventsToNotes(events)
    
    // Cache each note individually
    for (const note of notes) {
      queryClient.setQueryData(['note', note.id], note)
    }
    
    return notes
  } catch (error) {
    console.warn('Error fetching and caching notes:', error)
    return []
  }
}

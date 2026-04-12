import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { NostrFilter, NostrEvent } from '@nostrify/nostrify'
import { type Event, type Filter } from 'nostr-tools'
import { RelayConnectionPool } from '../utils/nostr/relayConnectionPool'
import type { Note } from '../types/nostr/types'
import { CACHE_KEYS } from '../utils/cacheKeys'
import { queryWithNostrifyPoolFallback } from '../utils/nostr/nostrifyPoolQuery'
import { startFeedMetric } from '../utils/nostr/feedPerformanceMetrics'

interface UseNoteOptions {
  noteId: string
  relayUrls: string[]
  enabled?: boolean
  poolRef: React.MutableRefObject<RelayConnectionPool | null>
  buildAugmentedRelays: (relayUrls: string[], tags?: any[]) => string[]
  hintTags?: any[]
}

interface UseNoteResult {
  note: Note | null
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

export function useNote({
  noteId,
  relayUrls,
  enabled = true,
  poolRef,
  buildAugmentedRelays,
  hintTags,
}: UseNoteOptions): UseNoteResult {

  const queryClient = useQueryClient();
  const queryKey = CACHE_KEYS.NOTE(noteId)

  const { data: note = null, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<Note | null> => {
      const finishNoteMetric = startFeedMetric('note_load', {
        noteId: noteId.slice(0, 8),
        relays: relayUrls.length,
      });
      if (!noteId || !relayUrls || relayUrls.length === 0) {
        finishNoteMetric({ status: 'skipped' });
        return null
      }

      // First check if we already have this note cached from feed loading
      const cachedNote = queryClient.getQueryData<Note>(queryKey)
      if (cachedNote) {
        console.log(`📋 Using cached note for ${noteId.slice(0, 8)}`)
        finishNoteMetric({ status: 'cache_hit' });
        return cachedNote
      }

      console.log(`🔍 Fetching note ${noteId.slice(0, 8)} from relays`)

      const filter: NostrFilter = {
        kinds: [1],
        ids: [noteId],
        limit: 1,
      }

      const augmentedRelays = buildAugmentedRelays(relayUrls, hintTags).slice(0, 12)
      const primaryRelayUrls = relayUrls.slice(0, 12)
      const pool = poolRef.current
      if (!pool) {
        throw new Error('Relay pool not initialized')
      }

      try {
        let events: Array<NostrEvent | Event> = []

        const queryWithFallback = async (relaysToUse: string[]) => {
          return queryWithNostrifyPoolFallback<NostrEvent | Event>(
            [filter],
            () => pool.querySync(relaysToUse, filter as unknown as Filter)
          )
        }

        events = await queryWithFallback(augmentedRelays)

        // If no events found with augmented relays, try with original relays only
        if (events.length === 0 && augmentedRelays.length !== primaryRelayUrls.length) {
          console.log(`🔄 Retrying note fetch with original relays only`)
          events = await queryWithFallback(primaryRelayUrls)
        }

        // If still no events, optionally try with popular relays as fallback
        // Gate this path to reduce background REQs: only when document is visible
        // and after a small delay so primary relays get priority.
        if (events.length === 0 && typeof document !== 'undefined' && !document.hidden) {
          await new Promise((r) => setTimeout(r, 250));
          console.log(`🔄 Retrying note fetch with popular relays (visible, delayed)`)
          const popularRelays = [
            'wss://nos.lol',
            'wss://relay.snort.social',
            'wss://nostr.mom'
          ]
          events = await queryWithFallback(popularRelays)
        }

        if (events.length === 0) {
          console.warn(`❌ Note ${noteId.slice(0, 8)} not found on any relay`)
          finishNoteMetric({ status: 'empty' });
          return null
        }

        const event = events[0]
        const mappedNote: Note = {
          id: event.id,
          content: event.content || '',
          pubkey: event.pubkey,
          created_at: event.created_at,
          tags: event.tags || [],
          imageUrls: [],
          videoUrls: [],
          receivedAt: Date.now(),
        }

        console.log(`✅ Successfully fetched note ${noteId.slice(0, 8)}`)
        finishNoteMetric({ status: 'ok', eventCount: events.length });
        return mappedNote
      } catch (error) {
        console.error(`❌ Failed to fetch note ${noteId.slice(0, 8)}:`, error)
        finishNoteMetric({ status: 'error', error: (error as Error)?.message ?? 'unknown' });
        throw error
      }
    },
    enabled: enabled && !!noteId && relayUrls.length > 0,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 4 * 60 * 1000, // 4 minutes
    retry: (failureCount) => {
      // Retry up to 2 times for network errors
      if (failureCount < 2) {
        console.log(`🔄 Retrying note fetch (attempt ${failureCount + 1})`)
        return true
      }
      return false
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    // Add placeholderData to show cached data immediately while fetching
    placeholderData: () => queryClient.getQueryData<Note>(queryKey),
  })

  return {
    note,
    isLoading,
    error: error as Error | null,
    refetch,
  }
}

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { NostrFilter, NostrEvent } from '@nostrify/nostrify'
import { type Event, type Filter } from 'nostr-tools'
import { RelayConnectionPool } from '../utils/nostr/relayConnectionPool'
import type { Note } from '../types/nostr/types'
import { CACHE_KEYS } from '../utils/cacheKeys'
import { useRelayConnectionStatus } from './useRelayConnectionStatus'

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
  const { hasMinimumConnections } = useRelayConnectionStatus();

  const { data: note = null, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<Note | null> => {
      if (!noteId || !relayUrls || relayUrls.length === 0) {
        return null
      }

      // First check if we already have this note cached from feed loading
      const cachedNote = queryClient.getQueryData<Note>(queryKey)
      if (cachedNote) {
        console.log(`📋 Using cached note for ${noteId.slice(0, 8)}`)
        return cachedNote
      }

      console.log(`🔍 Fetching note ${noteId.slice(0, 8)} from relays`)

      const filter: NostrFilter = {
        kinds: [1],
        ids: [noteId],
        limit: 1,
      }

      const augmentedRelays = buildAugmentedRelays(relayUrls, hintTags)
      // Prefer Nostrify pool when available
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nostrifyPool: any = (globalThis as any).__nostrifyPool
      const pool = poolRef.current!

      try {
        let events: Array<NostrEvent | Event> = []

        const queryWithFallback = async (relaysToUse: string[]) => {
          if (nostrifyPool) {
            try {
              return await nostrifyPool.query([filter])
            } catch (e: any) {
              if (typeof e?.message === 'string' && e.message.includes('Nostrify pool not ready')) {
                // Fall back to legacy pool when Nostrify exists but isn't ready yet
                return await pool.querySync(relaysToUse, filter as unknown as Filter)
              }
              throw e
            }
          }
          return await pool.querySync(relaysToUse, filter as unknown as Filter)
        }

        events = await queryWithFallback(augmentedRelays)

        // If no events found with augmented relays, try with original relays only
        if (events.length === 0 && augmentedRelays.length !== relayUrls.length) {
          console.log(`🔄 Retrying note fetch with original relays only`)
          events = await queryWithFallback(relayUrls)
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
            'wss://nostr.mom',
            'wss://purplepag.es',
            'wss://relay.nostr.band'
          ]
          events = await queryWithFallback(popularRelays)
        }

        if (events.length === 0) {
          console.warn(`❌ Note ${noteId.slice(0, 8)} not found on any relay`)
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
        return mappedNote
      } catch (error) {
        console.error(`❌ Failed to fetch note ${noteId.slice(0, 8)}:`, error)
        throw error
      }
    },
    enabled: enabled && !!noteId && relayUrls.length > 0 && hasMinimumConnections,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
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

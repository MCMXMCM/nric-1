import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { type Event, type Filter } from 'nostr-tools'
import { RelayConnectionPool } from '../utils/nostr/relayConnectionPool'
import type { Contact } from '../types/nostr/types'
import { CACHE_KEYS } from '../utils/cacheKeys'

// Note: Removed unused import

interface UseContactsOptions {
  pubkey: string
  relayUrls: string[]
  enabled?: boolean
  poolRef: React.MutableRefObject<RelayConnectionPool | null>
}

interface UseContactsResult {
  contacts: Contact[]
  isLoading: boolean
  error: Error | null
  refetch: () => void
  updateContacts: (newContacts: Contact[]) => void
}

export function useContacts({
  pubkey,
  relayUrls,
  enabled = true,
  poolRef,
}: UseContactsOptions): UseContactsResult {
  const queryClient = useQueryClient()
;
  const queryKey = CACHE_KEYS.CONTACTS(pubkey)

  const { data: contacts = [], isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<Contact[]> => {
      if (!pubkey || !relayUrls || relayUrls.length === 0) {
        return []
      }

      // First check if we already have this contacts list cached
      const cachedContacts = queryClient.getQueryData<Contact[]>(queryKey);
      if (cachedContacts) {
        console.log(`📋 Using cached contacts for ${pubkey.slice(0, 8)}`);
        return cachedContacts;
      }

      // Decode npub if needed
      let decodedPubkey = pubkey
      try {
        if (pubkey.startsWith('npub')) {
          const { nip19 } = await import('nostr-tools')
          const decoded = nip19.decode(pubkey)
          if (decoded.type === 'npub') {
            decodedPubkey = decoded.data
          }
        }
        // Ensure pubkey is in correct format
        if (decodedPubkey.length !== 64 || !/^[0-9a-fA-F]+$/.test(decodedPubkey)) {
          throw new Error('Invalid pubkey format')
        }
      } catch (e) {
        throw new Error('Invalid pubkey format. Please enter a valid 64-character hex pubkey or npub.')
      }

      const filter: Filter = {
        kinds: [3],
        authors: [decodedPubkey],
        limit: 1,
      }

      const pool = poolRef.current!
      const events: Event[] = await pool.querySync(relayUrls, filter)

      if (events.length === 0) {
        return []
      }

      const event = events[0]
      const contacts: Contact[] = []

      // Parse contact list from event tags
      for (const tag of event.tags || []) {
        if (tag[0] === 'p' && tag[1]) {
          contacts.push({
            pubkey: tag[1],
            relay: tag[2] || '',
            petname: tag[3] || '',
          })
        }
      }

      return contacts
    },
    enabled: enabled && !!pubkey && relayUrls.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    // Show cached data immediately while fetching
    placeholderData: () => queryClient.getQueryData<Contact[]>(queryKey),
  })

  const updateContactsMutation = useMutation({
    mutationFn: async (newContacts: Contact[]) => {
      // This would typically involve publishing a new contact list event
      // For now, we'll just update the cache
      return newContacts
    },
    onSuccess: (newContacts) => {
      // Update the cache with the new contacts
      queryClient.setQueryData(queryKey, newContacts)
    },
  })

  const updateContacts = (newContacts: Contact[]) => {
    updateContactsMutation.mutate(newContacts)
  }

  return {
    contacts,
    isLoading,
    error: error as Error | null,
    refetch,
    updateContacts,
  }
}

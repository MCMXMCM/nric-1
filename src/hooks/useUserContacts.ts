import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useContext, useCallback } from 'react'
import { type Event, type Filter } from 'nostr-tools'
import { getGlobalRelayPool } from '../utils/nostr/relayConnectionPool'
import type { Contact } from '../types/nostr/types'
import { CACHE_KEYS } from '../utils/cacheKeys'

import { NostrContext } from '../contexts/NostrContext'
import { followUser, unfollowUser, type FollowUserParams, type UnfollowUserParams } from '../utils/profileFollowUtils'


interface UseUserContactsOptions {
  relayUrls: string[]
  publishRelayUrls?: string[]
  enabled?: boolean
}

interface UseUserContactsResult {
  contacts: Contact[]
  isLoading: boolean
  error: Error | null
  refetch: () => void
  followUser: (targetPubkey: string) => Promise<{ success: boolean; error?: string }>
  unfollowUser: (targetPubkey: string) => Promise<{ success: boolean; error?: string }>
  isFollowing: (targetPubkey: string) => boolean
  isFollowBusy: boolean
  isUnfollowBusy: boolean
}

export function useUserContacts({
  relayUrls,
  publishRelayUrls = [],
  enabled = true,
}: UseUserContactsOptions): UseUserContactsResult {
  const queryClient = useQueryClient()

  const { pubkey: userPubkey, nostrClient, nip07Available, signInWithNip07 } = useContext(NostrContext)
  
  const queryKey = CACHE_KEYS.CONTACTS(userPubkey || '')

  // Query for current user's contacts
  const { data: contacts = [], isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<Contact[]> => {
      if (!userPubkey || !relayUrls || relayUrls.length === 0) {
        return []
      }

      // Decode npub if needed
      let decodedPubkey = userPubkey
      try {
        if (userPubkey.startsWith('npub')) {
          const { nip19 } = await import('nostr-tools')
          const decoded = nip19.decode(userPubkey)
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

      const pool = getGlobalRelayPool()
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
    enabled: enabled && !!userPubkey && relayUrls.length > 0,
    refetchOnMount: false, // Use persisted data first, don't refetch immediately
    staleTime: 10 * 60 * 1000, // 10 minutes - longer stale time to prefer cached data
    gcTime: 30 * 60 * 1000, // 30 minutes - keep data longer
    refetchOnWindowFocus: false,
    // Use persisted data immediately while refetching in background
    placeholderData: (previousData) => previousData,
  })

  // Follow user mutation with optimistic updates
  const followMutation = useMutation({
    mutationFn: async (targetPubkey: string) => {
      const followParams: FollowUserParams = {
        pubkeyHex: targetPubkey,
        userPubkey,
        nip07Available,
        signInWithNip07,
        nostrClient,
        relayUrls,
        publishRelayUrls,
        existingContacts: contacts,
      }
      return await followUser(followParams)
    },
    onMutate: async (targetPubkey) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey })

      // Snapshot the previous value
      const previousContacts = queryClient.getQueryData(queryKey)

      // Optimistically update to the new value
      queryClient.setQueryData(queryKey, (old: Contact[] = []) => {
        // Check if already following
        if (old.some(c => c.pubkey === targetPubkey)) {
          return old // Already following, no change needed
        }
        
        // Add new contact
        return [...old, {
          pubkey: targetPubkey,
          relay: '',
          petname: '',
        }]
      })

      // Return a context object with the snapshotted value
      return { previousContacts }
    },
    onError: (_err, _targetPubkey, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousContacts) {
        queryClient.setQueryData(queryKey, context.previousContacts)
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure cache consistency
      queryClient.invalidateQueries({ queryKey })
    },
  })

  // Unfollow user mutation with optimistic updates
  const unfollowMutation = useMutation({
    mutationFn: async (targetPubkey: string) => {
      const unfollowParams: UnfollowUserParams = {
        pubkeyHex: targetPubkey,
        userPubkey,
        nip07Available,
        signInWithNip07,
        nostrClient,
        relayUrls,
        publishRelayUrls,
        existingContacts: contacts,
      }
      return await unfollowUser(unfollowParams)
    },
    onMutate: async (targetPubkey) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey })

      // Snapshot the previous value
      const previousContacts = queryClient.getQueryData(queryKey)

      // Optimistically update to the new value
      queryClient.setQueryData(queryKey, (old: Contact[] = []) => {
        return old.filter(c => c.pubkey !== targetPubkey)
      })

      // Return a context object with the snapshotted value
      return { previousContacts }
    },
    onError: (_err, _targetPubkey, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousContacts) {
        queryClient.setQueryData(queryKey, context.previousContacts)
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure cache consistency
      queryClient.invalidateQueries({ queryKey })
    },
  })

  // Helper function to check if following a specific user
  // This needs to check both the query cache and any pending mutations for optimistic updates
  const isFollowing = useCallback((targetPubkey: string): boolean => {
    // Check the current query cache (includes optimistic updates)
    const currentContacts = queryClient.getQueryData(queryKey) as Contact[] | undefined
    if (currentContacts) {
      return currentContacts.some(c => c.pubkey === targetPubkey)
    }
    // Fallback to the query result
    return contacts.some(c => c.pubkey === targetPubkey)
  }, [contacts, queryClient, queryKey])

  // Follow user function
  const followUserFn = useCallback(async (targetPubkey: string) => {
    return await followMutation.mutateAsync(targetPubkey)
  }, [followMutation])

  // Unfollow user function
  const unfollowUserFn = useCallback(async (targetPubkey: string) => {
    return await unfollowMutation.mutateAsync(targetPubkey)
  }, [unfollowMutation])

  return {
    contacts,
    isLoading,
    error: error as Error | null,
    refetch,
    followUser: followUserFn,
    unfollowUser: unfollowUserFn,
    isFollowing,
    isFollowBusy: followMutation.isPending,
    isUnfollowBusy: unfollowMutation.isPending,
  }
}

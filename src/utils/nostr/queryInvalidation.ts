import { QueryClient } from '@tanstack/react-query'
import { CACHE_KEYS } from '../cacheKeys'

/**
 * Utility functions for invalidating thread-related queries
 * This ensures consistent cache invalidation across the app
 */

export interface ThreadInvalidationOptions {
  parentNoteId: string
  queryClient: QueryClient
}

/**
 * Invalidate all thread-related queries for a specific parent note
 */
export function invalidateThreadQueries({ parentNoteId, queryClient }: ThreadInvalidationOptions) {
  console.log('Invalidating thread queries for parent:', parentNoteId)
  
  // Avoid clearing sessionStorage for thread trees on invalidation.
  // We rely on merge-on-write to keep the global thread tree fresh and prevent empty UI windows.
  
  // Invalidate global thread tree (for new system)
  // This will cause a refetch of missing data
  queryClient.invalidateQueries({
    queryKey: ['thread', 'global-tree'],
    exact: false,
    refetchType: 'active'
  })
  
  // Invalidate root discovery queries to ensure proper thread routing
  queryClient.invalidateQueries({
    queryKey: ['thread', 'root-discovery'],
    exact: false,
    refetchType: 'active'
  })
  
  // Invalidate missing data queries
  queryClient.invalidateQueries({
    queryKey: ['thread', 'missing-data'],
    exact: false,
    refetchType: 'active'
  })
  
  // Invalidate Nostrify thread queries (used by ThreadPage - legacy)
  // Use refetchType: 'active' to force refetch of currently mounted queries
  queryClient.invalidateQueries({
    queryKey: ['nostrify-thread', parentNoteId],
    exact: false,
    refetchType: 'active'
  })
  
  // Invalidate Nostrify note query for the parent
  queryClient.invalidateQueries({
    queryKey: ['nostrify-note', parentNoteId],
    refetchType: 'active'
  })
  
  // Invalidate comment IDs query (thread structure)
  queryClient.invalidateQueries({
    queryKey: CACHE_KEYS.THREAD.COMMENT_IDS(parentNoteId),
    refetchType: 'active'
  })
  
  // Invalidate comment notes query
  queryClient.invalidateQueries({
    queryKey: CACHE_KEYS.THREAD.COMMENT_NOTES(parentNoteId),
    refetchType: 'active'
  })
  
  // Invalidate BFS tree query
  queryClient.invalidateQueries({
    queryKey: CACHE_KEYS.THREAD.TREE(parentNoteId),
    refetchType: 'active'
  })

  // Invalidate new two-phase queries
  // LEVEL1 - invalidate all matching variants for this parent (prefix match)
  queryClient.invalidateQueries({
    queryKey: ['thread', 'level1', parentNoteId],
    exact: false,
    refetchType: 'active'
  })
  // NESTED - frontierKey is dynamic; prefix-match to invalidate all combos
  queryClient.invalidateQueries({
    queryKey: ['thread', 'nested', parentNoteId],
    exact: false,
    refetchType: 'active'
  })
  
  // Invalidate thread path query
  queryClient.invalidateQueries({
    queryKey: CACHE_KEYS.THREAD.PATH(parentNoteId),
    refetchType: 'active'
  })
  
  // Note: Individual note queries are NOT invalidated here
  // They are cached globally and reused across different threads
  // Only invalidate if the specific note content has changed
  
  // Also invalidate any legacy query keys for backward compatibility
  queryClient.invalidateQueries({
    queryKey: ['thread-comments', parentNoteId],
    refetchType: 'active'
  })
  
  queryClient.invalidateQueries({
    queryKey: CACHE_KEYS.NOTE(parentNoteId),
    refetchType: 'active'
  })
  
  queryClient.invalidateQueries({
    queryKey: ['thread-path', parentNoteId],
    refetchType: 'active'
  })
}

/**
 * Invalidate a specific individual note query
 * Use this when a specific note content has been updated
 */
export function invalidateIndividualNote(noteId: string, queryClient: QueryClient) {
  console.log('Invalidating individual note:', noteId)
  
  queryClient.invalidateQueries({
    queryKey: CACHE_KEYS.NOTE(noteId)
  })
}

/**
 * Invalidate all thread queries (for global refresh)
 */
export function invalidateAllThreadQueries(queryClient: QueryClient) {
  console.log('Invalidating all thread queries')
  
  queryClient.invalidateQueries({
    queryKey: ['thread']
  })
  
  // Also invalidate legacy query keys
  queryClient.invalidateQueries({
    queryKey: ['thread-comments']
  })
  
  queryClient.invalidateQueries({
    queryKey: ['thread-path']
  })
}

/**
 * Invalidate feed queries when new content is posted
 * Updated for unified note caching structure
 */
export function invalidateFeedQueries(queryClient: QueryClient) {
  console.log('Invalidating feed queries')
  
  // Invalidate note ID lists (lightweight)
  queryClient.invalidateQueries({
    queryKey: ['feed', 'note-ids']
  })
  
  // Invalidate missing notes queries
  queryClient.invalidateQueries({
    queryKey: ['feed', 'missing-notes']
  })
  
  // Legacy invalidation for backward compatibility
  queryClient.invalidateQueries({
    queryKey: ['feed']
  })
  
  queryClient.invalidateQueries({
    queryKey: ['notes']
  })
}

/**
 * Invalidate profile queries when following status changes
 * Updated for unified note caching structure
 */
export function invalidateProfileQueries(queryClient: QueryClient, pubkey?: string) {
  console.log('Invalidating profile queries', { pubkey })
  
  if (pubkey) {
    // Invalidate profile note ID lists
    queryClient.invalidateQueries({
      queryKey: ['profile', 'note-ids', pubkey]
    })
    
    // Invalidate profile metadata
    queryClient.invalidateQueries({
      queryKey: ['profile', 'metadata', pubkey]
    })
    
    // Invalidate new useNostrifyFeed queries for profile notes
    queryClient.invalidateQueries({
      queryKey: ['nostrify-feed'],
      exact: false
    })
    
    // Legacy invalidation
    queryClient.invalidateQueries({
      queryKey: ['profile', pubkey]
    })
  } else {
    // Invalidate all profile queries
    queryClient.invalidateQueries({
      queryKey: ['profile', 'note-ids']
    })
    
    queryClient.invalidateQueries({
      queryKey: ['profile', 'metadata']
    })
    
    // Invalidate all useNostrifyFeed queries
    queryClient.invalidateQueries({
      queryKey: ['nostrify-feed'],
      exact: false
    })
    
    queryClient.invalidateQueries({
      queryKey: ['profile']
    })
  }
}

/**
 * Invalidate profile notes after a user publishes a new note
 * This ensures viewers see the new note in the profile immediately
 * @param queryClient - The React Query client
 * @param noteAuthorPubkey - The pubkey of the user who published the note
 * @param invalidateAllProfiles - Whether to invalidate all profile queries (when user follows/unfollows)
 */
export function invalidateProfileNotesAfterPublish(queryClient: QueryClient, noteAuthorPubkey: string, invalidateAllProfiles = false) {
  console.log('Invalidating profile notes after publish', { noteAuthorPubkey, invalidateAllProfiles })

  // CRITICAL: Remove ALL nostrify-feed queries that include this user as an author
  // This is necessary because useNostrifyFeed has refetchOnMount: false for scroll restoration
  // Simply invalidating won't refetch on mount, so we must remove the cached data entirely
  // The query key structure is: ['nostrify-feed', authorKey, kindsKey, relayKey, flagsKey, hashtagsKey, mutedLen, pageSize]
  // Where authorKey is the user's hex pubkey for profile queries

  if (invalidateAllProfiles) {
    // Invalidate all profile queries when following/unfollowing
    queryClient.invalidateQueries({
      queryKey: ['profile'],
      exact: false
    })
  } else {
    // Remove profile feed queries for this specific user (queries where the user is the author)
    queryClient.removeQueries({
      queryKey: ['nostrify-feed', noteAuthorPubkey],
      exact: false
    })

    // Also invalidate and refetch any currently active queries for this user's profile
    queryClient.invalidateQueries({
      queryKey: ['nostrify-feed', noteAuthorPubkey],
      exact: false,
      refetchType: 'active'
    })
  }

  // Invalidate ALL nostrify-feed queries (main feed, etc.) to ensure new content appears everywhere
  // This uses refetchType: 'active' to only refetch queries that are currently mounted
  queryClient.invalidateQueries({
    queryKey: ['nostrify-feed'],
    exact: false,
    refetchType: 'active'
  })

  // Also invalidate legacy profile queries for the user
  queryClient.invalidateQueries({
    queryKey: ['profile', 'note-ids', noteAuthorPubkey],
    refetchType: 'active'
  })

  queryClient.invalidateQueries({
    queryKey: ['profile', noteAuthorPubkey],
    refetchType: 'active'
  })

  // Invalidate feed queries to show the new note in main feed
  queryClient.invalidateQueries({
    queryKey: ['feed', 'note-ids'],
    refetchType: 'active'
  })

  queryClient.invalidateQueries({
    queryKey: ['feed'],
    refetchType: 'active'
  })
}

/**
 * Legacy function for backward compatibility - invalidates current user's profile notes after publishing
 * @deprecated Use invalidateProfileNotesAfterPublish instead
 */
export function invalidateCurrentUserProfileNotes(queryClient: QueryClient, userPubkey: string) {
  return invalidateProfileNotesAfterPublish(queryClient, userPubkey, false);
}

/**
 * Invalidate all note-related queries (for global refresh)
 * This includes both individual notes and note lists
 */
export function invalidateAllNoteQueries(queryClient: QueryClient) {
  console.log('Invalidating all note queries')
  
  // Invalidate individual note cache
  queryClient.invalidateQueries({
    queryKey: ['note']
  })
  
  // Invalidate note ID lists
  queryClient.invalidateQueries({
    queryKey: ['feed', 'note-ids']
  })
  
  queryClient.invalidateQueries({
    queryKey: ['profile', 'note-ids']
  })
  
  // Invalidate missing notes queries
  queryClient.invalidateQueries({
    queryKey: ['feed', 'missing-notes']
  })
  
  // Legacy invalidation
  queryClient.invalidateQueries({
    queryKey: ['feed']
  })
  
  queryClient.invalidateQueries({
    queryKey: ['profile']
  })
}

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import React from 'react'
import { type Event, type Filter } from 'nostr-tools'
import { RelayConnectionPool } from '../utils/nostr/relayConnectionPool'
import type { Note } from '../types/nostr/types'
import { extractImageUrls, extractVideoUrls } from '../utils/nostr/utils'
import { CACHE_KEYS } from '../utils/cacheKeys'

interface UseThreadInfiniteQueryOptions {
  parentNoteId: string
  relayUrls: string[]
  parentNote: Note
  poolRef: React.MutableRefObject<RelayConnectionPool | null>
  buildAugmentedRelays: (relayUrls: string[], tags?: any[]) => string[]
  pageSize?: number
}

interface UseThreadInfiniteQueryResult {
  // Infinite query data
  data: Note[] | undefined
  isLoading: boolean
  isFetching: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
  
  // Thread-specific data
  currentParentNote: Note | null
  isLoadingParentNote: boolean
  threadPath: { depth: number; path: string[]; opId: string | null } | null
  originalPostId: string | null
  
  // Actions
  refetch: () => void
}

// const MAX_COMMENTS_PER_THREAD = 500
// const MAX_NESTED_DEPTH = 3

export function useThreadInfiniteQuery({
  parentNoteId,
  relayUrls,
  parentNote,
  poolRef,
  buildAugmentedRelays,
  pageSize = 10,
}: UseThreadInfiniteQueryOptions): UseThreadInfiniteQueryResult {
  const queryClient = useQueryClient()

  // Helper function to build expanded relay list with static reliable relays
  const buildExpandedRelays = React.useCallback((baseRelays: string[], tags?: any[]) => {
    const augmentedRelays = buildAugmentedRelays(baseRelays, tags)
    
    // Use static reliable relays to avoid dynamic relay manager infinite loops
    const reliableRelays = [
      'wss://nos.lol',
      'wss://relay.snort.social',
      'wss://nostr.mom',
      'wss://purplepag.es',
      'wss://relay.nostr.band'
    ]
    
    const allRelays = [...baseRelays, ...augmentedRelays, ...reliableRelays]
    return [...new Set(allRelays)]
  }, [buildAugmentedRelays])

  // Filter out known problematic relays
  const filterRelays = React.useCallback((relays: string[]): string[] => {
    const problematic = new Set([
      'wss://relay.nostr.band', // Often slow
      'wss://relay.damus.io', // Sometimes unreliable
    ])
    
    return relays.filter(r => !problematic.has(r))
  }, [])

  // Cap relays to prevent overwhelming
  const capRelays = React.useCallback((relays: string[], cap: number): string[] => {
    const priorityRelays = [
      'wss://nos.lol',
      'wss://relay.snort.social',
      'wss://nostr.mom',
      'wss://purplepag.es',
    ]
    
    const filteredRelays = filterRelays(relays)
    const seen = new Set<string>()
    const out: string[] = []
    
    // Add priority relays first
    for (const r of priorityRelays) {
      if (filteredRelays.includes(r) && !seen.has(r)) {
        seen.add(r)
        out.push(r)
        if (out.length >= cap) break
      }
    }
    
    // Add remaining relays
    for (const r of filteredRelays) {
      if (!seen.has(r)) {
        seen.add(r)
        out.push(r)
        if (out.length >= cap) break
      }
    }
    
    return out
  }, [filterRelays])

  // Extract participant pubkeys from a note (author, p tags, and e-tag pubkeys if provided)
  const extractParticipantPubkeys = React.useCallback((note: Note | null | undefined): string[] => {
    if (!note) return []
    const pubkeys = new Set<string>()
    if (note.pubkey) pubkeys.add(note.pubkey)
    const tags = note.tags || []
    for (const t of tags) {
      if (!Array.isArray(t)) continue
      if (t[0] === 'p' && typeof t[1] === 'string' && t[1]) pubkeys.add(t[1])
      // NIP-10 e-tag pubkey is at index 4 if present
      if (t[0] === 'e' && typeof t[4] === 'string' && t[4]) pubkeys.add(t[4])
    }
    return Array.from(pubkeys)
  }, [])

  // Discover NIP-65 outbox/write relays for a set of authors using the current pool
  const discoverAuthorWriteRelays = React.useCallback(async (authors: string[], candidateRelays: string[]): Promise<string[]> => {
    if (!authors || authors.length === 0) return []
    const pool = poolRef.current
    if (!pool) return []
    try {
      const filter: Filter = {
        kinds: [10002],
        authors: authors,
        limit: 50,
      }
      const events: Event[] = await pool.querySync(candidateRelays, filter)
      const discovered = new Set<string>()
      for (const ev of events) {
        const tags = ev.tags || []
        for (const tag of tags) {
          if (Array.isArray(tag) && tag[0] === 'r' && typeof tag[1] === 'string') {
            const marker = tag[2]
            // Only include write or both (no marker)
            if (!marker || marker === 'write') {
              const norm = normalizeRelayUrl(tag[1])
              if (norm) discovered.add(norm)
            }
          }
        }
      }
      return Array.from(discovered)
    } catch (_e) {
      return []
    }
  }, [poolRef])

  // Normalize relay URL
  const normalizeRelayUrl = React.useCallback((inputUrl: string): string | null => {
    try {
      if (!inputUrl || typeof inputUrl !== 'string') return null
      let url = inputUrl.trim()
      if (!/^wss?:\/\//i.test(url)) url = `wss://${url}`
      url = url.replace(/^ws:\/\//i, 'wss://')
      const parsed = new URL(url)
      const protocol = 'wss:'
      const hostname = parsed.hostname.toLowerCase()
      const port = parsed.port ? `:${parsed.port}` : ''
      let pathname = parsed.pathname || ''
      if (pathname === '/') pathname = ''
      else if (pathname.endsWith('/')) pathname = pathname.slice(0, -1)
      return `${protocol}//${hostname}${port}${pathname}`
    } catch {
      return null
    }
  }, [])

  // Query for current parent note
  const {
    data: currentParentNote = parentNote,
    isLoading: isLoadingParentNote,
    refetch: refetchParentNote
  } = useQuery({
    queryKey: ['note', parentNoteId],
    queryFn: async (): Promise<Note> => {
      if (parentNote) {
        return parentNote
      }

      // If no parent note provided, fetch it
      const pool = poolRef.current
      if (!pool) {
        throw new Error('Relay connection pool not available')
      }

      const filter: Filter = { kinds: [1], ids: [parentNoteId], limit: 1 }
      const events: Event[] = await pool.querySync(relayUrls, filter)
      
      if (events.length === 0) {
        throw new Error(`Note ${parentNoteId} not found`)
      }

      const event = events[0]
      const imageUrls = extractImageUrls(event.content)
      const videoUrls = extractVideoUrls(event.content)
      
      const note: Note = {
        id: event.id,
        pubkey: event.pubkey,
        content: event.content,
        created_at: event.created_at,
        kind: (event as any).kind,
        tags: event.tags || [],
        imageUrls,
        videoUrls,
        receivedAt: Date.now()
      }

      // Cache the note individually
      queryClient.setQueryData(CACHE_KEYS.NOTE(note.id), note)
      
      return note
    },
    enabled: !!parentNoteId && relayUrls.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  // Main infinite query for thread comments
  const infiniteQuery = useInfiniteQuery({
    queryKey: ['thread', 'infinite', parentNoteId],
    enabled: !!parentNoteId && relayUrls.length > 0,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    queryFn: async ({ pageParam = 0 }): Promise<{ notes: Note[]; hasMore: boolean }> => {
      const tagsForHints = (currentParentNote as Note)?.tags || []
      let allRelays = buildExpandedRelays(relayUrls, tagsForHints)
      const pool = poolRef.current
      if (!pool) {
        throw new Error('Relay connection pool not available')
      }

      // Skip NIP-65 discovery for the first paint to reduce latency
      allRelays = capRelays(allRelays, 12)

      const filter: Filter = { 
        kinds: [1], 
        '#e': [parentNoteId], 
        limit: pageSize,
        since: pageParam > 0 ? pageParam : undefined
      }
      
      let events: Event[] = await pool.querySync(allRelays, filter)

      // Helper to map events -> direct children of current parent
      const buildDirectChildren = (evs: Event[]): Note[] => {
        return evs
          .filter((ev: Event) => {
            if (!ev.content || ev.content.trim().length === 0) return false
            
            // Filter for direct replies only using NIP-10 standards
            const eTags = (ev.tags || []).filter(
              (t) => Array.isArray(t) && t[0] === "e"
            );
            
            let isDirect = false;
            const replyTag = eTags.find((t) => t[3] === "reply");
            const rootTag = eTags.find((t) => t[3] === "root");
            
            // NIP-10: Direct replies to root should have ONLY "root" marker
            // Nested replies have BOTH "root" and "reply" markers
            if (replyTag && replyTag[1] === parentNoteId) {
              // This is a direct reply to parentNoteId (reply marker points to parent)
              isDirect = true;
            } else if (rootTag && rootTag[1] === parentNoteId && !replyTag) {
              // This is a top-level reply to root (only root marker, no reply marker)
              isDirect = true;
            } else if (!replyTag && !rootTag) {
              // Fallback to positional e-tags for backward compatibility
              if (
                (eTags.length === 1 && eTags[0][1] === parentNoteId) ||
                (eTags.length >= 2 && eTags[1][1] === parentNoteId)
              ) {
                isDirect = true;
              }
            }
            
            return isDirect;
          })
          .map((ev: Event) => {
            const imageUrls = extractImageUrls(ev.content)
            const videoUrls = extractVideoUrls(ev.content)
            
            const note: Note = {
              id: ev.id,
              pubkey: ev.pubkey,
              content: ev.content,
              created_at: ev.created_at,
              kind: (ev as any).kind,
              tags: ev.tags || [],
              imageUrls,
              videoUrls,
              receivedAt: Date.now()
            }

            // Cache the note individually for reuse across contexts
            queryClient.setQueryData(CACHE_KEYS.NOTE(note.id), note)
            
            return note
          })
      }

      let directChildren = buildDirectChildren(events)

      // Fallback: if no direct replies found, broaden relays via NIP-65 discovery and retry
      if (directChildren.length === 0) {
        try {
          const participantPubkeys = extractParticipantPubkeys(currentParentNote)
          if (participantPubkeys.length > 0) {
            const writeRelays = await discoverAuthorWriteRelays(participantPubkeys, allRelays)
            if (writeRelays.length > 0) {
              allRelays = Array.from(new Set([...writeRelays, ...allRelays]))
              allRelays = capRelays(allRelays, 10)
              const retryEvents: Event[] = await pool.querySync(allRelays, filter)
              const retried = buildDirectChildren(retryEvents)
              if (retried.length > 0) {
                directChildren = retried
              }
            }
          }
        } catch (_e) {
          // Ignore fallback errors; return empty list if still none
        }
      }

      // Final fallback: if still no results, query a wider set of popular relays with longer wait
      if (directChildren.length === 0) {
        try {
          const popularWide = [
            'wss://nos.lol',
            'wss://relay.snort.social',
            'wss://nostr.mom',
            'wss://purplepag.es',
            'wss://nostr-relay.wlvs.space',
            'wss://relay.damus.io',
            'wss://relay.primal.net',
          ]
          const wideRelays = Array.from(new Set([...popularWide, ...allRelays]))
          const capped = capRelays(wideRelays, 12)
          const retryEventsWide: Event[] = await pool.querySync(capped, filter)
          const retriedWide = buildDirectChildren(retryEventsWide)
          if (retriedWide.length > 0) {
            directChildren = retriedWide
          }
        } catch (error) {
          // Log error but don't record failures since we're not using dynamic relay manager
          console.warn('Failed to fetch thread data:', error)
        }
      }

      directChildren.sort((a, b) => (a.created_at - b.created_at) || a.id.localeCompare(b.id))
      
      // Determine if there are more pages
      const hasMore = directChildren.length === pageSize

      return { 
        notes: directChildren, 
        hasMore
      }
    },
    getNextPageParam: (lastPage) => {
      return lastPage.hasMore ? lastPage.notes[lastPage.notes.length - 1]?.created_at : undefined
    },
    initialPageParam: 0,
  })

  // Query for thread path and original post
  const {
    data: threadPath = null,
    // isLoading: isLoadingThreadPath
  } = useQuery({
    queryKey: ['thread', 'path', parentNoteId],
    queryFn: async (): Promise<{ depth: number; path: string[]; opId: string | null }> => {
      if (!(currentParentNote as Note)) {
        return { depth: 1, path: [parentNoteId], opId: parentNoteId }
      }

      // If no relay URLs, just return basic path info
      if (!relayUrls || relayUrls.length === 0) {
        return { depth: 1, path: [parentNoteId], opId: parentNoteId }
      }

      const pool = poolRef.current
      if (!pool) {
        return { depth: 1, path: [parentNoteId], opId: parentNoteId }
      }

      const path: string[] = [parentNoteId]
      let currentNote = currentParentNote as Note
      let depth = 1
      const maxDepth = 10 // Prevent infinite loops
      const visited = new Set<string>([parentNoteId])

      while (depth < maxDepth) {
        // Look for e-tag pointing to parent
        const eTags = currentNote.tags?.filter(tag => Array.isArray(tag) && tag[0] === 'e') || []
        let parentId: string | null = null

        for (const eTag of eTags) {
          if (Array.isArray(eTag) && typeof eTag[1] === 'string' && eTag[1] !== parentNoteId) {
            parentId = eTag[1]
            break
          }
        }

        if (!parentId || visited.has(parentId)) {
          break
        }

        visited.add(parentId)
        path.unshift(parentId)

        // Fetch parent note
        const parentNote = await fetchIndividualNote(parentId, relayUrls, pool, queryClient)
        if (!parentNote) {
          break
        }

        currentNote = parentNote
        depth++
      }

      return {
        depth,
        path,
        opId: path[0] || parentNoteId
      }
    },
    enabled: !!parentNoteId && !!currentParentNote && relayUrls.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  // Individual note fetching function
  const fetchIndividualNote = async (
    noteId: string,
    relayUrls: string[],
    pool: RelayConnectionPool,
    queryClient: any
  ): Promise<Note | null> => {
    try {
      // Check cache first
      const cached = queryClient.getQueryData(CACHE_KEYS.NOTE(noteId))
      if (cached) {
        return cached
      }

      const filter: Filter = { kinds: [1], ids: [noteId], limit: 1 }
      const events: Event[] = await pool.querySync(relayUrls, filter)
      
      if (events.length === 0) {
        return null
      }

      const event = events[0]
      const imageUrls = extractImageUrls(event.content)
      const videoUrls = extractVideoUrls(event.content)
      
      const note: Note = {
        id: event.id,
        pubkey: event.pubkey,
        content: event.content,
        created_at: event.created_at,
        kind: (event as any).kind,
        tags: event.tags || [],
        imageUrls,
        videoUrls,
        receivedAt: Date.now()
      }

      // Cache the note individually
      queryClient.setQueryData(CACHE_KEYS.NOTE(note.id), note)
      
      return note
    } catch (error) {
      console.error('Error fetching individual note:', error)
      return null
    }
  }

  // Flatten all pages into a single array
  const allNotes = React.useMemo(() => {
    return infiniteQuery.data?.pages.flatMap(page => page.notes) || []
  }, [infiniteQuery.data])

  // Combined refetch function
  const refetch = React.useCallback(() => {
    refetchParentNote()
    infiniteQuery.refetch()
  }, [refetchParentNote, infiniteQuery])

  return {
    // Infinite query data
    data: allNotes,
    isLoading: infiniteQuery.isPending,
    isFetching: infiniteQuery.isFetching,
    isFetchingNextPage: infiniteQuery.isFetchingNextPage,
    hasNextPage: infiniteQuery.hasNextPage,
    fetchNextPage: infiniteQuery.fetchNextPage,
    
    // Thread-specific data
    currentParentNote: currentParentNote as Note | null,
    isLoadingParentNote,
    threadPath: threadPath as { depth: number; path: string[]; opId: string | null } | null,
    originalPostId: (threadPath as { depth: number; path: string[]; opId: string | null } | null)?.opId || null,
    
    // Actions
    refetch,
  }
}

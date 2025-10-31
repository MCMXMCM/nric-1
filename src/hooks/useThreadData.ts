import { useQuery, useQueryClient } from '@tanstack/react-query'
import React from 'react'
import { type Event, type Filter } from 'nostr-tools'
import { RelayConnectionPool } from '../utils/nostr/relayConnectionPool'
import { useOutboxRelayManager } from './useOutboxRelayManager'
import type { Note } from '../types/nostr/types'
import { extractImageUrls, extractVideoUrls } from '../utils/nostr/utils'
import { CACHE_KEYS } from '../utils/cacheKeys'

interface UseThreadDataOptions {
  parentNoteId: string
  relayUrls: string[]
  parentNote: Note | null
  poolRef: React.MutableRefObject<RelayConnectionPool | null>
  buildAugmentedRelays: (relayUrls: string[], tags?: any[]) => string[]
}

interface ThreadPathResult {
  depth: number
  path: string[]
  opId: string | null
}

interface UseThreadDataResult {
  // Current parent note
  currentParentNote: Note | null
  isLoadingParentNote: boolean
  
  // Comments for current parent
  comments: Note[]
  isLoadingComments: boolean
  isFetchingComments: boolean
  isStaleComments: boolean
  refetchComments: () => void
  
  // Nested replies
  nestedReplies: Record<string, Note[]>
  childrenByParentId: Record<string, Note[]>
  isLoadingNested: boolean
  isFetchingNested: boolean
  isQueryingNestedReplies: boolean
  refetchNested: () => void
  
  // Thread path
  threadPath: ThreadPathResult | null
  originalPostId: string | null
  isLoadingThreadPath: boolean
  
  // Combined refetch
  refetchAll: () => void
}

// Individual note fetching function - can be reused across different contexts
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
    // Prefer Nostrify pool for all queries
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nostrifyPool: any = (globalThis as any).__nostrifyPool
    let events: Event[] = []
    if (nostrifyPool) {
      events = await nostrifyPool.query([filter as any])
    } else {
      events = await pool.querySync(relayUrls, filter)
    }
    
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

export function useThreadData({
  parentNoteId,
  relayUrls,
  parentNote,
  poolRef,
  buildAugmentedRelays,
}: UseThreadDataOptions): UseThreadDataResult {
  const queryClient = useQueryClient()

  // Add memory management for large result sets
  const MAX_COMMENTS_PER_THREAD = 500; // Limit to prevent memory issues
  const MAX_NESTED_DEPTH = 3; // Already limited, but ensure it's enforced
  const MAX_DEPTH = MAX_NESTED_DEPTH; // Alias for compatibility

  // Use outbox relay manager instead of dynamic relay manager
  const { recordSuccess, recordFailure } = useOutboxRelayManager({
    autoInitialize: true
  });

  // Helper function to build expanded relay list without hardcoded relays
  const buildExpandedRelays = React.useCallback((baseRelays: string[], tags?: any[]) => {
    const augmentedRelays = buildAugmentedRelays(baseRelays, tags)
    const allRelays = [...baseRelays, ...augmentedRelays]
    return [...new Set(allRelays)]
  }, [buildAugmentedRelays])

  // Filter out known problematic relays
  const filterRelays = React.useCallback((relays: string[]): string[] => relays, [])

  // Cap relays to prevent overwhelming
  const capRelays = React.useCallback((relays: string[], cap: number): string[] => {
    const filteredRelays = filterRelays(relays)
    const out: string[] = []
    for (const r of filteredRelays) {
      if (!out.includes(r)) {
        out.push(r)
        if (out.length >= cap) break
      }
    }
    return out
  }, [filterRelays])

  // Normalize and deduplicate relay URLs (minimal variant)
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
  }, [poolRef, normalizeRelayUrl])

  // Phase 1: Fetch only direct children (first-level replies)
  const {
    data: level1 = { directChildren: [] as Note[] },
    isLoading: isLoadingLevel1,
    isFetching: isFetchingLevel1,
    isStale: isStaleLevel1,
    refetch: refetchLevel1,
  } = useQuery({
    queryKey: CACHE_KEYS.THREAD.LEVEL1(parentNoteId),
    enabled: !!parentNoteId && relayUrls.length > 0,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000, // Reduced from 10 minutes to 5 minutes
    queryFn: async (): Promise<{ directChildren: Note[] }> => {
      const tagsForHints = parentNote?.tags || []
      // Note: TanStack Query handles caching automatically - no need for manual IndexedDB hydration

      let allRelays = buildExpandedRelays(relayUrls, tagsForHints)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nostrifyPool: any = (globalThis as any).__nostrifyPool
      if (!nostrifyPool) {
        throw new Error('Nostrify pool not available')
      }

      // Skip NIP-65 discovery for the first paint to reduce latency

      // Start smaller to avoid relay throttle; escalate only if needed
      capRelays(allRelays, 6)

      const filter: Filter = { kinds: [1], '#e': [parentNoteId], limit: MAX_COMMENTS_PER_THREAD }
            let events: Event[] = await nostrifyPool.query([filter as any])

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

      // If low/no results, escalate relay coverage in stages
      if (directChildren.length === 0) {
        // Stage A: escalate to more of the existing read relays
        capRelays(allRelays, 10)
        try {
          const retryA: Event[] = await nostrifyPool.query([filter as any])
          const retriedA = buildDirectChildren(retryA)
          if (retriedA.length > 0) {
            directChildren = retriedA
          }
        } catch {}
      }

      // Fallback: if still no direct replies found, broaden via NIP-65 discovery and retry
      if (directChildren.length === 0) {
        try {
          const participantPubkeys = extractParticipantPubkeys(parentNote)
          if (participantPubkeys.length > 0) {
            const writeRelays = await discoverAuthorWriteRelays(participantPubkeys, allRelays)
            if (writeRelays.length > 0) {
              allRelays = Array.from(new Set([...writeRelays, ...allRelays]))
              allRelays = capRelays(allRelays, 10)
                      const startTime = Date.now()
        const retryEvents: Event[] = await nostrifyPool.query([filter as any])
        const responseTime = Date.now() - startTime
        
        // Record success for all relays that participated
        try {
          allRelays.forEach(relay => {
            recordSuccess(relay, responseTime)
          })
        } catch (error) {
          // Ignore dynamic manager errors
        }
        
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

      // Final fallback: if still no results, defer to outbox model to expand relays rather than hardcoding
      if (directChildren.length === 0) {
        try {
          // Use outbox discovery to fetch write relays for participants, then retry
          const participants = extractParticipantPubkeys(parentNote)
          if (participants.length > 0) {
            const writeRelays = await discoverAuthorWriteRelays(participants, allRelays)
            if (writeRelays.length > 0) {
              allRelays = capRelays(Array.from(new Set([...writeRelays, ...allRelays])), 10)
            }
          }
          const retryEventsWide: Event[] = await nostrifyPool.query([filter as any])
          const retriedWide = buildDirectChildren(retryEventsWide)
          if (retriedWide.length > 0) {
            directChildren = retriedWide
          }
        } catch (error) {
          // Record failure for all relays that were attempted
          try {
            allRelays.forEach(relay => {
              recordFailure(relay, error instanceof Error ? error.message : 'Unknown error')
            })
          } catch (dynamicError) {
            // Ignore outbox manager errors
          }
        }
      }

      directChildren.sort((a, b) => (a.created_at - b.created_at) || a.id.localeCompare(b.id))
      // Save to cache for future hydration
      try {
        // Note: Removed duplicate IndexedDB storage - TanStack Query already caches notes
      } catch {}

      return { directChildren }
    }
  })

  // Query for current parent note - now uses individual note caching
  const {
    data: currentParentNote = parentNote,
    isLoading: isLoadingParentNote,
    refetch: refetchParentNote
  } = useQuery({
    queryKey: CACHE_KEYS.NOTE(parentNoteId),
    queryFn: async (): Promise<Note> => {
      // First check if we already have this note cached
      const cachedNote = queryClient.getQueryData<Note>(CACHE_KEYS.NOTE(parentNoteId))
      if (cachedNote) {
        console.log(`📋 Using cached note for ${parentNoteId.slice(0, 8)}`)
        return cachedNote
      }

      // If parentNote is provided, use it and cache it
      if (parentNote) {
        queryClient.setQueryData(CACHE_KEYS.NOTE(parentNote.id), parentNote)
        return parentNote
      }

      console.log(`🔍 Fetching note ${parentNoteId.slice(0, 8)} from relays`)

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
    // Add initialData to provide cached note immediately if available
    initialData: () => {
      const cachedNote = queryClient.getQueryData<Note>(CACHE_KEYS.NOTE(parentNoteId))
      if (cachedNote) {
        console.log(`📋 Providing cached note as initial data for ${parentNoteId.slice(0, 8)}`)
        return cachedNote
      }
      return parentNote || undefined
    },
  })

  // Phase 1 streaming subscription: render direct replies as they arrive
  React.useEffect(() => {
    if (!parentNoteId || relayUrls.length === 0) return
    const pool = poolRef.current
    if (!pool) return

    let closed = false
    let sub: ReturnType<RelayConnectionPool['subscribeMany']> | null = null
    let received = 0
    let lastReceived = Date.now()
    let idleCheck: number | null = null
    let overallTimer: number | null = null

    const setup = async () => {
      try {
        const tagsForHints = currentParentNote?.tags || []
        let allRelays = buildExpandedRelays(relayUrls, tagsForHints)

        // Quick NIP-65 discovery to include likely write relays (short timeout)
        try {
          const participantPubkeys = extractParticipantPubkeys(currentParentNote)
          if (participantPubkeys.length > 0) {
            const writeRelays = await discoverAuthorWriteRelays(participantPubkeys, allRelays)
            if (writeRelays.length > 0) {
              allRelays = Array.from(new Set([...writeRelays, ...allRelays]))
            }
          }
        } catch (_e) {
          // Ignore NIP-65 discovery errors
        }

        // Start with fewer relays for subscription; escalate if idle
        capRelays(allRelays, 4)
        const filter: Filter = { kinds: [1], '#e': [parentNoteId], limit: MAX_COMMENTS_PER_THREAD }
        // Poll using Nostrify query to simulate streaming updates without legacy subscriptions
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nostrifyPool: any = (globalThis as any).__nostrifyPool
        const seenIds = new Set<string>()
        const poll = async () => {
          if (closed) return
          try {
            const evs: Event[] = await nostrifyPool.query([filter as any])
            for (const event of evs) {
              if (seenIds.has(event.id)) continue
              seenIds.add(event.id)
              received++
              lastReceived = Date.now()
              queryClient.setQueryData<{ directChildren: Note[] }>(['thread', 'level1', parentNoteId], (prev) => {
                if (!prev) return { directChildren: [] }
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
                queryClient.setQueryData(CACHE_KEYS.NOTE(note.id), note)
                const exists = prev.directChildren.some(n => n.id === note.id)
                if (exists) return prev
                const updated = [...prev.directChildren, note]
                updated.sort((a, b) => (a.created_at - b.created_at) || a.id.localeCompare(b.id))
                return { directChildren: updated }
              })
            }
          } catch {}
        }
        // Initial poll and set interval
        await poll()
        sub = { close: () => {} } as any

        // Set up idle detection
        idleCheck = window.setInterval(() => {
          if (closed) return
          const timeSinceLastEvent = Date.now() - lastReceived
          if (timeSinceLastEvent > 10000) { // 10 seconds of no events
            // No-op: polling handles idleness
          }
        }, 5000)

        // Overall timeout
        overallTimer = window.setTimeout(() => {
          if (closed) return
          // If nothing received, try another poll immediately
          if (received === 0) { poll() }
        }, 30000) // 30 second overall timeout

      } catch (error) {
        console.error('Error setting up thread subscription:', error)
      }
    }

    setup()

    return () => {
      closed = true
      if (sub) {
        sub.close()
      }
      if (idleCheck) {
        clearInterval(idleCheck)
      }
      if (overallTimer) {
        clearTimeout(overallTimer)
      }
    }
  }, [parentNoteId, relayUrls, currentParentNote, poolRef, buildExpandedRelays, extractParticipantPubkeys, discoverAuthorWriteRelays, capRelays, queryClient])

  // Build frontier key for nested queries
  const frontierKey = React.useMemo(() => {
    try {
      return (level1.directChildren || []).map((c) => c.id).join(',');
    } catch {
      return ''
    }
  }, [level1.directChildren])
  const {
    data: nested = { childrenByParentId: {} as Record<string, Note[]> },
    refetch: refetchNested,
    isLoading: isLoadingNested,
    isFetching: isFetchingNested,
  } = useQuery({
    queryKey: CACHE_KEYS.THREAD.NESTED(parentNoteId, MAX_DEPTH, frontierKey),
    enabled: !!parentNoteId && relayUrls.length > 0 && (level1.directChildren?.length || 0) > 0,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000, // Reduced from 10 minutes to 5 minutes
    queryFn: async (): Promise<{ childrenByParentId: Record<string, Note[]> }> => {
      const tagsForHints = currentParentNote?.tags || []
      let allRelays = buildExpandedRelays(relayUrls, tagsForHints)
      const pool = poolRef.current
      if (!pool) {
        throw new Error('Relay connection pool not available')
      }

      // Skip NIP-65 discovery for nested queries to reduce latency
      allRelays = capRelays(allRelays, 8)

      let frontier: string[] = level1.directChildren.map((c) => c.id)
      const childrenByParent: Record<string, Note[]> = {}
      const globalProcessed = new Set<string>() // Global deduplication across all depths
      let depth = 0

      while (frontier.length > 0 && depth < MAX_NESTED_DEPTH) {
        depth++
        const filter: Filter = { kinds: [1], '#e': frontier, limit: MAX_COMMENTS_PER_THREAD }
        const events: Event[] = await pool.querySync(allRelays, filter)

        const newFrontier: string[] = []
        const processed = new Set<string>()

        for (const event of events) {
          if (!event.content || event.content.trim().length === 0) continue
          
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

          // Find parent note ID from e-tags using robust parent-child relationship logic
          const eTags = event.tags?.filter(tag => Array.isArray(tag) && tag[0] === 'e') || []
          
          // Use the exact same logic as direct children processing to find the correct parent
          let parentId: string | null = null
          
          // Apply correct NIP-10 logic for nested replies
          const replyTag = eTags.find((t: any) => t[3] === 'reply')
          
          // For nested replies, the "reply" tag should point to the immediate parent
          // The "root" tag should point to the original root note
          if (replyTag && replyTag[1] && frontier.includes(replyTag[1])) {
            // This is a nested reply - reply tag points to immediate parent in frontier
            parentId = replyTag[1]
          }
          // For nested queries, we should NOT use root tags to determine parent-child relationships
          // because root tags point to the thread root, not the immediate parent
          else {
            // Strategy 3: Fallback to positional e-tags for backward compatibility
            for (const eTag of eTags) {
              if (Array.isArray(eTag) && typeof eTag[1] === 'string' && frontier.includes(eTag[1])) {
                parentId = eTag[1]
                break
              }
            }
          }
          
          // Add to parent if we found a valid parent in the frontier
          // Use global deduplication to prevent the same note from appearing multiple times
          if (parentId && !globalProcessed.has(note.id)) {
            if (!childrenByParent[parentId]) {
              childrenByParent[parentId] = []
            }
            childrenByParent[parentId].push(note)
            processed.add(note.id)
            globalProcessed.add(note.id)
            newFrontier.push(note.id)
          }
        }

        // Sort children by creation time
        for (const parentId in childrenByParent) {
          childrenByParent[parentId].sort((a, b) => (a.created_at - b.created_at) || a.id.localeCompare(b.id))
        }

        frontier = newFrontier
      }

      return { childrenByParentId: childrenByParent }
    }
  })

  // Effective values from phase 1 for UI
  const effectiveComments = level1.directChildren
  const effectiveIsLoadingComments = isLoadingLevel1
  const effectiveIsFetchingComments = isFetchingLevel1
  const effectiveIsStaleComments = isStaleLevel1

  const refetchCommentsCombined = React.useCallback(() => {
    refetchLevel1()
    refetchNested()
  }, [refetchLevel1, refetchNested])

  // Query for thread path and original post
  const {
    data: threadPath = null,
    isLoading: isLoadingThreadPath
  } = useQuery({
    queryKey: ['thread', 'path', parentNoteId],
    queryFn: async (): Promise<ThreadPathResult> => {
      if (!currentParentNote) {
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
      let currentNote = currentParentNote
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

  // Combined refetch function
  const refetchAll = React.useCallback(() => {
    refetchParentNote()
    refetchLevel1()
    refetchNested()
  }, [refetchParentNote, refetchLevel1, refetchNested])

  return {
    // Current parent note
    currentParentNote,
    isLoadingParentNote,
    
    // Comments for current parent
    comments: effectiveComments,
    isLoadingComments: effectiveIsLoadingComments,
    isFetchingComments: effectiveIsFetchingComments,
    isStaleComments: effectiveIsStaleComments,
    refetchComments: refetchCommentsCombined,
    
    // Nested replies
    nestedReplies: nested.childrenByParentId,
    childrenByParentId: nested.childrenByParentId,
    isLoadingNested,
    isFetchingNested,
    isQueryingNestedReplies: isFetchingNested,
    refetchNested,
    
    // Thread path
    threadPath,
    originalPostId: threadPath?.opId || null,
    isLoadingThreadPath,
    
    // Combined refetch
    refetchAll,
  }
}
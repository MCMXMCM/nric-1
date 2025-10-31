import { useContext, useMemo, useCallback, useEffect } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { NostrContext } from '../contexts/NostrContext'
import { getGlobalRelayPool } from '../utils/nostr/relayConnectionPool'
import { classifyNotification, filterByMutedCategories } from '../utils/nostr/notifications'
import type { ClassifiedNotification } from '../utils/nostr/notifications'
import { uiStore } from '../components/lib/uiStore'
import { useUIStore } from '../components/lib/useUIStore'
import { CACHE_KEYS } from '../utils/cacheKeys'
import type { Note } from '../types/nostr/types'
import { extractImageUrls, extractVideoUrls } from '../utils/nostr/utils'
import { useSessionState } from './useSessionState'

export interface UseNotificationsResult {
  items: ClassifiedNotification[]
  isLoading: boolean
  error: string | null
  unreadCount: number
  markAllAsRead: () => void
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
}

export function useNotifications({ relayUrls }: { relayUrls: string[] }): UseNotificationsResult {
  const { pubkey } = useContext(NostrContext)
  const queryClient = useQueryClient()

  const queryKey = useMemo(() => ['notifications', pubkey, (relayUrls || []).join('|')], [pubkey, relayUrls])

  // Cache notification-related notes for faster loading
  const cacheNotificationNotes = useCallback(async (notifications: ClassifiedNotification[]) => {
    if (!notifications.length || !relayUrls.length) return

    const pool = getGlobalRelayPool()
    const noteIdsToFetch = new Set<string>()

    // Collect all note IDs referenced in notifications
    for (const notification of notifications) {
      if (notification.event?.id) {
        // For replies and mentions, we need the note that was replied to
        if (notification.type === 'reply' || notification.type === 'mention') {
          const eTags = notification.event.tags?.filter((tag: any) => tag[0] === 'e') || []
          // Use the last e-tag as the parent note (most recent reply context)
          const parentTag = eTags[eTags.length - 1]
          if (parentTag && parentTag[1]) {
            noteIdsToFetch.add(parentTag[1])
          }
        }
        // For likes, we need to cache the liked note, not the like event
        else if (notification.type === 'like') {
          const eTags = notification.event.tags?.filter((tag: any) => tag[0] === 'e') || []
          if (eTags.length > 0) {
            // Use the same logic as NotificationItem for consistency
            let targetTag = null;
            for (const tag of eTags) {
              if (tag.length >= 2 && !tag[3]) { // No marker means this is the main referenced note
                targetTag = tag;
                break;
              }
            }
            if (!targetTag && eTags.length > 0) {
              targetTag = eTags[eTags.length - 1];
            }
            if (targetTag && targetTag[1]) {
              noteIdsToFetch.add(targetTag[1])
            }
          }
        }
        // Also cache the notification event itself if it's a note (replies, mentions)
        if (notification.event.kind === 1) {
          noteIdsToFetch.add(notification.event.id)
        }
      }
    }

    if (noteIdsToFetch.size === 0) return

    // Check which notes are not already cached
    const uncachedNoteIds = Array.from(noteIdsToFetch).filter(noteId => {
      return !queryClient.getQueryData(CACHE_KEYS.NOTE(noteId))
    })

    if (uncachedNoteIds.length === 0) return

    try {
      // Fetch uncached notes
      const filter = {
        kinds: [1],
        ids: uncachedNoteIds,
        limit: uncachedNoteIds.length
      }

      const events = await pool.querySync(relayUrls, filter)

      // Cache the fetched notes
      for (const event of events) {
        const note: Note = {
          id: event.id,
          pubkey: event.pubkey,
          content: event.content || '',
          created_at: event.created_at,
          kind: (event as any).kind,
          tags: event.tags || [],
          imageUrls: extractImageUrls(event.content || ''),
          videoUrls: extractVideoUrls(event.content || ''),
          receivedAt: Date.now()
        }

        queryClient.setQueryData(CACHE_KEYS.NOTE(note.id), note)
      }

      console.log(`📋 Cached ${events.length} notification-related notes`)
    } catch (error) {
      console.warn('Failed to cache notification notes:', error)
    }
  }, [relayUrls, queryClient])

  const { 
    data, 
    isLoading, 
    error, 
    hasNextPage, 
    isFetchingNextPage, 
    fetchNextPage 
  } = useInfiniteQuery({
    queryKey,
    enabled: Boolean(pubkey && relayUrls && relayUrls.length > 0),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }): Promise<ClassifiedNotification[]> => {
      const pool = getGlobalRelayPool()
      // Fetch reactions and notes with pagination
      const filters = [
        { kinds: [7], '#p': [pubkey], limit: 50, until: pageParam },
        { kinds: [1], '#p': [pubkey], limit: 50, until: pageParam },
      ] as any[]
      const all: any[] = []
      for (const f of filters) {
        const evs = await pool.querySync(relayUrls, f)
        all.push(...evs)
      }
      
      // For reactions (kind 7), we need to fetch the notes being reacted to
      // to verify they're authored by the user
      const reactions = all.filter(ev => ev.kind === 7)
      const reactionNoteIds = new Set<string>()
      
      for (const reaction of reactions) {
        const eTags = (reaction.tags || []).filter((t: any) => Array.isArray(t) && t[0] === 'e')
        for (const eTag of eTags) {
          if (eTag[1]) reactionNoteIds.add(eTag[1])
        }
      }
      
      // Fetch the notes being reacted to
      const likedNotes = new Map<string, any>()
      if (reactionNoteIds.size > 0) {
        const noteFilter = { 
          kinds: [1], 
          ids: Array.from(reactionNoteIds), 
          limit: reactionNoteIds.size 
        } as any
        const notes = await pool.querySync(relayUrls, noteFilter)
        for (const note of notes) {
          likedNotes.set(note.id, note)
        }
      }
      
      const classified = all.map(ev => {
        if (ev.kind === 7) {
          // For reactions, check which note is being reacted to
          const eTags = (ev.tags || []).filter((t: any) => Array.isArray(t) && t[0] === 'e')
          const targetNoteId = eTags[0]?.[1]
          const targetNote = targetNoteId ? likedNotes.get(targetNoteId) : null
          const likedNoteAuthor = targetNote?.pubkey
          return classifyNotification(ev, pubkey, likedNoteAuthor)
        } else {
          return classifyNotification(ev, pubkey)
        }
      }).filter(Boolean) as ClassifiedNotification[]

      // Dedupe by id and sort desc
      const byId = new Map<string, ClassifiedNotification>()
      for (const n of classified) {
        const id = n.event?.id || `${n.actor}:${n.created_at}:${n.type}`
        const prev = byId.get(id)
        if (!prev || (n.created_at || 0) > (prev.created_at || 0)) byId.set(id, n)
      }
      return Array.from(byId.values()).sort((a, b) => (b.created_at - a.created_at))
    },
    getNextPageParam: (lastPage) => {
      // Don't stop pagination just because we got fewer notifications than requested
      // Stop only if we get zero notifications (truly no more content available)
      if (!lastPage || lastPage.length === 0) return undefined
      
      const oldest = lastPage[lastPage.length - 1]?.created_at
      if (!oldest) return undefined
      
      // Stop pagination after reaching notifications older than 60 days
      // Notifications are less likely to be relevant after this period
      const MAXIMUM_AGE_DAYS = 60;
      const maximumAgeTimestamp = Date.now() / 1000 - (MAXIMUM_AGE_DAYS * 24 * 60 * 60);
      
      if (oldest < maximumAgeTimestamp) {
        console.log(`🛑 Notifications pagination stopped: reached ${MAXIMUM_AGE_DAYS}-day limit`);
        return undefined;
      }
      
      return Math.max(0, oldest - 1);
    },
  })

  // Flatten all pages
  const allNotifications = useMemo(() => {
    if (!data?.pages) return []
    const byId = new Map<string, ClassifiedNotification>()
    for (const page of data.pages) {
      for (const n of page) {
        const id = n.event?.id || `${n.actor}:${n.created_at}:${n.type}`
        const prev = byId.get(id)
        if (!prev || (n.created_at || 0) > (prev.created_at || 0)) byId.set(id, n)
      }
    }
    return Array.from(byId.values()).sort((a, b) => (b.created_at - a.created_at))
  }, [data?.pages])

  // Cache notification-related notes when notifications are loaded
  useEffect(() => {
    if (allNotifications.length > 0 && !isLoading) {
      cacheNotificationNotes(allNotifications)
    }
  }, [allNotifications, isLoading, cacheNotificationNotes])

  const {
    muteLikes = false,
    muteReplies = false,
    muteMentions = false,
    muteReposts = false,
    muteZaps = false,
  } = useUIStore((s) => ({
    muteLikes: s.muteLikes,
    muteReplies: s.muteReplies,
    muteMentions: s.muteMentions,
    muteReposts: s.muteReposts,
    muteZaps: s.muteZaps,
  }))

  const mutedFiltered = useMemo(() => {
    const items = allNotifications || []
    return filterByMutedCategories(items, {
      muteLikes,
      muteReplies,
      muteMentions,
      muteReposts,
      muteZaps,
    })
  }, [allNotifications, muteLikes, muteReplies, muteMentions, muteReposts, muteZaps])

  // Unread count using a simple last-seen timestamp per pubkey
  const notificationsLastSeen = useUIStore((s) => s.notificationsLastSeen || {})
  const unreadCount = useMemo(() => {
    const lastSeenTs = Number((notificationsLastSeen as any)[pubkey] || 0)
    return (mutedFiltered || []).filter(n => (n.created_at || 0) > lastSeenTs).length
  }, [mutedFiltered, pubkey, notificationsLastSeen])

  const markAllAsRead = useCallback(() => {
    const latest = (mutedFiltered[0]?.created_at || Math.floor(Date.now() / 1000))
    try {
      const s: any = (uiStore.state as any)
      const next = { ...(s.notificationsLastSeen || {}), [pubkey]: latest }
      // persist
      try { localStorage.setItem('notificationsLastSeen', JSON.stringify(next)) } catch {}
      // update store state without adding new API
      uiStore.setState((prev: any) => ({ ...prev, notificationsLastSeen: next }))
    } catch {}
  }, [mutedFiltered, pubkey])

  return {
    items: mutedFiltered,
    isLoading,
    error: (error as any)?.message || null,
    unreadCount,
    markAllAsRead,
    hasNextPage: hasNextPage || false,
    isFetchingNextPage: isFetchingNextPage || false,
    fetchNextPage,
  }
}

const PAGE_SIZE = 20

export interface UseNotificationsPaginationResult {
  visibleCount: number
  handleLoadMore: () => Promise<void>
}

/**
 * Hook to manage pagination state for notifications with session persistence
 */
export function useNotificationsPagination(
  items: ClassifiedNotification[],
  hasNextPage: boolean,
  fetchNextPage: () => void,
  pubkey: string | undefined
): UseNotificationsPaginationResult {
  // Persist pagination state using useSessionState
  const [visibleCount, setVisibleCount] = useSessionState<number>(
    pubkey ? `visibleCount:${pubkey}:notifications` : `visibleCount:anonymous:notifications`,
    PAGE_SIZE
  )

  // Handle load more notifications
  const handleLoadMore = useCallback(async () => {
    const nextVisible = visibleCount + PAGE_SIZE
    // If we already have enough loaded to show next page, just increase the count
    if (items.length >= nextVisible) {
      setVisibleCount(nextVisible)
      return
    }
    // Otherwise fetch more if available
    if (hasNextPage) {
      fetchNextPage()
      setVisibleCount((prev) => prev + PAGE_SIZE)
    }
  }, [visibleCount, items.length, hasNextPage, fetchNextPage, setVisibleCount])

  return {
    visibleCount,
    handleLoadMore,
  }
}


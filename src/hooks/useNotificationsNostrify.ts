import { useContext, useMemo, useCallback, useEffect, useState } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useNostr } from '@nostrify/react'
import { NostrContext } from '../contexts/NostrContext'
import { classifyNotification, filterByMutedCategories, buildNotificationStableKey, getTargetNoteIdFromEvent } from '../utils/nostr/notifications'
import type { ClassifiedNotification } from '../utils/nostr/notifications'
import { uiStore, subscribeUI } from '../components/lib/uiStore'
import { useUIStore } from '../components/lib/useUIStore'
import { CACHE_KEYS } from '../utils/cacheKeys'
import type { Note } from '../types/nostr/types'
import { extractImageUrls, extractVideoUrls } from '../utils/nostr/utils'
import { useSessionState } from './useSessionState'
import type { NostrFilter } from '@nostrify/nostrify'
import { getGlobalRelayPool } from '../utils/nostr/relayConnectionPool'

export interface UseNotificationsNostrifyResult {
  items: ClassifiedNotification[]
  isLoading: boolean
  error: string | null
  unreadCount: number
  markAllAsRead: () => void
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
}

export function useNotificationsNostrify({ relayUrls }: { relayUrls: string[] }): UseNotificationsNostrifyResult {
  const { pubkey } = useContext(NostrContext)
  const { nostr } = useNostr()
  const queryClient = useQueryClient()

  const queryKey = useMemo(() => ['notifications-nostrify', pubkey, (relayUrls || []).join('|')], [pubkey, relayUrls])

  // Cache notification-related notes for faster loading
  const cacheNotificationNotes = useCallback(async (notifications: ClassifiedNotification[]) => {
    if (!notifications.length || !relayUrls.length || !nostr) return

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
      // Fetch uncached notes using nostrify
      const filter: NostrFilter = {
        kinds: [1],
        ids: uncachedNoteIds,
        limit: uncachedNoteIds.length
      }

      const events = await nostr.query([filter])

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

      console.log(`📋 Cached ${events.length} notification-related notes using nostrify`)
    } catch (error) {
      console.warn('Failed to cache notification notes with nostrify:', error)
    }
  }, [relayUrls, queryClient, nostr])

  const { 
    data, 
    isLoading, 
    error, 
    hasNextPage, 
    isFetchingNextPage, 
    fetchNextPage 
  } = useInfiniteQuery({
    queryKey,
    enabled: Boolean(pubkey && relayUrls && relayUrls.length > 0 && nostr),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }): Promise<ClassifiedNotification[]> => {
      // Deterministic fetching across the user's connected read relays
      const pool = getGlobalRelayPool()
      const filters: NostrFilter[] = [
        { kinds: [7], '#p': [pubkey], limit: 50, until: pageParam },
        { kinds: [1], '#p': [pubkey], limit: 50, until: pageParam },
      ]
      const all: any[] = []
      for (const f of filters) {
        // Primary: deterministic via connected relays
        try {
          const evs = await pool.querySync(relayUrls, f as any)
          all.push(...evs)
        } catch {}
        // Fallback/augment: nostrify client (keeps tests working and fills gaps)
        try {
          const evs2 = await nostr?.query([f])
          if (Array.isArray(evs2)) all.push(...evs2)
        } catch {}
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
        const noteFilter: NostrFilter = { kinds: [1], ids: Array.from(reactionNoteIds), limit: reactionNoteIds.size }
        let notes: any[] = []
        try {
          notes = await pool.querySync(relayUrls, noteFilter as any)
        } catch {}
        if (!Array.isArray(notes) || notes.length === 0) {
          try {
            const fromNostr = await nostr?.query([noteFilter])
            if (Array.isArray(fromNostr)) notes = fromNostr
          } catch {}
        }
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

      // Enrich with targetNoteId for stability and future per-note mutes
      const resolveTarget = (event: any): string | null => {
        try {
          if (typeof getTargetNoteIdFromEvent === 'function') {
            return getTargetNoteIdFromEvent(event) as any
          }
        } catch {}
        // Fallback extraction
        const kind = Number(event?.kind)
        const tags: any[] = Array.isArray(event?.tags) ? event.tags : []
        const eTags = tags.filter((t) => Array.isArray(t) && t[0] === 'e')
        if (kind === 1 && eTags.length > 0) {
          const last = eTags[eTags.length - 1]
          if (last && last[1]) return last[1]
          const root = eTags.find((t: any) => t[3] === 'root')
          if (root && root[1]) return root[1]
          if (eTags[0] && eTags[0][1]) return eTags[0][1]
          return null
        }
        if (kind === 1 && eTags.length === 0) return event?.id || null
        if ((kind === 7 || kind === 9735 || kind === 6) && eTags.length > 0) {
          for (const tag of eTags) {
            if (Array.isArray(tag) && tag.length >= 2 && !tag[3]) return tag[1] || null
          }
          const last = eTags[eTags.length - 1]
          return (last && last[1]) || null
        }
        return null
      }

      const enriched: ClassifiedNotification[] = classified.map((n) => ({
        ...n,
        targetNoteId: resolveTarget(n.event)
      }))

      // Dedupe by id and sort desc
      const byId = new Map<string, ClassifiedNotification>()
      const buildKey = (n: ClassifiedNotification): string => {
        try {
          if (typeof buildNotificationStableKey === 'function') return buildNotificationStableKey(n)
        } catch {}
        const targetId = n.targetNoteId ?? resolveTarget(n.event) ?? 'unknown'
        return n?.event?.id || `${n.actor}:${n.type}:${targetId}:${n.created_at}`
      }

      for (const n of enriched) {
        const key = buildKey(n)
        const prev = byId.get(key)
        if (!prev || (n.created_at || 0) > (prev.created_at || 0)) byId.set(key, n)
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
        const key = (() => {
          try {
            if (typeof buildNotificationStableKey === 'function') return buildNotificationStableKey(n)
          } catch {}
          const targetId = n.targetNoteId ?? ((): string | null => {
            try { if (typeof getTargetNoteIdFromEvent === 'function') return getTargetNoteIdFromEvent(n.event) as any } catch {}
            return null
          })() ?? 'unknown'
          return n?.event?.id || `${n.actor}:${n.type}:${targetId}:${n.created_at}`
        })()
        const prev = byId.get(key)
        if (!prev || (n.created_at || 0) > (prev.created_at || 0)) byId.set(key, n)
      }
    }
    return Array.from(byId.values()).sort((a, b) => (b.created_at - a.created_at))
  }, [data?.pages])

  // Always show the last 100 notifications (regardless of read status)
  // The unread count will be calculated separately based on lastSeen timestamp
  const cappedNotifications = useMemo(() => {
    return allNotifications.length > 100 ? allNotifications.slice(0, 100) : allNotifications
  }, [allNotifications])

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

  // Reactive subscription to per-note mutes to work with tests that mock useUIStore non-reactively
  const [mutedIds, setMutedIds] = useState<string[]>(() => uiStore.state.mutedNotificationTargetIds || [])
  useEffect(() => {
    const unsub = subscribeUI((s) => {
      setMutedIds(s.mutedNotificationTargetIds || [])
    })
    return () => { try { unsub() } catch {} }
  }, [])

  const mutedFiltered = useMemo(() => {
    const items = cappedNotifications || []
    const categoryFiltered = filterByMutedCategories(items, {
      muteLikes,
      muteReplies,
      muteMentions,
      muteReposts,
      muteZaps,
    })
    if (!mutedIds || mutedIds.length === 0) return categoryFiltered
    const mutedSet = new Set(mutedIds)
    return categoryFiltered.filter((n) => {
      const targetId = n.targetNoteId ?? (() => {
        try { return getTargetNoteIdFromEvent(n.event) as any } catch { return null }
      })()
      return targetId ? !mutedSet.has(targetId) : true
    })
  }, [cappedNotifications, muteLikes, muteReplies, muteMentions, muteReposts, muteZaps, mutedIds])

  // Unread count: count all notifications after lastSeen timestamp (not just the displayed ones)
  const notificationsLastSeen = useUIStore((s) => s.notificationsLastSeen || {})
  const unreadCount = useMemo(() => {
    const ls = Number((notificationsLastSeen as any)[pubkey] || 0)
    return (allNotifications || []).filter(n => (n.created_at || 0) > ls).length
  }, [allNotifications, pubkey, notificationsLastSeen])

  const markAllAsRead = useCallback(() => {
    const latest = (allNotifications[0]?.created_at || Math.floor(Date.now() / 1000))
    try {
      const s: any = (uiStore.state as any)
      const next = { ...(s.notificationsLastSeen || {}), [pubkey]: latest }
      // persist
      try { localStorage.setItem('notificationsLastSeen', JSON.stringify(next)) } catch {}
      // update store state without adding new API
      uiStore.setState((prev: any) => ({ ...prev, notificationsLastSeen: next }))
      
      // Invalidate notification count cache to update amber light immediately
      queryClient.invalidateQueries({
        queryKey: ['notification-count-nostrify', pubkey]
      })
    } catch {}
  }, [allNotifications, pubkey, queryClient])

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

export interface UseNotificationsPaginationNostrifyResult {
  visibleCount: number
  handleLoadMore: () => Promise<void>
}

/**
 * Hook to manage pagination state for notifications with session persistence
 */
export function useNotificationsPaginationNostrify(
  items: ClassifiedNotification[],
  hasNextPage: boolean,
  fetchNextPage: () => void,
  pubkey: string | undefined
): UseNotificationsPaginationNostrifyResult {
  // Persist pagination state using useSessionState
  const [visibleCount, setVisibleCount] = useSessionState<number>(
    pubkey ? `visibleCount:${pubkey}:notifications-nostrify` : `visibleCount:anonymous:notifications-nostrify`,
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

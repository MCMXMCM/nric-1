import { useContext, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { NostrContext } from '../contexts/NostrContext'
import { getGlobalRelayPool } from '../utils/nostr/relayConnectionPool'
import { classifyNotification, filterByMutedCategories } from '../utils/nostr/notifications'
import { useUIStore } from '../components/lib/useUIStore'

export interface UseNotificationCountResult {
  unreadCount: number
  isLoading: boolean
  error: string | null
}

/**
 * Lightweight hook to get just the unread notification count for UI indicators
 * Uses a smaller query focused only on recent notifications
 */
export function useNotificationCount({ 
  relayUrls 
}: { 
  relayUrls: string[] 
}): UseNotificationCountResult {
  const { pubkey } = useContext(NostrContext) as any
  
  const queryKey = useMemo(() => ['notification-count', pubkey, (relayUrls || []).join('|')], [pubkey, relayUrls])

  const { 
    data: notifications = [], 
    isLoading, 
    error 
  } = useQuery({
    queryKey,
    enabled: Boolean(pubkey && relayUrls && relayUrls.length > 0),
    staleTime: 30_000, // 30 seconds - frequent enough for timely updates
    gcTime: 2 * 60_000, // 2 minutes
    queryFn: async () => {
      const pool = getGlobalRelayPool()
      
      // Only fetch recent notifications (last 24 hours) to keep it lightweight
      const since = Math.floor(Date.now() / 1000) - (24 * 60 * 60)
      
      const filters = [
        { kinds: [7], '#p': [pubkey], limit: 100, since }, // reactions
        { kinds: [1], '#p': [pubkey], limit: 100, since }, // mentions/replies
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
      
      const classified = all
        .map(ev => {
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
        })
        .filter((n): n is NonNullable<typeof n> => Boolean(n))
      
      // Dedupe by id
      const byId = new Map<string, any>()
      for (const n of classified) {
        const id = n.event?.id || `${n.actor}:${n.created_at}:${n.type}`
        const prev = byId.get(id)
        if (!prev || (n.created_at || 0) > (prev.created_at || 0)) {
          byId.set(id, n)
        }
      }
      
      return Array.from(byId.values()).sort((a, b) => (b.created_at - a.created_at))
    },
  })

  // Apply mute filters
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

  const filteredNotifications = useMemo(() => {
    return filterByMutedCategories(notifications || [], {
      muteLikes,
      muteReplies,
      muteMentions,
      muteReposts,
      muteZaps,
    })
  }, [notifications, muteLikes, muteReplies, muteMentions, muteReposts, muteZaps])

  // Calculate unread count
  const notificationsLastSeen = useUIStore((s) => s.notificationsLastSeen || {})
  const unreadCount = useMemo(() => {
    const lastSeenTs = Number((notificationsLastSeen as any)[pubkey] || 0)
    return (filteredNotifications || []).filter(n => (n.created_at || 0) > lastSeenTs).length
  }, [filteredNotifications, pubkey, notificationsLastSeen])

  return {
    unreadCount,
    isLoading,
    error: (error as any)?.message || null,
  }
}

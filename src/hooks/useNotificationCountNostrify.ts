import { useContext, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNostr } from '@nostrify/react'
import { NostrContext } from '../contexts/NostrContext'
import { classifyNotification, filterByMutedCategories } from '../utils/nostr/notifications'
import { useUIStore } from '../components/lib/useUIStore'
import type { NostrFilter } from '@nostrify/nostrify'

export interface UseNotificationCountNostrifyResult {
  unreadCount: number
  isLoading: boolean
  error: string | null
}

/**
 * Lightweight hook to get just the unread notification count for UI indicators
 * Uses nostrify NPool for better performance and reliability
 */
export function useNotificationCountNostrify({ 
  relayUrls 
}: { 
  relayUrls: string[] 
}): UseNotificationCountNostrifyResult {
  const { pubkey } = useContext(NostrContext) as any
  const { nostr } = useNostr()
  
  const queryKey = useMemo(() => ['notification-count-nostrify', pubkey, (relayUrls || []).join('|')], [pubkey, relayUrls])

  const { 
    data: notifications = [], 
    isLoading, 
    error 
  } = useQuery({
    queryKey,
    enabled: Boolean(pubkey && relayUrls && relayUrls.length > 0 && nostr),
    staleTime: 30_000, // 30 seconds - frequent enough for timely updates
    gcTime: 2 * 60_000, // 2 minutes
    queryFn: async () => {
      if (!nostr) throw new Error('Nostrify pool not available')
      
      // Only fetch recent notifications (last 24 hours) to keep it lightweight
      const since = Math.floor(Date.now() / 1000) - (24 * 60 * 60)
      
      const filters: NostrFilter[] = [
        { kinds: [7], '#p': [pubkey], limit: 100, since }, // reactions
        { kinds: [1], '#p': [pubkey], limit: 100, since }, // mentions/replies
      ]
      
      const all: any[] = []
      for (const filter of filters) {
        const events = await nostr.query([filter])
        all.push(...events)
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
        const noteFilter: NostrFilter = { 
          kinds: [1], 
          ids: Array.from(reactionNoteIds), 
          limit: reactionNoteIds.size 
        }
        const notes = await nostr.query([noteFilter])
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

  const mutedFiltered = useMemo(() => {
    return filterByMutedCategories(notifications, {
      muteLikes,
      muteReplies,
      muteMentions,
      muteReposts,
      muteZaps,
    })
  }, [notifications, muteLikes, muteReplies, muteMentions, muteReposts, muteZaps])

  // Unread count using a simple last-seen timestamp per pubkey
  const notificationsLastSeen = useUIStore((s) => s.notificationsLastSeen || {})
  const unreadCount = useMemo(() => {
    const lastSeenTs = Number((notificationsLastSeen as any)[pubkey] || 0)
    return (mutedFiltered || []).filter(n => (n.created_at || 0) > lastSeenTs).length
  }, [mutedFiltered, pubkey, notificationsLastSeen])

  return {
    unreadCount,
    isLoading,
    error: (error as any)?.message || null,
  }
}

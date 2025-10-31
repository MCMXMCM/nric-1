export type NotificationType = 'like' | 'reply' | 'mention' | 'repost' | 'zap'

export interface ClassifiedNotification {
  type: NotificationType
  actor: string // pubkey of the actor
  created_at: number
  event: any
  // Optional: computed target note id this notification is about (liked note, parent of reply, etc.)
  targetNoteId?: string | null
}

export function classifyNotification(event: any, myPubkeyHex: string, likedNoteAuthor?: string): ClassifiedNotification | null {
  if (!event || !myPubkeyHex) return null
  const kind = Number(event.kind)
  const tags: string[][] = Array.isArray(event.tags) ? event.tags : []
  const pTags = tags.filter(t => Array.isArray(t) && t[0] === 'p').map(t => t[1]).filter(Boolean)
  const eTags = tags.filter(t => Array.isArray(t) && t[0] === 'e')

  // Reaction / Like (kind 7) to me
  if (kind === 7) {
    // For likes, we need to ensure the like is actually on a note authored by the user
    // Check both pTags (legacy behavior) and likedNoteAuthor (more accurate)
    const isInPTags = pTags.includes(myPubkeyHex)
    const isOnMyNote = likedNoteAuthor === myPubkeyHex
    
    if (isInPTags && (isOnMyNote || likedNoteAuthor === undefined)) {
      return { type: 'like', actor: event.pubkey, created_at: event.created_at || 0, event }
    }
  }

  // Reply (kind 1) referencing an e-tag, to me if I'm in p-tags
  if (kind === 1 && eTags.length > 0) {
    if (pTags.includes(myPubkeyHex)) {
      return { type: 'reply', actor: event.pubkey, created_at: event.created_at || 0, event }
    }
  }

  // Mention (kind 1) no e-tag, but p-tag includes me
  if (kind === 1 && eTags.length === 0) {
    if (pTags.includes(myPubkeyHex)) {
      return { type: 'mention', actor: event.pubkey, created_at: event.created_at || 0, event }
    }
  }

  // Repost (kind 6) mentioning me (optional)
  if (kind === 6 && pTags.includes(myPubkeyHex)) {
    return { type: 'repost', actor: event.pubkey, created_at: event.created_at || 0, event }
  }

  // Zap (kind 9735) to me (optional placeholder)
  if (kind === 9735 && pTags.includes(myPubkeyHex)) {
    return { type: 'zap', actor: event.pubkey, created_at: event.created_at || 0, event }
  }

  return null
}

export function filterByMutedCategories<T extends ClassifiedNotification>(
  items: T[],
  opts: {
    muteLikes?: boolean
    muteReplies?: boolean
    muteMentions?: boolean
    muteReposts?: boolean
    muteZaps?: boolean
  }
): T[] {
  return items.filter((n) => {
    if (opts.muteLikes && n.type === 'like') return false
    if (opts.muteReplies && n.type === 'reply') return false
    if (opts.muteMentions && n.type === 'mention') return false
    if (opts.muteReposts && n.type === 'repost') return false
    if (opts.muteZaps && n.type === 'zap') return false
    return true
  })
}

/**
 * Extract the target note id from a raw Nostr event, following NotificationItem behavior:
 * - For likes/zaps/reposts (events that reference another note via e-tags):
 *   prefer an unmarked 'e' tag, otherwise use the last 'e' tag
 * - For replies (kind 1 with e-tags):
 *   prefer the last 'e' tag (most recent reply context), then a 'root' marker, then first 'e'
 * - For mentions (kind 1 without e-tags): return the event id itself
 */
export function getTargetNoteIdFromEvent(event: any): string | null {
  if (!event) return null
  const kind = Number(event.kind)
  const tags: any[] = Array.isArray(event.tags) ? event.tags : []
  const eTags = tags.filter((t) => Array.isArray(t) && t[0] === 'e')

  // Reply (kind 1 with e-tags): extract parent context
  if (kind === 1 && eTags.length > 0) {
    const lastTag = eTags[eTags.length - 1]
    if (lastTag && lastTag[1]) return lastTag[1]
    const rootTag = eTags.find((t: any) => t[3] === 'root')
    if (rootTag && rootTag[1]) return rootTag[1]
    if (eTags[0] && eTags[0][1]) return eTags[0][1]
    return null
  }

  // Mention (kind 1 without e-tags): the event itself
  if (kind === 1 && eTags.length === 0) {
    return event.id || null
  }

  // Like/Zap/Repost: find referenced note via e-tags
  if ((kind === 7 || kind === 9735 || kind === 6) && eTags.length > 0) {
    // Prefer unmarked e-tag (no marker at index 3)
    for (const tag of eTags) {
      if (Array.isArray(tag) && tag.length >= 2 && !tag[3]) {
        return tag[1] || null
      }
    }
    // Fallback to the last e-tag
    const last = eTags[eTags.length - 1]
    return (last && last[1]) || null
  }

  return null
}

/**
 * Build a stable dedupe key for a classified notification.
 * Uses event id when present; otherwise includes actor, type, target id, and timestamp.
 */
export function buildNotificationStableKey(n: ClassifiedNotification): string {
  if (n?.event?.id) return String(n.event.id)
  const targetId = n.targetNoteId ?? getTargetNoteIdFromEvent(n.event) ?? 'unknown'
  return `${n.actor}:${n.type}:${targetId}:${n.created_at}`
}



// Lightweight route prefetch helpers
// These preload code-split route chunks and can also prewarm React Query data.

import { nip19 } from 'nostr-tools'
import { SimplePool, type Event } from 'nostr-tools'
import type { Note } from '../types/nostr/types'
import { fetchUserMetadata, loadUserNotes } from '../utils/profileMetadataUtils'
import { DEFAULT_RELAY_URLS } from './nostr/constants'
import { CACHE_KEYS } from './cacheKeys'

function getQueryClient(): any | undefined {
  try {
    return (window as any).__queryClient
  } catch {
    return undefined
  }
}

/** Prefetch route component bundles based on a target path. */
export async function prefetchRoute(path: string): Promise<void> {
  try {
    if (!path || typeof path !== 'string') return;
    // Normalize to pathname without origin
    const url = safeParseUrl(path);
    const pathname = url?.pathname || path;

    if (pathname === '/' || pathname === '') {
      // Home feed
      await import('../components/NostrFeed');
      return;
    }

    if (pathname.startsWith('/create')) {
      await import('../components/CreateView');
      return;
    }

    if (pathname.startsWith('/note/')) {
      // Note view and thread dependencies
      await Promise.all([

        import('../components/NoteView'),
      ]);
      // Best-effort query data prewarm
      const bech = pathname.split('/note/')[1]?.split(/[?#]/)[0] || ''
      if (bech) {
        await prefetchNoteData(bech)
      }
      return;
    }

    if (pathname.startsWith('/npub/')) {
      // Profile and common nested routes
      await Promise.all([
        import('../components/ProfileView'),
        import('../components/profile/ProfileNotesRoute'),
        import('../components/profile/ProfileFollowersRoute'),
        import('../components/profile/ProfileFollowingRoute'),
        import('../components/profile/ProfileMuteListRoute'),
        import('../components/profile/ProfileRelaysRoute'),
        import('../components/profile/RelayDiscoveryModal'),
      ]);
      // Best-effort profile query data prewarm
      const bech = pathname.split('/npub/')[1]?.split('/')[0]?.split(/[?#]/)[0] || ''
      if (bech) {
        await prefetchProfileData(bech)
      }
      return;
    }
  } catch {
    // Best-effort prefetch; ignore failures
  }
}

/** Attempt to parse an arbitrary string as URL, falling back to relative path handling. */
function safeParseUrl(raw: string): URL | null {
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return new URL(raw);
    }
    return new URL(raw, window.location.origin);
  } catch {
    return null;
  }
}

async function prefetchNoteData(bech32: string): Promise<void> {
  const client = getQueryClient()
  if (!client) return

  let hexId: string | null = null
  try {
    const decoded = nip19.decode(bech32) as any
    if (decoded.type === 'note') {
      hexId = decoded.data as string
    } else if (decoded.type === 'nevent') {
      hexId = decoded?.data?.id || null
    }
  } catch {
    // leave hexId null
  }
  if (!hexId) return

  const queryKey = ['note', hexId]
  // Avoid duplicate work
  if (client.getQueryData(queryKey)) return

  try {
    await client.prefetchQuery({
      queryKey,
      staleTime: 30 * 1000,
      gcTime: 10 * 60 * 1000,
      queryFn: async () => {
        const pool = new SimplePool()
        const events: Event[] = await pool.querySync(
          DEFAULT_RELAY_URLS,
          { kinds: [1], ids: [hexId], limit: 1 } as any
        )
        pool.close(DEFAULT_RELAY_URLS)
        if (Array.isArray(events) && events.length > 0) {
          const ev = events[0]
          const mapped: Note = {
            id: ev.id,
            content: ev.content || '',
            pubkey: ev.pubkey,
            created_at: ev.created_at,
            tags: ev.tags || [],
            imageUrls: [],
            videoUrls: [],
            receivedAt: Date.now(),
          }
          return mapped
        }
        return undefined as unknown as Note
      },
    })
  } catch {
    // ignore
  }
}

async function prefetchProfileData(bech32: string): Promise<void> {
  const client = getQueryClient()
  if (!client) return

  let pubkeyHex: string | null = null
  try {
    const decoded = nip19.decode(bech32) as any
    if (decoded.type === 'npub') pubkeyHex = decoded.data as string
    else if (decoded.type === 'nprofile') pubkeyHex = decoded?.data?.pubkey || null
    else if (bech32.startsWith('npub1')) pubkeyHex = (nip19.decode(bech32) as any).data as string
  } catch {
    // ignore
  }
  if (!pubkeyHex) return

  const relayKey = JSON.stringify([...DEFAULT_RELAY_URLS].sort())

  // Prefetch metadata (kind 0) - use same cache configuration as runtime queries
  try {
    await client.prefetchQuery({
      queryKey: ['metadata', pubkeyHex],
      queryFn: async () => {
        return await fetchUserMetadata({ pubkeyHex, relayUrls: DEFAULT_RELAY_URLS })
      },
      staleTime: 2 * 60 * 1000, // Match useProfileData staleTime
      gcTime: 10 * 60 * 1000,
    })
  } catch {
    // ignore
  }

  // Prefetch first page of notes lightly
  try {
    const firstPage = await loadUserNotes({ pubkeyHex, relayUrls: DEFAULT_RELAY_URLS, pageSize: 10 }, client)
    // Use the proper cache key function to ensure consistency
    const key = CACHE_KEYS.PROFILE.NOTES(pubkeyHex, relayKey)
    const existing = client.getQueryData(key)
    if (!existing && firstPage) {
      client.setQueryData(key, { pages: [firstPage], pageParams: [undefined] })
    }
  } catch {
    // ignore
  }
}



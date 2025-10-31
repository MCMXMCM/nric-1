import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getGlobalRelayPool } from '../utils/nostr/relayConnectionPool';
import { CACHE_KEYS } from '../utils/cacheKeys';
import type { Filter } from 'nostr-tools';

interface UseFollowingMetadataPreloadConfig {
  pubkeyHex: string | undefined;
  relayUrls: string[];
  enabled?: boolean;
  addDisplayNamesFromMetadata: (metadata: Record<string, any>) => void;
}

/**
 * Hook to preload metadata for all following contacts
 * This ensures mention suggestions show all available display names
 * instead of just the ones that have been loaded on the feed
 */
export function useFollowingMetadataPreload({
  pubkeyHex,
  relayUrls,
  enabled = true,
  addDisplayNamesFromMetadata,
}: UseFollowingMetadataPreloadConfig) {
  // First, get the user's following list
  const followingQuery = useQuery({
    queryKey: CACHE_KEYS.CONTACTS(pubkeyHex || ''),
    enabled: enabled && !!pubkeyHex && relayUrls.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    queryFn: async () => {
      const pool = getGlobalRelayPool();
      const filter: Filter = {
        kinds: [3],
        authors: [pubkeyHex!],
        limit: 1,
      };

      const events = await pool.querySync(relayUrls, filter);
      const contacts: string[] = [];

      if (events.length > 0) {
        const event = events[0];
        for (const tag of event.tags || []) {
          if (tag[0] === 'p' && tag[1]) {
            contacts.push(tag[1]);
          }
        }
      }

      return contacts;
    },
  });

  // Then, fetch metadata for all following contacts
  const followingMetadataQuery = useQuery({
    queryKey: CACHE_KEYS.PROFILE.CONTACTS_METADATA(followingQuery.data || [], JSON.stringify(relayUrls)),
    enabled: enabled && (followingQuery.data?.length || 0) > 0 && relayUrls.length > 0,
    staleTime: 10 * 60 * 1000, // 10 minutes - metadata changes less frequently
    gcTime: 30 * 60 * 1000, // 30 minutes
    queryFn: async () => {
      if (!followingQuery.data || followingQuery.data.length === 0) {
        return {};
      }

      const pool = getGlobalRelayPool();
      const filter: Filter = {
        kinds: [0],
        authors: followingQuery.data,
        limit: followingQuery.data.length,
      };

      const events = await pool.querySync(relayUrls, filter);
      const metadata: Record<string, any> = {};

      events.forEach((event: any) => {
        try {
          const content = JSON.parse(event.content || '{}');
          metadata[event.pubkey] = {
            name: content.name || '',
            display_name: content.display_name || content.displayName || '',
            picture: content.picture || '',
            about: content.about || '',
            nip05: content.nip05 || '',
            website: content.website || content.lud16 || '',
            banner: content.banner || '',
            lud16: content.lud16 || '',
          };
        } catch (error) {
          // Ignore parse errors
        }
      });

      return metadata;
    },
  });

  // Update display names cache whenever metadata is loaded
  useEffect(() => {
    if (followingMetadataQuery.data && Object.keys(followingMetadataQuery.data).length > 0) {
      addDisplayNamesFromMetadata(followingMetadataQuery.data);
      console.log(
        `✅ Preloaded ${Object.keys(followingMetadataQuery.data).length} following contact display names for mentions`
      );
    }
  }, [followingMetadataQuery.data, addDisplayNamesFromMetadata]);

  return {
    isLoading: followingQuery.isLoading || followingMetadataQuery.isLoading,
    error: followingQuery.error || followingMetadataQuery.error,
    followingCount: followingQuery.data?.length || 0,
    metadataCount: Object.keys(followingMetadataQuery.data || {}).length,
  };
}

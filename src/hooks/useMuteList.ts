import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useContext } from 'react';
import { NostrContext } from '../contexts/NostrContext';
import { fetchUserMuteList } from '../utils/nostr/publish';

/**
 * Hook to manage the current user's mute list
 */
export function useMuteList(relayUrls: string[]) {
  const { nostrClient, pubkey: userPubkey } = useContext(NostrContext);

  const {
    data: mutedPubkeys = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['mute-list', userPubkey, relayUrls.join('|')],
    enabled: Boolean(userPubkey && nostrClient && relayUrls.length > 0),
    queryFn: async () => {
      if (!userPubkey || !nostrClient) return [];
      return await fetchUserMuteList({
        pool: nostrClient,
        relayUrls,
        userPubkey
      });
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  });

  const isUserMuted = useCallback((targetPubkey: string): boolean => {
    return mutedPubkeys.includes(targetPubkey);
  }, [mutedPubkeys]);

  return {
    mutedPubkeys,
    isUserMuted,
    isLoading,
    error,
    refetch
  };
}

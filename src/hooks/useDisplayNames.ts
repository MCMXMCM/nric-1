import { useState, useEffect, useCallback, useContext } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { NostrContext } from '../contexts/NostrContext';
import type { Metadata } from '../types/nostr/types';
import type { Filter, Event } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import {
  loadDisplayNamesFromStorage,
  addDisplayNameToCache,
  getDisplayNameWithFallback,
  addDisplayNamesBatch,
  getPubkeysNeedingDisplayNames,
  clearExpiredDisplayNames,
  clearDisplayNamesCache
} from '../utils/nostr/userDisplayNames';
import { formatPubkey } from '../utils/nostr/pubkeyFormatting';

interface DisplayNameState {
  [pubkey: string]: string;
}

interface FetchStatus {
  [pubkey: string]: {
    status: 'pending' | 'success' | 'failed';
    lastAttempt: number;
    attempts: number;
  };
}

export const useDisplayNames = (relayUrls: string[]) => {
  const { nostrClient } = useContext(NostrContext);
  const queryClient = useQueryClient();
  const [displayNames, setDisplayNames] = useState<DisplayNameState>({});
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>({});
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize display names from storage
  useEffect(() => {
    const initializeDisplayNames = () => {
      try {
        // Only run on client side
        if (typeof window === 'undefined') {
          setIsInitialized(true);
          return;
        }
        
        const cachedNames = loadDisplayNamesFromStorage();
        const displayNameMap: DisplayNameState = {};
        
        Object.entries(cachedNames).forEach(([pubkey, entry]) => {
          displayNameMap[pubkey] = entry.displayName;
        });
        
        setDisplayNames(displayNameMap);
        setIsInitialized(true);
        
        // Clear expired entries in the background
        clearExpiredDisplayNames();
      } catch (error) {
        console.error('Error initializing display names:', error);
        setIsInitialized(true);
      }
    };

    initializeDisplayNames();
  }, []);

  // Fetch metadata for pubkeys that need display names
  const fetchDisplayNames = useCallback(async (pubkeys: string[]) => {
    if (!nostrClient || pubkeys.length === 0 || relayUrls.length === 0) return;

    const pubkeysToFetch = getPubkeysNeedingDisplayNames(pubkeys);
    if (pubkeysToFetch.length === 0) return;

    // Update fetch status for pubkeys being fetched
    setFetchStatus(prev => {
      const newStatus = { ...prev };
      pubkeysToFetch.forEach(pubkey => {
        newStatus[pubkey] = {
          status: 'pending',
          lastAttempt: Date.now(),
          attempts: (prev[pubkey]?.attempts || 0) + 1
        };
      });
      return newStatus;
    });

    try {
      const metadataFilter: Filter = {
        kinds: [0],
        authors: pubkeysToFetch
      };

      const receivedPubkeys = new Set<string>();
      const metadataMap: Record<string, Metadata> = {};

      const sub = nostrClient.subscribeMany(relayUrls, [metadataFilter], {
        onevent: (event: Event) => {
          try {
            const metadata = JSON.parse(event.content) as Metadata;
            receivedPubkeys.add(event.pubkey);
            metadataMap[event.pubkey] = metadata;
            
            // Add to cache immediately
            addDisplayNameToCache(event.pubkey, metadata, event.created_at);
            
            // Update state
            setDisplayNames(prev => ({
              ...prev,
              [event.pubkey]: metadata.display_name || metadata.name || ''
            }));
            
            setFetchStatus(prev => ({
              ...prev,
              [event.pubkey]: {
                status: 'success',
                lastAttempt: Date.now(),
                attempts: prev[event.pubkey]?.attempts || 1
              }
            }));
          } catch (error) {
            console.error('Error parsing metadata:', error);
            setFetchStatus(prev => ({
              ...prev,
              [event.pubkey]: {
                status: 'failed',
                lastAttempt: Date.now(),
                attempts: prev[event.pubkey]?.attempts || 1
              }
            }));
          }
        },
        onclose: () => {
          // Mark unfetched pubkeys as failed
          pubkeysToFetch.forEach(pubkey => {
            if (!receivedPubkeys.has(pubkey)) {
              setFetchStatus(prev => {
                if (prev[pubkey]?.status === 'pending') {
                  return {
                    ...prev,
                    [pubkey]: {
                      status: 'failed',
                      lastAttempt: Date.now(),
                      attempts: prev[pubkey].attempts
                    }
                  };
                }
                return prev;
              });
            }
          });
        }
      });

      // Close subscription after 10 seconds
      setTimeout(() => {
        sub.close();
      }, 10000);

    } catch (error) {
      console.error('Error fetching display names:', error);
      // Mark all pubkeys as failed
      setFetchStatus(prev => {
        const newStatus = { ...prev };
        pubkeysToFetch.forEach(pubkey => {
          newStatus[pubkey] = {
            status: 'failed',
            lastAttempt: Date.now(),
            attempts: (prev[pubkey]?.attempts || 0) + 1
          };
        });
        return newStatus;
      });
    }
  }, [nostrClient, relayUrls]);

  // Helper to get metadata from TanStack Query cache
  const getMetadataFromQueryCache = useCallback((pubkey: string): Metadata | null => {
    try {
      const queryKey = ['metadata', pubkey];
      const queryData = queryClient.getQueryData(queryKey) as { metadata?: Metadata } | undefined;
      return queryData?.metadata || null;
    } catch {
      return null;
    }
  }, [queryClient]);

  // Get display name for a single pubkey (checks TanStack Query cache first)
  const getDisplayNameForPubkey = useCallback((pubkey: string): string => {
    // First check TanStack Query cache for metadata
    const metadata = getMetadataFromQueryCache(pubkey);
    if (metadata) {
      const displayName = metadata.display_name || metadata.name;
      if (displayName && displayName.trim()) {
        return displayName.trim();
      }
    }
    
    // Fall back to local display names cache
    return getDisplayNameWithFallback(pubkey, (pk: string) => {
      try {
        return nip19.npubEncode(pk);
      } catch {
        return formatPubkey(pk, false);
      }
    });
  }, [getMetadataFromQueryCache]);

  // Get display names for multiple pubkeys
  const getDisplayNamesForPubkeys = useCallback((pubkeys: string[]): Record<string, string> => {
    const result: Record<string, string> = {};
    pubkeys.forEach(pubkey => {
      result[pubkey] = getDisplayNameForPubkey(pubkey);
    });
    return result;
  }, [getDisplayNameForPubkey]);

  // Add display names from metadata (e.g., when metadata is fetched elsewhere)
  const addDisplayNamesFromMetadata = useCallback((metadataMap: Record<string, Metadata>) => {
    addDisplayNamesBatch(metadataMap);
    
    // Update state
    const newDisplayNames: DisplayNameState = {};
    Object.entries(metadataMap).forEach(([pubkey, metadata]) => {
      const displayName = metadata.display_name || metadata.name || '';
      if (displayName) {
        newDisplayNames[pubkey] = displayName;
      }
    });
    
    setDisplayNames(prev => ({
      ...prev,
      ...newDisplayNames
    }));
  }, []);

  // Check if a pubkey needs display name fetching
  const needsDisplayNameFetch = useCallback((pubkey: string): boolean => {
    const status = fetchStatus[pubkey];
    return !displayNames[pubkey] && 
           (!status || 
            status.status === 'failed' && 
            status.attempts < 3 &&
            Date.now() - status.lastAttempt > 30000); // 30 second cooldown
  }, [displayNames, fetchStatus]);

  // Get pubkeys that need fetching
  const getPubkeysNeedingFetch = useCallback((pubkeys: string[]): string[] => {
    return pubkeys.filter(pubkey => needsDisplayNameFetch(pubkey));
  }, [needsDisplayNameFetch]);



  // Clear display names cache
  const clearDisplayNames = useCallback(() => {
    clearDisplayNamesCache();
    setDisplayNames({});
    setFetchStatus({});
  }, []);

  return {
    displayNames,
    fetchStatus,
    isInitialized,
    getDisplayNameForPubkey,
    getDisplayNamesForPubkeys,
    fetchDisplayNames,
    addDisplayNamesFromMetadata,
    needsDisplayNameFetch,
    getPubkeysNeedingFetch,
    clearDisplayNames
  };
};

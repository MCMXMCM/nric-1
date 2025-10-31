import { useCallback, useEffect, useMemo, useRef, useState, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUnifiedWebSocketManager } from './useUnifiedWebSocketManager';
import { getGlobalRelayPool } from '../utils/nostr/relayConnectionPool';
import { type Event, type Filter } from 'nostr-tools';
import { CACHE_KEYS } from '../utils/cacheKeys';
import { selectSmartRelaysForContacts } from '../utils/smartRelaySelection';
import { useRelayManager } from './useRelayManager';
import { NostrContext } from '../contexts/NostrContext';

interface ProcessedEvent {
  event: Event;
  shouldUpdateContacts: boolean;
}

interface UseEnhancedProfileContactsConfig {
  pubkeyHex: string;
  relayUrls: string[];
  mode: 'followers' | 'following';
  enabled?: boolean;
  realtimeEnabled?: boolean;
  onContactsUpdate?: (contacts: string[]) => void;
  useSmartRelaySelection?: boolean; // New option to enable smart relay selection
}

/**
 * Enhanced profile contacts hook with real-time WebSocket updates
 * Integrates with TanStack Query and provides live updates for followers/following
 */
export function useEnhancedProfileContacts(config: UseEnhancedProfileContactsConfig) {
  const {
    pubkeyHex,
    relayUrls,
    mode,
    enabled = true,
    realtimeEnabled = true,
    onContactsUpdate,
    useSmartRelaySelection = true // Default to using smart relay selection
  } = config;

  const queryClient = useQueryClient();
  const wsManager = useUnifiedWebSocketManager();
  
  // Get user's relay permissions for smart selection
  const { nostrClient, pubkey: userPubkey } = useContext(NostrContext) as any;
  const { relayPermissions } = useRelayManager({
    nostrClient,
    initialRelays: relayUrls,
    pubkeyHex: userPubkey,
  });
  
  // Track seen contact events to prevent duplicates
  const seenEventIds = useRef<Set<string>>(new Set());
  const lastUpdateTime = useRef<number>(Date.now());
  
  // Navigation state tracking
  const navigationStateRef = useRef<{
    isNavigating: boolean;
    preservedData: string[] | null;
  }>({
    isNavigating: false,
    preservedData: null
  });

  // Stabilize relay URLs to avoid effect churn
  const relayKey = useMemo(() => {
    try {
      return JSON.stringify([...(relayUrls || [])].sort());
    } catch {
      return String((relayUrls || []).length);
    }
  }, [relayUrls]);

  // Rate limiting for cache updates
  const lastCacheUpdateRef = useRef<number>(0);
  const pendingUpdatesRef = useRef<ProcessedEvent[]>([]);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable query key
  const queryKey = useMemo(
    () => CACHE_KEYS.PROFILE.CONTACTS(mode, pubkeyHex, relayKey),
    [mode, pubkeyHex, relayKey]
  );

  // Enhanced enabled condition
  const queryEnabled = useMemo(() => {
    return Boolean(
      pubkeyHex && 
      relayUrls.length > 0 && 
      enabled
    );
  }, [pubkeyHex, relayUrls, enabled]);

  /**
   * Process incoming WebSocket event for contacts
   */
  const processEvent = useCallback((event: any): ProcessedEvent | null => {
    try {
      // Only process contact list events (kind 3)
      if (event.kind !== 3) {
        return null;
      }

      // Check if we've already seen this event
      const deduplicated = seenEventIds.current.has(event.id);
      if (!deduplicated) {
        seenEventIds.current.add(event.id);
      }

      // For following mode, only process events from the target pubkey
      if (mode === 'following' && event.pubkey !== pubkeyHex) {
        return null;
      }

      // For followers mode, only process events that include the target pubkey in p-tags
      if (mode === 'followers' && !event.tags.some((tag: any[]) => tag[0] === 'p' && tag[1] === pubkeyHex)) {
        return null;
      }

      return {
        event,
        shouldUpdateContacts: !deduplicated
      };
    } catch (error) {
      console.error('Failed to process contacts event:', error);
      return null;
    }
  }, [mode, pubkeyHex]);

  /**
   * Extract contacts from contact list event
   */
  const extractContactsFromEvent = useCallback((event: Event): string[] => {
    if (mode === 'following') {
      // Extract p-tags for following list
      return (event.tags || [])
        .filter((tag) => tag[0] === "p" && tag[1])
        .map((tag) => tag[1]);
    } else {
      // For followers, return the event author
      return [event.pubkey];
    }
  }, [mode]);

  /**
   * Batched cache update function with rate limiting
   */
  const executeBatchedCacheUpdate = useCallback(() => {
    const updates = [...pendingUpdatesRef.current];
    pendingUpdatesRef.current = [];

    if (updates.length === 0) return;

    console.log(`📝 Profile contacts: Executing batched cache update: ${updates.length} new events`);

    // Get current contacts data
    const currentData = queryClient.getQueryData<string[]>(queryKey) || [];
    const currentContacts = new Set(currentData);

    // Process updates and merge contacts
    updates.forEach(update => {
      if (update.shouldUpdateContacts) {
        const newContacts = extractContactsFromEvent(update.event);
        newContacts.forEach(contact => currentContacts.add(contact));
      }
    });

    const updatedContacts = Array.from(currentContacts);

    // Update cache if there are changes
    if (updatedContacts.length !== currentData.length || 
        !updatedContacts.every(contact => currentData.includes(contact))) {
      
      queryClient.setQueryData(queryKey, updatedContacts);
      lastCacheUpdateRef.current = Date.now();
      lastUpdateTime.current = Date.now();

      // Call the callback
      if (onContactsUpdate) {
        onContactsUpdate(updatedContacts);
      }
    }
  }, [queryClient, queryKey, extractContactsFromEvent, onContactsUpdate]);

  /**
   * Handle real-time events with batching and rate limiting
   */
  const handleRealtimeEvent = useCallback((event: any) => {
    const processed = processEvent(event);
    if (!processed) return;

    // Add to pending updates
    pendingUpdatesRef.current.push(processed);

    // Clear existing timer
    if (updateTimerRef.current) {
      clearTimeout(updateTimerRef.current);
    }

    // Rate limit cache updates to avoid overwhelming the UI
    const timeSinceLastUpdate = Date.now() - lastCacheUpdateRef.current;
    const minUpdateInterval = 2000; // 2 seconds minimum between cache updates (contacts change less frequently)

    if (timeSinceLastUpdate >= minUpdateInterval) {
      // Execute immediately if enough time has passed
      executeBatchedCacheUpdate();
    } else {
      // Schedule for later
      const delay = minUpdateInterval - timeSinceLastUpdate;
      updateTimerRef.current = setTimeout(executeBatchedCacheUpdate, delay);
    }
  }, [processEvent, executeBatchedCacheUpdate]);

  // Main query for contacts
  const contactsQuery = useQuery<string[]>({
    queryKey,
    enabled: queryEnabled,
    staleTime: 5 * 60 * 1000, // 5 minutes - contacts change less frequently
    gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache longer
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch on mount if we have cached data
    placeholderData: (previousData) => previousData,
    retry: 2, // Retry failed queries
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
    queryFn: async ({ signal }) => {
      const pool = getGlobalRelayPool();
      let filter: Filter;
      let relaysToUse = relayUrls;
      
      // Use smart relay selection if enabled
      if (useSmartRelaySelection) {
        try {
          const smartSelection = await selectSmartRelaysForContacts({
            targetPubkeyHex: pubkeyHex,
            userRelayUrls: relayUrls,
            userRelayPermissions: relayPermissions,
            maxRelays: 5
          });
          relaysToUse = smartSelection.relayUrls;
          console.log(`🎯 Smart relay selection for ${mode}:`, smartSelection.strategy, relaysToUse);
        } catch (error) {
          console.warn('Smart relay selection failed, using fallback:', error);
          relaysToUse = relayUrls;
        }
      }
      
      if (mode === "following") {
        filter = { kinds: [3], authors: [pubkeyHex], limit: 1 };
      } else {
        filter = { kinds: [3], "#p": [pubkeyHex], limit: 5000 } as any;
      }
      
      // Add timeout handling
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Query timeout after 30 seconds'));
        }, 30000);
        
        // Clear timeout if signal is aborted
        signal?.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          reject(new Error('Query aborted'));
        });
      });
      
      const queryPromise = pool.querySync(relaysToUse, filter);
      const events: Event[] = await Promise.race([queryPromise, timeoutPromise]);
      let pubkeys: string[] = [];
      
      if (mode === "following") {
        const latest = events.sort((a, b) => b.created_at - a.created_at)[0];
        const pTags = (latest?.tags || []).filter((t) => t[0] === "p" && t[1]);
        pubkeys = (pTags || []).map((t) => t[1]);
      } else {
        pubkeys = Array.from(new Set(events.map((ev) => ev.pubkey)));
      }
      
      // Update seen IDs
      events.forEach(event => seenEventIds.current.add(event.id));
      
      return Array.from(new Set(pubkeys));
    },
  });

  // Navigation preservation logic
  useEffect(() => {
    // Preserve data when navigating away
    const handleBeforeUnload = () => {
      if (contactsQuery.data && contactsQuery.data.length > 0) {
        navigationStateRef.current.preservedData = contactsQuery.data;
        navigationStateRef.current.isNavigating = true;
        
        // Save to sessionStorage as backup
        try {
          sessionStorage.setItem(`contacts-${mode}-${pubkeyHex}`, JSON.stringify(contactsQuery.data));
        } catch (error) {
          console.warn('Failed to save contacts to sessionStorage:', error);
        }
      }
    };

    // Restore data when returning from navigation
    const handleFocus = () => {
      if (navigationStateRef.current.isNavigating && navigationStateRef.current.preservedData) {
        // Restore preserved data to prevent empty list
        queryClient.setQueryData(queryKey, navigationStateRef.current.preservedData);
        navigationStateRef.current.isNavigating = false;
        navigationStateRef.current.preservedData = null;
      } else {
        // Try to restore from sessionStorage as fallback
        try {
          const saved = sessionStorage.getItem(`contacts-${mode}-${pubkeyHex}`);
          if (saved && !contactsQuery.data?.length) {
            const parsedData = JSON.parse(saved);
            queryClient.setQueryData(queryKey, parsedData);
          }
        } catch (error) {
          console.warn('Failed to restore contacts from sessionStorage:', error);
        }
      }
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('focus', handleFocus);
    };
  }, [contactsQuery.data, queryKey, queryClient, mode, pubkeyHex]);

  // Set up real-time WebSocket subscription for contacts
  useEffect(() => {
    if (!realtimeEnabled || !queryEnabled || !pubkeyHex || !relayUrls.length) {
      return;
    }

    // Build filter for contact list events (kind 3)
    let filter: any = {
      kinds: [3],
      since: Math.floor(Date.now() / 1000), // Only get events from now forward
      limit: undefined // Remove limit for real-time feed
    };

    if (mode === 'following') {
      // Subscribe to contact list updates from the target user
      filter.authors = [pubkeyHex];
    } else {
      // Subscribe to contact list updates that include the target user
      filter['#p'] = [pubkeyHex];
    }

    console.log('🔴 Setting up real-time profile contacts subscription', {
      mode,
      pubkey: pubkeyHex.slice(0, 8),
      relayUrls: relayUrls.length,
      filter
    });

    // For real-time subscriptions, use smart relay selection if enabled
    let relaysToUse = relayUrls;
    
    const setupSubscription = async () => {
      if (useSmartRelaySelection) {
        try {
          const smartSelection = await selectSmartRelaysForContacts({
            targetPubkeyHex: pubkeyHex,
            userRelayUrls: relayUrls,
            userRelayPermissions: relayPermissions,
            maxRelays: 5
          });
          relaysToUse = smartSelection.relayUrls;
          console.log(`🔴 Smart relay selection for real-time ${mode}:`, smartSelection.strategy, relaysToUse);
        } catch (error) {
          console.warn('Smart relay selection failed for real-time, using fallback:', error);
          relaysToUse = relayUrls;
        }
      }

      return wsManager.subscribe({
        id: `profile-contacts-${mode}-${pubkeyHex}`,
        relayUrls: relaysToUse,
        filter,
        enabled: true,
        onEvent: handleRealtimeEvent,
        queryKey
      });
    };

    let unsubscribe: (() => void) | null = null;
    
    setupSubscription().then((unsub) => {
      unsubscribe = unsub;
    }).catch((error) => {
      console.error('Failed to set up real-time subscription:', error);
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      
      // Clear pending updates
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
        updateTimerRef.current = null;
      }
      pendingUpdatesRef.current = [];
    };
  }, [
    realtimeEnabled,
    queryEnabled,
    mode,
    pubkeyHex,
    relayUrls,
    wsManager,
    handleRealtimeEvent,
    queryKey,
    useSmartRelaySelection,
    relayPermissions
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
      }
    };
  }, []);

  // Calculate real-time statistics
  const realtimeStats = useMemo(() => {
    const timeSinceLastUpdate = Date.now() - lastUpdateTime.current;
    return {
      isConnected: realtimeEnabled && queryEnabled,
      lastUpdateTime: lastUpdateTime.current,
      timeSinceLastUpdate,
      seenEventsCount: seenEventIds.current.size,
      pendingUpdatesCount: pendingUpdatesRef.current.length
    };
  }, [realtimeEnabled, queryEnabled, lastUpdateTime.current]);

  // Local state for UI
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Filter contacts by search
  const filteredContacts = useMemo(() => {
    if (!contactsQuery.data || !debouncedSearch.trim()) {
      return contactsQuery.data || [];
    }

    const searchLower = debouncedSearch.toLowerCase();
    return contactsQuery.data.filter(pubkey => 
      pubkey.toLowerCase().includes(searchLower)
    );
  }, [contactsQuery.data, debouncedSearch]);

  return {
    // Standard query interface
    ...contactsQuery,
    
    // Filtered contacts
    contacts: contactsQuery.data || [],
    filteredContacts,
    
    // Real-time specific data
    realtimeStats,
    
    // Search functionality
    search,
    setSearch,
    
    // Actions
    refetchContacts: contactsQuery.refetch,
    
    // Utility functions
    clearSeenEvents: () => seenEventIds.current.clear(),
    forceUpdateCache: executeBatchedCacheUpdate,
  };
}

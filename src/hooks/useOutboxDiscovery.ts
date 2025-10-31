import React, { useEffect, useRef, useCallback } from 'react';
import { getOutboxRouter } from '../utils/nostr/outboxRouter';
import type { Contact } from '../types/nostr/types';

interface UseOutboxDiscoveryOptions {
  pubkey?: string | null;
  contacts?: Contact[];
  relayUrls: string[];
  enabled?: boolean;
}

// LocalStorage key for tracking last discovery timestamp
const LAST_DISCOVERY_KEY = 'nostree-outbox-last-discovery';

// Get last discovery timestamp from localStorage
function getLastDiscoveryTime(): number {
  try {
    const stored = localStorage.getItem(LAST_DISCOVERY_KEY);
    return stored ? parseInt(stored, 10) : 0;
  } catch {
    return 0;
  }
}

// Save last discovery timestamp to localStorage
function saveLastDiscoveryTime(timestamp: number): void {
  try {
    localStorage.setItem(LAST_DISCOVERY_KEY, timestamp.toString());
  } catch (error) {
    console.warn('Failed to save outbox discovery timestamp:', error);
  }
}

// Get last discovery timestamp from outbox storage as fallback
async function getLastDiscoveryTimeFromStorage(): Promise<number> {
  try {
    const { getOutboxStorage } = await import('../utils/nostr/outboxStorage');
    const storage = getOutboxStorage();
    const stats = await storage.getStats();
    
    // If we have outbox data, use the most recent stored_at timestamp
    if (stats.totalEvents > 0) {
      const lastStoredTimestamp = await storage.getLastStoredTimestamp();
      if (lastStoredTimestamp > 0) {
        // Use the actual stored timestamp as a fallback
        return lastStoredTimestamp;
      }
    }
    
    return 0;
  } catch (error) {
    console.warn('Failed to get discovery time from storage:', error);
    return 0;
  }
}

// Enhanced function to get last discovery time with fallback
async function getLastDiscoveryTimeWithFallback(): Promise<number> {
  const localStorageTime = getLastDiscoveryTime();
  
  // If localStorage has a recent timestamp, use it
  if (localStorageTime > 0) {
    return localStorageTime;
  }
  
  // Otherwise, try to estimate from outbox storage
  return await getLastDiscoveryTimeFromStorage();
}

/**
 * Hook that automatically discovers NIP-65 relay lists for followed users
 * Implements outbox model discovery as described in Nostrify documentation
 * 
 * Persists discovery timestamp to localStorage to handle iOS app lifecycle:
 * - Checks localStorage on mount to see if refresh is needed
 * - Runs discovery if more than 2 hours have passed since last discovery
 * - Works even if app was killed by iOS and restarted
 */
export function useOutboxDiscovery({
  pubkey,
  contacts = [],
  relayUrls,
  enabled = true,
}: UseOutboxDiscoveryOptions) {
  const [isDiscovering, setIsDiscovering] = React.useState(false);
  const [hasCompletedInitialDiscovery, setHasCompletedInitialDiscovery] = React.useState(false);
  const discoveryInProgressRef = useRef(false);
  const lastDiscoveryRef = useRef<number>(getLastDiscoveryTime());
  const discoveredUsersRef = useRef<Set<string>>(new Set());

  // Minimum time between discovery runs (30 minutes)
  const MIN_DISCOVERY_INTERVAL = 30 * 60 * 1000;
  
  // Background refresh interval (2 hours)
  const REFRESH_INTERVAL = 2 * 60 * 60 * 1000;

  const discoverForUsers = useCallback(async (userPubkeys: string[]) => {
    if (!enabled || userPubkeys.length === 0 || discoveryInProgressRef.current) {
      return;
    }

    // Filter out users we've already discovered recently
    const usersToDiscover = userPubkeys.filter(
      (pk) => !discoveredUsersRef.current.has(pk)
    );

    if (usersToDiscover.length === 0) {
      return;
    }

    discoveryInProgressRef.current = true;
    setIsDiscovering(true);

    try {
      const router = getOutboxRouter();
      
      // Batch discovery in groups of 50 users at a time
      const BATCH_SIZE = 50;
      const batches: string[][] = [];
      
      for (let i = 0; i < usersToDiscover.length; i += BATCH_SIZE) {
        batches.push(usersToDiscover.slice(i, i + BATCH_SIZE));
      }

      if (import.meta.env.DEV) {
        console.log('📦 Starting outbox discovery:', {
          totalUsers: usersToDiscover.length,
          batches: batches.length,
          relays: relayUrls.length,
        });
      }

      // Discover each batch sequentially to avoid overwhelming relays
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        if (import.meta.env.DEV) {
          console.log(`📦 Discovering batch ${i + 1}/${batches.length} (${batch.length} users)`);
        }

        const result = await router.discoverOutboxEvents(batch, relayUrls);
        
        if (result.success) {
          // Mark these users as discovered
          batch.forEach((pk) => discoveredUsersRef.current.add(pk));
          
          if (import.meta.env.DEV) {
            console.log(`✅ Batch ${i + 1} complete:`, {
              eventsFound: result.eventsFound,
              usersDiscovered: result.usersDiscovered,
            });
          }
        }

        // Small delay between batches to be polite to relays
        if (i < batches.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      const now = Date.now();
      lastDiscoveryRef.current = now;
      
      // Persist to localStorage for iOS app lifecycle handling
      saveLastDiscoveryTime(now);
      
      // Mark initial discovery as complete
      if (!hasCompletedInitialDiscovery) {
        setHasCompletedInitialDiscovery(true);
      }
      
      if (import.meta.env.DEV) {
        console.log('✅ Outbox discovery complete:', {
          totalDiscovered: discoveredUsersRef.current.size,
          timestamp: new Date(now).toISOString(),
        });
      }
    } catch (error) {
      console.error('❌ Outbox discovery failed:', error);
      // Still mark as complete even on failure to prevent blocking
      if (!hasCompletedInitialDiscovery) {
        setHasCompletedInitialDiscovery(true);
      }
    } finally {
      discoveryInProgressRef.current = false;
      setIsDiscovering(false);
    }
  }, [enabled, relayUrls, hasCompletedInitialDiscovery]);

  // Discover NIP-65 events for followed users when contacts change
  useEffect(() => {
    if (!enabled || !pubkey || contacts.length === 0 || relayUrls.length === 0) {
      return;
    }

    // Check if enough time has passed since last discovery
    const now = Date.now();
    const timeSinceLastDiscovery = now - lastDiscoveryRef.current;
    
    // If discovery ran very recently (less than 30 minutes), skip it
    // But allow discovery if this is the first time contacts are loaded after page refresh
    const isFirstContactsLoad = lastDiscoveryRef.current === 0 && contacts.length > 0;
    
    if (timeSinceLastDiscovery < MIN_DISCOVERY_INTERVAL && !isFirstContactsLoad) {
      if (import.meta.env.DEV) {
        console.log('⏭️ Skipping outbox discovery (too soon since last run):', {
          minutesSince: (timeSinceLastDiscovery / (60 * 1000)).toFixed(1),
          minInterval: MIN_DISCOVERY_INTERVAL / (60 * 1000),
        });
      }
      return;
    }

    // Get all followed pubkeys
    const followedPubkeys = contacts.map((c) => c.pubkey);
    
    // Also discover for the logged-in user's own relay list
    const allPubkeys = [pubkey, ...followedPubkeys];

    if (import.meta.env.DEV) {
      console.log('📦 Triggering outbox discovery for contacts:', {
        userPubkey: pubkey.slice(0, 8),
        contactCount: contacts.length,
        totalPubkeys: allPubkeys.length,
        isFirstLoad: isFirstContactsLoad,
        minutesSinceLastDiscovery: (timeSinceLastDiscovery / (60 * 1000)).toFixed(1),
      });
    }

    // Run discovery in background (don't await)
    discoverForUsers(allPubkeys);
  }, [pubkey, contacts.length, relayUrls.length, enabled, discoverForUsers]);

  // Check on mount and when contacts are loaded if discovery is needed (handles iOS app restarts)
  useEffect(() => {
    if (!enabled || !pubkey || relayUrls.length === 0) {
      return;
    }

    // If no contacts yet, wait for them to be loaded
    if (contacts.length === 0) {
      if (import.meta.env.DEV) {
        console.log('📦 Waiting for contacts to load before checking outbox discovery...');
      }
      return;
    }

    // Use async function to check discovery time with fallback
    const checkDiscoveryTime = async () => {
      const lastDiscoveryTime = await getLastDiscoveryTimeWithFallback();
      const now = Date.now();
      const timeSinceLastDiscovery = now - lastDiscoveryTime;

      // If more than 2 hours have passed since last discovery, trigger refresh
      if (timeSinceLastDiscovery >= REFRESH_INTERVAL) {
        if (import.meta.env.DEV) {
          console.log('📦 Outbox refresh needed on startup:', {
            lastDiscovery: new Date(lastDiscoveryTime).toISOString(),
            hoursSince: (timeSinceLastDiscovery / (60 * 60 * 1000)).toFixed(1),
            contactCount: contacts.length,
          });
        }

        const followedPubkeys = contacts.map((c) => c.pubkey);
        const allPubkeys = [pubkey, ...followedPubkeys];

        // Reset discovered users set to force refresh
        discoveredUsersRef.current.clear();
        lastDiscoveryRef.current = 0;

        // Trigger discovery
        discoverForUsers(allPubkeys);
      } else {
        if (import.meta.env.DEV) {
          console.log('📦 Outbox discovery check on startup - no refresh needed:', {
            lastDiscovery: new Date(lastDiscoveryTime).toISOString(),
            hoursSince: (timeSinceLastDiscovery / (60 * 60 * 1000)).toFixed(1),
            contactCount: contacts.length,
          });
        }
      }
    };

    checkDiscoveryTime();
  }, [pubkey, contacts.length, relayUrls.length, enabled, discoverForUsers, REFRESH_INTERVAL]);

  // Periodic background refresh every 2 hours (for active sessions)
  useEffect(() => {
    if (!enabled || !pubkey || contacts.length === 0 || relayUrls.length === 0) {
      return;
    }

    const refreshTimer = setInterval(() => {
      const followedPubkeys = contacts.map((c) => c.pubkey);
      const allPubkeys = [pubkey, ...followedPubkeys];

      if (import.meta.env.DEV) {
        console.log('📦 Periodic outbox refresh triggered (active session)');
      }

      // Reset discovered users set to force refresh
      discoveredUsersRef.current.clear();
      lastDiscoveryRef.current = 0;

      discoverForUsers(allPubkeys);
    }, REFRESH_INTERVAL);

    return () => clearInterval(refreshTimer);
  }, [pubkey, contacts.length, relayUrls.length, enabled, discoverForUsers, REFRESH_INTERVAL]);

  return {
    discoverForUsers,
    isDiscovering,
    hasCompletedInitialDiscovery,
  };
}


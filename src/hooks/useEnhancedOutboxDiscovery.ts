import { useEffect, useRef, useCallback, useState } from 'react';
import { getOutboxRouter } from '../utils/nostr/outboxRouter';
import { useContactRelayProgress } from '../contexts/ContactRelayProgressContext';
import type { Contact } from '../types/nostr/types';

interface UseEnhancedOutboxDiscoveryOptions {
  pubkey?: string | null;
  contacts?: Contact[];
  relayUrls: string[];
  enabled?: boolean;
  onProgressUpdate?: (progress: { completed: number; total: number; percentage: number }) => void;
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

// Check if outbox database is empty (no discovered users)
async function checkIfDatabaseIsEmpty(): Promise<boolean> {
  try {
    const { getOutboxStorage } = await import('../utils/nostr/outboxStorage');
    const storage = getOutboxStorage();
    const allUsers = await storage.getAllUsers();
    return allUsers.length === 0;
  } catch (error) {
    console.error('Failed to check if database is empty:', error);
    return true; // Assume empty if we can't check
  }
}

/**
 * Enhanced outbox discovery hook that provides progress tracking
 * for contact relay preference discovery
 */
export function useEnhancedOutboxDiscovery({
  pubkey,
  contacts = [],
  relayUrls,
  enabled = true,
  onProgressUpdate,
}: UseEnhancedOutboxDiscoveryOptions) {
  const { startProgressTracking, stopProgressTracking } = useContactRelayProgress();
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [hasCompletedInitialDiscovery, setHasCompletedInitialDiscovery] = useState(false);
  const [discoveryProgress, setDiscoveryProgress] = useState({
    completed: 0,
    total: 0,
    percentage: 0,
  });

  const discoveryInProgressRef = useRef(false);
  const lastDiscoveryRef = useRef<number>(getLastDiscoveryTime());
  const discoveredUsersRef = useRef<Set<string>>(new Set());
  const activeRelaysRef = useRef<Set<string>>(new Set());

  // Minimum time between discovery runs (30 minutes)
  const MIN_DISCOVERY_INTERVAL = 30 * 60 * 1000;
  
  // Background refresh interval (2 hours)
  const REFRESH_INTERVAL = 2 * 60 * 60 * 1000;

  const discoverForUsers = useCallback(async (userPubkeys: string[]) => {
    console.log('📦 Enhanced outbox discovery: discoverForUsers called', {
      enabled,
      userCount: userPubkeys.length,
      alreadyInProgress: discoveryInProgressRef.current
    });

    if (!enabled || userPubkeys.length === 0 || discoveryInProgressRef.current) {
      console.log('📦 Enhanced outbox discovery: skipping - not enabled, no users, or already in progress');
      return;
    }

    // Filter out users we've already discovered recently
    const usersToDiscover = userPubkeys.filter(
      (pk) => !discoveredUsersRef.current.has(pk)
    );

    console.log('📦 Enhanced outbox discovery: filtered users', {
      original: userPubkeys.length,
      toDiscover: usersToDiscover.length,
      alreadyDiscovered: userPubkeys.length - usersToDiscover.length
    });

    if (usersToDiscover.length === 0) {
      console.log('📦 Enhanced outbox discovery: no new users to discover');
      return;
    }

    discoveryInProgressRef.current = true;
    setIsDiscovering(true);

    console.log('📦 Enhanced outbox discovery: starting discovery for', usersToDiscover.length, 'users');

    // Track active relays for conflict detection
    activeRelaysRef.current = new Set(relayUrls);
    
    // Set global discovery state for other hooks to detect
    (globalThis as any).__outboxDiscoveryActive = true;
    (globalThis as any).__outboxDiscoveryActiveRelays = relayUrls;
    
    if (import.meta.env.DEV) {
      console.log('🔍 Discovery mode activated:', {
        activeRelays: relayUrls.length,
        relayUrls: relayUrls.slice(0, 3), // Show first 3 for brevity
        userAgent: navigator.userAgent.slice(0, 50),
        isSafari: /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)
      });
    }

    // Start progress tracking
    startProgressTracking();

    try {
      const router = getOutboxRouter();
      
      // Batch discovery in groups of 25 users at a time (smaller batches for better progress tracking)
      const BATCH_SIZE = 25;
      const batches: string[][] = [];
      
      for (let i = 0; i < usersToDiscover.length; i += BATCH_SIZE) {
        batches.push(usersToDiscover.slice(i, i + BATCH_SIZE));
      }

      // Initialize progress tracking
      setDiscoveryProgress({
        completed: 0,
        total: usersToDiscover.length,
        percentage: 0,
      });

      if (import.meta.env.DEV) {
        console.log('📦 Starting enhanced outbox discovery:', {
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
          
          // Update progress
          const completed = Math.min(discoveredUsersRef.current.size, usersToDiscover.length);
          const percentage = Math.round((completed / usersToDiscover.length) * 100);
          
          setDiscoveryProgress({
            completed,
            total: usersToDiscover.length,
            percentage,
          });

          // Notify parent component of progress
          if (onProgressUpdate) {
            onProgressUpdate({
              completed,
              total: usersToDiscover.length,
              percentage,
            });
          }
          
          if (import.meta.env.DEV) {
            console.log(`✅ Batch ${i + 1} complete:`, {
              eventsFound: result.eventsFound,
              usersDiscovered: result.usersDiscovered,
              progress: `${completed}/${usersToDiscover.length} (${percentage}%)`,
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
        console.log('✅ Enhanced outbox discovery complete:', {
          totalDiscovered: discoveredUsersRef.current.size,
          timestamp: new Date(now).toISOString(),
        });
      }
    } catch (error) {
      console.error('❌ Enhanced outbox discovery failed:', error);
      // Still mark as complete even on failure to prevent blocking
      if (!hasCompletedInitialDiscovery) {
        setHasCompletedInitialDiscovery(true);
      }
    } finally {
      discoveryInProgressRef.current = false;
      setIsDiscovering(false);
      
      // Clear active relays and global discovery state
      activeRelaysRef.current.clear();
      (globalThis as any).__outboxDiscoveryActive = false;
      (globalThis as any).__outboxDiscoveryActiveRelays = [];
      
      if (import.meta.env.DEV) {
        console.log('🔍 Discovery mode deactivated:', {
          totalDiscovered: discoveredUsersRef.current.size,
          duration: Date.now() - (lastDiscoveryRef.current || 0)
        });
      }
      
      // Stop progress tracking after a short delay to allow final progress update
      setTimeout(() => {
        stopProgressTracking();
      }, 1000);
    }
  }, [enabled, relayUrls, hasCompletedInitialDiscovery, startProgressTracking, stopProgressTracking, onProgressUpdate]);

  // Discover NIP-65 events for followed users when contacts change
  useEffect(() => {
    const runDiscovery = async () => {
      console.log('📦 Enhanced outbox discovery: useEffect triggered', {
        enabled,
        hasPubkey: !!pubkey,
        contactCount: contacts.length,
        relayCount: relayUrls.length,
        outboxMode: enabled
      });

      if (!enabled || !pubkey || contacts.length === 0 || relayUrls.length === 0) {
        console.log('📦 Enhanced outbox discovery: skipping - missing requirements', {
          enabled,
          hasPubkey: !!pubkey,
          contactCount: contacts.length,
          relayCount: relayUrls.length
        });
        return;
      }

      // Check if enough time has passed since last discovery
      const now = Date.now();
      const timeSinceLastDiscovery = now - lastDiscoveryRef.current;
      
      // If discovery ran very recently (less than 30 minutes), skip it
      // But allow discovery if this is the first time contacts are loaded after page refresh
      const isFirstContactsLoad = lastDiscoveryRef.current === 0 && contacts.length > 0;
      
      // Check if outbox database is empty (no discovered users yet)
      const isDatabaseEmpty = await checkIfDatabaseIsEmpty();
    
    console.log('📦 Enhanced outbox discovery: timing check', {
      timeSinceLastDiscovery: (timeSinceLastDiscovery / (60 * 1000)).toFixed(1) + ' minutes',
      minInterval: (MIN_DISCOVERY_INTERVAL / (60 * 1000)) + ' minutes',
      isFirstContactsLoad,
      isDatabaseEmpty
    });
    
    // Allow discovery if:
    // 1. First time contacts are loaded, OR
    // 2. Database is empty (no discovered users), OR  
    // 3. Enough time has passed since last discovery
    const shouldRunDiscovery = isFirstContactsLoad || isDatabaseEmpty || timeSinceLastDiscovery >= MIN_DISCOVERY_INTERVAL;
    
    if (!shouldRunDiscovery) {
      if (import.meta.env.DEV) {
        console.log('⏭️ Skipping enhanced outbox discovery (too soon since last run):', {
          minutesSince: (timeSinceLastDiscovery / (60 * 1000)).toFixed(1),
          minInterval: MIN_DISCOVERY_INTERVAL / (60 * 1000),
          isFirstContactsLoad,
          isDatabaseEmpty
        });
      }
      return;
    }

    // Get all followed pubkeys
    const followedPubkeys = contacts.map((c) => c.pubkey);
    
    // Also discover for the logged-in user's own relay list
    const allPubkeys = [pubkey, ...followedPubkeys];

    if (import.meta.env.DEV) {
      console.log('📦 Triggering enhanced outbox discovery for contacts:', {
        userPubkey: pubkey.slice(0, 8),
        contactCount: contacts.length,
        totalPubkeys: allPubkeys.length,
        isFirstLoad: isFirstContactsLoad,
        minutesSinceLastDiscovery: (timeSinceLastDiscovery / (60 * 1000)).toFixed(1),
      });
    }

      // Run discovery in background (don't await)
      discoverForUsers(allPubkeys);
    };

    runDiscovery();
  }, [pubkey, contacts.length, relayUrls.length, enabled, discoverForUsers]);

  // Check on mount and when contacts are loaded if discovery is needed (handles iOS app restarts)
  useEffect(() => {
    if (!enabled || !pubkey || relayUrls.length === 0) {
      return;
    }

    // If no contacts yet, wait for them to be loaded
    if (contacts.length === 0) {
      if (import.meta.env.DEV) {
        console.log('📦 Waiting for contacts to load before checking enhanced outbox discovery...');
      }
      return;
    }

    // Use async function to check discovery time
    const checkDiscoveryTime = async () => {
      const lastDiscoveryTime = getLastDiscoveryTime();
      const now = Date.now();
      const timeSinceLastDiscovery = now - lastDiscoveryTime;

      // If more than 2 hours have passed since last discovery, trigger refresh
      if (timeSinceLastDiscovery >= REFRESH_INTERVAL) {
        if (import.meta.env.DEV) {
          console.log('📦 Enhanced outbox refresh needed on startup:', {
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
          console.log('📦 Enhanced outbox discovery check on startup - no refresh needed:', {
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
        console.log('📦 Periodic enhanced outbox refresh triggered (active session)');
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
    discoveryProgress,
    activeDiscoveryRelays: Array.from(activeRelaysRef.current),
  };
}

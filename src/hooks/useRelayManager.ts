import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RelayStatus, RelayPermission } from '../types/nostr/types';
import { DEFAULT_RELAY_URLS, DEFAULT_RELAY_PERMISSIONS, PROFILE_RELAY_URLS } from '../utils/nostr/constants';
import { RelayConnectionPool } from '../utils/nostr/relayConnectionPool';
import { publishRelayList, canPublishRelayList } from '../utils/nostr/publishRelayList';
import { resetGlobalRelayPoolConnections, cleanupGlobalRelayPool } from '../utils/nostr/relayConnectionPool';

interface UseRelayManagerProps {
  nostrClient: RelayConnectionPool | null;
  initialRelays?: string[];
  pubkeyHex?: string; // Current user's pubkey for per-user relay storage
}

const GLOBAL_STORED_RELAYS_KEY = 'nostr_stored_relays';
const GLOBAL_STORED_RELAY_PERMISSIONS_KEY = 'nostr_relay_permissions';
const SESSION_RELAY_DEFAULTS_KEY = 'nostr_session_relay_defaults';

// Get user-specific storage keys
const getUserSpecificKeys = (pubkeyHex?: string) => {
  if (!pubkeyHex) {
    return {
      relaysKey: GLOBAL_STORED_RELAYS_KEY,
      permissionsKey: GLOBAL_STORED_RELAY_PERMISSIONS_KEY,
    };
  }
  return {
    relaysKey: `nostr_stored_relays_${pubkeyHex}`,
    permissionsKey: `nostr_relay_permissions_${pubkeyHex}`,
  };
};

export const useRelayManager = ({ nostrClient, initialRelays = [], pubkeyHex }: UseRelayManagerProps) => {

  const normalizeRelayUrl = useCallback((inputUrl: string): string => {
    try {
      let url = (inputUrl || '').trim();
      if (!/^wss?:\/\//i.test(url)) {
        url = `wss://${url}`;
      }
      // Force wss
      url = url.replace(/^ws:\/\//i, 'wss://');
      const parsed = new URL(url);
      const protocol = 'wss:';
      const hostname = parsed.hostname.toLowerCase();
      const port = parsed.port ? `:${parsed.port}` : '';
      // Keep non-root paths but strip trailing slash
      let pathname = parsed.pathname || '';
      if (pathname === '/') {
        pathname = '';
      } else if (pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
      }
      return `${protocol}//${hostname}${port}${pathname}`;
    } catch {
      // Fallback to simple normalization
      let url = (inputUrl || '').trim();
      if (!url.startsWith('wss://')) url = `wss://${url.replace(/^ws:\/\//i, '')}`;
      if (url.endsWith('/')) url = url.slice(0, -1);
      return url.toLowerCase();
    }
  }, []);

  const dedupeAndNormalize = useCallback((urls: string[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const u of urls) {
      const n = normalizeRelayUrl(u);
      if (!seen.has(n)) {
        seen.add(n);
        result.push(n);
      }
    }
    return result;
  }, [normalizeRelayUrl]);

  const arraysShallowEqual = useCallback((a: string[], b: string[]): boolean => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }, []);

  // Migrate global relays to first user's account
  const migrateGlobalRelaysToUser = useCallback((userPubkeyHex: string) => {
    const globalRelays = localStorage.getItem(GLOBAL_STORED_RELAYS_KEY);
    const globalPermissions = localStorage.getItem(GLOBAL_STORED_RELAY_PERMISSIONS_KEY);

    if (globalRelays) {
      const userRelaysKey = `nostr_stored_relays_${userPubkeyHex}`;
      // Only migrate if user doesn't already have relays
      if (!localStorage.getItem(userRelaysKey)) {
        localStorage.setItem(userRelaysKey, globalRelays);

      }
    }

    if (globalPermissions) {
      const userPermissionsKey = `nostr_relay_permissions_${userPubkeyHex}`;
      // Only migrate if user doesn't already have permissions
      if (!localStorage.getItem(userPermissionsKey)) {
        localStorage.setItem(userPermissionsKey, globalPermissions);

      }
    }
  }, []);

  /**
   * Invalidate relay-dependent queries when relay settings change
   */
  const queryClient = useQueryClient();
  const invalidateRelayDependentQueries = useCallback(
    (_newRelays?: string[], _oldRelays?: string[]) => {
      // Invalidate feed queries when relays change
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['metadata'] });
    },
    [queryClient]
  );

  // Load stored relays from localStorage on initialization
  const [relayUrls, setRelayUrls] = useState<string[]>(() => {
    // Session-scoped defaults (e.g., npub-only login) override everything for the session
    try {
      const sessionDefaultsRaw = sessionStorage.getItem(SESSION_RELAY_DEFAULTS_KEY);
      if (sessionDefaultsRaw) {
        const sessionDefaults = JSON.parse(sessionDefaultsRaw) as { relays?: string[] };
        if (Array.isArray(sessionDefaults?.relays) && sessionDefaults.relays.length > 0) {
          return dedupeAndNormalize(sessionDefaults.relays);
        }
      }
    } catch {}

    // Get user-specific storage keys
    const { relaysKey } = getUserSpecificKeys(pubkeyHex);

    // Migrate global relays to user-specific storage if this is the first user
    if (pubkeyHex) {
      migrateGlobalRelaysToUser(pubkeyHex);
    }

    const storedRelays = localStorage.getItem(relaysKey);
    if (storedRelays) {
      try {
        const parsed = JSON.parse(storedRelays);
        const arr = Array.isArray(parsed) ? parsed : initialRelays;
        const normalized = arr.map((u: string) => u).filter(Boolean);
        return dedupeAndNormalize(normalized);
      } catch (e) {
        console.error('Failed to parse stored relays:', e);
        return dedupeAndNormalize(initialRelays);
      }
    }

    // For new users (no stored relays), use default relays
    // This applies to users who have never used the app before
    return dedupeAndNormalize([...DEFAULT_RELAY_URLS, ...initialRelays]);
  });

  // Function to reload relays for a specific user
  // Use refs to store stable references to avoid dependency issues
  const dedupeAndNormalizeRef = useRef(dedupeAndNormalize);
  const initialRelaysRef = useRef(initialRelays);
  const pubkeyHexRef = useRef(pubkeyHex);

  // Update refs when dependencies change
  useEffect(() => {
    dedupeAndNormalizeRef.current = dedupeAndNormalize;
  }, [dedupeAndNormalize]);

  useEffect(() => {
    initialRelaysRef.current = initialRelays;
  }, [initialRelays]);

  useEffect(() => {
    pubkeyHexRef.current = pubkeyHex;
  }, [pubkeyHex]);

  const reloadRelaysForUser = useCallback((userPubkeyHex: string) => {
    if (!userPubkeyHex) return;

    const { relaysKey, permissionsKey } = getUserSpecificKeys(userPubkeyHex);

    // Migrate global relays to user-specific storage if this is the first user
    migrateGlobalRelaysToUser(userPubkeyHex);

    // Load user-specific relays
    const storedRelays = localStorage.getItem(relaysKey);
    if (storedRelays) {
      try {
        const parsed = JSON.parse(storedRelays);
        const arr = Array.isArray(parsed) ? parsed : initialRelaysRef.current;
        const normalized = arr.map((u: string) => u).filter(Boolean);
        const deduped = dedupeAndNormalizeRef.current(normalized);
        setRelayUrls(deduped);
      } catch (e) {
        console.error('Failed to parse stored relays:', e);
      }
    } else {
      // For new users (no stored relays), use default relays
      setRelayUrls(dedupeAndNormalizeRef.current([...DEFAULT_RELAY_URLS, ...initialRelaysRef.current]));
    }

    // Load user-specific permissions
    const storedPermissions = localStorage.getItem(permissionsKey);
    if (storedPermissions) {
      try {
        const parsed = JSON.parse(storedPermissions);
        const permissionsMap = new Map<string, RelayPermission>();
        if (Array.isArray(parsed)) {
          // Legacy format - convert to new format
          parsed.forEach((url: string) => {
            permissionsMap.set(url, 'write');
          });
        } else if (typeof parsed === 'object') {
          Object.entries(parsed).forEach(([url, permission]) => {
            if (typeof permission === 'string' && ['read', 'write', 'readwrite', 'indexer'].includes(permission)) {
              permissionsMap.set(url, permission as RelayPermission);
            }
          });
        }
        setRelayPermissions(permissionsMap);
      } catch (e) {
        console.error('Failed to parse stored relay permissions:', e);
        // Default permissions for new users
        const defaultPermissions = new Map<string, RelayPermission>();
        DEFAULT_RELAY_PERMISSIONS.forEach((permission, url) => {
          defaultPermissions.set(url, permission);
        });
        initialRelaysRef.current.forEach(url => {
          if (!defaultPermissions.has(url)) {
            defaultPermissions.set(url, 'readwrite');
          }
        });
        PROFILE_RELAY_URLS.forEach(url => {
          if (!defaultPermissions.has(url)) {
            defaultPermissions.set(url, 'write');
          }
        });
        setRelayPermissions(defaultPermissions);
      }
    }

    // Clear connection attempts for fresh start
    connectionAttempts.current.clear();
    
    // Reset global relay pool connection attempts to allow fresh connections
    try {
      resetGlobalRelayPoolConnections();
    } catch (error) {
      console.warn('Failed to reset global relay pool connections:', error);
    }

  }, []); // Remove dependencies to prevent infinite re-renders

  // Reload relays when pubkey changes (for account switching)
  useEffect(() => {
    if (pubkeyHex) {
      reloadRelaysForUser(pubkeyHex);
    }
  }, [pubkeyHex]); // Removed reloadRelaysForUser from dependencies to prevent infinite loop

  // Listen for relay reload events (triggered by login/logout)
  useEffect(() => {
    const handleRelayReload = (event: CustomEvent) => {
      const { pubkeyHex: newPubkeyHex } = event.detail || {};
      if (newPubkeyHex) {
        reloadRelaysForUser(newPubkeyHex);
      }
    };

    window.addEventListener('relayReload', handleRelayReload as EventListener);
    return () => {
      window.removeEventListener('relayReload', handleRelayReload as EventListener);
    };
  }, []); // Remove dependency to prevent re-adding listeners

  // Load stored relay permissions from localStorage
  const [relayPermissions, setRelayPermissions] = useState<Map<string, RelayPermission>>(() => {
    const { permissionsKey } = getUserSpecificKeys(pubkeyHex);
    
    // First load user's persistent preferences
    let userPermissions = new Map<string, RelayPermission>();
    const stored = localStorage.getItem(permissionsKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Legacy format - convert to new format
          parsed.forEach((url: string) => {
            userPermissions.set(url, 'write');
          });
        } else if (typeof parsed === 'object') {
          Object.entries(parsed).forEach(([url, permission]) => {
            if (typeof permission === 'string' && ['read', 'write', 'readwrite', 'indexer'].includes(permission)) {
              userPermissions.set(url, permission as RelayPermission);
            }
          });
        }
      } catch (e) {
        console.warn('Failed to parse stored relay permissions:', e);
      }
    }

    // Then apply session defaults ONLY for relays not already configured by user
    try {
      const sessionDefaultsRaw = sessionStorage.getItem(SESSION_RELAY_DEFAULTS_KEY);
      if (sessionDefaultsRaw) {
        const sessionDefaults = JSON.parse(sessionDefaultsRaw) as {
          permissions?: Record<string, RelayPermission>;
          relays?: string[];
        };
        if (sessionDefaults?.permissions) {
          Object.entries(sessionDefaults.permissions).forEach(([url, perm]) => {
            // Only apply session default if user hasn't configured this relay
            if (
              !userPermissions.has(url) &&
              typeof perm === 'string' &&
              ['read', 'write', 'readwrite', 'indexer'].includes(perm)
            ) {
              userPermissions.set(url, perm as RelayPermission);
            }
          });
        }
      }
    } catch (e) {
      console.warn('Failed to parse session relay defaults:', e);
    }

    // If we have user permissions, return them
    if (userPermissions.size > 0) {
      return userPermissions;
    }

    // Default permissions for new users
    const defaultPermissions = new Map<string, RelayPermission>();
    
    // Set permissions from constants
    DEFAULT_RELAY_PERMISSIONS.forEach((permission, url) => {
      defaultPermissions.set(url, permission);
    });
    
    // For any other initial relays not explicitly set above, default to readwrite
    initialRelays.forEach(url => {
      if (!defaultPermissions.has(url)) {
        defaultPermissions.set(url, 'readwrite');
      }
    });
    
    // Profile-specific relays that aren't already set
    PROFILE_RELAY_URLS.forEach(url => {
      if (!defaultPermissions.has(url)) {
        defaultPermissions.set(url, 'write');
      }
    });
    
    // Save default permissions
    const permissionsObj = Object.fromEntries(defaultPermissions);
    localStorage.setItem(GLOBAL_STORED_RELAY_PERMISSIONS_KEY, JSON.stringify(permissionsObj));
    
    return defaultPermissions;
  });

  const [relayStatuses, setRelayStatuses] = useState<RelayStatus[]>([]);
  const connectionAttempts = useRef<Map<string, number>>(new Map());
  const MAX_RECONNECT_ATTEMPTS = 3;
  const RECONNECT_DELAY = 2000; // Reduced from 5s to 2s for faster retries

  const connectRelay = useCallback(async (rawUrl: string) => {
    const url = normalizeRelayUrl(rawUrl);
    if (!nostrClient) return;

    try {
              const relay = await nostrClient.getConnection(url);
      if (relay) {
        setRelayStatuses(prev => {
          let changed = false;
          const next = prev.map(status => {
            if (status.url === url && status.connected !== true) {
              changed = true;
              return { ...status, connected: true };
            }
            return status;
          });
          return changed ? next : prev;
        });
        connectionAttempts.current.set(url, 0);

        // Note: Removed automatic relay addition to prevent infinite loops
        // Relays should be added explicitly by user action, not automatically on connection
      }
    } catch (error) {
      const attempts = (connectionAttempts.current.get(url) || 0) + 1;
      connectionAttempts.current.set(url, attempts);

      // Only log errors on the first attempt or if it's not a max attempts exceeded error
      if (attempts === 1 && !(error instanceof Error && error.message.includes('Max connection attempts'))) {
        console.warn(`Failed to connect to relay ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } else if (attempts >= MAX_RECONNECT_ATTEMPTS) {
        // Only log final failure once
        console.warn(`Relay ${url} failed to connect after ${attempts} attempts`);
      }

      if (attempts < MAX_RECONNECT_ATTEMPTS) {
        setTimeout(() => connectRelay(url), RECONNECT_DELAY);
      } else {
        setRelayStatuses(prev =>
          prev.map(status =>
            status.url === url ? { ...status, connected: false } : status
          )
        );
      }
    }
  }, [nostrClient, normalizeRelayUrl]); // Remove pubkeyHex dependency, using ref instead

  const disconnectRelay = useCallback(async (rawUrl: string) => {
    const url = normalizeRelayUrl(rawUrl);
    if (!nostrClient) return;

    try {
      nostrClient.close([url]);
      setRelayStatuses(prev => {
        let changed = false;
        const next = prev.map(status => {
          if (status.url === url && status.connected !== false) {
            changed = true;
            return { ...status, connected: false };
          }
          return status;
        });
        return changed ? next : prev;
      });
    } catch (error) {
      console.error(`Failed to disconnect from relay ${url}:`, error);
    }
  }, [nostrClient, normalizeRelayUrl]);

  // Listen for relay list changes from other components
  useEffect(() => {
    const handleRelayListChange = (event: CustomEvent) => {
      const { action, url, permission, relays, permissions } = event.detail as {
        action: string;
        url?: string;
        permission?: RelayPermission;
        relays?: string[];
        permissions?: Record<string, RelayPermission>;
      };
      
      if (action === 'add' && url && permission && relays) {
        // Only update if this relay manager doesn't already have this relay
        setRelayUrls(prev => {
          if (prev.includes(url)) return prev;
          return dedupeAndNormalize(relays);
        });
        
        setRelayPermissions(prev => {
          if (prev.has(url)) return prev;
          const newPermissions = new Map(prev);
          newPermissions.set(url, permission);
          return newPermissions;
        });
        
        setRelayStatuses(prev => {
          if (prev.some(s => s.url === url)) return prev;
          const read = permission === 'read' || permission === 'readwrite';
          const write = permission === 'write' || permission === 'readwrite' || permission === 'indexer';
          return [...prev, { url, connected: false, read, write }];
        });
      } else if (action === 'set_defaults' && Array.isArray(relays) && permissions) {
        // Replace current relays and permissions with provided defaults
        const normalizedRelays = dedupeAndNormalize(relays);

        // Get user-specific storage keys
        const { relaysKey, permissionsKey } = getUserSpecificKeys(pubkeyHex);

        // Persist to localStorage
        try {
          localStorage.setItem(relaysKey, JSON.stringify(normalizedRelays));
        } catch {}

        const permissionsMap = new Map<string, RelayPermission>();
        Object.entries(permissions).forEach(([u, p]) => {
          if (typeof p === 'string') {
            permissionsMap.set(normalizeRelayUrl(u), p as RelayPermission);
          }
        });
        try {
          const permissionsObj = Object.fromEntries(permissionsMap);
          localStorage.setItem(permissionsKey, JSON.stringify(permissionsObj));
        } catch {}

        // Apply to state
        setRelayUrls(() => normalizedRelays);
        setRelayPermissions(() => permissionsMap);
        setRelayStatuses(() => {
          return normalizedRelays.map(u => {
            const perm = permissionsMap.get(u) || 'readwrite';
            const read = perm === 'read' || perm === 'readwrite';
            const write = perm === 'write' || perm === 'readwrite' || perm === 'indexer';
            return { url: u, connected: false, read, write };
          });
        });
        connectionAttempts.current.clear();

        // Invalidate relay-dependent queries when defaults are set
        invalidateRelayDependentQueries(normalizedRelays);
      }
    };

    window.addEventListener('relayListChanged', handleRelayListChange as EventListener);
    return () => {
      window.removeEventListener('relayListChanged', handleRelayListChange as EventListener);
    };
  }, [dedupeAndNormalize, invalidateRelayDependentQueries, normalizeRelayUrl, pubkeyHex]);

  // Initialize relay statuses and connect to relays
  useEffect(() => {
    if (!nostrClient) {
      setRelayStatuses(prev => {
        let changed = false;
        const next = prev.map(status => {
          if (status.connected) {
            changed = true;
            return { ...status, connected: false };
          }
          return status;
        });
        return changed ? next : prev;
      });
      return;
    }

    setRelayStatuses(prev => {
      const next = relayUrls.map(url => {
        const existing = prev.find(s => s.url === url);
        const permission = relayPermissions.get(url) || 'readwrite';
        const read = permission === 'read' || permission === 'readwrite';
        const write = permission === 'write' || permission === 'readwrite' || permission === 'indexer';
        
        if (existing) {
          return {
            ...existing,
            read,
            write
          };
        }
        return { url, connected: false, read, write };
      });
      const sameLength = prev.length === next.length;
      const same = sameLength && prev.every((s, i) => 
        s.url === next[i].url && 
        s.connected === next[i].connected &&
        s.read === next[i].read &&
        s.write === next[i].write
      );
      return same ? prev : next;
    });

    // Connect to read relays only, prioritizing working relays
    const readRelays = relayUrls.filter(url => {
      const permission = relayPermissions.get(url) || 'readwrite';
      return permission === 'read' || permission === 'readwrite';
    });

    // Sort relays by connection success rate (prioritize previously successful ones)
    const sortedRelays = readRelays.sort((a, b) => {
      const attemptsA = connectionAttempts.current.get(a) || 0;
      const attemptsB = connectionAttempts.current.get(b) || 0;
      return attemptsA - attemptsB; // Fewer attempts = more likely to succeed
    });

    // Connect to relays with a small delay between each to avoid overwhelming the network
    sortedRelays.forEach((url, index) => {
      setTimeout(() => connectRelay(url), index * 100); // 100ms delay between connections
    });
  }, [nostrClient, relayUrls, relayPermissions]); // Removed connectRelay from dependencies to prevent infinite loop

  // Health monitoring for stuck queries - runs every 30 seconds
  useEffect(() => {
    if (!nostrClient || relayUrls.length === 0) return;

    const healthCheckInterval = setInterval(() => {
      // Check if we have any read relays connected
      const connectedReadRelays = relayStatuses.filter(status => status.read && status.connected);
      
      if (connectedReadRelays.length === 0 && relayUrls.length > 0) {
        console.warn('🏥 Health check: No read relays connected, attempting recovery...');
        
        // Reset connection attempts and try to reconnect
        connectionAttempts.current.clear();
        
        try {
          resetGlobalRelayPoolConnections();
          cleanupGlobalRelayPool();
        } catch (error) {
          console.warn('Failed to reset global relay pool during health check:', error);
        }

        // Try to reconnect to read relays
        const readRelays = relayUrls.filter(url => {
          const permission = relayPermissions.get(url) || 'readwrite';
          return permission === 'read' || permission === 'readwrite';
        });

        readRelays.forEach((url, index) => {
          setTimeout(() => connectRelay(url), index * 200); // Staggered reconnection
        });

        // Invalidate queries to trigger refetch when connections recover
        setTimeout(() => {
          invalidateRelayDependentQueries(relayUrls);
        }, 2000);
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(healthCheckInterval);
  }, [nostrClient, relayUrls, relayStatuses, relayPermissions, connectRelay, invalidateRelayDependentQueries]);

  // Debounced broadcast timer ref
  const broadcastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Broadcast relay changes to the network (NIP-65) for users with signing capabilities
  const broadcastRelayList = useCallback(async () => {
    if (!nostrClient || !(await canPublishRelayList())) {
      return; // Skip broadcasting for npub-only users or when client not ready
    }

    try {
      // Get write relays for publishing the relay list
      const writeRelays = relayUrls.filter(url => {
        const permission = relayPermissions.get(url) || 'readwrite';
        return permission === 'write' || permission === 'readwrite' || permission === 'indexer';
      });

      if (writeRelays.length === 0) {
        console.warn('No write relays available for broadcasting relay list');
        return;
      }

      await publishRelayList({
        pool: nostrClient,
        relayUrls,
        relayPermissions,
        publishToRelays: writeRelays,
      });

    } catch (error) {
      console.warn('⚠️ Failed to broadcast relay list:', error);
    }
  }, [nostrClient, relayUrls, relayPermissions]);

  // Debounced version of broadcastRelayList with 3 second delay
  const debouncedBroadcastRelayList = useCallback(() => {
    // Clear existing timeout if there is one
    if (broadcastTimeoutRef.current) {
      clearTimeout(broadcastTimeoutRef.current);
    }

    // Set new timeout for 3 seconds
    broadcastTimeoutRef.current = setTimeout(() => {
      broadcastRelayList();
      broadcastTimeoutRef.current = null;
    }, 3000);
  }, [broadcastRelayList]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (broadcastTimeoutRef.current) {
        clearTimeout(broadcastTimeoutRef.current);
      }
    };
  }, []);

  // Add a new relay
  const addRelay = useCallback(async (rawUrl: string, permission: RelayPermission = 'readwrite') => {
    const url = normalizeRelayUrl(rawUrl);
    if (relayUrls.includes(url)) return;

    // Get user-specific storage keys
    const { relaysKey, permissionsKey } = getUserSpecificKeys(pubkeyHexRef.current || pubkeyHex);

    setRelayUrls(prev => {
      const deduped = dedupeAndNormalizeRef.current([...prev, url]);
      if (arraysShallowEqual(prev, deduped)) return prev;
      localStorage.setItem(relaysKey, JSON.stringify(deduped));

      // Dispatch custom event to notify other relay manager instances
      try {
        window.dispatchEvent(new CustomEvent('relayListChanged', {
          detail: { action: 'add', url, permission, relays: deduped }
        }));
      } catch (e) {
        console.warn('Failed to dispatch relayListChanged event:', e);
      }

      return deduped;
    });

    setRelayPermissions(prev => {
      const newPermissions = new Map(prev);
      newPermissions.set(url, permission);
      const permissionsObj = Object.fromEntries(newPermissions);
      localStorage.setItem(permissionsKey, JSON.stringify(permissionsObj));
      return newPermissions;
    });
    
    setRelayStatuses(prev => {
      const exists = prev.some(s => s.url === url);
      if (exists) return prev;
      
      const read = permission === 'read' || permission === 'readwrite';
      const write = permission === 'write' || permission === 'readwrite' || permission === 'indexer';
      return [...prev, { url, connected: false, read, write }];
    });
    
    // Only connect if it's a read relay
    if (permission === 'read' || permission === 'readwrite') {
      connectRelay(url);
    }

    // Invalidate relay-dependent queries when a relay is added
    invalidateRelayDependentQueries([...relayUrls, url]);

    // Broadcast relay list changes for users with signing capabilities (debounced)
    // Use setTimeout to ensure state updates are processed first, then trigger debounced broadcast
    setTimeout(() => {
      debouncedBroadcastRelayList();
    }, 100);
  }, [relayUrls, connectRelay, normalizeRelayUrl, relayPermissions, debouncedBroadcastRelayList, invalidateRelayDependentQueries]); // Remove problematic dependencies, using refs instead

  // Remove a relay
  const removeRelay = useCallback(async (rawUrl: string) => {
    const url = normalizeRelayUrl(rawUrl);
    await disconnectRelay(url);

    // Get user-specific storage keys
    const { relaysKey, permissionsKey } = getUserSpecificKeys(pubkeyHexRef.current || pubkeyHex);

    setRelayUrls(prev => {
      const newUrls = prev.filter(u => u !== url);
      if (arraysShallowEqual(prev, newUrls)) return prev;
      localStorage.setItem(relaysKey, JSON.stringify(newUrls));
      return newUrls;
    });

    setRelayPermissions(prev => {
      const newPermissions = new Map(prev);
      newPermissions.delete(url);
      const permissionsObj = Object.fromEntries(newPermissions);
      localStorage.setItem(permissionsKey, JSON.stringify(permissionsObj));
      return newPermissions;
    });
    
    setRelayStatuses(prev => prev.filter(status => status.url !== url));
    connectionAttempts.current.delete(url);

    // Invalidate relay-dependent queries when a relay is removed  
    invalidateRelayDependentQueries(relayUrls.filter(u => u !== url), relayUrls);

    // Broadcast relay list changes for users with signing capabilities (debounced)
    // Use setTimeout to ensure state updates are processed first, then trigger debounced broadcast
    setTimeout(() => {
      debouncedBroadcastRelayList();
    }, 100);
  }, [disconnectRelay, normalizeRelayUrl, relayPermissions, debouncedBroadcastRelayList, invalidateRelayDependentQueries]); // Remove pubkeyHex and arraysShallowEqual dependencies, using refs instead

  // Clear all stored relays
  const clearStoredRelays = useCallback(() => {
    const { relaysKey, permissionsKey } = getUserSpecificKeys(pubkeyHexRef.current || pubkeyHex);
    localStorage.removeItem(relaysKey);
    localStorage.removeItem(permissionsKey);
    setRelayUrls([]);
    setRelayStatuses([]);
    setRelayPermissions(new Map());
    connectionAttempts.current.clear();
  }, []); // Remove dependencies, using ref instead

  // Restore default relays and permissions
  const restoreDefaultRelays = useCallback(() => {
    try {
      // Clear session-scoped overrides
      try {
        sessionStorage.removeItem(SESSION_RELAY_DEFAULTS_KEY);
      } catch {}

      // Get user-specific storage keys
      const { relaysKey, permissionsKey } = getUserSpecificKeys(pubkeyHexRef.current || pubkeyHex);

      // Set default relays
      localStorage.setItem(relaysKey, JSON.stringify(DEFAULT_RELAY_URLS));

      // Set default relay permissions
      const permissionsObj: Record<string, string> = {};
      DEFAULT_RELAY_PERMISSIONS.forEach((permission, url) => {
        permissionsObj[url] = permission;
      });
      localStorage.setItem(permissionsKey, JSON.stringify(permissionsObj));
      
      // Update state to reflect the new defaults
      setRelayUrls(DEFAULT_RELAY_URLS);
      setRelayPermissions(DEFAULT_RELAY_PERMISSIONS);
      
      // Clear connection attempts to allow fresh connections
      connectionAttempts.current.clear();
      
      // Reset relay statuses to initial state
      setRelayStatuses(DEFAULT_RELAY_URLS.map(url => ({
        url,
        connected: false,
        read: DEFAULT_RELAY_PERMISSIONS.get(url) === 'read' || DEFAULT_RELAY_PERMISSIONS.get(url) === 'readwrite',
        write: DEFAULT_RELAY_PERMISSIONS.get(url) === 'write' || DEFAULT_RELAY_PERMISSIONS.get(url) === 'readwrite' || DEFAULT_RELAY_PERMISSIONS.get(url) === 'indexer'
      })));

      // Invalidate relay-dependent queries when defaults are restored
      invalidateRelayDependentQueries(DEFAULT_RELAY_URLS);

    } catch (error) {
      console.error("❌ Error restoring default relays:", error);
    }
  }, [invalidateRelayDependentQueries]); // Remove pubkeyHex dependency, using ref instead

  // Cycle through relay permissions: read -> write -> readwrite -> indexer -> read
  const cycleRelayPermission = useCallback(async (rawUrl: string) => {
    const url = normalizeRelayUrl(rawUrl);
    
    setRelayPermissions(prev => {
      const currentPermission = prev.get(url) || 'readwrite';
      let newPermission: RelayPermission;
      
      switch (currentPermission) {
        case 'read':
          newPermission = 'write';
          break;
        case 'write':
          newPermission = 'readwrite';
          break;
        case 'readwrite':
          newPermission = 'indexer';
          break;
        case 'indexer':
          newPermission = 'read';
          break;
        default:
          newPermission = 'readwrite';
      }
      
      const newPermissions = new Map(prev);
      newPermissions.set(url, newPermission);
      const permissionsObj = Object.fromEntries(newPermissions);

      // Get user-specific storage keys
      const { permissionsKey } = getUserSpecificKeys(pubkeyHexRef.current || pubkeyHex);
      localStorage.setItem(permissionsKey, JSON.stringify(permissionsObj));
      
      // Update relay statuses immediately with the new permission
      const read = newPermission === 'read' || newPermission === 'readwrite';
      const write = newPermission === 'write' || newPermission === 'readwrite' || newPermission === 'indexer';
      
      setRelayStatuses(currentStatuses => 
        currentStatuses.map(status => 
          status.url === url 
            ? { ...status, read, write }
            : status
        )
      );
      
            // Connect/disconnect based on new permission
      if (read) {
        connectRelay(url);
      } else {
        disconnectRelay(url);
      }

      // Invalidate relay-dependent queries when relay permission changes
      invalidateRelayDependentQueries(relayUrls);

      return newPermissions;
    });

    // Broadcast relay list changes for users with signing capabilities (debounced)
    // Use setTimeout to ensure state updates are processed first, then trigger debounced broadcast
    setTimeout(() => {
      debouncedBroadcastRelayList();
    }, 100);
  }, [normalizeRelayUrl, connectRelay, disconnectRelay, debouncedBroadcastRelayList, invalidateRelayDependentQueries]); // Remove pubkeyHex dependency, using ref instead

  // Get relay permission
  const getRelayPermission = useCallback((rawUrl: string): RelayPermission => {
    const url = normalizeRelayUrl(rawUrl);
    return relayPermissions.get(url) || 'readwrite';
  }, [relayPermissions, normalizeRelayUrl]);

  // Get read relays (for status indicators and feed) - memoized to prevent unnecessary re-renders
  const readRelays = useMemo(() => {
    return relayUrls.filter(url => {
      const permission = relayPermissions.get(url) || 'readwrite';
      return permission === 'read' || permission === 'readwrite';
    });
  }, [relayUrls, relayPermissions]);

  // Get write relays (for publishing) - memoized to prevent unnecessary re-renders
  const writeRelays = useMemo(() => {
    return relayUrls.filter(url => {
      const permission = relayPermissions.get(url) || 'readwrite';
      return permission === 'write' || permission === 'readwrite' || permission === 'indexer';
    });
  }, [relayUrls, relayPermissions]);

  // Get read relay statuses (for status indicators)
  const getReadRelayStatuses = useCallback(() => {
    return relayStatuses.filter(status => status.read);
  }, [relayStatuses]);

  // Apply session-scoped defaults (npub-only login) if present
  const applySessionDefaultsIfPresent = useCallback(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_RELAY_DEFAULTS_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { relays?: string[]; permissions?: Record<string, RelayPermission> };
      const relays = Array.isArray(parsed.relays) ? parsed.relays : [];
      const permissionsObj = parsed.permissions || {};
      if (relays.length === 0) return false;

      const normalizedRelays = dedupeAndNormalize(relays);
      const permissionsMap = new Map<string, RelayPermission>();
      Object.entries(permissionsObj).forEach(([u, p]) => {
        if (typeof p === 'string' && ['read', 'write', 'readwrite', 'indexer'].includes(p)) {
          permissionsMap.set(normalizeRelayUrl(u), p as RelayPermission);
        }
      });

      // Do not persist to localStorage; session-only override
      setRelayUrls(() => normalizedRelays);
      setRelayPermissions(() => permissionsMap);
      setRelayStatuses(() => {
        return normalizedRelays.map(u => {
          const perm = permissionsMap.get(u) || 'readwrite';
          const read = perm === 'read' || perm === 'readwrite';
          const write = perm === 'write' || perm === 'readwrite' || perm === 'indexer';
          return { url: u, connected: false, read, write };
        });
      });
      connectionAttempts.current.clear();
      return true;
    } catch {
      return false;
    }
  }, [dedupeAndNormalize, normalizeRelayUrl]);

  // Attempt to apply session defaults on mount and shortly after (to catch async npub fetch)
  useEffect(() => {
    const applied = applySessionDefaultsIfPresent();
    // Retry once shortly after if not applied yet
    let timer: number | undefined;
    if (!applied) {
      timer = window.setTimeout(() => {
        applySessionDefaultsIfPresent();
      }, 800);
    }
    // Listen for explicit session defaults update event
    const onSessionDefaults = () => applySessionDefaultsIfPresent();
    window.addEventListener('sessionRelayDefaultsUpdated', onSessionDefaults as EventListener);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('sessionRelayDefaultsUpdated', onSessionDefaults as EventListener);
    };
  }, [applySessionDefaultsIfPresent]);

  return {
    relayUrls,
    relayStatuses,
    relayPermissions,
    readRelays,
    writeRelays,
    readRelayStatuses: getReadRelayStatuses(),
    addRelay,
    removeRelay,
    clearStoredRelays,
    restoreDefaultRelays,
    cycleRelayPermission,
    getRelayPermission,
    applySessionDefaultsIfPresent,
    broadcastRelayList: debouncedBroadcastRelayList,
    canPublishRelayList
  };
}; 
import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_RELAY_URLS, DEFAULT_RELAY_PERMISSIONS, PROFILE_RELAY_URLS } from '../utils/nostr/constants';
import type { RelayPermission } from '../types/nostr/types';

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

/**
 * Hook to read relay configuration from the same storage as useRelayManager
 * This allows NostrifyMigrationProvider to stay in sync with relay settings
 */
export const useRelayConfiguration = (pubkeyHex?: string) => {
  const [relayUrls, setRelayUrls] = useState<string[]>(DEFAULT_RELAY_URLS);
  const [relayPermissions, setRelayPermissions] = useState<Map<string, RelayPermission>>(new Map());

  // Load relay configuration from storage
  const loadRelayConfiguration = useCallback(() => {
    const { relaysKey, permissionsKey } = getUserSpecificKeys(pubkeyHex);
    
    // Load relay URLs
    const storedRelays = localStorage.getItem(relaysKey);
    let urls: string[] = [];
    
    if (storedRelays) {
      try {
        const parsed = JSON.parse(storedRelays);
        if (Array.isArray(parsed)) {
          urls = parsed; // Use the stored array even if empty
        }
      } catch (e) {
        console.warn('Failed to parse stored relays:', e);
      }
    }
    
    // Only fall back to defaults if no stored relays exist at all (new user)
    if (urls.length === 0 && !storedRelays) {
      urls = DEFAULT_RELAY_URLS;
    }
    
    // Load relay permissions
    let permissions = new Map<string, RelayPermission>();
    
    // First load user's persistent preferences
    const storedPermissions = localStorage.getItem(permissionsKey);
    if (storedPermissions) {
      try {
        const parsed = JSON.parse(storedPermissions);
        if (Array.isArray(parsed)) {
          // Legacy format - convert to new format
          parsed.forEach((url: string) => {
            permissions.set(url, 'write');
          });
        } else if (typeof parsed === 'object') {
          Object.entries(parsed).forEach(([url, permission]) => {
            if (typeof permission === 'string' && ['read', 'write', 'readwrite', 'indexer'].includes(permission)) {
              permissions.set(url, permission as RelayPermission);
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
              !permissions.has(url) &&
              typeof perm === 'string' &&
              ['read', 'write', 'readwrite', 'indexer'].includes(perm)
            ) {
              permissions.set(url, perm as RelayPermission);
            }
          });
        }
      }
    } catch (e) {
      console.warn('Failed to parse session relay defaults:', e);
    }

    // If we have user permissions, use them
    if (permissions.size > 0) {
      setRelayUrls(urls);
      setRelayPermissions(permissions);
      return;
    }

    // Default permissions for new users
    const defaultPermissions = new Map<string, RelayPermission>();
    
    // Set permissions from constants
    DEFAULT_RELAY_PERMISSIONS.forEach((permission, url) => {
      defaultPermissions.set(url, permission);
    });
    
    // For any other initial relays not explicitly set above, default to readwrite
    urls.forEach(url => {
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
    
    setRelayUrls(urls);
    setRelayPermissions(defaultPermissions);
  }, [pubkeyHex]);

  // Load configuration on mount and when pubkey changes
  useEffect(() => {
    loadRelayConfiguration();
  }, [loadRelayConfiguration]);

  // Listen for storage changes to stay in sync with useRelayManager
  useEffect(() => {
    const { relaysKey, permissionsKey } = getUserSpecificKeys(pubkeyHex);
    
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === relaysKey || 
          e.key === permissionsKey ||
          e.key === SESSION_RELAY_DEFAULTS_KEY) {
        loadRelayConfiguration();
      }
    };

    const handleCustomStorageChange = () => {
      // Handle same-window localStorage changes
      loadRelayConfiguration();
    };

    const handleRelayListChange = () => {
      // Handle relay list changes from useRelayManager
      loadRelayConfiguration();
    };

    // REMOVED: Aggressive polling that was causing infinite loops
    // The storage event listeners should be sufficient for detecting changes

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('relayConfigurationChanged', handleCustomStorageChange);
    window.addEventListener('relayListChanged', handleRelayListChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('relayConfigurationChanged', handleCustomStorageChange);
      window.removeEventListener('relayListChanged', handleRelayListChange);
    };
  }, [pubkeyHex, loadRelayConfiguration]);

  return {
    relayUrls,
    relayPermissions,
    reloadConfiguration: loadRelayConfiguration,
  };
};

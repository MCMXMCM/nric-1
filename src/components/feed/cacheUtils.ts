// Cache clearing utility functions for the NostrFeed components

// Note: clearCache import removed - using TanStack Query for caching instead
import { 
  clearPersistedRQCache, 
  getCacheBreakdown,
  clearFeedQueries,
  clearMetadataQueries,
  clearContactsQueries,
  clearZapTotalsQueries
} from '../../utils/persistQueryClient';
import { QueryClient } from '@tanstack/react-query';
import { createIDBPersister } from '../../utils/persistQueryClient';

export interface CacheOperationState {
  setIsClearingCache: (value: boolean) => void;
  setIsInitialized: (value: boolean) => void;
  setNotes: (value: any[]) => void;
  setAsciiCache: (value: any) => void;
  updateCurrentIndex: (index: number) => void;
  setCacheStats: (stats: any) => void;
  setMetadata: (value: any) => void;
  setContacts: (value: any[]) => void;
  setShowClearCacheConfirm: (value: boolean) => void;
  cacheStats: any;
  asciiCache: any;
  queryClient?: QueryClient; // Add QueryClient to state
}

export const createClearNoteCache = (state: CacheOperationState) => async () => {
  try {

    state.setIsClearingCache(true);
    state.setIsInitialized(false);
    
    // Clear React state

    state.setNotes([]);
    state.setAsciiCache({});
    state.updateCurrentIndex(0);
    localStorage.removeItem('currentIndex');

    // Clear feed queries using cache buster

    try {
      if (state.queryClient) {
        const persister = createIDBPersister();
        await clearFeedQueries(state.queryClient, persister);
      } else {
        console.warn('⚠️ No QueryClient provided, cannot clear feed queries');
      }
    } catch (error) {
      console.error('❌ Error clearing feed queries:', error);
    }
    
    // Get updated cache stats from TanStack Query persistence
    const cacheBreakdown = await getCacheBreakdown();
    state.setCacheStats({
      notesCount: cacheBreakdown.breakdown.feedQueries,
      metadataCount: cacheBreakdown.breakdown.metadataQueries,
      contactsCount: cacheBreakdown.breakdown.contactsQueries,
      asciiCacheCount: 0,
      zapTotalsCount: cacheBreakdown.breakdown.zapTotalsQueries
    });
    
    // Verify the feed cache was actually cleared
    if (cacheBreakdown.breakdown.feedQueries === 0) {

    } else {
      console.warn(`⚠️ VERIFICATION WARNING - ${cacheBreakdown.breakdown.feedQueries} feed queries still remain in persisted cache.`);
    }
    
    state.setShowClearCacheConfirm(false);
    state.setIsInitialized(true);
  } catch (error) {
    console.error('❌ Error clearing cache:', error);
  } finally {
    state.setIsClearingCache(false);
  }
};

export const createClearContactsCache = (state: CacheOperationState) => async () => {
  try {

    state.setIsClearingCache(true);
    
    // Clear React state
    state.setContacts([]);

    // Clear metadata and contacts queries using cache buster

    try {
      if (state.queryClient) {
        const persister = createIDBPersister();
        await clearMetadataQueries(state.queryClient, persister);
        await clearContactsQueries(state.queryClient, persister);
      } else {
        console.warn('⚠️ No QueryClient provided, cannot clear metadata/contacts queries');
      }
    } catch (error) {
      console.error('❌ Error clearing metadata/contacts queries:', error);
    }
    
    // Get updated cache stats from TanStack Query persistence
    const cacheBreakdown = await getCacheBreakdown();
    state.setCacheStats({
      notesCount: cacheBreakdown.breakdown.feedQueries,
      metadataCount: cacheBreakdown.breakdown.metadataQueries,
      contactsCount: cacheBreakdown.breakdown.contactsQueries,
      asciiCacheCount: Object.keys(state.asciiCache).length,
      zapTotalsCount: cacheBreakdown.breakdown.zapTotalsQueries
    });

  } catch (error) {
    console.error('❌ Error clearing contacts cache:', error);
  } finally {
    state.setIsClearingCache(false);
  }
};

export const createClearZapTotalsCache = (state: CacheOperationState) => async () => {
  try {

    state.setIsClearingCache(true);
    
    // Clear zap totals queries using cache buster

    try {
      if (state.queryClient) {
        const persister = createIDBPersister();
        await clearZapTotalsQueries(state.queryClient, persister);
      } else {
        console.warn('⚠️ No QueryClient provided, cannot clear zap totals queries');
      }
    } catch (error) {
      console.error('❌ Error clearing zap totals queries:', error);
    }
    
    // Get updated cache stats from TanStack Query persistence
    const cacheBreakdown = await getCacheBreakdown();
    state.setCacheStats({
      notesCount: cacheBreakdown.breakdown.feedQueries,
      metadataCount: cacheBreakdown.breakdown.metadataQueries,
      contactsCount: cacheBreakdown.breakdown.contactsQueries,
      asciiCacheCount: Object.keys(state.asciiCache).length,
      zapTotalsCount: cacheBreakdown.breakdown.zapTotalsQueries
    });

  } catch (error) {
    console.error('❌ Error clearing zap totals cache:', error);
  } finally {
    state.setIsClearingCache(false);
  }
};

export const createClearOutboxData = async () => {
  try {
    const { getOutboxStorage } = await import('../../utils/nostr/outboxStorage.js');
    const storage = getOutboxStorage();
    await storage.clearAllOutboxData();
    console.log('✅ Outbox data cleared successfully');
  } catch (error) {
    console.error('❌ Error clearing outbox data:', error);
  }
};

export const createClearAllCaches = (state: CacheOperationState) => async () => {
  try {

    state.setIsClearingCache(true);
    state.setIsInitialized(false);
    
    // Clear React state

    state.setNotes([]);
    state.setContacts([]);
    state.setAsciiCache({});
    state.updateCurrentIndex(0);
    localStorage.removeItem('currentIndex');

    // Clear TanStack Query cache completely

    try {
      if (state.queryClient) {
        await clearPersistedRQCache({ queryClient: state.queryClient });
      } else {
        console.warn('⚠️ No QueryClient provided, creating new instance');
        const qc = new QueryClient();
        await clearPersistedRQCache({ queryClient: qc });
      }
    } catch (error) {
      console.error('❌ Error clearing TanStack Query cache:', error);
    }
    
    // Clear legacy IndexedDB collections (nostr-feed keystore only)
    // Note: Outbox data is preserved unless explicitly cleared

    try {
      const request = indexedDB.open('nostr-feed', 5);
      request.onsuccess = () => {
        const db = request.result;
        const stores = ['keystore']; // zap_totals removed - now handled by TanStack Query
        
        stores.forEach(storeName => {
          if (db.objectStoreNames.contains(storeName)) {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            store.clear();

          }
        });
        db.close();
      };
    } catch (error) {
      console.warn('⚠️ Could not clear legacy IndexedDB collections:', error);
    }
    
    // Clear all localStorage preferences and settings

    const localStorageKeysToClear = [
      'isDarkMode', 'darkMode', 'useAscii', 'useColor',
      'filterByBitcoin', 'filterByNews', 'filterByNostr',
      'filterByFollow', 'currentIndex',
      'nostrPubkey', 'asciiCache', 'nostr_user_display_names',
      'nostr_stored_relays', 'showProfileMeta', 'customHashtags'
    ];
    
    localStorageKeysToClear.forEach(key => {
      try {
        localStorage.removeItem(key);

      } catch (error) {
        console.warn(`⚠️ Could not clear localStorage key: ${key}`, error);
      }
    });
    
    // Get updated cache stats from TanStack Query persistence
    const cacheBreakdown = await getCacheBreakdown();
    state.setCacheStats({
      notesCount: cacheBreakdown.breakdown.feedQueries,
      metadataCount: cacheBreakdown.breakdown.metadataQueries,
      contactsCount: cacheBreakdown.breakdown.contactsQueries,
      asciiCacheCount: 0,
      zapTotalsCount: cacheBreakdown.breakdown.zapTotalsQueries
    });
    
    // Verify all caches were actually cleared
    if (cacheBreakdown.totalQueries === 0) {

    } else {
      console.warn(`⚠️ VERIFICATION WARNING - ${cacheBreakdown.totalQueries} queries still remain in persisted cache.`);
    }
    
    state.setShowClearCacheConfirm(false);
    state.setIsInitialized(true);
  } catch (error) {
    console.error('❌ Error clearing all caches:', error);
  } finally {
    state.setIsClearingCache(false);
  }
};

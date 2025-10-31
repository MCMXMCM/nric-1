import { get, set, del } from 'idb-keyval'
import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client'
import type { QueryClient } from '@tanstack/react-query'
import { persistQueryClientSave, persistQueryClientRestore } from '@tanstack/react-query-persist-client'
import { performSmartRehydration, preloadCriticalData, optimizeQueryCache } from './smartRehydration'

const DEFAULT_KEY = 'rq-cache-v1'

export function createIDBPersister(idbKey: string = DEFAULT_KEY): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        await set(idbKey, client)
      } catch (_) {
        // ignore persistence errors
      }
    },
    restoreClient: async () => {
      try {
        return (await get(idbKey)) as PersistedClient | undefined
      } catch (_) {
        return undefined
      }
    },
    removeClient: async () => {
      try {
        await del(idbKey)
      } catch (_) {
        // ignore
      }
    },
  }
}

export const PERSIST_KEY = DEFAULT_KEY

export interface PersistedSummary {
  queries: number
  mutations: number
  lastUpdatedAt: number
  sizeBytes: number
}

export async function getPersistedRQSummary(idbKey: string = DEFAULT_KEY): Promise<PersistedSummary> {
  try {
    const client = (await get(idbKey)) as PersistedClient | undefined
    if (!client) return { queries: 0, mutations: 0, lastUpdatedAt: 0, sizeBytes: 0 }
    const queries = client.clientState?.queries?.length || 0
    const mutations = client.clientState?.mutations?.length || 0
    const lastUpdatedAt = Number(client.timestamp || 0)
    let sizeBytes = 0
    try {
      sizeBytes = new Blob([JSON.stringify(client)]).size
    } catch {
      sizeBytes = 0
    }
    return { queries, mutations, lastUpdatedAt, sizeBytes }
  } catch {
    return { queries: 0, mutations: 0, lastUpdatedAt: 0, sizeBytes: 0 }
  }
}

export async function clearPersistedRQCache(opts?: { idbKey?: string; queryClient?: QueryClient }): Promise<void> {
  const key = opts?.idbKey || DEFAULT_KEY
  try { await del(key) } catch {}
  try { opts?.queryClient?.clear?.() } catch {}
}

/**
 * Performs smart rehydration with priority-based loading
 */
export async function performSmartRehydrationWithPersistence(
  queryClient: QueryClient,
  persister: Persister,
  options?: {
    enableSmartRehydration?: boolean;
    enableCacheOptimization?: boolean;
  }
): Promise<{
  success: boolean;
  rehydratedQueries: number;
  totalTime: number;
  errors: string[];
}> {
  const {
    enableSmartRehydration = true,
    enableCacheOptimization = true,
  } = options || {};

  try {

    // First, restore the persisted client
    await persistQueryClientRestore({ queryClient, persister });

    if (!enableSmartRehydration) {

      return {
        success: true,
        rehydratedQueries: queryClient.getQueryCache().getAll().length,
        totalTime: 0,
        errors: [],
      };
    }

    // Preload critical data for offline-first experience

    await preloadCriticalData(queryClient);

    // Perform smart rehydration
    const result = await performSmartRehydration(queryClient);

    // Optimize cache if enabled
    if (enableCacheOptimization) {

      optimizeQueryCache(queryClient);
    }

    return result;

  } catch (error) {
    console.error('❌ Smart rehydration with persistence failed:', error);
    return {
      success: false,
      rehydratedQueries: 0,
      totalTime: 0,
      errors: [`Rehydration failed: ${error}`],
    };
  }
}

// Selective cache clearing functions using cache busters
export async function clearFeedQueries(queryClient: QueryClient, persister: Persister): Promise<void> {
  try {
    // Create a cache buster for feed queries
    const buildHash = `feed-buster-${Date.now()}`
    
    // Save current state with feed queries busted
    await persistQueryClientSave({ queryClient, persister, buster: buildHash })
    
    // Remove feed-related queries from cache
    const queries = queryClient.getQueryCache().getAll()
    queries.forEach(query => {
      const queryKey = query.queryKey
      if (Array.isArray(queryKey) && (
        queryKey[0] === 'feed' || 
        queryKey[0] === 'note' || 
        (queryKey[0] === 'profile' && queryKey[1] === 'notes')
      )) {
        queryClient.removeQueries({ queryKey })
      }
    })
    
    // Restore with busted feed queries
    await persistQueryClientRestore({ queryClient, persister, buster: buildHash })
    
    console.log('✅ Feed queries cleared successfully')
  } catch (error) {
    console.error('❌ Error clearing feed queries:', error)
  }
}

export async function clearMetadataQueries(queryClient: QueryClient, persister: Persister): Promise<void> {
  try {
    // Create a cache buster for metadata queries
    const buildHash = `metadata-buster-${Date.now()}`
    
    // Save current state with metadata queries busted
    await persistQueryClientSave({ queryClient, persister, buster: buildHash })
    
    // Remove metadata-related queries from cache
    const queries = queryClient.getQueryCache().getAll()
    queries.forEach(query => {
      const queryKey = query.queryKey
      if (Array.isArray(queryKey) && (
        queryKey[0] === 'metadata' || 
        (queryKey[0] === 'profile' && queryKey[1] === 'metadata') ||
        (queryKey[0] === 'profile' && queryKey[1] === 'contacts-metadata')
      )) {
        queryClient.removeQueries({ queryKey })
      }
    })
    
    // Restore with busted metadata queries
    await persistQueryClientRestore({ queryClient, persister, buster: buildHash })
    
    console.log('✅ Metadata queries cleared successfully')
  } catch (error) {
    console.error('❌ Error clearing metadata queries:', error)
  }
}

export async function clearContactsQueries(queryClient: QueryClient, persister: Persister): Promise<void> {
  try {
    // Create a cache buster for contacts queries
    const buildHash = `contacts-buster-${Date.now()}`
    
    // Save current state with contacts queries busted
    await persistQueryClientSave({ queryClient, persister, buster: buildHash })
    
    // Remove contacts-related queries from cache
    const queries = queryClient.getQueryCache().getAll()
    queries.forEach(query => {
      const queryKey = query.queryKey
      if (Array.isArray(queryKey) && (
        queryKey[0] === 'contacts' || 
        (queryKey[0] === 'profile' && queryKey[1] === 'contacts')
      )) {
        queryClient.removeQueries({ queryKey })
      }
    })
    
    // Restore with busted contacts queries
    await persistQueryClientRestore({ queryClient, persister, buster: buildHash })
    
    console.log('✅ Contacts queries cleared successfully')
  } catch (error) {
    console.error('❌ Error clearing contacts queries:', error)
  }
}

export async function clearThreadQueries(queryClient: QueryClient, persister: Persister): Promise<void> {
  try {
    // Create a cache buster for thread queries
    const buildHash = `thread-buster-${Date.now()}`
    
    // Save current state with thread queries busted
    await persistQueryClientSave({ queryClient, persister, buster: buildHash })
    
    // Remove thread-related queries from cache
    const queries = queryClient.getQueryCache().getAll()
    queries.forEach(query => {
      const queryKey = query.queryKey
      if (Array.isArray(queryKey) && queryKey[0] === 'thread') {
        queryClient.removeQueries({ queryKey })
      }
    })
    
    // Restore with busted thread queries
    await persistQueryClientRestore({ queryClient, persister, buster: buildHash })
    
    console.log('✅ Thread queries cleared successfully')
  } catch (error) {
    console.error('❌ Error clearing thread queries:', error)
  }
}

export async function clearZapTotalsQueries(queryClient: QueryClient, persister: Persister): Promise<void> {
  try {
    // Create a cache buster for zap totals queries
    const buildHash = `zap-totals-buster-${Date.now()}`
    
    // Save current state with zap totals queries busted
    await persistQueryClientSave({ queryClient, persister, buster: buildHash })
    
    // Remove zap totals-related queries from cache
    const queries = queryClient.getQueryCache().getAll()
    queries.forEach(query => {
      const queryKey = query.queryKey
      if (Array.isArray(queryKey) && queryKey[0] === 'zap-totals') {
        queryClient.removeQueries({ queryKey })
      }
    })
    
    // Restore with busted zap totals queries
    await persistQueryClientRestore({ queryClient, persister, buster: buildHash })
    
    console.log('✅ Zap totals queries cleared successfully')
  } catch (error) {
    console.error('❌ Error clearing zap totals queries:', error)
  }
}

// Get metadata queries count from persisted cache
export async function getMetadataQueriesCount(idbKey: string = DEFAULT_KEY): Promise<number> {
  try {
    const client = (await get(idbKey)) as PersistedClient | undefined
    if (!client?.clientState?.queries) return 0
    
    // Count queries that are metadata-related
    const metadataQueries = client.clientState.queries.filter((query: any) => {
      const queryKey = query.queryKey
      if (!Array.isArray(queryKey)) return false
      
      // Check for different metadata query patterns
      return (
        queryKey[0] === 'metadata' && queryKey[1] || // ['metadata', pubkey]
        (queryKey[0] === 'profile' && queryKey[1] === 'metadata' && queryKey[2]) || // ['profile', 'metadata', pubkey]
        (queryKey[0] === 'profile' && queryKey[1] === 'contacts-metadata' && queryKey[2]) // ['profile', 'contacts-metadata', pubkeys, relayKey]
      )
    })
    
    return metadataQueries.length
  } catch {
    return 0
  }
}

// Get contacts queries count from persisted cache
export async function getContactsQueriesCount(idbKey: string = DEFAULT_KEY): Promise<number> {
  try {
    const client = (await get(idbKey)) as PersistedClient | undefined
    if (!client?.clientState?.queries) return 0
    
    // Count queries that are contacts-related
    const contactsQueries = client.clientState.queries.filter((query: any) => {
      const queryKey = query.queryKey
      if (!Array.isArray(queryKey)) return false
      
      // Check for different contacts query patterns
      return (
        queryKey[0] === 'contacts' && queryKey[1] || // ['contacts', pubkey]
        (queryKey[0] === 'profile' && queryKey[1] === 'contacts' && queryKey[2]) // ['profile', 'contacts', mode, pubkey, relayKey]
      )
    })
    
    return contactsQueries.length
  } catch {
    return 0
  }
}

// Get feed/notes queries count from persisted cache
export async function getFeedQueriesCount(idbKey: string = DEFAULT_KEY): Promise<number> {
  try {
    const client = (await get(idbKey)) as PersistedClient | undefined
    if (!client?.clientState?.queries) return 0
    
    // Count queries that are feed/notes-related
    const feedQueries = client.clientState.queries.filter((query: any) => {
      const queryKey = query.queryKey
      if (!Array.isArray(queryKey)) return false
      
      // Check for different feed query patterns
      return (
        queryKey[0] === 'feed' || // ['feed', 'notes', filterHash, relayKey, pageSize]
        queryKey[0] === 'note' || // ['note', noteId]
        (queryKey[0] === 'profile' && queryKey[1] === 'notes') // ['profile', 'notes', pubkey, relayKey]
      )
    })
    
    return feedQueries.length
  } catch {
    return 0
  }
}

// Get thread queries count from persisted cache
export async function getThreadQueriesCount(idbKey: string = DEFAULT_KEY): Promise<number> {
  try {
    const client = (await get(idbKey)) as PersistedClient | undefined
    if (!client?.clientState?.queries) return 0
    
    // Count queries that are thread-related
    const threadQueries = client.clientState.queries.filter((query: any) => {
      const queryKey = query.queryKey
      if (!Array.isArray(queryKey)) return false
      
      // Check for thread query patterns
      return queryKey[0] === 'thread' // ['thread', 'level1', parentNoteId], etc.
    })
    
    return threadQueries.length
  } catch {
    return 0
  }
}

// Get zap totals queries count from persisted cache
export async function getZapTotalsQueriesCount(idbKey: string = DEFAULT_KEY): Promise<number> {
  try {
    const client = (await get(idbKey)) as PersistedClient | undefined
    if (!client?.clientState?.queries) return 0
    
    // Count queries that are zap totals-related
    const zapTotalsQueries = client.clientState.queries.filter((query: any) => {
      const queryKey = query.queryKey
      if (!Array.isArray(queryKey)) return false
      
      // Check for zap totals query patterns
      return queryKey[0] === 'zap-totals' && queryKey[1] // ['zap-totals', noteId]
    })
    
    return zapTotalsQueries.length
  } catch {
    return 0
  }
}

// Get comprehensive cache breakdown from persisted cache
export async function getCacheBreakdown(idbKey: string = DEFAULT_KEY): Promise<{
  totalQueries: number;
  totalMutations: number;
  totalSizeBytes: number;
  lastUpdatedAt: number;
  breakdown: {
    feedQueries: number;
    metadataQueries: number;
    contactsQueries: number;
    threadQueries: number;
    zapTotalsQueries: number;
    otherQueries: number;
  };
  sizeBreakdown: {
    feedQueriesSize: number;
    metadataQueriesSize: number;
    contactsQueriesSize: number;
    threadQueriesSize: number;
    zapTotalsQueriesSize: number;
    otherQueriesSize: number;
  };
}> {
  try {
    const client = (await get(idbKey)) as PersistedClient | undefined
    if (!client?.clientState?.queries) {
      return {
        totalQueries: 0,
        totalMutations: 0,
        totalSizeBytes: 0,
        lastUpdatedAt: 0,
        breakdown: {
          feedQueries: 0,
          metadataQueries: 0,
          contactsQueries: 0,
          threadQueries: 0,
          zapTotalsQueries: 0,
          otherQueries: 0,
        },
        sizeBreakdown: {
          feedQueriesSize: 0,
          metadataQueriesSize: 0,
          contactsQueriesSize: 0,
          threadQueriesSize: 0,
          zapTotalsQueriesSize: 0,
          otherQueriesSize: 0,
        }
      }
    }
    
    const queries = client.clientState.queries || []
    const mutations = client.clientState.mutations || []
    const lastUpdatedAt = Number(client.timestamp || 0)
    
    let totalSizeBytes = 0
    try {
      totalSizeBytes = new Blob([JSON.stringify(client)]).size
    } catch {
      totalSizeBytes = 0
    }
    
    // Categorize queries and calculate individual sizes
    let feedQueries = 0
    let metadataQueries = 0
    let contactsQueries = 0
    let threadQueries = 0
    let zapTotalsQueries = 0
    let otherQueries = 0
    
    let feedQueriesSize = 0
    let metadataQueriesSize = 0
    let contactsQueriesSize = 0
    let threadQueriesSize = 0
    let zapTotalsQueriesSize = 0
    let otherQueriesSize = 0
    
    queries.forEach((query: any) => {
      const queryKey = query.queryKey
      const querySize = new Blob([JSON.stringify(query)]).size
      
      if (!Array.isArray(queryKey)) {
        otherQueries++
        otherQueriesSize += querySize
        return
      }
      
      if (queryKey[0] === 'feed' || queryKey[0] === 'note' || 
          (queryKey[0] === 'profile' && queryKey[1] === 'notes')) {
        feedQueries++
        feedQueriesSize += querySize
      } else if (queryKey[0] === 'metadata' || 
                 (queryKey[0] === 'profile' && queryKey[1] === 'metadata') ||
                 (queryKey[0] === 'profile' && queryKey[1] === 'contacts-metadata')) {
        metadataQueries++
        metadataQueriesSize += querySize
      } else if (queryKey[0] === 'contacts' || 
                 (queryKey[0] === 'profile' && queryKey[1] === 'contacts')) {
        contactsQueries++
        contactsQueriesSize += querySize
      } else if (queryKey[0] === 'thread') {
        threadQueries++
        threadQueriesSize += querySize
      } else if (queryKey[0] === 'zap-totals') {
        zapTotalsQueries++
        zapTotalsQueriesSize += querySize
      } else {
        otherQueries++
        otherQueriesSize += querySize
      }
    })
    
    return {
      totalQueries: queries.length,
      totalMutations: mutations.length,
      totalSizeBytes,
      lastUpdatedAt,
      breakdown: {
        feedQueries,
        metadataQueries,
        contactsQueries,
        threadQueries,
        zapTotalsQueries,
        otherQueries,
      },
      sizeBreakdown: {
        feedQueriesSize,
        metadataQueriesSize,
        contactsQueriesSize,
        threadQueriesSize,
        zapTotalsQueriesSize,
        otherQueriesSize,
      }
    }
  } catch {
    return {
      totalQueries: 0,
      totalMutations: 0,
      totalSizeBytes: 0,
      lastUpdatedAt: 0,
      breakdown: {
        feedQueries: 0,
        metadataQueries: 0,
        contactsQueries: 0,
        threadQueries: 0,
        zapTotalsQueries: 0,
        otherQueries: 0,
      },
      sizeBreakdown: {
        feedQueriesSize: 0,
        metadataQueriesSize: 0,
        contactsQueriesSize: 0,
        threadQueriesSize: 0,
        zapTotalsQueriesSize: 0,
        otherQueriesSize: 0,
      }
    }
  }
}


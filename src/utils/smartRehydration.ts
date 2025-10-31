import { QueryClient } from '@tanstack/react-query';

export interface RehydrationPriority {
  critical: string[];
  high: string[];
  medium: string[];
  low: string[];
}

export interface RehydrationConfig {
  priorities: RehydrationPriority;
  batchSize: number;
  delayBetweenBatches: number;
  maxConcurrentBatches: number;
}

/**
 * Default rehydration priorities based on user experience importance
 */
export const DEFAULT_REHYDRATION_PRIORITIES: RehydrationPriority = {
  // Critical: Must be available immediately for app to function
  critical: [
    'user-session',
    'auth-state',
  ],
  
  // High: Core functionality data that users expect to see quickly
  high: [
    'feed-notes',
    'user-metadata',
    'contacts',
    'mute-list',
    'relay-config',
  ],
  
  // Medium: Secondary data that enhances experience
  medium: [
    'thread-data',
    'reaction-counts',
    'profile-follows',
    'relay-status',
  ],
  
  // Low: Nice-to-have data that can load later
  low: [
    'old-feed-pages',
    'archived-notes',
    'analytics-data',
    'debug-logs',
  ],
};

/**
 * Smart rehydration configuration
 */
export const DEFAULT_REHYDRATION_CONFIG: RehydrationConfig = {
  priorities: DEFAULT_REHYDRATION_PRIORITIES,
  batchSize: 10, // Number of queries to rehydrate per batch
  delayBetweenBatches: 50, // ms delay between batches
  maxConcurrentBatches: 3, // Maximum concurrent rehydration batches
};

/**
 * Analyzes the current query cache and categorizes queries by priority
 */
export const analyzeQueryCache = (queryClient: QueryClient): {
  byPriority: Record<string, string[]>;
  totalQueries: number;
  estimatedTime: number;
} => {
  const queries = queryClient.getQueryCache().getAll();
  const byPriority: Record<string, string[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  };
  
  queries.forEach(query => {
    const queryKey = query.queryKey as readonly unknown[];
    const queryKeyString = JSON.stringify(queryKey);
    
    // Determine priority based on query key patterns
    if (isCriticalQuery(queryKey)) {
      byPriority.critical.push(queryKeyString);
    } else if (isHighPriorityQuery(queryKey)) {
      byPriority.high.push(queryKeyString);
    } else if (isMediumPriorityQuery(queryKey)) {
      byPriority.medium.push(queryKeyString);
    } else {
      byPriority.low.push(queryKeyString);
    }
  });
  
  const totalQueries = queries.length;
  const estimatedTime = calculateEstimatedTime(byPriority);
  
  return { byPriority, totalQueries, estimatedTime };
};

/**
 * Determines if a query is critical for app functionality
 */
const isCriticalQuery = (queryKey: readonly unknown[]): boolean => {
  const keyString = JSON.stringify(queryKey);
  
  // User session and authentication
  if (keyString.includes('user-session') ||
      keyString.includes('auth-state') ||
      keyString.includes('nostr-client')) {
    return true;
  }
  
  return false;
};

/**
 * Determines if a query is high priority for user experience
 */
const isHighPriorityQuery = (queryKey: readonly unknown[]): boolean => {
  const keyString = JSON.stringify(queryKey);
  
  // Feed data (first page)
  if (keyString.includes('feed') && keyString.includes('page-0')) {
    return true;
  }
  
  // User metadata
  if (keyString.includes('metadata')) {
    return true;
  }
  
  // Contacts and social data
  if (keyString.includes('contacts') || 
      (keyString.includes('follows') && !keyString.includes('profile-follows')) ||
      keyString.includes('mute-list')) {
    return true;
  }
  
  // Relay configuration
  if (keyString.includes('relay-config') || 
      keyString.includes('relay-urls')) {
    return true;
  }
  
  return false;
};

/**
 * Determines if a query is medium priority
 */
const isMediumPriorityQuery = (queryKey: readonly unknown[]): boolean => {
  const keyString = JSON.stringify(queryKey);
  
  // Thread data
  if (keyString.includes('thread')) {
    return true;
  }
  
  // Reaction counts
  if (keyString.includes('reactions')) {
    return true;
  }
  
  // Profile follows
  if (keyString.includes('profile-follows')) {
    return true;
  }
  
  // Relay status
  if (keyString.includes('relay-status')) {
    return true;
  }
  
  return false;
};

/**
 * Calculates estimated rehydration time based on query counts
 */
const calculateEstimatedTime = (byPriority: Record<string, string[]>): number => {
  const criticalTime = byPriority.critical.length * 5; // 5ms per critical query
  const highTime = byPriority.high.length * 10; // 10ms per high priority query
  const mediumTime = byPriority.medium.length * 20; // 20ms per medium priority query
  const lowTime = byPriority.low.length * 50; // 50ms per low priority query
  
  return criticalTime + highTime + mediumTime + lowTime;
};

/**
 * Performs smart rehydration with priority-based loading
 */
export const performSmartRehydration = async (
  queryClient: QueryClient,
  config: RehydrationConfig = DEFAULT_REHYDRATION_CONFIG
): Promise<{
  success: boolean;
  rehydratedQueries: number;
  totalTime: number;
  errors: string[];
}> => {
  const startTime = Date.now();
  const errors: string[] = [];
  let rehydratedQueries = 0;
  
  try {

    // Analyze current cache
    const analysis = analyzeQueryCache(queryClient);

    // Rehydrate critical queries first (synchronous)

    const criticalQueries = analysis.byPriority.critical;
    for (const queryKeyString of criticalQueries) {
      try {
        const queryKey = JSON.parse(queryKeyString);
        await queryClient.ensureQueryData({ queryKey });
        rehydratedQueries++;
      } catch (error) {
        errors.push(`Critical query rehydration failed: ${error}`);
      }
    }
    
    // Rehydrate high priority queries in batches

    await rehydrateQueriesInBatches(
      queryClient,
      analysis.byPriority.high,
      config,
      'high',
      errors
    );
    rehydratedQueries += analysis.byPriority.high.length;
    
    // Rehydrate medium priority queries in background

    setTimeout(async () => {
      await rehydrateQueriesInBatches(
        queryClient,
        analysis.byPriority.medium,
        config,
        'medium',
        errors
      );
    }, config.delayBetweenBatches);
    
    // Rehydrate low priority queries with longer delay

    setTimeout(async () => {
      await rehydrateQueriesInBatches(
        queryClient,
        analysis.byPriority.low,
        config,
        'low',
        errors
      );
    }, config.delayBetweenBatches * 3);
    
    const totalTime = Date.now() - startTime;

    return {
      success: errors.length === 0,
      rehydratedQueries,
      totalTime,
      errors
    };
    
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('❌ Smart rehydration failed:', error);
    
    return {
      success: false,
      rehydratedQueries,
      totalTime,
      errors: [...errors, `Rehydration failed: ${error}`]
    };
  }
};

/**
 * Rehydrates queries in batches with controlled concurrency
 */
const rehydrateQueriesInBatches = async (
  queryClient: QueryClient,
  queries: string[],
  config: RehydrationConfig,
  priority: string,
  errors: string[]
): Promise<void> => {
  const batches = chunkArray(queries, config.batchSize);
  let activeBatches = 0;
  
  for (let i = 0; i < batches.length; i += config.maxConcurrentBatches) {
    const currentBatches = batches.slice(i, i + config.maxConcurrentBatches);
    
    // Wait for previous batches to complete
    while (activeBatches >= config.maxConcurrentBatches) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Process current batches
    const batchPromises = currentBatches.map(async (batch, _batchIndex) => {
      activeBatches++;
      try {

        for (const queryKeyString of batch) {
          try {
            const queryKey = JSON.parse(queryKeyString);
            
            // Check if the query already has data and doesn't need rehydration
            const existingQuery = queryClient.getQueryCache().get(queryKey);
            if (existingQuery && existingQuery.state.data !== undefined) {
              continue; // Skip if already has data
            }
            
            // Only try to ensure data if the query has a queryFn
            if (existingQuery && existingQuery.options.queryFn) {
              await queryClient.ensureQueryData({ queryKey });
            }
            // Skip queries without queryFn (they're likely persisted data that doesn't need rehydration)
          } catch (error) {
            console.error(`❌ Query rehydration failed for ${queryKeyString}:`, error);
            errors.push(`${priority} query rehydration failed: ${error}`);
          }
        }
        
        // Add delay between batches
        await new Promise(resolve => setTimeout(resolve, config.delayBetweenBatches));
        
      } finally {
        activeBatches--;
      }
    });
    
    await Promise.all(batchPromises);
  }
};

/**
 * Utility function to chunk array into smaller arrays
 */
const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

/**
 * Preloads critical data for improved user experience
 */
export const preloadCriticalData = async (queryClient: QueryClient): Promise<void> => {

  try {
    // Preload user session data
    await queryClient.prefetchQuery({
      queryKey: ['user-session'],
      queryFn: () => Promise.resolve(null),
      staleTime: Infinity,
    });

  } catch (error) {
    console.error('❌ Critical data preload failed:', error);
  }
};

/**
 * Optimizes query cache for better performance
 * Note: TanStack Query handles cache optimization automatically.
 * Stale times and GC times are configured at query definition level.
 */
export const optimizeQueryCache = (_queryClient: QueryClient): void => {
  
  // TanStack Query handles cache optimization automatically:
  // - Stale times are set at query definition level
  // - GC times are configured globally in QueryClient
  // - Automatic cache cleanup happens when queries go out of scope
  // - Background refetching is handled by the query system

  // Note: Manual cache optimization is generally not needed with TanStack Query
  // as it provides intelligent caching, automatic cleanup, and background updates.
};

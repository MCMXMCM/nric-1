import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  analyzeQueryCache,
  performSmartRehydration,
  preloadCriticalData,
  optimizeQueryCache,
  DEFAULT_REHYDRATION_CONFIG,
} from '../smartRehydration';

describe('smartRehydration', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('analyzeQueryCache', () => {
    it('should categorize queries by priority correctly', () => {
      // Add some test queries
      queryClient.setQueryData(['user-session'], { user: 'test' });
      queryClient.setQueryData(['feed', 'page-0'], { notes: [] });
      queryClient.setQueryData(['metadata', 'user123'], { name: 'Test User' });
      queryClient.setQueryData(['thread', 'note123'], { replies: [] });
      queryClient.setQueryData(['old-feed-pages'], { pages: [] });

      const analysis = analyzeQueryCache(queryClient);

      expect(analysis.totalQueries).toBe(5);
      expect(analysis.byPriority.critical.length).toBeGreaterThan(0);
      expect(analysis.byPriority.high.length).toBeGreaterThan(0);
      expect(analysis.byPriority.medium.length).toBeGreaterThan(0);
      expect(analysis.byPriority.low.length).toBeGreaterThan(0);
      expect(analysis.estimatedTime).toBeGreaterThan(0);
    });

    it('should handle empty cache', () => {
      const analysis = analyzeQueryCache(queryClient);

      expect(analysis.totalQueries).toBe(0);
      expect(analysis.byPriority.critical.length).toBe(0);
      expect(analysis.byPriority.high.length).toBe(0);
      expect(analysis.byPriority.medium.length).toBe(0);
      expect(analysis.byPriority.low.length).toBe(0);
      expect(analysis.estimatedTime).toBe(0);
    });
  });

  describe('performSmartRehydration', () => {
    it('should perform rehydration successfully', async () => {
      // Add some test queries
      queryClient.setQueryData(['user-session'], { user: 'test' });
      queryClient.setQueryData(['feed', 'page-0'], { notes: [] });

      const result = await performSmartRehydration(queryClient, {
        ...DEFAULT_REHYDRATION_CONFIG,
        batchSize: 1,
        delayBetweenBatches: 10,
      });

      expect(result.success).toBe(true);
      expect(result.rehydratedQueries).toBeGreaterThan(0);
      expect(result.totalTime).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle rehydration errors gracefully', async () => {
      // Mock a failing query
      queryClient.setQueryData(['user-session'], { user: 'test' });
      
      // Mock ensureQueryData to throw an error
      const originalEnsureQueryData = queryClient.ensureQueryData;
      queryClient.ensureQueryData = vi.fn().mockRejectedValue(new Error('Test error'));

      const result = await performSmartRehydration(queryClient, {
        ...DEFAULT_REHYDRATION_CONFIG,
        batchSize: 1,
        delayBetweenBatches: 10,
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Test error');

      // Restore original method
      queryClient.ensureQueryData = originalEnsureQueryData;
    });
  });

  describe('preloadCriticalData', () => {
    it('should preload critical data successfully', async () => {
      await expect(preloadCriticalData(queryClient)).resolves.not.toThrow();

      // Check that critical queries were prefetched
      const queries = queryClient.getQueryCache().getAll();
      const hasUserSession = queries.some(q =>
        JSON.stringify(q.queryKey).includes('user-session')
      );

      expect(hasUserSession).toBe(true);
    });
  });

  describe('optimizeQueryCache', () => {
    it('should optimize query cache without errors', () => {
      // Add some test queries
      queryClient.setQueryData(['metadata', 'user123'], { name: 'Test User' });
      queryClient.setQueryData(['feed', 'page-0'], { notes: [] });
      queryClient.setQueryData(['thread', 'note123'], { replies: [] });

      expect(() => optimizeQueryCache(queryClient)).not.toThrow();
    });

    it('should handle empty cache optimization', () => {
      expect(() => optimizeQueryCache(queryClient)).not.toThrow();
    });
  });

  describe('priority classification', () => {
    it('should classify critical queries correctly', () => {
      const criticalQueries = [
        ['user-session'],
        ['auth-state'],
      ];

      criticalQueries.forEach(queryKey => {
        queryClient.setQueryData(queryKey, { test: 'data' });
      });

      const analysis = analyzeQueryCache(queryClient);
      expect(analysis.byPriority.critical.length).toBe(criticalQueries.length);
    });

    it('should classify high priority queries correctly', () => {
      const highPriorityQueries = [
        ['feed', 'page-0'],
        ['metadata', 'user123'],
        ['contacts', 'user123'],
        ['mute-list', 'user123'],
        ['relay-config'],
      ];

      highPriorityQueries.forEach(queryKey => {
        queryClient.setQueryData(queryKey, { test: 'data' });
      });

      const analysis = analyzeQueryCache(queryClient);
      expect(analysis.byPriority.high.length).toBe(highPriorityQueries.length);
    });

               it('should classify medium priority queries correctly', () => {
             const mediumPriorityQueries = [
               ['thread', 'note123'],
               ['reactions', 'note123'],
               ['profile-follows', 'user123'],
               ['relay-status'],
             ];

             mediumPriorityQueries.forEach(queryKey => {
               queryClient.setQueryData(queryKey, { test: 'data' });
             });

             const analysis = analyzeQueryCache(queryClient);
             expect(analysis.byPriority.medium.length).toBe(mediumPriorityQueries.length);
           });

    it('should classify low priority queries correctly', () => {
      const lowPriorityQueries = [
        ['old-feed-pages'],
        ['archived-notes'],
        ['analytics-data'],
        ['debug-logs'],
      ];

      lowPriorityQueries.forEach(queryKey => {
        queryClient.setQueryData(queryKey, { test: 'data' });
      });

      const analysis = analyzeQueryCache(queryClient);
      expect(analysis.byPriority.low.length).toBe(lowPriorityQueries.length);
    });
  });
});

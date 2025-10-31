/**
 * Relay Health Monitoring System
 * Tracks relay performance and automatically selects the best fallback relays
 */

interface RelayHealthStats {
  url: string;
  successCount: number;
  failureCount: number;
  averageResponseTime: number;
  lastChecked: number;
  isHealthy: boolean;
}

interface RelayHealthConfig {
  maxFailures: number;
  responseTimeThreshold: number;
  checkInterval: number;
  healthCheckTimeout: number;
}

class RelayHealthMonitor {
  private healthStats: Map<string, RelayHealthStats> = new Map();
  private config: RelayHealthConfig;

  constructor(config?: Partial<RelayHealthConfig>) {
    this.config = {
      maxFailures: 3,
      responseTimeThreshold: 5000, // 5 seconds
      checkInterval: 300000, // 5 minutes
      healthCheckTimeout: 3000, // 3 seconds
      ...config,
    };
  }

  /**
   * Record a successful relay operation
   */
  recordSuccess(relayUrl: string, responseTime: number): void {
    const stats = this.getOrCreateStats(relayUrl);
    stats.successCount++;
    stats.averageResponseTime = this.calculateAverageResponseTime(stats, responseTime);
    stats.lastChecked = Date.now();
    stats.isHealthy = true;
    
    console.log(`✅ Relay health: ${relayUrl} - success (${responseTime}ms avg: ${stats.averageResponseTime}ms)`);
  }

  /**
   * Record a failed relay operation
   */
  recordFailure(relayUrl: string, operationType?: 'metadata' | 'feed' | 'general'): void {
    const stats = this.getOrCreateStats(relayUrl);
    stats.failureCount++;
    stats.lastChecked = Date.now();
    
    // Be more lenient with metadata failures - they're more likely to fail
    // and don't indicate the relay is actually unhealthy for feed operations
    const maxFailures = operationType === 'metadata' 
      ? this.config.maxFailures * 4  // Allow 4x more failures for metadata (12 total vs 3)
      : this.config.maxFailures;
    
    // Mark as unhealthy if too many failures
    if (stats.failureCount >= maxFailures) {
      stats.isHealthy = false;
      console.warn(`❌ Relay health: ${relayUrl} marked unhealthy (${stats.failureCount} failures, type: ${operationType || 'general'})`);
    } else {
      console.warn(`⚠️ Relay health: ${relayUrl} - failure (${stats.failureCount}/${maxFailures}, type: ${operationType || 'general'})`);
    }
  }

  /**
   * Get the healthiest relays from a list, sorted by performance
   */
  getHealthyRelays(relayUrls: string[], limit?: number): string[] {
    const healthyRelays = relayUrls
      .map(url => ({ url, stats: this.healthStats.get(url) }))
      .filter(({ stats }) => !stats || stats.isHealthy)
      .sort((a, b) => {
        // Sort by health score: fewer failures, faster response times
        const scoreA = this.calculateHealthScore(a.stats);
        const scoreB = this.calculateHealthScore(b.stats);
        return scoreB - scoreA;
      })
      .map(({ url }) => url);

    return limit ? healthyRelays.slice(0, limit) : healthyRelays;
  }

  /**
   * Get relay health statistics
   */
  getHealthStats(relayUrl: string): RelayHealthStats | undefined {
    return this.healthStats.get(relayUrl);
  }

  /**
   * Get all relay health statistics
   */
  getAllHealthStats(): Map<string, RelayHealthStats> {
    return new Map(this.healthStats);
  }

  /**
   * Check if a relay is considered healthy
   */
  isRelayHealthy(relayUrl: string): boolean {
    const stats = this.healthStats.get(relayUrl);
    return stats ? stats.isHealthy : true; // Assume healthy if no stats
  }

  /**
   * Reset health stats for a relay
   */
  resetRelayStats(relayUrl: string): void {
    this.healthStats.delete(relayUrl);
    console.log(`🔄 Relay health: Reset stats for ${relayUrl}`);
  }

  /**
   * Reset all health stats
   */
  resetAllStats(): void {
    this.healthStats.clear();
    console.log('🔄 Relay health: Reset all stats');
  }

  /**
   * Get or create health stats for a relay
   */
  private getOrCreateStats(relayUrl: string): RelayHealthStats {
    if (!this.healthStats.has(relayUrl)) {
      this.healthStats.set(relayUrl, {
        url: relayUrl,
        successCount: 0,
        failureCount: 0,
        averageResponseTime: 0,
        lastChecked: Date.now(),
        isHealthy: true,
      });
    }
    return this.healthStats.get(relayUrl)!;
  }

  /**
   * Calculate average response time
   */
  private calculateAverageResponseTime(stats: RelayHealthStats, newResponseTime: number): number {
    if (stats.averageResponseTime === 0) {
      return newResponseTime;
    }
    return (stats.averageResponseTime + newResponseTime) / 2;
  }

  /**
   * Calculate health score for sorting relays
   */
  private calculateHealthScore(stats: RelayHealthStats | undefined): number {
    if (!stats) return 0;
    
    // Higher score = better health
    const successRate = stats.successCount / (stats.successCount + stats.failureCount);
    const responseTimeScore = Math.max(0, this.config.responseTimeThreshold - stats.averageResponseTime) / this.config.responseTimeThreshold;
    
    return successRate * 0.7 + responseTimeScore * 0.3;
  }
}

// Global relay health monitor instance
export const relayHealthMonitor = new RelayHealthMonitor();

/**
 * Utility function to get healthy fallback relays
 */
export function getHealthyFallbackRelays(allRelays: string[], limit?: number): string[] {
  return relayHealthMonitor.getHealthyRelays(allRelays, limit);
}

/**
 * Utility function to record relay success
 */
export function recordRelaySuccess(relayUrl: string, responseTime: number): void {
  relayHealthMonitor.recordSuccess(relayUrl, responseTime);
}

/**
 * Utility function to record relay failure
 */
export function recordRelayFailure(relayUrl: string, operationType?: 'metadata' | 'feed' | 'general'): void {
  relayHealthMonitor.recordFailure(relayUrl, operationType);
}

export default relayHealthMonitor;

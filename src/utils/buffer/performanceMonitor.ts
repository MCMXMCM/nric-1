// import type { BufferState, BufferStats } from '../../types/buffer'

/**
 * Performance metrics for buffer operations
 */
export interface BufferPerformanceMetrics {
  /** Navigation performance */
  navigation: {
    totalNavigations: number
    avgNavigationTime: number
    cacheHitRate: number
    prefetchHitRate: number
  }

  /** Memory usage */
  memory: {
    bufferSize: number
    memoryUsage: number
    peakMemoryUsage: number
    cleanupFrequency: number
  }

  /** Prefetching performance */
  prefetching: {
    totalPrefetchOperations: number
    avgPrefetchTime: number
    prefetchSuccessRate: number
    wastedPrefetchRate: number
  }

  /** Persistence performance */
  persistence: {
    saveOperations: number
    avgSaveTime: number
    loadOperations: number
    avgLoadTime: number
    dataSize: number
  }

  /** Overall performance */
  overall: {
    uptime: number
    avgResponseTime: number
    errorRate: number
    userSatisfaction: number
  }
}

/**
 * Performance event types
 */
export const PerformanceEventType = {
  NAVIGATION_START: 'navigation_start',
  NAVIGATION_END: 'navigation_end',
  PREFETCH_START: 'prefetch_start',
  PREFETCH_END: 'prefetch_end',
  SAVE_START: 'save_start',
  SAVE_END: 'save_end',
  LOAD_START: 'load_start',
  LOAD_END: 'load_end',
  CACHE_HIT: 'cache_hit',
  CACHE_MISS: 'cache_miss',
  ERROR: 'error'
} as const

export type PerformanceEventType = typeof PerformanceEventType[keyof typeof PerformanceEventType]

/**
 * Performance event data
 */
export interface PerformanceEvent {
  type: PerformanceEventType
  timestamp: number
  duration?: number
  metadata?: Record<string, any>
}

/**
 * Buffer performance monitor
 */
export class BufferPerformanceMonitor {
  private events: PerformanceEvent[] = []
  private maxEvents = 1000
  private startTime = Date.now()
  private metrics: BufferPerformanceMetrics

  constructor() {
    this.metrics = this.createInitialMetrics()
  }

  /**
   * Record a performance event
   */
  recordEvent(event: PerformanceEvent): void {
    this.events.push(event)

    // Keep only recent events
    if (this.events.length > this.maxEvents) {
      this.events.shift()
    }

    // Update metrics based on event
    this.updateMetrics(event)

    console.log('[PerformanceMonitor] Recorded event:', {
      type: event.type,
      duration: event.duration,
      metadata: event.metadata
    })
  }

  /**
   * Start timing an operation
   */
  startTiming(type: PerformanceEventType, metadata?: Record<string, any>): () => void {
    const startTime = Date.now()

    return () => {
      const duration = Date.now() - startTime
      this.recordEvent({
        type: this.getEndEventType(type),
        timestamp: startTime,
        duration,
        metadata
      })
    }
  }

  /**
   * Record a cache hit or miss
   */
  recordCacheAccess(hit: boolean, metadata?: Record<string, any>): void {
    this.recordEvent({
      type: hit ? PerformanceEventType.CACHE_HIT : PerformanceEventType.CACHE_MISS,
      timestamp: Date.now(),
      metadata
    })
  }

  /**
   * Record an error
   */
  recordError(error: Error, metadata?: Record<string, any>): void {
    this.recordEvent({
      type: PerformanceEventType.ERROR,
      timestamp: Date.now(),
      metadata: {
        error: error.message,
        stack: error.stack,
        ...metadata
      }
    })
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): BufferPerformanceMetrics {
    // Update calculated metrics
    this.updateCalculatedMetrics()
    return { ...this.metrics }
  }

  /**
   * Get performance summary for a time period
   */
  getPerformanceSummary(hours: number = 1): {
    period: string
    metrics: BufferPerformanceMetrics
    insights: string[]
  } {
    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000)
    const periodEvents = this.events.filter(e => e.timestamp >= cutoffTime)

    const insights = this.generateInsights(periodEvents)

    return {
      period: `${hours} hour${hours === 1 ? '' : 's'}`,
      metrics: this.getMetrics(),
      insights
    }
  }

  /**
   * Reset performance data
   */
  reset(): void {
    this.events = []
    this.startTime = Date.now()
    this.metrics = this.createInitialMetrics()
    console.log('[PerformanceMonitor] Reset performance data')
  }

  /**
   * Export performance data for analysis
   */
  exportData(): {
    events: PerformanceEvent[]
    metrics: BufferPerformanceMetrics
    exportTime: number
  } {
    return {
      events: [...this.events],
      metrics: this.getMetrics(),
      exportTime: Date.now()
    }
  }

  /**
   * Create initial metrics structure
   */
  private createInitialMetrics(): BufferPerformanceMetrics {
    return {
      navigation: {
        totalNavigations: 0,
        avgNavigationTime: 0,
        cacheHitRate: 0,
        prefetchHitRate: 0
      },
      memory: {
        bufferSize: 0,
        memoryUsage: 0,
        peakMemoryUsage: 0,
        cleanupFrequency: 0
      },
      prefetching: {
        totalPrefetchOperations: 0,
        avgPrefetchTime: 0,
        prefetchSuccessRate: 0,
        wastedPrefetchRate: 0
      },
      persistence: {
        saveOperations: 0,
        avgSaveTime: 0,
        loadOperations: 0,
        avgLoadTime: 0,
        dataSize: 0
      },
      overall: {
        uptime: 0,
        avgResponseTime: 0,
        errorRate: 0,
        userSatisfaction: 0
      }
    }
  }

  /**
   * Update metrics based on event
   */
  private updateMetrics(event: PerformanceEvent): void {
    const { type, duration } = event

    switch (type) {
      case PerformanceEventType.NAVIGATION_END:
        if (duration) {
          this.metrics.navigation.totalNavigations++
          this.updateAverageTime('navigation', duration)
        }
        break

      case PerformanceEventType.PREFETCH_END:
        if (duration) {
          this.metrics.prefetching.totalPrefetchOperations++
          this.updateAverageTime('prefetching', duration)
        }
        break

      case PerformanceEventType.SAVE_END:
        if (duration) {
          this.metrics.persistence.saveOperations++
          this.updateAverageTime('persistence', duration)
        }
        break

      case PerformanceEventType.LOAD_END:
        if (duration) {
          this.metrics.persistence.loadOperations++
          this.updateAverageTime('persistence', duration)
        }
        break

      case PerformanceEventType.CACHE_HIT:
        this.updateCacheHitRate(true)
        break

      case PerformanceEventType.CACHE_MISS:
        this.updateCacheHitRate(false)
        break

      case PerformanceEventType.ERROR:
        // Could track error rate here
        break
    }
  }

  /**
   * Update calculated metrics
   */
  private updateCalculatedMetrics(): void {
    // Update uptime
    this.metrics.overall.uptime = Date.now() - this.startTime

    // Calculate overall response time
    const allResponseTimes = this.events
      .filter(e => e.duration && (
        e.type === PerformanceEventType.NAVIGATION_END ||
        e.type === PerformanceEventType.PREFETCH_END
      ))
      .map(e => e.duration!)

    if (allResponseTimes.length > 0) {
      this.metrics.overall.avgResponseTime =
        allResponseTimes.reduce((sum, time) => sum + time, 0) / allResponseTimes.length
    }

    // Calculate error rate
    const totalOperations = this.metrics.navigation.totalNavigations +
                           this.metrics.prefetching.totalPrefetchOperations
    const errorEvents = this.events.filter(e => e.type === PerformanceEventType.ERROR).length

    if (totalOperations > 0) {
      this.metrics.overall.errorRate = errorEvents / totalOperations
    }

    // Estimate user satisfaction (simplified heuristic)
    this.metrics.overall.userSatisfaction = this.calculateUserSatisfaction()
  }

  /**
   * Update average time for a metric category
   */
  private updateAverageTime(category: 'navigation' | 'prefetching' | 'persistence', newTime: number): void {
    if (category === 'navigation') {
      const navMetrics = this.metrics.navigation
      const currentCount = navMetrics.totalNavigations
      const currentAvg = navMetrics.avgNavigationTime
      navMetrics.avgNavigationTime = ((currentAvg * (currentCount - 1)) + newTime) / currentCount
    } else if (category === 'prefetching') {
      const prefetchMetrics = this.metrics.prefetching
      const currentCount = prefetchMetrics.totalPrefetchOperations
      const currentAvg = prefetchMetrics.avgPrefetchTime
      prefetchMetrics.avgPrefetchTime = ((currentAvg * (currentCount - 1)) + newTime) / currentCount
    } else {
      const persistMetrics = this.metrics.persistence
      const currentCount = persistMetrics.saveOperations + persistMetrics.loadOperations
      const currentAvg = (persistMetrics.avgSaveTime + persistMetrics.avgLoadTime) / 2
      const newAvg = ((currentAvg * (currentCount - 1)) + newTime) / currentCount
      persistMetrics.avgSaveTime = newAvg
      persistMetrics.avgLoadTime = newAvg
    }
  }

  /**
   * Update cache hit rate
   */
  private updateCacheHitRate(_hit: boolean): void {
    const totalCacheAccesses = this.events.filter(e =>
      e.type === PerformanceEventType.CACHE_HIT || e.type === PerformanceEventType.CACHE_MISS
    ).length

    const cacheHits = this.events.filter(e => e.type === PerformanceEventType.CACHE_HIT).length

    if (totalCacheAccesses > 0) {
      this.metrics.navigation.cacheHitRate = cacheHits / totalCacheAccesses
    }
  }

  /**
   * Calculate user satisfaction score (simplified heuristic)
   */
  private calculateUserSatisfaction(): number {
    const {
      cacheHitRate,
      avgNavigationTime
    } = this.metrics.navigation

    // Simple satisfaction formula
    let satisfaction = 0

    // Cache hit rate contribution (40%)
    satisfaction += cacheHitRate * 0.4

    // Response time contribution (40%) - faster is better
    const responseTimeScore = Math.max(0, 1 - (avgNavigationTime / 1000)) // Assume 1 second is bad
    satisfaction += responseTimeScore * 0.4

    // Error rate contribution (20%) - lower errors is better
    satisfaction += (1 - this.metrics.overall.errorRate) * 0.2

    return Math.max(0, Math.min(1, satisfaction))
  }

  /**
   * Generate performance insights
   */
  private generateInsights(_events: PerformanceEvent[]): string[] {
    const insights: string[] = []

    const metrics = this.getMetrics()

    // Cache performance insights
    if (metrics.navigation.cacheHitRate < 0.5) {
      insights.push('Low cache hit rate detected. Consider increasing buffer size.')
    } else if (metrics.navigation.cacheHitRate > 0.9) {
      insights.push('Excellent cache performance!')
    }

    // Response time insights
    if (metrics.navigation.avgNavigationTime > 500) {
      insights.push('Navigation is slow. Consider optimizing buffer operations.')
    } else if (metrics.navigation.avgNavigationTime < 100) {
      insights.push('Navigation performance is excellent!')
    }

    // Memory insights
    if (metrics.memory.bufferSize > 100) {
      insights.push('Large buffer size. Consider implementing more aggressive cleanup.')
    }

    // Error insights
    if (metrics.overall.errorRate > 0.1) {
      insights.push('High error rate detected. Check buffer operations for issues.')
    }

    // Prefetch insights
    if (metrics.prefetching.prefetchSuccessRate < 0.3) {
      insights.push('Low prefetch success rate. Consider adjusting prefetch strategy.')
    }

    return insights.length > 0 ? insights : ['Performance looks good overall!']
  }

  /**
   * Get end event type for timing
   */
  private getEndEventType(startType: PerformanceEventType): PerformanceEventType {
    switch (startType) {
      case PerformanceEventType.NAVIGATION_START:
        return PerformanceEventType.NAVIGATION_END
      case PerformanceEventType.PREFETCH_START:
        return PerformanceEventType.PREFETCH_END
      case PerformanceEventType.SAVE_START:
        return PerformanceEventType.SAVE_END
      case PerformanceEventType.LOAD_START:
        return PerformanceEventType.LOAD_END
      default:
        return startType
    }
  }
}

/**
 * Singleton instance for easy access
 */
export const bufferPerformanceMonitor = new BufferPerformanceMonitor()

/**
 * Hook for buffer performance monitoring
 */
export function useBufferPerformance() {
  return {
    recordEvent: (event: PerformanceEvent) => bufferPerformanceMonitor.recordEvent(event),
    startTiming: (type: PerformanceEventType, metadata?: Record<string, any>) =>
      bufferPerformanceMonitor.startTiming(type, metadata),
    recordCacheAccess: (hit: boolean, metadata?: Record<string, any>) =>
      bufferPerformanceMonitor.recordCacheAccess(hit, metadata),
    recordError: (error: Error, metadata?: Record<string, any>) =>
      bufferPerformanceMonitor.recordError(error, metadata),
    getMetrics: () => bufferPerformanceMonitor.getMetrics(),
    getPerformanceSummary: (hours?: number) => bufferPerformanceMonitor.getPerformanceSummary(hours),
    reset: () => bufferPerformanceMonitor.reset(),
    exportData: () => bufferPerformanceMonitor.exportData()
  }
}

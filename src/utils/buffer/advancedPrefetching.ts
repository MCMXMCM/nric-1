import type { BufferDirectionType } from '../../types/buffer'

/**
 * User navigation pattern analysis
 */
export interface NavigationPattern {
  /** Direction of navigation */
  direction: 'forward' | 'backward'
  /** Distance moved */
  distance: number
  /** Timestamp of navigation */
  timestamp: number
  /** Time spent at position before moving */
  dwellTime: number
  /** Current buffer position when navigation occurred */
  bufferPosition: number
}

/**
 * Prefetching strategy configuration
 */
export interface PrefetchStrategy {
  /** Base prefetch distance */
  baseDistance: number
  /** Adaptive multiplier based on user behavior */
  adaptiveMultiplier: number
  /** Maximum prefetch distance */
  maxDistance: number
  /** Minimum prefetch distance */
  minDistance: number
  /** Learning rate for pattern adaptation */
  learningRate: number
  /** Pattern memory size */
  patternMemorySize: number
}

/**
 * Default prefetch strategy
 */
export const DEFAULT_PREFETCH_STRATEGY: PrefetchStrategy = {
  baseDistance: 5,
  adaptiveMultiplier: 1.0,
  maxDistance: 15,
  minDistance: 2,
  learningRate: 0.1,
  patternMemorySize: 20
}

/**
 * Advanced prefetching manager with pattern learning
 */
export class AdvancedPrefetchManager {
  private patterns: NavigationPattern[] = []
  private strategy: PrefetchStrategy
  // private lastPosition = 0
  private lastTimestamp = Date.now()

  constructor(strategy: Partial<PrefetchStrategy> = {}) {
    this.strategy = { ...DEFAULT_PREFETCH_STRATEGY, ...strategy }
  }

  /**
   * Record a navigation event for pattern analysis
   */
  recordNavigation(
    direction: 'forward' | 'backward',
    distance: number,
    currentPosition: number
  ): void {
    const now = Date.now()
    const dwellTime = now - this.lastTimestamp

    const pattern: NavigationPattern = {
      direction,
      distance,
      timestamp: now,
      dwellTime,
      bufferPosition: currentPosition
    }

    this.patterns.push(pattern)

    // Keep only recent patterns
    if (this.patterns.length > this.strategy.patternMemorySize) {
      this.patterns.shift()
    }

    // this.lastPosition = currentPosition
    this.lastTimestamp = now

    // Adapt strategy based on new pattern
    this.adaptStrategy(pattern)

    console.log('[AdvancedPrefetch] Recorded navigation pattern:', {
      direction,
      distance,
      dwellTime,
      adaptiveMultiplier: this.strategy.adaptiveMultiplier
    })
  }

  /**
   * Calculate optimal prefetch distance based on patterns
   */
  getOptimalPrefetchDistance(direction: BufferDirectionType): number {
    const baseDistance = this.strategy.baseDistance
    const adaptiveMultiplier = this.strategy.adaptiveMultiplier

    // Calculate pattern-based adjustment
    const patternAdjustment = this.calculatePatternAdjustment(direction)

    // Apply adaptive multiplier and pattern adjustment
    let optimalDistance = Math.round(baseDistance * adaptiveMultiplier + patternAdjustment)

    // Clamp to min/max bounds
    optimalDistance = Math.max(this.strategy.minDistance, Math.min(this.strategy.maxDistance, optimalDistance))

    console.log('[AdvancedPrefetch] Calculated optimal prefetch distance:', {
      direction,
      baseDistance,
      adaptiveMultiplier,
      patternAdjustment,
      optimalDistance
    })

    return optimalDistance
  }

  /**
   * Predict likely next navigation direction
   */
  predictNextDirection(): { direction: 'forward' | 'backward'; confidence: number } | null {
    if (this.patterns.length < 3) {
      return null // Not enough data for prediction
    }

    // Analyze recent patterns (last 5 navigations)
    const recentPatterns = this.patterns.slice(-5)
    const directionCounts = recentPatterns.reduce((counts, pattern) => {
      counts[pattern.direction] = (counts[pattern.direction] || 0) + 1
      return counts
    }, {} as Record<string, number>)

    const forwardCount = directionCounts.forward || 0
    const backwardCount = directionCounts.backward || 0
    const total = forwardCount + backwardCount

    if (total === 0) return null

    const forwardRatio = forwardCount / total
    const backwardRatio = backwardCount / total

    // Determine dominant direction
    const dominantDirection = forwardRatio > backwardRatio ? 'forward' : 'backward'
    const confidence = Math.max(forwardRatio, backwardRatio)

    return { direction: dominantDirection, confidence }
  }

  /**
   * Get prefetch priority for different directions
   */
  getPrefetchPriorities(): Array<{ direction: 'forward' | 'backward'; priority: number }> {
    const prediction = this.predictNextDirection()

    if (!prediction) {
      // Default priorities when no prediction available
      return [
        { direction: 'forward', priority: 1.0 },
        { direction: 'backward', priority: 0.5 }
      ]
    }

    // Prioritize predicted direction
    return [
      { direction: prediction.direction, priority: prediction.confidence },
      {
        direction: prediction.direction === 'forward' ? 'backward' : 'forward',
        priority: 1 - prediction.confidence
      }
    ]
  }

  /**
   * Calculate prefetch timing based on user behavior
   */
  getPrefetchTiming(): { delay: number; batchSize: number } {
    if (this.patterns.length === 0) {
      return { delay: 100, batchSize: 3 } // Default timing
    }

    // Calculate average dwell time from recent patterns
    const recentPatterns = this.patterns.slice(-5)
    const avgDwellTime = recentPatterns.reduce((sum, p) => sum + p.dwellTime, 0) / recentPatterns.length

    // Faster prefetching for users who navigate quickly
    const delay = Math.max(50, Math.min(200, avgDwellTime * 0.1))

    // Larger batches for users who navigate in larger steps
    const avgDistance = recentPatterns.reduce((sum, p) => sum + p.distance, 0) / recentPatterns.length
    const batchSize = Math.max(2, Math.min(5, Math.round(avgDistance)))

    return { delay, batchSize }
  }

  /**
   * Reset learning state
   */
  reset(): void {
    this.patterns = []
    this.strategy.adaptiveMultiplier = DEFAULT_PREFETCH_STRATEGY.adaptiveMultiplier
    // this.lastPosition = 0
    this.lastTimestamp = Date.now()

    console.log('[AdvancedPrefetch] Reset learning state')
  }

  /**
   * Get current strategy and patterns for debugging
   */
  getDebugInfo(): {
    strategy: PrefetchStrategy
    patternCount: number
    recentPatterns: NavigationPattern[]
    prediction: ReturnType<AdvancedPrefetchManager['predictNextDirection']>
  } {
    return {
      strategy: this.strategy,
      patternCount: this.patterns.length,
      recentPatterns: this.patterns.slice(-5),
      prediction: this.predictNextDirection()
    }
  }

  /**
   * Adapt strategy based on new navigation pattern
   */
  private adaptStrategy(pattern: NavigationPattern): void {
    const { learningRate, baseDistance } = this.strategy

    // Adjust adaptive multiplier based on navigation distance
    const distanceRatio = pattern.distance / baseDistance
    const targetMultiplier = Math.max(0.5, Math.min(2.0, distanceRatio))

    // Smooth adaptation using learning rate
    this.strategy.adaptiveMultiplier += (targetMultiplier - this.strategy.adaptiveMultiplier) * learningRate

    // Clamp to reasonable bounds
    this.strategy.adaptiveMultiplier = Math.max(0.5, Math.min(3.0, this.strategy.adaptiveMultiplier))
  }

  /**
   * Calculate pattern-based adjustment for prefetch distance
   */
  private calculatePatternAdjustment(direction: BufferDirectionType): number {
    if (this.patterns.length < 3) {
      return 0 // Not enough data
    }

    // Analyze patterns in the same direction
    const relevantPatterns = this.patterns.filter(p => p.direction === direction)
    if (relevantPatterns.length === 0) {
      return 0
    }

    // Calculate average distance for this direction
    const avgDistance = relevantPatterns.reduce((sum, p) => sum + p.distance, 0) / relevantPatterns.length

    // Calculate adjustment based on recent vs historical behavior
    const recentPatterns = relevantPatterns.slice(-3)
    const recentAvgDistance = recentPatterns.reduce((sum, p) => sum + p.distance, 0) / recentPatterns.length

    // If recent behavior differs from historical, adjust accordingly
    const adjustment = (recentAvgDistance - avgDistance) * 0.5

    return Math.round(adjustment)
  }
}

/**
 * Singleton instance for easy access
 */
export const advancedPrefetchManager = new AdvancedPrefetchManager()

/**
 * Hook for advanced prefetching
 */
export function useAdvancedPrefetching() {
  return {
    recordNavigation: (direction: 'forward' | 'backward', distance: number, currentPosition: number) => {
      advancedPrefetchManager.recordNavigation(direction, distance, currentPosition)
    },
    getOptimalPrefetchDistance: (direction: BufferDirectionType) => {
      return advancedPrefetchManager.getOptimalPrefetchDistance(direction)
    },
    getPrefetchPriorities: () => advancedPrefetchManager.getPrefetchPriorities(),
    getPrefetchTiming: () => advancedPrefetchManager.getPrefetchTiming(),
    getDebugInfo: () => advancedPrefetchManager.getDebugInfo(),
    reset: () => advancedPrefetchManager.reset()
  }
}

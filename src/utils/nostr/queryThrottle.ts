/**
 * Global query throttle system to coordinate Nostrify queries
 * Prevents relay overload when multiple query types run simultaneously
 */

export type QueryType = 'feed' | 'metadata' | 'profile' | 'discovery';

interface QuerySlot {
  type: QueryType;
  acquiredAt: number;
  id: string;
}

interface ThrottleConfig {
  maxFeedQueries: number;
  maxMetadataQueries: number;
  maxProfileQueries: number;
  maxDiscoveryQueries: number;
  priority: QueryType[];
}

class QueryThrottleManager {
  private activeSlots: Map<string, QuerySlot> = new Map();
  private queue: Array<{
    type: QueryType;
    resolve: (slotId: string) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  
  private config: ThrottleConfig = {
    maxFeedQueries: 4, // Increased from 3 to 4 for better throughput
    maxMetadataQueries: 5,
    maxProfileQueries: 2,
    maxDiscoveryQueries: 1,
    priority: ['feed', 'profile', 'metadata', 'discovery']
  };

  private getDynamicConfig(): ThrottleConfig {
    const isDiscoveryActive = (globalThis as any).__outboxDiscoveryActive || false;
    
    if (isDiscoveryActive) {
      // Reduce feed queries during discovery to prevent relay conflicts
      return {
        ...this.config,
        maxFeedQueries: 1, // Only 1 feed query during discovery
        // Always prioritize feed work over discovery to avoid UI timeouts on login (iOS Safari)
        priority: ['feed', 'profile', 'metadata', 'discovery']
      };
    }
    
    return this.config;
  }

  private getMaxQueries(type: QueryType): number {
    const dynamicConfig = this.getDynamicConfig();
    switch (type) {
      case 'feed': return dynamicConfig.maxFeedQueries;
      case 'metadata': return dynamicConfig.maxMetadataQueries;
      case 'profile': return dynamicConfig.maxProfileQueries;
      case 'discovery': return dynamicConfig.maxDiscoveryQueries;
      default: return 1;
    }
  }

  private getActiveCount(type: QueryType): number {
    return Array.from(this.activeSlots.values()).filter(slot => slot.type === type).length;
  }

  private isSlotAvailable(type: QueryType): boolean {
    return this.getActiveCount(type) < this.getMaxQueries(type);
  }

  private processQueue(): void {
    if (this.queue.length === 0) return;

    // Sort queue by priority using dynamic config
    const dynamicConfig = this.getDynamicConfig();
    this.queue.sort((a, b) => {
      const aPriority = dynamicConfig.priority.indexOf(a.type);
      const bPriority = dynamicConfig.priority.indexOf(b.type);
      return aPriority - bPriority;
    });

    // Process available slots
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const queued = this.queue[i];
      if (this.isSlotAvailable(queued.type)) {
        const slotId = this.acquireSlot(queued.type);
        queued.resolve(slotId);
        this.queue.splice(i, 1);
      }
    }
  }

  private acquireSlot(type: QueryType): string {
    const slotId = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.activeSlots.set(slotId, {
      type,
      acquiredAt: Date.now(),
      id: slotId
    });
    return slotId;
  }

  /**
   * Acquire a query slot for the specified type
   * Returns a promise that resolves with a slot ID when available
   */
  async acquireQuerySlot(type: QueryType, options?: { signal?: AbortSignal; queueTimeoutMs?: number }): Promise<string> {
    if (this.isSlotAvailable(type)) {
      return this.acquireSlot(type);
    }

    // Queue the request with optional abort/timeout controls
    return new Promise((resolve, reject) => {
      const queued = {
        type,
        resolve,
        reject,
        timestamp: Date.now()
      } as const;

      this.queue.push({ ...queued });

      const queueTimeoutMs = typeof options?.queueTimeoutMs === 'number' ? options.queueTimeoutMs : 30000;
      const timeoutId = setTimeout(() => {
        const index = this.queue.findIndex(q => q.resolve === queued.resolve);
        if (index !== -1) {
          this.queue.splice(index, 1);
          reject(new Error(`Query slot timeout for ${type} after ${queueTimeoutMs} milliseconds`));
        }
      }, queueTimeoutMs);

      const onAbort = () => {
        clearTimeout(timeoutId);
        const index = this.queue.findIndex(q => q.resolve === queued.resolve);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
        reject(new Error(`Query slot aborted for ${type}`));
      };

      if (options?.signal) {
        if (options.signal.aborted) {
          onAbort();
        } else {
          options.signal.addEventListener('abort', onAbort, { once: true });
        }
      }
    });
  }

  /**
   * Release a query slot
   */
  releaseQuerySlot(slotId: string): void {
    if (this.activeSlots.has(slotId)) {
      this.activeSlots.delete(slotId);
      this.processQueue();
    }
  }

  /**
   * Get current throttle status for debugging
   */
  getStatus() {
    const status: Record<QueryType, { active: number; max: number; queued: number }> = {
      feed: { active: 0, max: 0, queued: 0 },
      metadata: { active: 0, max: 0, queued: 0 },
      profile: { active: 0, max: 0, queued: 0 },
      discovery: { active: 0, max: 0, queued: 0 }
    };

    for (const type of this.config.priority) {
      status[type] = {
        active: this.getActiveCount(type),
        max: this.getMaxQueries(type),
        queued: this.queue.filter(q => q.type === type).length
      };
    }

    return status;
  }

  /**
   * Clear all slots and queue (for testing)
   */
  reset(): void {
    this.activeSlots.clear();
    this.queue.forEach(queued => {
      queued.reject(new Error('Throttle manager reset'));
    });
    this.queue = [];
  }
}

// Global instance
const throttleManager = new QueryThrottleManager();

/**
 * Acquire a query slot for the specified type
 */
export async function acquireQuerySlot(type: QueryType): Promise<string> {
  return throttleManager.acquireQuerySlot(type);
}

/**
 * Release a query slot
 */
export function releaseQuerySlot(slotId: string): void {
  throttleManager.releaseQuerySlot(slotId);
}

/**
 * Get current throttle status for debugging
 */
export function getThrottleStatus() {
  return throttleManager.getStatus();
}

/**
 * Reset throttle manager (for testing)
 */
export function resetThrottleManager(): void {
  throttleManager.reset();
}

/**
 * Hook for using query throttling in React components
 */
export function useQueryThrottle() {
  return {
    acquireQuerySlot,
    releaseQuerySlot,
    getStatus: getThrottleStatus
  };
}

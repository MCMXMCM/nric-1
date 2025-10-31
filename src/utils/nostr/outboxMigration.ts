import { getOutboxRouter } from './outboxRouter';

export interface MigrationConfig {
  enableOutboxModel: boolean;
  outboxWeight: number; // 0-1, how much to use outbox vs dynamic
  discoveryBatchSize: number;
  discoveryInterval: number; // ms
  autoIncrementWeight?: boolean; // Automatically increase weight as data is discovered
  targetWeight?: number; // Target weight to reach (default 1.0)
  weightIncrement?: number; // How much to increment per successful discovery (default 0.1)
}

/**
 * Migration strategy to gradually replace dynamic relay fetching with outbox model
 * Provides a smooth transition while maintaining performance
 */
export class OutboxMigration {
  private outboxRouter = getOutboxRouter();
  private config: Required<MigrationConfig>;
  private discoveryTimer?: number;
  private isDiscovering = false;
  private isRunning = false;

  constructor(config: Partial<MigrationConfig> = {}) {
    this.config = {
      enableOutboxModel: config.enableOutboxModel ?? true,
      outboxWeight: config.outboxWeight ?? 0.5, // Start with 50% outbox
      discoveryBatchSize: config.discoveryBatchSize ?? 10,
      // Increase default discovery interval to ~2 hours to avoid rate limiting
      discoveryInterval: config.discoveryInterval ?? 2 * 60 * 60 * 1000, // 2 hours
      autoIncrementWeight: config.autoIncrementWeight ?? true,
      targetWeight: config.targetWeight ?? 1.0,
      weightIncrement: config.weightIncrement ?? 0.1
    };
  }

  /**
   * Start the migration process
   */
  async startMigration(): Promise<void> {
    if (!this.config.enableOutboxModel) {
      console.log('📦 Outbox model disabled, using dynamic relay fetching');
      return;
    }

    if (this.isRunning) {
      console.log('📦 Migration already running');
      return;
    }

    console.log(`📦 Starting outbox migration (weight: ${this.config.outboxWeight})`);
    
    this.isRunning = true;
    
    // Start periodic discovery
    this.startPeriodicDiscovery();
    
    // Initial cleanup
    await this.outboxRouter.cleanup();
    
    console.log('📦 Migration started successfully');
  }

  /**
   * Stop the migration process
   */
  stopMigration(): void {
    console.log('📦 Stopping outbox migration');
    
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = undefined;
    }
    
    this.isRunning = false;
    this.isDiscovering = false;
    
    console.log('📦 Migration stopped');
  }

  /**
   * Discover outbox events for users in the current session
   */
  async discoverSessionOutbox(): Promise<void> {
    if (this.isDiscovering) return;
    
    this.isDiscovering = true;
    
    try {
      // Get users from recent activity
      const recentUsers = await this.getRecentUsers();
      
      // Apply per-user TTL to avoid re-discovering too frequently
      // Store timestamps in localStorage to avoid DB schema changes
      const ttlMs = this.config.discoveryInterval; // reuse configured interval
      const now = Date.now();
      let tsMap: Record<string, number> = {};
      try {
        const raw = localStorage.getItem('outbox-discovery-ts');
        tsMap = raw ? JSON.parse(raw) : {};
      } catch {}
      
      const eligibleUsers = recentUsers.filter((pk) => {
        const last = tsMap[pk] || 0;
        return now - last >= ttlMs;
      });
      
      if (eligibleUsers.length > 0) {
        console.log(`📦 Discovering outbox events for ${eligibleUsers.length} users (TTL filtered from ${recentUsers.length})`);
        
        let totalEventsFound = 0;
        let totalUsersDiscovered = 0;
        
        // Process in batches
        for (let i = 0; i < eligibleUsers.length; i += this.config.discoveryBatchSize) {
          const batch = eligibleUsers.slice(i, i + this.config.discoveryBatchSize);
          const result = await this.outboxRouter.discoverOutboxEvents(batch, this.getDiscoveryRelays());
          
          if (result.success) {
            totalEventsFound += result.eventsFound;
            totalUsersDiscovered += result.usersDiscovered;
          }
          
          // Update TTL timestamps for attempted users to prevent immediate re-queries
          for (const pk of batch) {
            tsMap[pk] = now;
          }
          try { localStorage.setItem('outbox-discovery-ts', JSON.stringify(tsMap)); } catch {}
          
          // Small delay between batches (2s) to reduce load
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        console.log(`📦 Session discovery complete: ${totalEventsFound} events from ${totalUsersDiscovered} users`);
        
        // Auto-increment weight if enabled and we found data
        if (this.config.autoIncrementWeight && totalEventsFound > 0) {
          this.incrementWeightOnSuccess(totalUsersDiscovered);
        }
      }
    } catch (error) {
      console.warn('Outbox discovery failed:', error);
    } finally {
      this.isDiscovering = false;
    }
  }

  /**
   * Discover outbox events for specific users (called from application flows)
   */
  async discoverUserOutbox(pubkeys: string[]): Promise<{ 
    success: boolean; 
    eventsFound: number; 
    usersDiscovered: number;
    error?: string;
  }> {
    if (!this.config.enableOutboxModel || pubkeys.length === 0) {
      return { success: false, eventsFound: 0, usersDiscovered: 0, error: 'Outbox model disabled or no users' };
    }
    
    try {
      console.log(`📦 Discovering outbox events for ${pubkeys.length} specific users`);
      const result = await this.outboxRouter.discoverOutboxEvents(pubkeys, this.getDiscoveryRelays());
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.warn('User outbox discovery failed:', error);
      return { success: false, eventsFound: 0, usersDiscovered: 0, error: errorMsg };
    }
  }

  /**
   * Get recent users from the current session for outbox discovery
   */
  private async getRecentUsers(): Promise<string[]> {
    try {
      // Get users from various sources in the current session
      const recentUsers = new Set<string>();
      
      // 1. Get users from localStorage recent activity
      const recentActivity = localStorage.getItem('nostr-recent-activity');
      if (recentActivity) {
        try {
          const activity = JSON.parse(recentActivity);
          if (Array.isArray(activity)) {
            activity.forEach((item: any) => {
              if (item.pubkey && typeof item.pubkey === 'string') {
                recentUsers.add(item.pubkey);
              }
            });
          }
        } catch (e) {
          console.warn('Failed to parse recent activity:', e);
        }
      }
      
      // 2. Get users from session storage
      const sessionUsers = sessionStorage.getItem('nostr-session-users');
      if (sessionUsers) {
        try {
          const users = JSON.parse(sessionUsers);
          if (Array.isArray(users)) {
            users.forEach((pubkey: string) => {
              if (typeof pubkey === 'string') {
                recentUsers.add(pubkey);
              }
            });
          }
        } catch (e) {
          console.warn('Failed to parse session users:', e);
        }
      }
      
      // 3. Get users from current feed (if available globally)
      if (typeof window !== 'undefined' && (window as any).__queryClient) {
        try {
          const queryClient = (window as any).__queryClient;
          const feedData = queryClient.getQueryData(['feed', 'notes']);
          if (feedData && Array.isArray(feedData)) {
            feedData.forEach((note: any) => {
              if (note.pubkey) {
                recentUsers.add(note.pubkey);
              }
            });
          }
        } catch (e) {
          console.warn('Failed to get users from feed:', e);
        }
      }
      
      const usersArray = Array.from(recentUsers);
      console.log(`📦 Found ${usersArray.length} recent users for outbox discovery`);
      return usersArray;
      
    } catch (error) {
      console.warn('Failed to get recent users:', error);
      return [];
    }
  }

  /**
   * Get hybrid relay selection (combines outbox and dynamic)
   */
  async getHybridRelays(
    authors: string[], 
    operation: 'query' | 'publish' = 'query'
  ): Promise<string[]> {
    if (!this.config.enableOutboxModel) {
      return this.getDynamicRelays(operation);
    }

    try {
      const outboxRelays = await this.getOutboxRelays(authors, operation);
      const dynamicRelays = this.getDynamicRelays(operation);
      
      // Combine based on weight
      const outboxCount = Math.floor(outboxRelays.length * this.config.outboxWeight);
      const dynamicCount = Math.floor(dynamicRelays.length * (1 - this.config.outboxWeight));
      
      const selectedRelays = [
        ...outboxRelays.slice(0, outboxCount),
        ...dynamicRelays.slice(0, dynamicCount)
      ];
      
      // Remove duplicates and limit
      const uniqueRelays = [...new Set(selectedRelays)].slice(0, 8);
      
      console.log(`📦 Hybrid relay selection: ${uniqueRelays.length} relays (${outboxCount} outbox, ${dynamicCount} dynamic)`);
      return uniqueRelays;
      
    } catch (error) {
      console.warn('Hybrid relay selection failed, using dynamic:', error);
      return this.getDynamicRelays(operation);
    }
  }

  /**
   * Gradually increase outbox weight over time
   */
  increaseOutboxWeight(): void {
    if (this.config.outboxWeight < (this.config.targetWeight || 1.0)) {
      const increment = this.config.weightIncrement || 0.1;
      const newWeight = Math.min(this.config.targetWeight || 1.0, this.config.outboxWeight + increment);
      const oldWeight = this.config.outboxWeight;
      this.config.outboxWeight = newWeight;
      console.log(`📦 Increased outbox weight from ${oldWeight.toFixed(2)} to ${newWeight.toFixed(2)} (target: ${this.config.targetWeight})`);
    } else {
      console.log(`📦 Outbox weight already at target: ${this.config.outboxWeight.toFixed(2)}`);
    }
  }

  /**
   * Decrease outbox weight
   */
  decreaseOutboxWeight(): void {
    if (this.config.outboxWeight > 0) {
      const decrement = this.config.weightIncrement || 0.1;
      const newWeight = Math.max(0, this.config.outboxWeight - decrement);
      const oldWeight = this.config.outboxWeight;
      this.config.outboxWeight = newWeight;
      console.log(`📦 Decreased outbox weight from ${oldWeight.toFixed(2)} to ${newWeight.toFixed(2)}`);
    }
  }

  /**
   * Set outbox weight manually
   */
  setOutboxWeight(weight: number): void {
    const clampedWeight = Math.max(0, Math.min(1.0, weight));
    const oldWeight = this.config.outboxWeight;
    this.config.outboxWeight = clampedWeight;
    console.log(`📦 Set outbox weight from ${oldWeight.toFixed(2)} to ${clampedWeight.toFixed(2)}`);
  }

  /**
   * Automatically increment weight based on successful discoveries
   */
  private incrementWeightOnSuccess(usersDiscovered: number): void {
    // Only increment if we discovered a meaningful number of users (at least 3)
    if (usersDiscovered >= 3 && this.config.outboxWeight < (this.config.targetWeight || 1.0)) {
      this.increaseOutboxWeight();
    }
  }

  /**
   * Get migration status
   */
  async getMigrationStatus(): Promise<{
    outboxWeight: number;
    outboxStats: any;
    dynamicStats: any;
    isDiscovering: boolean;
    isRunning: boolean;
  }> {
    const outboxStats = await this.outboxRouter.getStats();
    const dynamicStats = { relayCount: 0, healthyRelays: 0 }; // DynamicRelayManager doesn't have getStats
    
    return {
      outboxWeight: this.config.outboxWeight,
      outboxStats,
      dynamicStats,
      isDiscovering: this.isDiscovering,
      isRunning: this.isRunning
    };
  }

  /**
   * Private methods
   */
  private startPeriodicDiscovery(): void {
    // Add jitter of ±10% to avoid synchronized spikes across clients
    const scheduleNext = () => {
      const base = this.config.discoveryInterval;
      const jitter = base * 0.1;
      const delay = Math.max(60_000, base + (Math.random() * 2 - 1) * jitter);
      this.discoveryTimer = setTimeout(async () => {
        await this.discoverSessionOutbox();
        scheduleNext();
      }, delay) as unknown as number;
    };
    scheduleNext();
  }


  private getDiscoveryRelays(): string[] {
    // Candidate discovery relays
    const candidates = [
      'wss://relay.damus.io',
      'wss://relay.primal.net',
      'wss://nos.lol',
      'wss://relay.snort.social',
      'wss://nostr.mom',
      'wss://purplepag.es',
      'wss://relay.nostr.band',
      'wss://relay.nostr.bg',
    ];
    // Randomly select up to 3 per discovery cycle to reduce load
    const shuffled = candidates.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }

  private async getOutboxRelays(authors: string[], operation: 'query' | 'publish'): Promise<string[]> {
    if (operation === 'query') {
      const userRelays = await this.outboxRouter['outboxStorage'].getRelaysForUsers(authors);
      const allRelays = new Set<string>();
      
      for (const relays of userRelays.values()) {
        const readRelays = relays
          .filter(r => r.permission === 'read' || r.permission === 'readwrite' || r.permission === 'indexer')
          .map(r => r.relay);
        readRelays.forEach(relay => allRelays.add(relay));
      }
      
      return [...allRelays];
    } else {
      const allRelays = new Set<string>();
      for (const author of authors) {
        const publishRelays = await this.outboxRouter['outboxStorage'].getPublishRelays(author);
        publishRelays.forEach(relay => allRelays.add(relay));
      }
      return [...allRelays];
    }
  }

  private getDynamicRelays(_operation: 'query' | 'publish'): string[] {
    // Use reliable fallback relays directly since outbox system is sufficient
    return [
      'wss://nos.lol',
      'wss://relay.snort.social',
      'wss://nostr.mom',
      'wss://purplepag.es'
    ];
  }
}

// Global migration instance
let outboxMigration: OutboxMigration | null = null;

export const getOutboxMigration = (config?: Partial<MigrationConfig>): OutboxMigration => {
  if (!outboxMigration) {
    outboxMigration = new OutboxMigration(config);
  }
  return outboxMigration;
};

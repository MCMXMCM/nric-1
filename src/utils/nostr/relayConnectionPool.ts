import { SimplePool, Relay, type Filter, type Event } from 'nostr-tools';
import { DEFAULT_RELAY_URLS } from './constants';

export interface RelayConnectionStatus {
  url: string;
  connected: boolean;
  lastConnected?: number;
  lastError?: string;
  connectionAttempts: number;
  lastHealthCheck?: number;
}

export interface RelayConnectionPoolConfig {
  maxConnections?: number;
  connectionTimeout?: number;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

export class RelayConnectionPool {
  private pool: SimplePool;
  private connectionStatuses: Map<string, RelayConnectionStatus> = new Map();
  private connectionPromises: Map<string, Promise<Relay>> = new Map();
  private activeConnections: Map<string, Relay> = new Map();
  private connectionTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private config: Required<RelayConnectionPoolConfig>;
  private isDestroyed = false;
  private healthCheckInterval?: ReturnType<typeof setInterval>;

  constructor(config: RelayConnectionPoolConfig = {}) {
    this.pool = new SimplePool();
    this.config = {
      maxConnections: config.maxConnections ?? 20,
      connectionTimeout: config.connectionTimeout ?? 5000, // Reduced from 10s to 5s for faster failure detection
      reconnectDelay: config.reconnectDelay ?? 5000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 3,
    };

    // Initialize status tracking for default relays
    DEFAULT_RELAY_URLS.forEach(url => {
      this.connectionStatuses.set(url, {
        url,
        connected: false,
        connectionAttempts: 0,
      });
    });

    // Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Get or create a connection to a relay
   */
  async getConnection(url: string): Promise<Relay> {
    if (this.isDestroyed) {
      throw new Error('RelayConnectionPool has been destroyed');
    }

    // Normalize URL
    const normalizedUrl = this.normalizeRelayUrl(url);
    
    // Update status
    if (!this.connectionStatuses.has(normalizedUrl)) {
      this.connectionStatuses.set(normalizedUrl, {
        url: normalizedUrl,
        connected: false,
        connectionAttempts: 0,
      });
    }

    // Check if we already have a connection promise for this URL
    if (this.connectionPromises.has(normalizedUrl)) {
      return this.connectionPromises.get(normalizedUrl)!;
    }

    // Check connection limit
    if (this.connectionStatuses.size >= this.config.maxConnections) {
      throw new Error(`Maximum connections (${this.config.maxConnections}) reached`);
    }

    // Create new connection promise
    const connectionPromise = this.establishConnection(normalizedUrl);
    this.connectionPromises.set(normalizedUrl, connectionPromise);

    try {
      const relay = await connectionPromise;
      this.updateConnectionStatus(normalizedUrl, { connected: true, lastConnected: Date.now() });

      // Store active connection for proper cleanup
      this.activeConnections.set(normalizedUrl, relay);

      // Set up connection monitoring
      this.setupConnectionMonitoring(relay, normalizedUrl);

      return relay;
    } catch (error) {
      this.updateConnectionStatus(normalizedUrl, {
        connected: false,
        lastError: error instanceof Error ? error.message : 'Unknown error',
        connectionAttempts: (this.connectionStatuses.get(normalizedUrl)?.connectionAttempts ?? 0) + 1
      });
      throw error;
    } finally {
      this.connectionPromises.delete(normalizedUrl);
    }
  }

  /**
   * Query multiple relays with the same filter
   */
  async querySync(relayUrls: string[], filter: Filter): Promise<Event[]> {
    if (this.isDestroyed) {
      throw new Error('RelayConnectionPool has been destroyed');
    }

    return this.pool.querySync(relayUrls, filter);
  }

  /**
   * Publish an event to multiple relays
   */
  async publish(relayUrls: string[], event: Event): Promise<string[]> {
    if (this.isDestroyed) {
      throw new Error('RelayConnectionPool has been destroyed');
    }

    // Publish to all relays and consider success if at least one accepts.
    const settled = await Promise.allSettled(this.pool.publish(relayUrls, event));
    const successes: string[] = [];
    const errors: Array<{ url: string; error: any }> = [];
    settled.forEach((res, idx) => {
      const url = relayUrls[idx];
      if (res.status === 'fulfilled') successes.push(res.value);
      else errors.push({ url, error: res.reason });
    });
    if (successes.length === 0) {
      const errorSummary = errors.map(e => `${e.url}: ${e.error?.message || e.error}`).join('; ');
      throw new Error(`Publish failed: ${errorSummary}`);
    }
    return successes;
  }

  /**
   * Subscribe to multiple relays
   */
  subscribeMany(relayUrls: string[], filters: Filter[], params?: any): { close: () => void } {
    if (this.isDestroyed) {
      throw new Error('RelayConnectionPool has been destroyed');
    }

    return this.pool.subscribeMany(relayUrls, filters, params);
  }

  /**
   * Close connections to specific relays
   */
  close(relayUrls: string[]): void {
    if (this.isDestroyed) return;

    relayUrls.forEach(url => {
      const normalizedUrl = this.normalizeRelayUrl(url);
      this.updateConnectionStatus(normalizedUrl, { connected: false });

      // Remove from active connections
      this.activeConnections.delete(normalizedUrl);

      // Clean up monitoring
      this.cleanupConnectionMonitoring(normalizedUrl);
    });

    this.pool.close(relayUrls);
  }

  /**
   * Ensure a relay connection exists
   */
  async ensureRelay(url: string): Promise<Relay> {
    return this.getConnection(url);
  }

  /**
   * Get the underlying SimplePool
   */
  getPool(): SimplePool {
    return this.pool;
  }

  /**
   * Add missing SimplePool compatibility methods
   */
  get relays() {
    // Access relays through a public method or property
    return (this.pool as any).relays || new Map();
  }

  get seenOn() {
    return this.pool.seenOn;
  }

  trackRelays(...args: any[]) {
    return (this.pool as any).trackRelays?.(...args);
  }

  verifyEvent(...args: any[]) {
    return (this.pool as any).verifyEvent?.(...args);
  }

  /**
   * Get connection status for all relays
   */
  getConnectionStatuses(): RelayConnectionStatus[] {
    return Array.from(this.connectionStatuses.values());
  }

  /**
   * Get connection status for a specific relay
   */
  getConnectionStatus(url: string): RelayConnectionStatus | undefined {
    const normalizedUrl = this.normalizeRelayUrl(url);
    return this.connectionStatuses.get(normalizedUrl);
  }

  /**
   * Check if a relay is connected
   */
  isConnected(url: string): boolean {
    const status = this.getConnectionStatus(url);
    return status?.connected ?? false;
  }

  /**
   * Get all connected relay URLs
   */
  getConnectedRelays(): string[] {
    return Array.from(this.connectionStatuses.values())
      .filter(status => status.connected)
      .map(status => status.url);
  }

  /**
   * Set up monitoring for a connection to handle disconnects and errors
   */
  private setupConnectionMonitoring(_relay: Relay, url: string): void {
    // Clean up any existing monitoring for this URL
    this.cleanupConnectionMonitoring(url);

    // Note: SimplePool doesn't expose direct connection events
    // These handlers are prepared for future use when we implement
    // more sophisticated WebSocket monitoring

    // Monitor the relay connection (this is a best-effort approach)
    // The SimplePool doesn't expose connection events directly, so we rely on usage patterns
    // to detect failed connections

    // Store cleanup functions
    this.connectionTimeouts.set(url, setTimeout(() => {
      // This is a placeholder for more sophisticated monitoring
      // In a real implementation, we'd monitor the WebSocket state
    }, 60000)); // Check every minute
  }

  /**
   * Handle connection failure and attempt recovery
   */
  private handleConnectionFailure(url: string, error: string): void {
    console.warn(`Connection failure for ${url}: ${error}`);

    // Update status
    this.updateConnectionStatus(url, {
      connected: false,
      lastError: error,
      connectionAttempts: (this.connectionStatuses.get(url)?.connectionAttempts ?? 0) + 1
    });

    // Remove from active connections
    this.activeConnections.delete(url);

    // Clean up monitoring
    this.cleanupConnectionMonitoring(url);

    // Attempt reconnection if we haven't exceeded max attempts
    const status = this.connectionStatuses.get(url);
    if (status && status.connectionAttempts < this.config.maxReconnectAttempts) {

      setTimeout(() => {
        if (!this.isDestroyed) {
          this.getConnection(url).catch(err => {
            console.warn(`Reconnection failed for ${url}:`, err);
          });
        }
      }, this.config.reconnectDelay);
    } else {
      console.warn(`Max reconnection attempts reached for ${url}`);
    }
  }

  /**
   * Clean up connection monitoring for a URL
   */
  private cleanupConnectionMonitoring(url: string): void {
    const timeout = this.connectionTimeouts.get(url);
    if (timeout) {
      clearTimeout(timeout);
      this.connectionTimeouts.delete(url);
    }
  }

  /**
   * Start periodic health monitoring of connections
   */
  private startHealthMonitoring(): void {
    // Use longer interval on mobile to reduce CPU usage
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    const interval = isMobile ? 90000 : 60000; // 90s on mobile, 60s on desktop (increased from 30s)
    
    this.healthCheckInterval = setInterval(() => {
      if (this.isDestroyed) return;

      // Skip health checks when app is backgrounded (Page Visibility API)
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }

      // Check health of active connections
      this.performHealthCheck();
    }, interval);
  }

  /**
   * Perform health check on all active connections
   */
  private async performHealthCheck(): Promise<void> {
    if (this.isDestroyed) return;

    const urlsToCheck = Array.from(this.activeConnections.keys());

    for (const url of urlsToCheck) {
      try {
        // Simple health check - try to use the connection
        const relay = this.activeConnections.get(url);
        if (!relay) continue;

        // Update last health check time
        const status = this.connectionStatuses.get(url);
        if (status) {
          status.lastHealthCheck = Date.now();
        }

      } catch (error) {
        console.warn(`Health check failed for ${url}:`, error);
        this.handleConnectionFailure(url, 'Health check failed');
      }
    }
  }

  /**
   * Force cleanup of stale connections
   */
  forceCleanup(): void {

    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    // Clean up connections that haven't been used recently
    for (const [url, status] of this.connectionStatuses) {
      if (status.connected && status.lastConnected) {
        if (now - status.lastConnected > staleThreshold) {

          this.close([url]);
        }
      }
    }

    // Clean up connection promises that have been pending too long
    const promisesToCleanup: string[] = [];
    for (const [url, _promise] of this.connectionPromises) {
      const status = this.connectionStatuses.get(url);
      if (status && status.connectionAttempts >= this.config.maxReconnectAttempts) {
        promisesToCleanup.push(url);
      }
    }

    // Remove stuck connection promises
    promisesToCleanup.forEach(url => {

      this.connectionPromises.delete(url);
      this.cleanupConnectionMonitoring(url);
    });
  }

  /**
   * Reset connection attempts for all relays to allow fresh reconnection attempts
   */
  resetConnectionAttempts(): void {

    for (const [url, status] of this.connectionStatuses) {
      if (status.connectionAttempts > 0) {
        this.updateConnectionStatus(url, { connectionAttempts: 0, lastError: undefined });
      }
    }

    // Clear any pending connection promises to allow fresh attempts
    this.connectionPromises.clear();
    
    // Clean up all connection timeouts
    for (const timeout of this.connectionTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.connectionTimeouts.clear();
  }

  /**
   * Get detailed connection statistics
   */
  getConnectionStats(): {
    totalConnections: number;
    activeConnections: number;
    failedConnections: number;
    pendingConnections: number;
    connectionStatuses: RelayConnectionStatus[];
  } {
    const stats = {
      totalConnections: this.connectionStatuses.size,
      activeConnections: this.activeConnections.size,
      failedConnections: Array.from(this.connectionStatuses.values()).filter(s => !s.connected).length,
      pendingConnections: this.connectionPromises.size,
      connectionStatuses: Array.from(this.connectionStatuses.values())
    };

    return stats;
  }

  /**
   * Destroy the pool and close all connections
   */
  destroy(): void {
    if (this.isDestroyed) return;

    this.isDestroyed = true;

    // Clear health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    // Clean up all connection timeouts
    for (const timeout of this.connectionTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.connectionTimeouts.clear();

    // Close all active connections
    const urls = Array.from(this.activeConnections.keys());
    if (urls.length > 0) {
      this.pool.close(urls);
    }

    // Clear all state
    this.connectionPromises.clear();
    this.connectionStatuses.clear();
    this.activeConnections.clear();

    // Destroy the underlying pool
    this.pool.destroy();
  }

  /**
   * Establish a connection to a relay with retry logic and timeout
   */
  private async establishConnection(url: string): Promise<Relay> {
    const status = this.connectionStatuses.get(url);
    if (!status) {
      throw new Error(`No status tracking for relay: ${url}`);
    }

    // Check if we've exceeded max reconnect attempts
    if (status.connectionAttempts >= this.config.maxReconnectAttempts) {
      throw new Error(`Max connection attempts (${this.config.maxReconnectAttempts}) exceeded for ${url}`);
    }

    try {
      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Connection timeout after ${this.config.connectionTimeout}ms for ${url}`)), this.config.connectionTimeout);
      });

      // Race the connection against the timeout
      const relay = await Promise.race([
        this.pool.ensureRelay(url),
        timeoutPromise
      ]);

      return relay;
    } catch (error) {
      // Increment connection attempts
      status.connectionAttempts++;
      this.connectionStatuses.set(url, status);

      throw error;
    }
  }

  /**
   * Update connection status for a relay
   */
  private updateConnectionStatus(url: string, updates: Partial<RelayConnectionStatus>): void {
    const current = this.connectionStatuses.get(url);
    if (current) {
      this.connectionStatuses.set(url, { ...current, ...updates });
    }
  }

  /**
   * Normalize relay URL to standard format
   */
  private normalizeRelayUrl(url: string): string {
    try {
      let normalized = url.trim();
      
      if (!normalized.startsWith('ws://') && !normalized.startsWith('wss://')) {
        normalized = `wss://${normalized}`;
      }
      
      // Force wss for security
      normalized = normalized.replace(/^ws:\/\//i, 'wss://');
      
      const parsed = new URL(normalized);
      const protocol = 'wss:';
      const hostname = parsed.hostname.toLowerCase();
      const port = parsed.port ? `:${parsed.port}` : '';
      let pathname = parsed.pathname || '';
      
      if (pathname === '/') {
        pathname = '';
      } else if (pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
      }
      
      return `${protocol}//${hostname}${port}${pathname}`;
    } catch {
      return url;
    }
  }
}

// Export a singleton instance for the application
let globalRelayPool: RelayConnectionPool | null = null;

export const getGlobalRelayPool = (): RelayConnectionPool => {
  if (!globalRelayPool) {
    globalRelayPool = new RelayConnectionPool();
  }
  return globalRelayPool;
};

export const destroyGlobalRelayPool = (): void => {
  if (globalRelayPool) {
    globalRelayPool.destroy();
    globalRelayPool = null;
  }
};

/**
 * Reset connection attempts for the global relay pool
 */
export const resetGlobalRelayPoolConnections = (): void => {
  const pool = getGlobalRelayPool();
  pool.resetConnectionAttempts();
};

/**
 * Force cleanup of the global relay pool
 */
export const cleanupGlobalRelayPool = (): void => {
  const pool = getGlobalRelayPool();
  pool.forceCleanup();
};

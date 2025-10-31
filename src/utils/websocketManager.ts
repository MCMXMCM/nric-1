/**
 * WebSocket Connection Manager for Nostr relays
 * Provides centralized WebSocket lifecycle management and cleanup
 */

interface WebSocketConnection {
  url: string;
  websocket: WebSocket;
  isConnected: boolean;
  lastActivity: number;
  reconnectAttempts: number;
  cleanupTimer?: ReturnType<typeof setTimeout>;
}

interface WebSocketManagerConfig {
  maxConnections: number;
  connectionTimeout: number;
  reconnectDelay: number;
  maxReconnectAttempts: number;
  pingInterval: number;
  pongTimeout: number;
  staleConnectionThreshold: number;
}

const DEFAULT_CONFIG: WebSocketManagerConfig = {
  maxConnections: 20,
  connectionTimeout: 10000, // 10 seconds for mobile
  reconnectDelay: 3000, // 3 seconds
  maxReconnectAttempts: 5,
  pingInterval: 30000, // 30 seconds
  pongTimeout: 5000, // 5 seconds
  staleConnectionThreshold: 300000, // 5 minutes
};

export class WebSocketManager {
  private connections: Map<string, WebSocketConnection> = new Map();
  private config: WebSocketManagerConfig;
  private isDestroyed = false;
  private pingTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private pongTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private eventListeners: Map<string, EventListener[]> = new Map();

  constructor(config: Partial<WebSocketManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanupTimer();
  }

  /**
   * Create or get a WebSocket connection
   */
  async getConnection(url: string): Promise<WebSocket> {
    if (this.isDestroyed) {
      throw new Error('WebSocketManager has been destroyed');
    }

    const normalizedUrl = this.normalizeUrl(url);

    // Check if we already have a connection
    const existing = this.connections.get(normalizedUrl);
    if (existing && existing.isConnected) {
      existing.lastActivity = Date.now();
      return existing.websocket;
    }

    // Check connection limit
    if (this.connections.size >= this.config.maxConnections) {
      throw new Error(`Maximum WebSocket connections (${this.config.maxConnections}) reached`);
    }

    // Create new connection
    return this.createConnection(normalizedUrl);
  }

  /**
   * Create a new WebSocket connection
   */
  private async createConnection(url: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const websocket = new WebSocket(url);
      const connection: WebSocketConnection = {
        url,
        websocket,
        isConnected: false,
        lastActivity: Date.now(),
        reconnectAttempts: 0,
      };

      const timeout = setTimeout(() => {
        websocket.close();
        reject(new Error(`Connection timeout after ${this.config.connectionTimeout}ms`));
      }, this.config.connectionTimeout);

      websocket.onopen = () => {
        clearTimeout(timeout);
        connection.isConnected = true;
        connection.lastActivity = Date.now();
        this.connections.set(url, connection);

        // Set up keep-alive ping
        this.setupPingPong(connection);

        // Set up event forwarding
        this.setupEventForwarding(connection);

        resolve(websocket);
      };

      websocket.onclose = (event) => {
        clearTimeout(timeout);
        connection.isConnected = false;

        // Attempt reconnection if not a normal closure
        if (event.code !== 1000 && event.code !== 1001) {
          this.handleReconnection(connection);
        } else {
          // Clean close - remove from connections
          this.removeConnection(url);
        }
      };

      websocket.onerror = (error) => {
        clearTimeout(timeout);
        connection.isConnected = false;
        console.warn(`WebSocket error for ${url}:`, error);
        reject(new Error('WebSocket connection failed'));
      };

      websocket.onmessage = (event) => {
        connection.lastActivity = Date.now();
        // Forward message to any listeners
        this.forwardMessage(url, event);
      };
    });
  }

  /**
   * Set up ping/pong for connection health monitoring
   */
  private setupPingPong(connection: WebSocketConnection): void {
    const ping = () => {
      if (!connection.isConnected || connection.websocket.readyState !== WebSocket.OPEN) {
        return;
      }

      try {
        connection.websocket.send('ping');

        // Set pong timeout
        const pongTimeout = setTimeout(() => {
          console.warn(`Pong timeout for ${connection.url}, closing connection`);
          connection.websocket.close(1000, 'pong timeout');
        }, this.config.pongTimeout);

        this.pongTimeouts.set(connection.url, pongTimeout);

      } catch (error) {
        console.warn(`Ping failed for ${connection.url}:`, error);
        connection.websocket.close(1000, 'ping failed');
      }
    };

    // Set up ping interval
    const pingTimer = setInterval(ping, this.config.pingInterval);
    this.pingTimers.set(connection.url, pingTimer);

    // Handle pong responses
    const originalOnMessage = connection.websocket.onmessage;
    connection.websocket.onmessage = (event) => {
      // Clear pong timeout if we receive any message (assuming it's a pong)
      const pongTimeout = this.pongTimeouts.get(connection.url);
      if (pongTimeout) {
        clearTimeout(pongTimeout);
        this.pongTimeouts.delete(connection.url);
      }

      // Call original handler
      if (originalOnMessage) {
        originalOnMessage.call(connection.websocket, event);
      }
    };
  }

  /**
   * Set up event forwarding for external listeners
   */
  private setupEventForwarding(connection: WebSocketConnection): void {
    // Store original event handlers to preserve them
    const originalOnMessage = connection.websocket.onmessage;
    const originalOnError = connection.websocket.onerror;
    const originalOnClose = connection.websocket.onclose;

    connection.websocket.onmessage = (event) => {
      // Forward to external listeners
      const listeners = this.eventListeners.get(connection.url) || [];
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.warn('Error in WebSocket message listener:', error);
        }
      });

      // Call original handler
      if (originalOnMessage) {
        originalOnMessage.call(connection.websocket, event);
      }
    };

    connection.websocket.onerror = (event) => {
      // Forward to external listeners
      const listeners = this.eventListeners.get(`${connection.url}:error`) || [];
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.warn('Error in WebSocket error listener:', error);
        }
      });

      // Call original handler
      if (originalOnError) {
        originalOnError.call(connection.websocket, event);
      }
    };

    connection.websocket.onclose = (event) => {
      // Forward to external listeners
      const listeners = this.eventListeners.get(`${connection.url}:close`) || [];
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.warn('Error in WebSocket close listener:', error);
        }
      });

      // Call original handler
      if (originalOnClose) {
        originalOnClose.call(connection.websocket, event);
      }
    };
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnection(connection: WebSocketConnection): void {
    if (connection.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.warn(`Max reconnection attempts reached for ${connection.url}`);
      this.removeConnection(connection.url);
      return;
    }

    connection.reconnectAttempts++;

    setTimeout(() => {
      if (this.isDestroyed) return;

      this.createConnection(connection.url).catch(error => {
        console.warn(`Reconnection failed for ${connection.url}:`, error);
        this.handleReconnection(connection);
      });
    }, this.config.reconnectDelay * connection.reconnectAttempts); // Exponential backoff
  }

  /**
   * Forward message to external listeners
   */
  private forwardMessage(url: string, event: MessageEvent): void {
    const listeners = this.eventListeners.get(url) || [];
    listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.warn('Error forwarding WebSocket message:', error);
      }
    });
  }

  /**
   * Add an event listener for a specific connection
   */
  addEventListener(url: string, eventType: 'message' | 'error' | 'close', listener: EventListener): void {
    const key = eventType === 'message' ? url : `${url}:${eventType}`;
    if (!this.eventListeners.has(key)) {
      this.eventListeners.set(key, []);
    }
    this.eventListeners.get(key)!.push(listener);
  }

  /**
   * Remove an event listener
   */
  removeEventListener(url: string, eventType: 'message' | 'error' | 'close', listener: EventListener): void {
    const key = eventType === 'message' ? url : `${url}:${eventType}`;
    const listeners = this.eventListeners.get(key) || [];
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  /**
   * Close a specific connection
   */
  closeConnection(url: string): void {
    const normalizedUrl = this.normalizeUrl(url);
    const connection = this.connections.get(normalizedUrl);

    if (connection) {

      connection.websocket.close(1000, 'manual close');
      this.removeConnection(normalizedUrl);
    }
  }

  /**
   * Remove a connection from tracking
   */
  private removeConnection(url: string): void {
    const connection = this.connections.get(url);
    if (connection) {
      // Clear timers
      const pingTimer = this.pingTimers.get(url);
      if (pingTimer) {
        clearInterval(pingTimer);
        this.pingTimers.delete(url);
      }

      const pongTimeout = this.pongTimeouts.get(url);
      if (pongTimeout) {
        clearTimeout(pongTimeout);
        this.pongTimeouts.delete(url);
      }

      // Clear cleanup timer
      if (connection.cleanupTimer) {
        clearTimeout(connection.cleanupTimer);
        connection.cleanupTimer = undefined;
      }
    }

    this.connections.delete(url);

    // Clear event listeners
    this.eventListeners.delete(url);
    this.eventListeners.delete(`${url}:error`);
    this.eventListeners.delete(`${url}:close`);
  }

  /**
   * Start periodic cleanup of stale connections
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleConnections();
    }, 60000); // Check every minute
  }

  /**
   * Clean up stale connections
   */
  private cleanupStaleConnections(): void {
    if (this.isDestroyed) return;

    const now = Date.now();
    const staleUrls: string[] = [];

    for (const [url, connection] of this.connections) {
      if (now - connection.lastActivity > this.config.staleConnectionThreshold) {

        staleUrls.push(url);
      }
    }

    staleUrls.forEach(url => {
      this.closeConnection(url);
    });
  }

  /**
   * Force cleanup of all connections
   */
  forceCleanup(): void {

    const urls = Array.from(this.connections.keys());
    urls.forEach(url => this.closeConnection(url));
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnections: number;
    activeConnections: number;
    staleConnections: number;
  } {
    const now = Date.now();
    let activeConnections = 0;
    let staleConnections = 0;

    for (const connection of this.connections.values()) {
      if (connection.isConnected) {
        activeConnections++;
        if (now - connection.lastActivity > this.config.staleConnectionThreshold) {
          staleConnections++;
        }
      }
    }

    return {
      totalConnections: this.connections.size,
      activeConnections,
      staleConnections,
    };
  }

  /**
   * Check if a connection is active
   */
  isConnected(url: string): boolean {
    const normalizedUrl = this.normalizeUrl(url);
    const connection = this.connections.get(normalizedUrl);
    return connection?.isConnected ?? false;
  }

  /**
   * Normalize WebSocket URL
   */
  private normalizeUrl(url: string): string {
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

  /**
   * Destroy the manager and close all connections
   */
  destroy(): void {
    if (this.isDestroyed) return;

    this.isDestroyed = true;

    // Clear cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Clear all ping timers
    for (const timer of this.pingTimers.values()) {
      clearInterval(timer);
    }
    this.pingTimers.clear();

    // Clear all pong timeouts
    for (const timeout of this.pongTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.pongTimeouts.clear();

    // Close all connections
    this.forceCleanup();

    // Clear event listeners
    this.eventListeners.clear();
  }
}

// Global WebSocket manager instance
let globalWebSocketManager: WebSocketManager | null = null;

export const getGlobalWebSocketManager = (): WebSocketManager => {
  if (!globalWebSocketManager) {
    globalWebSocketManager = new WebSocketManager();
  }
  return globalWebSocketManager;
};

export const destroyGlobalWebSocketManager = (): void => {
  if (globalWebSocketManager) {
    globalWebSocketManager.destroy();
    globalWebSocketManager = null;
  }
};

import React, { ReactElement } from "react";
import { render, RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "../routeTree";
import { vi } from "vitest";

// Create a mock router for testing
const createMockRouter = () => {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    context: {
      queryClient: new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            gcTime: 0,
          },
          mutations: {
            retry: false,
          },
        },
      }),
    },
  });
};

// Custom render function that includes providers
interface AllTheProvidersProps {
  children: React.ReactNode;
  queryClient?: QueryClient;
  router?: ReturnType<typeof createMockRouter>;
}

const AllTheProviders: React.FC<AllTheProvidersProps> = ({
  children,
  queryClient,
  router,
}) => {
  const testQueryClient =
    queryClient ||
    new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
        mutations: {
          retry: false,
        },
      },
    });

  const testRouter = router || createMockRouter();

  return (
    <QueryClientProvider client={testQueryClient}>
      <RouterProvider router={testRouter}>{children}</RouterProvider>
    </QueryClientProvider>
  );
};

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  queryClient?: QueryClient;
  router?: ReturnType<typeof createMockRouter>;
}

const customRender = (ui: ReactElement, options: CustomRenderOptions = {}) => {
  const { queryClient, router, ...renderOptions } = options;

  return render(ui, {
    wrapper: (props) => (
      <AllTheProviders queryClient={queryClient} router={router} {...props} />
    ),
    ...renderOptions,
  });
};

// Re-export everything
export * from "@testing-library/react";
export { customRender as render };

// Test utilities for mocking
export const createTestQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
    logger: {
      log: () => {},
      warn: () => {},
      error: () => {},
    },
  });
};

export const createTestRouter = () => {
  return createMockRouter();
};

// Mock WebSocket manager for tests
export class MockWebSocketManager {
  private subscriptions = new Map();

  subscribe(subscription: any) {
    this.subscriptions.set(subscription.id, subscription);
    return () => {
      this.subscriptions.delete(subscription.id);
    };
  }

  updateSubscription(id: string, updates: any) {
    const existing = this.subscriptions.get(id);
    if (existing) {
      this.subscriptions.set(id, { ...existing, ...updates });
    }
  }

  unsubscribe(id: string) {
    this.subscriptions.delete(id);
  }

  destroy() {
    this.subscriptions.clear();
  }

  // Test utilities
  getSubscription(id: string) {
    return this.subscriptions.get(id);
  }

  getSubscriptionCount() {
    return this.subscriptions.size;
  }

  simulateEvent(subscriptionId: string, event: any) {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription && subscription.onEvent) {
      subscription.onEvent(event);
    }
  }
}

// Mock Nostr context for tests
export const mockNostrContext = {
  nostrClient: {
    subscribeMany: vi.fn(() => ({
      close: vi.fn(),
    })),
  },
  pubkey: "test-pubkey",
  loginMethod: "nip07",
  nsecPersistedThisSession: false,
  listSavedAccounts: vi.fn(() => []),
  signInWithNip07: vi.fn(),
  signInWithNsec: vi.fn(),
  logout: vi.fn(),
};

// Helper to wait for async operations in tests
export const waitForAsync = (ms = 0) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// Helper to flush all pending promises
export const flushPromises = () => {
  return new Promise((resolve) => setImmediate(resolve));
};

// Memory usage monitoring for tests
export class TestMemoryMonitor {
  private measurements: number[] = [];

  measure() {
    // In a real implementation, you might use performance.measureUserAgentSpecificMemory
    // For tests, we'll simulate memory usage
    const usage = Math.random() * 100; // Mock memory usage
    this.measurements.push(usage);
    return usage;
  }

  getAverage() {
    return this.measurements.length > 0
      ? this.measurements.reduce((a, b) => a + b, 0) / this.measurements.length
      : 0;
  }

  getPeak() {
    return Math.max(...this.measurements, 0);
  }

  reset() {
    this.measurements = [];
  }
}

// Mock localStorage for tests that don't have it
export const mockLocalStorage = {
  store: {} as Record<string, string>,

  getItem(key: string) {
    return this.store[key] || null;
  },

  setItem(key: string, value: string) {
    this.store[key] = value;
  },

  removeItem(key: string) {
    delete this.store[key];
  },

  clear() {
    this.store = {};
  },

  key(index: number) {
    const keys = Object.keys(this.store);
    return keys[index] || null;
  },

  get length() {
    return Object.keys(this.store).length;
  },
};

// Mock sessionStorage for tests
export const mockSessionStorage = {
  store: {} as Record<string, string>,

  getItem(key: string) {
    return this.store[key] || null;
  },

  setItem(key: string, value: string) {
    this.store[key] = value;
  },

  removeItem(key: string) {
    delete this.store[key];
  },

  clear() {
    this.store = {};
  },

  key(index: number) {
    const keys = Object.keys(this.store);
    return keys[index] || null;
  },

  get length() {
    return Object.keys(this.store).length;
  },
};

// Setup function for tests that need to mock global objects
export const setupTestEnvironment = () => {
  // Mock localStorage
  Object.defineProperty(window, "localStorage", {
    value: mockLocalStorage,
    writable: true,
  });

  // Mock sessionStorage
  Object.defineProperty(window, "sessionStorage", {
    value: mockSessionStorage,
    writable: true,
  });

  // Mock requestIdleCallback
  Object.defineProperty(window, "requestIdleCallback", {
    value: (callback: IdleRequestCallback) => setTimeout(callback, 0),
    writable: true,
  });

  Object.defineProperty(window, "cancelIdleCallback", {
    value: (id: number) => clearTimeout(id),
    writable: true,
  });

  // Mock IntersectionObserver for virtual scrolling tests
  Object.defineProperty(window, "IntersectionObserver", {
    value: class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {}
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    writable: true,
  });

  // Mock ResizeObserver
  if (!window.ResizeObserver) {
    Object.defineProperty(window, "ResizeObserver", {
      value: class MockResizeObserver {
        constructor(callback: ResizeObserverCallback) {}
        observe() {}
        unobserve() {}
        disconnect() {}
      },
      writable: true,
      configurable: true,
    });
  }
};

// Cleanup function for tests
export const cleanupTestEnvironment = () => {
  mockLocalStorage.clear();
  mockSessionStorage.clear();
};

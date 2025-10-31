import React from "react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRelayManager } from "../useRelayManager";
import { RelayConnectionPool } from "../../utils/nostr/relayConnectionPool";
import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_RELAY_URLS,
  DEFAULT_RELAY_PERMISSIONS,
} from "../../utils/nostr/constants";

// Mock RelayConnectionPool
vi.mock("../../utils/nostr/relayConnectionPool", () => ({
  RelayConnectionPool: class RelayConnectionPoolMock {
    getConnection = vi.fn();
    close = vi.fn();
    destroy = vi.fn();
  },
}));

// Create a wrapper with QueryClient provider for tests
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useRelayManager - default permissions", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  it("should set correct default permissions for known relays", () => {
    const mockClient = new RelayConnectionPool();

    const { result } = renderHook(
      () =>
        useRelayManager({
          nostrClient: mockClient,
          initialRelays: DEFAULT_RELAY_URLS,
        }),
      { wrapper: createWrapper() }
    );

    // Check that the correct permissions are set based on constants
    DEFAULT_RELAY_PERMISSIONS.forEach((permission, url) => {
      expect(result.current.getRelayPermission(url)).toBe(permission);
    });
  });

  it("should include default relays for new users", () => {
    const mockClient = new RelayConnectionPool();

    const { result } = renderHook(
      () =>
        useRelayManager({
          nostrClient: mockClient,
          initialRelays: DEFAULT_RELAY_URLS,
        }),
      { wrapper: createWrapper() }
    );

    // Check that default relays are included
    expect(result.current.relayUrls).toContain("wss://nos.lol");
    expect(result.current.relayUrls).toContain("wss://relay.damus.io");
    expect(result.current.relayUrls).toContain("wss://relay.primal.net");
    expect(result.current.relayUrls).toContain("wss://nostr.mom");
    expect(result.current.relayUrls).toContain("wss://purplepag.es");
  });

  it("should filter read relays correctly based on permissions", () => {
    const mockClient = new RelayConnectionPool();

    const { result } = renderHook(
      () =>
        useRelayManager({
          nostrClient: mockClient,
          initialRelays: DEFAULT_RELAY_URLS,
        }),
      { wrapper: createWrapper() }
    );

    const readRelays = result.current.readRelays;

    // Check read relays based on permissions from constants
    DEFAULT_RELAY_PERMISSIONS.forEach((permission, url) => {
      if (permission === "read" || permission === "readwrite") {
        expect(readRelays).toContain(url);
      } else {
        expect(readRelays).not.toContain(url);
      }
    });
  });

  it("should filter write relays correctly based on permissions", () => {
    const mockClient = new RelayConnectionPool();

    const { result } = renderHook(
      () =>
        useRelayManager({
          nostrClient: mockClient,
          initialRelays: DEFAULT_RELAY_URLS,
        }),
      { wrapper: createWrapper() }
    );

    const writeRelays = result.current.writeRelays;

    // Check write relays based on permissions from constants
    DEFAULT_RELAY_PERMISSIONS.forEach((permission, url) => {
      if (
        permission === "write" ||
        permission === "readwrite" ||
        permission === "indexer"
      ) {
        expect(writeRelays).toContain(url);
      } else {
        expect(writeRelays).not.toContain(url);
      }
    });
  });
});

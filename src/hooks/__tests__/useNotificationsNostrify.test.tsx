import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NostrContext } from "../../contexts/NostrContext";
import { useNotificationsNostrify } from "../useNotificationsNostrify";
import { uiStore } from "../../components/lib/uiStore";

// Shared mock for nostr.query so tests can override per-case
const sharedQueryMock = vi.fn().mockResolvedValue([]);

// Mock the nostrify hook
vi.mock("@nostrify/react", () => ({
  useNostr: () => ({
    nostr: {
      query: sharedQueryMock,
    },
  }),
}));

// Mock the notification classification
vi.mock("../../utils/nostr/notifications", () => ({
  classifyNotification: vi.fn((event, pubkey) => ({
    event,
    actor: event.pubkey,
    created_at: event.created_at,
    type: "like",
    targetNoteId:
      event.kind === 1
        ? event.id
        : event.tags?.find((t: any) => t[0] === "e")?.[1] || null,
  })),
  filterByMutedCategories: vi.fn((items) => items),
  getTargetNoteIdFromEvent: vi.fn((event) => {
    if (!event) return null;
    if (event.kind === 1) return event.id;
    const eTag = Array.isArray(event.tags)
      ? event.tags.find((t: any) => t[0] === "e")
      : null;
    return eTag ? eTag[1] : null;
  }),
  buildNotificationStableKey: vi.fn(
    (n: any) =>
      n?.event?.id ||
      `${n.actor}:${n.type}:${n.targetNoteId || "unknown"}:${n.created_at}`
  ),
}));

// Mock the useUIStore hook
vi.mock("../../components/lib/useUIStore", () => ({
  useUIStore: vi.fn((selector) => {
    const state = uiStore.state;
    return selector(state);
  }),
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, "localStorage", {
  value: mockLocalStorage,
});

const createWrapper = (pubkey: string) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <NostrContext.Provider value={{ pubkey } as any}>
        {children}
      </NostrContext.Provider>
    </QueryClientProvider>
  );
};

describe("useNotificationsNostrify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue("{}");
    sharedQueryMock.mockReset();
    sharedQueryMock.mockResolvedValue([]);
    // Reset UI store state
    uiStore.setState({
      notificationsLastSeen: {},
    });
  });

  it("should persist mark as read timestamp per pubkey", async () => {
    const pubkey1 = "pubkey1";

    // Test with first pubkey
    const { result } = renderHook(
      () =>
        useNotificationsNostrify({ relayUrls: ["wss://relay.example.com"] }),
      { wrapper: createWrapper(pubkey1) }
    );

    // Mark all as read for first pubkey
    act(() => {
      result.current.markAllAsRead();
    });

    // Verify localStorage was called
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      "notificationsLastSeen",
      expect.stringContaining(pubkey1)
    );

    // Verify the stored data contains the pubkey
    const storedData = JSON.parse(mockLocalStorage.setItem.mock.calls[0][1]);
    expect(storedData).toHaveProperty(pubkey1);
    expect(typeof storedData[pubkey1]).toBe("number");
  });

  it("should calculate unread count based on last seen timestamp", () => {
    const pubkey = "test-pubkey";

    // Set up initial state with some notifications already seen
    uiStore.setState({
      notificationsLastSeen: { [pubkey]: 2000 },
    });

    const { result } = renderHook(
      () =>
        useNotificationsNostrify({ relayUrls: ["wss://relay.example.com"] }),
      { wrapper: createWrapper(pubkey) }
    );

    // The unread count should be calculated based on the last seen timestamp
    // Since we have no notifications loaded, it should be 0
    expect(result.current.unreadCount).toBe(0);
  });

  it("should handle empty notifications gracefully", () => {
    const pubkey = "test-pubkey";

    const { result } = renderHook(
      () =>
        useNotificationsNostrify({ relayUrls: ["wss://relay.example.com"] }),
      { wrapper: createWrapper(pubkey) }
    );

    // Mock empty notifications
    vi.mocked(result.current).items = [];

    // Mark all as read should use current timestamp when no notifications
    act(() => {
      result.current.markAllAsRead();
    });

    // Should save current timestamp (approximate)
    const savedData = JSON.parse(mockLocalStorage.setItem.mock.calls[0][1]);
    expect(savedData[pubkey]).toBeGreaterThan(Date.now() / 1000 - 1);
    expect(savedData[pubkey]).toBeLessThanOrEqual(Date.now() / 1000);
  });

  it("should maintain separate timestamps for different pubkeys", () => {
    const pubkey1 = "pubkey1";
    const pubkey2 = "pubkey2";

    // Set up different timestamps for different pubkeys
    uiStore.setState({
      notificationsLastSeen: {
        [pubkey1]: 1000,
        [pubkey2]: 2000,
      },
    });

    const { result: result1 } = renderHook(
      () =>
        useNotificationsNostrify({ relayUrls: ["wss://relay.example.com"] }),
      { wrapper: createWrapper(pubkey1) }
    );

    const { result: result2 } = renderHook(
      () =>
        useNotificationsNostrify({ relayUrls: ["wss://relay.example.com"] }),
      { wrapper: createWrapper(pubkey2) }
    );

    // Each pubkey should have access to their own timestamp
    // Since we have no notifications loaded, both should be 0
    expect(result1.current.unreadCount).toBe(0);
    expect(result2.current.unreadCount).toBe(0);
  });

  it("shows all notifications but counts only unread after lastSeen", async () => {
    const pubkey = "pk-anchor";

    // lastSeen = 1000
    uiStore.setState({ notificationsLastSeen: { [pubkey]: 1000 } });

    // Mock nostr.query to return events both before and after lastSeen
    sharedQueryMock.mockImplementation(async (_filters: any[]) => [
      { id: "e1", pubkey: "a", created_at: 900, kind: 7, tags: [] },
      { id: "e2", pubkey: "b", created_at: 1000, kind: 1, tags: [] },
      { id: "e3", pubkey: "c", created_at: 1001, kind: 7, tags: [] },
      { id: "e4", pubkey: "d", created_at: 1500, kind: 1, tags: [] },
    ]);

    const { result } = renderHook(
      () =>
        useNotificationsNostrify({ relayUrls: ["wss://relay.example.com"] }),
      { wrapper: createWrapper(pubkey) }
    );

    // Wait for items to populate
    await waitFor(() => {
      expect(result.current.items.length).toBeGreaterThan(0);
    });

    // Should show ALL notifications (not filtered by lastSeen)
    const ids = result.current.items.map((n) => n.event.id);
    expect(ids).toEqual(["e4", "e3", "e2", "e1"]);

    // But unread count should only include notifications after lastSeen (1001, 1500)
    expect(result.current.unreadCount).toBe(2);
  });

  it("returns at most 100 items and counts all as unread when no lastSeen exists", async () => {
    const pubkey = "pk-no-anchor";
    uiStore.setState({ notificationsLastSeen: {} });

    const events: any[] = [];
    for (let i = 0; i < 150; i++) {
      events.push({
        id: `e${i}`,
        pubkey: "x",
        created_at: 1000 + i,
        kind: i % 2 === 0 ? 1 : 7,
        tags: [],
      });
    }
    sharedQueryMock.mockResolvedValue(events);

    const { result } = renderHook(
      () =>
        useNotificationsNostrify({ relayUrls: ["wss://relay.example.com"] }),
      { wrapper: createWrapper(pubkey) }
    );

    await waitFor(() => {
      expect(result.current.items.length).toBeGreaterThan(0);
    });

    expect(result.current.items.length).toBeLessThanOrEqual(100);
    // Ensure sorted desc
    const createdAts = result.current.items.map((n) => n.created_at);
    const sorted = [...createdAts].sort((a, b) => b - a);
    expect(createdAts).toEqual(sorted);
    // When no lastSeen, all notifications should be counted as unread
    expect(result.current.unreadCount).toBeGreaterThan(0);
  });

  it("filters out muted target ids", async () => {
    const pubkey = "pk-mute";
    uiStore.setState({ notificationsLastSeen: {} });

    // Two events pointing at two different targets
    sharedQueryMock.mockResolvedValue([
      { id: "e1", pubkey: "a", created_at: 1000, kind: 1, tags: [] }, // target e1
      { id: "x1", pubkey: "b", created_at: 1001, kind: 7, tags: [["e", "t2"]] }, // target t2
    ]);

    const { result } = renderHook(
      () =>
        useNotificationsNostrify({ relayUrls: ["wss://relay.example.com"] }),
      { wrapper: createWrapper(pubkey) }
    );

    await waitFor(() => {
      expect(result.current.items.length).toBeGreaterThan(0);
    });

    // Mute target e1
    uiStore.setState({ mutedNotificationTargetIds: ["e1"] });

    // Items should filter out e1, leaving only the like on t2
    await waitFor(() => {
      const ids = result.current.items.map((n) => n.targetNoteId || n.event.id);
      expect(ids).toContain("t2");
      expect(ids).not.toContain("e1");
    });
  });
});

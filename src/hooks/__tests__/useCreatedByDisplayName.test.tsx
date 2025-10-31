import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useCreatedByDisplayName } from "../useCreatedByDisplayName";
import { nip19 } from "nostr-tools";

// Mock the useMetadataQuery hook
vi.mock("../useMetadataQuery", () => ({
  useMetadataQuery: vi.fn(),
}));

describe("useCreatedByDisplayName", () => {
  let queryClient: QueryClient;
  const mockGetDisplayNameForPubkey = vi.fn();
  const testPubkey =
    "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  const testRelayUrls = ["wss://relay.example.com"];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    mockGetDisplayNameForPubkey.mockClear();

    // Clear and reset the mock
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("should return existing display name when available", async () => {
    const existingDisplayName = "Alice";
    mockGetDisplayNameForPubkey.mockReturnValue(existingDisplayName);

    // Mock the useMetadataQuery hook
    const { useMetadataQuery } = await import("../useMetadataQuery");
    vi.mocked(useMetadataQuery).mockReturnValue({
      data: null,
      isPending: false,
    });

    const { result } = renderHook(
      () =>
        useCreatedByDisplayName({
          pubkey: testPubkey,
          relayUrls: testRelayUrls,
          getDisplayNameForPubkey: mockGetDisplayNameForPubkey,
        }),
      { wrapper }
    );

    expect(result.current.displayText).toBe(existingDisplayName);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasDisplayName).toBe(true);
    expect(result.current.npub).toBe(nip19.npubEncode(testPubkey));
  });

  it("should fetch metadata when no display name exists", async () => {
    const npub = nip19.npubEncode(testPubkey);
    mockGetDisplayNameForPubkey.mockReturnValue(npub); // Same as npub, so no display name

    // Mock the useMetadataQuery hook
    const { useMetadataQuery } = await import("../useMetadataQuery");
    vi.mocked(useMetadataQuery).mockReturnValue({
      data: null,
      isPending: true,
    });

    const { result } = renderHook(
      () =>
        useCreatedByDisplayName({
          pubkey: testPubkey,
          relayUrls: testRelayUrls,
          getDisplayNameForPubkey: mockGetDisplayNameForPubkey,
        }),
      { wrapper }
    );

    expect(result.current.displayText).toBe(null);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasDisplayName).toBe(false);
    expect(vi.mocked(useMetadataQuery)).toHaveBeenCalledWith({
      pubkeyHex: testPubkey,
      relayUrls: testRelayUrls,
      enabled: true,
    });
  });

  it("should use metadata display name when fetched", async () => {
    const npub = nip19.npubEncode(testPubkey);
    mockGetDisplayNameForPubkey.mockReturnValue(npub);

    const mockMetadata = {
      metadata: {
        display_name: "Bob",
        name: "Bob Smith",
      },
    };

    // Mock the useMetadataQuery hook
    const { useMetadataQuery } = await import("../useMetadataQuery");
    vi.mocked(useMetadataQuery).mockReturnValue({
      data: mockMetadata,
      isPending: false,
    });

    const { result } = renderHook(
      () =>
        useCreatedByDisplayName({
          pubkey: testPubkey,
          relayUrls: testRelayUrls,
          getDisplayNameForPubkey: mockGetDisplayNameForPubkey,
        }),
      { wrapper }
    );

    expect(result.current.displayText).toBe("Bob");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasDisplayName).toBe(false);
  });

  it("should fall back to name when display_name is not available", async () => {
    const npub = nip19.npubEncode(testPubkey);
    mockGetDisplayNameForPubkey.mockReturnValue(npub);

    const mockMetadata = {
      metadata: {
        name: "Charlie",
        // No display_name
      },
    };

    // Mock the useMetadataQuery hook
    const { useMetadataQuery } = await import("../useMetadataQuery");
    vi.mocked(useMetadataQuery).mockReturnValue({
      data: mockMetadata,
      isPending: false,
    });

    const { result } = renderHook(
      () =>
        useCreatedByDisplayName({
          pubkey: testPubkey,
          relayUrls: testRelayUrls,
          getDisplayNameForPubkey: mockGetDisplayNameForPubkey,
        }),
      { wrapper }
    );

    expect(result.current.displayText).toBe("Charlie");
  });

  it("should fall back to npub when no metadata is available", async () => {
    const npub = nip19.npubEncode(testPubkey);
    mockGetDisplayNameForPubkey.mockReturnValue(npub);

    // Mock the useMetadataQuery hook
    const { useMetadataQuery } = await import("../useMetadataQuery");
    vi.mocked(useMetadataQuery).mockReturnValue({
      data: { metadata: null },
      isPending: false,
    });

    const { result } = renderHook(
      () =>
        useCreatedByDisplayName({
          pubkey: testPubkey,
          relayUrls: testRelayUrls,
          getDisplayNameForPubkey: mockGetDisplayNameForPubkey,
        }),
      { wrapper }
    );

    expect(result.current.displayText).toBe(npub);
  });

  it("should truncate npub on mobile when no display name", async () => {
    const npub = nip19.npubEncode(testPubkey);
    mockGetDisplayNameForPubkey.mockReturnValue(npub);

    // Mock the useMetadataQuery hook
    const { useMetadataQuery } = await import("../useMetadataQuery");
    vi.mocked(useMetadataQuery).mockReturnValue({
      data: { metadata: null },
      isPending: false,
    });

    const { result } = renderHook(
      () =>
        useCreatedByDisplayName({
          pubkey: testPubkey,
          relayUrls: testRelayUrls,
          isMobile: true,
          getDisplayNameForPubkey: mockGetDisplayNameForPubkey,
        }),
      { wrapper }
    );

    expect(result.current.displayText).toBe(
      `${npub.slice(0, 8)}...${npub.slice(-6)}`
    );
  });

  it("should not fetch metadata when display name already exists", async () => {
    const existingDisplayName = "David";
    mockGetDisplayNameForPubkey.mockReturnValue(existingDisplayName);

    // Mock the useMetadataQuery hook
    const { useMetadataQuery } = await import("../useMetadataQuery");
    vi.mocked(useMetadataQuery).mockReturnValue({
      data: null,
      isPending: false,
    });

    const { result } = renderHook(
      () =>
        useCreatedByDisplayName({
          pubkey: testPubkey,
          relayUrls: testRelayUrls,
          getDisplayNameForPubkey: mockGetDisplayNameForPubkey,
        }),
      { wrapper }
    );

    expect(vi.mocked(useMetadataQuery)).toHaveBeenCalledWith({
      pubkeyHex: null,
      relayUrls: testRelayUrls,
      enabled: false,
    });
    expect(result.current.displayText).toBe(existingDisplayName);
  });

  it("should not fetch metadata when no relay URLs are provided", async () => {
    const npub = nip19.npubEncode(testPubkey);
    mockGetDisplayNameForPubkey.mockReturnValue(npub);

    // Mock the useMetadataQuery hook
    const { useMetadataQuery } = await import("../useMetadataQuery");
    vi.mocked(useMetadataQuery).mockReturnValue({
      data: null,
      isPending: false,
    });

    const { result } = renderHook(
      () =>
        useCreatedByDisplayName({
          pubkey: testPubkey,
          relayUrls: [],
          getDisplayNameForPubkey: mockGetDisplayNameForPubkey,
        }),
      { wrapper }
    );

    expect(vi.mocked(useMetadataQuery)).toHaveBeenCalledWith({
      pubkeyHex: testPubkey,
      relayUrls: [],
      enabled: false,
    });
    expect(result.current.displayText).toBe(npub);
  });
});

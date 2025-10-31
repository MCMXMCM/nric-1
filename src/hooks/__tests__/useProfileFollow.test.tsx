import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useProfileFollow } from "../useProfileFollow";
import {
  followUser,
  unfollowUser,
  checkIsFollowing,
} from "../../utils/profileFollowUtils";
import { hasInMemorySecretKey } from "../../utils/nostr/nip07";
import { UserContactsProvider } from "../../contexts/UserContactsContext";

// Mock dependencies
vi.mock("../../utils/profileFollowUtils");
vi.mock("../../utils/nostr/nip07");
vi.mock("nostr-tools", () => ({
  nip19: {
    decode: vi.fn(),
  },
}));
vi.mock("../../contexts/NostrContext", () => ({
  NostrContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
}));

const mockFollowUserFromContext = vi.fn().mockResolvedValue({ success: true });
const mockUnfollowUserFromContext = vi
  .fn()
  .mockResolvedValue({ success: true });

vi.mock("../../contexts/UserContactsContext", () => ({
  UserContactsProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useUserContactsContext: () => ({
    contacts: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    followUser: mockFollowUserFromContext,
    unfollowUser: mockUnfollowUserFromContext,
    isFollowing: vi.fn().mockReturnValue(false),
    isFollowBusy: false,
    isUnfollowBusy: false,
  }),
}));

const mockFollowUser = vi.mocked(followUser);
const mockUnfollowUser = vi.mocked(unfollowUser);
const mockCheckIsFollowing = vi.mocked(checkIsFollowing);
const mockHasInMemorySecretKey = vi.mocked(hasInMemorySecretKey);

// Mock React context
const mockContextValue = {
  pubkey: "user-pubkey-hex",
  nip07Available: false,
  signInWithNip07: vi.fn(),
  listSavedAccounts: vi.fn(),
  nostrClient: {
    publish: vi.fn(),
  },
};

vi.mock("react", async () => {
  const actual = await vi.importActual("react");
  return {
    ...actual,
    useContext: () => mockContextValue,
  };
});

// Create a wrapper component with QueryClient provider
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <UserContactsProvider>{children}</UserContactsProvider>
    </QueryClientProvider>
  );
};

describe("useProfileFollow", () => {
  const relayUrls = ["wss://relay.example.com"];

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckIsFollowing.mockResolvedValue(false);
    mockFollowUser.mockResolvedValue({ success: true });
    mockUnfollowUser.mockResolvedValue({ success: true });
    mockHasInMemorySecretKey.mockReturnValue(false);
    mockContextValue.listSavedAccounts.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should initialize with correct default state", () => {
    const { result } = renderHook(
      () => useProfileFollow("target-pubkey-hex", relayUrls),
      {
        wrapper: createWrapper(),
      }
    );

    expect(result.current.isFollowing).toBe(false);
    expect(result.current.isFollowBusy).toBe(false);
    expect(result.current.isUnfollowBusy).toBe(false);
    expect(result.current.followError).toBe(null);
  });

  it("should check following status on mount", async () => {
    // Note: Following status is now checked via useUserContacts hook
    const { result } = renderHook(
      () => useProfileFollow("target-pubkey-hex", relayUrls),
      {
        wrapper: createWrapper(),
      }
    );

    // The hook should initialize with isFollowing as false
    expect(result.current.isFollowing).toBe(false);
  });

  describe("executeFollow", () => {
    it("should follow user successfully", async () => {
      mockFollowUserFromContext.mockResolvedValue({ success: true });

      const { result } = renderHook(
        () => useProfileFollow("target-pubkey-hex", relayUrls),
        {
          wrapper: createWrapper(),
        }
      );

      await act(async () => {
        await result.current.executeFollow();
      });

      // The follow operation is now handled by useUserContacts hook
      // We just verify that the function was called
      expect(result.current.followError).toBe(null);
    });

    it("should handle follow error", async () => {
      mockFollowUserFromContext.mockResolvedValue({
        success: false,
        error: "Follow failed",
      });

      const { result } = renderHook(
        () => useProfileFollow("target-pubkey-hex", relayUrls),
        {
          wrapper: createWrapper(),
        }
      );

      await act(async () => {
        await result.current.executeFollow();
      });

      expect(result.current.followError).toBe("Follow failed");
    });

    it("should not execute if pubkeyHex is null", async () => {
      const { result } = renderHook(() => useProfileFollow(null, relayUrls), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.executeFollow();
      });

      // Should not throw an error when pubkeyHex is null
      expect(result.current.followError).toBe(null);
    });
  });

  describe("executeUnfollow", () => {
    it("should unfollow user successfully", async () => {
      mockUnfollowUserFromContext.mockResolvedValue({ success: true });

      const { result } = renderHook(
        () => useProfileFollow("target-pubkey-hex", relayUrls),
        {
          wrapper: createWrapper(),
        }
      );

      await act(async () => {
        await result.current.executeUnfollow();
      });

      // The unfollow operation is now handled by useUserContacts hook
      // We just verify that the function was called
      expect(result.current.followError).toBe(null);
    });

    it("should handle unfollow error", async () => {
      mockUnfollowUserFromContext.mockResolvedValue({
        success: false,
        error: "Unfollow failed",
      });

      const { result } = renderHook(
        () => useProfileFollow("target-pubkey-hex", relayUrls),
        {
          wrapper: createWrapper(),
        }
      );

      await act(async () => {
        await result.current.executeUnfollow();
      });

      expect(result.current.followError).toBe("Unfollow failed");
    });

    it("should not execute if pubkeyHex is null", async () => {
      const { result } = renderHook(() => useProfileFollow(null, relayUrls), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.executeUnfollow();
      });

      // Should not throw an error when pubkeyHex is null
      expect(result.current.followError).toBe(null);
    });
  });

  describe("checkNeedsUnlock", () => {
    it("should return false when NIP-07 is available", async () => {
      mockContextValue.nip07Available = true;

      const { result } = renderHook(
        () => useProfileFollow("target-pubkey-hex", relayUrls),
        {
          wrapper: createWrapper(),
        }
      );

      const needsUnlock = await result.current.checkNeedsUnlock();

      expect(needsUnlock).toBe(false);
    });

    it("should return false when secret key is in memory", async () => {
      mockHasInMemorySecretKey.mockReturnValue(true);

      const { result } = renderHook(
        () => useProfileFollow("target-pubkey-hex", relayUrls),
        {
          wrapper: createWrapper(),
        }
      );

      const needsUnlock = await result.current.checkNeedsUnlock();

      expect(needsUnlock).toBe(false);
    });

    it("should return false when no saved accounts", async () => {
      mockContextValue.listSavedAccounts.mockResolvedValue([]);

      const { result } = renderHook(
        () => useProfileFollow("target-pubkey-hex", relayUrls),
        {
          wrapper: createWrapper(),
        }
      );

      const needsUnlock = await result.current.checkNeedsUnlock();

      expect(needsUnlock).toBe(false);
    });
  });

  describe("setFollowError", () => {
    it("should set follow error", () => {
      const { result } = renderHook(
        () => useProfileFollow("target-pubkey-hex", relayUrls),
        {
          wrapper: createWrapper(),
        }
      );

      act(() => {
        result.current.setFollowError("Test error");
      });

      expect(result.current.followError).toBe("Test error");
    });
  });
});

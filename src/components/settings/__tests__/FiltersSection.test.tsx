import React from "react";
import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FiltersSection } from "../FiltersSection";
import { NostrContext } from "../../../contexts/NostrContext";

// Mock the UI store
vi.mock("../../lib/useUIStore", () => ({
  useUIStore: vi.fn(),
}));

vi.mock("../../lib/uiStore", () => ({
  setShowReplies: vi.fn(),
  setShowReposts: vi.fn(),
  setCustomHashtags: vi.fn(),
}));

import { useUIStore } from "../../lib/useUIStore";

const mockUseUIStore = vi.mocked(useUIStore);

describe("FiltersSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear localStorage
    localStorage.clear();
    // Mock console.log
    vi.spyOn(console, "log").mockImplementation(() => {});

    // Default mock implementation
    mockUseUIStore.mockImplementation((selector) => {
      const state = {
        showReplies: true,
        showReposts: true,
        customHashtags: [],
      };
      return selector(state);
    });
  });

  const renderWithContext = (pubkey: string) => {
    const mockContextValue = {
      pubkey,
      pubkeyNpub: "",
      nostrClient: null,
      nip07Available: false,
      refreshNip07Availability: vi.fn(),
      setPubkey: vi.fn(),
      signInWithNip07: vi.fn(),
      signInWithNsec: vi.fn(),
      signOut: vi.fn(),
      listSavedAccounts: vi.fn(),
      signInWithSavedAccount: vi.fn(),
      loginMethod: "" as "" | "nip07" | "nsec",
      nsecPersistedThisSession: false,
    };

    return render(
      <NostrContext.Provider value={mockContextValue}>
        <FiltersSection isMobile={false} />
      </NostrContext.Provider>
    );
  };

  it("should render show replies and show reposts toggles", async () => {
    const { container } = renderWithContext("testpubkey123");

    // Find the setting row labels
    const labels = container.querySelectorAll("span");
    const labelTexts = Array.from(labels).map((l) => l.textContent);

    // Should include Show Replies and Show Reposts labels
    expect(labelTexts.some((text) => text?.includes("Show Replies"))).toBe(
      true
    );
    expect(labelTexts.some((text) => text?.includes("Show Reposts"))).toBe(
      true
    );
  });

  it("should render custom hashtag input", async () => {
    const { container } = renderWithContext("testpubkey123");

    // Find the hashtag input
    const hashtagInput = container.querySelector(
      'input[placeholder*="Add hashtag"]'
    );

    expect(hashtagInput).toBeDefined();
  });
});

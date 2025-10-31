import React from "react";
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useNostrOperations } from "../useNostrOperations";
import { NostrContext } from "../../contexts/NostrContext";

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <NostrContext.Provider value={{ nostrClient: {} } as any}>
    {children}
  </NostrContext.Provider>
);

describe("useNostrOperations - long form mode filter", () => {
  it("uses kind 30023 when longFormMode is true", () => {
    const { result } = renderHook(
      () =>
        useNostrOperations({
          isPageVisible: true,
          isFetchingPage: false,
          isRateLimited: false,
          setIsRateLimited: () => {},
          setIsInitialized: () => {},
          notes: [],
          setNotes: () => {},
          currentIndex: 0,
          updateCurrentIndex: () => {},
          setCurrentIndex: () => {},
          displayIndex: 1,
          setDisplayIndex: () => {},
          setHasMorePages: () => {},
          setIsFetchingPage: () => {},
          metadata: {},
          setMetadata: () => {},
          setContacts: () => {},
          setIsLoadingContacts: () => {},
          setContactLoadError: () => {},
          setContactStatus: () => {},
          setCacheStats: () => {},
          showReplies: true,
          showReposts: true,
          nsfwBlock: true,
          customHashtags: [],
          longFormMode: true,
          contacts: [],
          mutedPubkeys: [],
          isMobile: false,
          isCheckingForNewNotes: false,
          setIsCheckingForNewNotes: () => {},
          newNotesFound: 0,
          setNewNotesFound: () => {},
          showNoNewNotesMessage: false,
          setShowNoNewNotesMessage: () => {},
          relayUrls: ["wss://example"],
          onNoRelays: () => {},
          fetchDisplayNames: async () => {},
          addDisplayNamesFromMetadata: () => {},
          getPubkeysNeedingFetch: () => [],
          queryClient: {} as any,
        } as any),
      { wrapper }
    );

    const filter = result.current.buildNotesFilter();
    expect((filter as any).kinds).toEqual([30023]);
  });

  it("uses kind 1 when longFormMode is false", () => {
    const { result } = renderHook(
      () =>
        useNostrOperations({
          isPageVisible: true,
          isFetchingPage: false,
          isRateLimited: false,
          setIsRateLimited: () => {},
          setIsInitialized: () => {},
          notes: [],
          setNotes: () => {},
          currentIndex: 0,
          updateCurrentIndex: () => {},
          setCurrentIndex: () => {},
          displayIndex: 1,
          setDisplayIndex: () => {},
          setHasMorePages: () => {},
          setIsFetchingPage: () => {},
          metadata: {},
          setMetadata: () => {},
          setContacts: () => {},
          setIsLoadingContacts: () => {},
          setContactLoadError: () => {},
          setContactStatus: () => {},
          setCacheStats: () => {},
          showReplies: true,
          showReposts: true,
          nsfwBlock: true,
          customHashtags: [],
          longFormMode: false,
          contacts: [],
          mutedPubkeys: [],
          isMobile: false,
          isCheckingForNewNotes: false,
          setIsCheckingForNewNotes: () => {},
          newNotesFound: 0,
          setNewNotesFound: () => {},
          showNoNewNotesMessage: false,
          setShowNoNewNotesMessage: () => {},
          relayUrls: ["wss://example"],
          onNoRelays: () => {},
          fetchDisplayNames: async () => {},
          addDisplayNamesFromMetadata: () => {},
          getPubkeysNeedingFetch: () => [],
          queryClient: {} as any,
        } as any),
      { wrapper }
    );

    const filter = result.current.buildNotesFilter();
    expect((filter as any).kinds).toEqual([1]);
  });
});

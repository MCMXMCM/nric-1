import React from "react";
import { describe, it, expect } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { useNostrOperations } from "../useNostrOperations";
import type { Note } from "../../types/nostr/types";
import { NostrContext } from "../../contexts/NostrContext";

// Shared mock control for SimplePool
const mockPool = {
  events: [] as Array<{
    id: string;
    content: string;
    pubkey: string;
    created_at: number;
    tags: any[];
  }>,
  lastFilter: null as any,
};

// Mock nostr-tools SimplePool so fetchNotesPage can return controlled events
vi.mock("nostr-tools", async (orig) => {
  const mod = await orig();
  class SimplePoolMock {
    async querySync(_relays: string[], filter: any) {
      mockPool.lastFilter = filter;
      return mockPool.events;
    }
    close(_relays: string[]) {}
  }
  return {
    ...mod,
    SimplePool: SimplePoolMock,
  };
});

const TestHarness: React.FC<{ onNotes: (notes: Note[]) => void }> = ({
  onNotes,
}) => {
  const [notes, setNotes] = React.useState<Note[]>([]);
  const [isFetchingPage, setIsFetchingPage] = React.useState(false);
  const [hasMorePages, setHasMorePages] = React.useState(true);

  const operations = useNostrOperations({
    isPageVisible: true,
    isFetchingPage,
    isRateLimited: false,
    setIsRateLimited: () => {},
    setIsInitialized: () => {},
    notes,
    setNotes,
    currentIndex: 0,
    updateCurrentIndex: () => {},
    setCurrentIndex: () => {},
    displayIndex: 1,
    setDisplayIndex: () => {},
    setHasMorePages,
    setIsFetchingPage,
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
    contacts: [
      { pubkey: "alice", relay: "", petname: "" },
      { pubkey: "bob", relay: "", petname: "" },
    ],
    mutedPubkeys: [],
    isMobile: false,
    isCheckingForNewNotes: false,
    setIsCheckingForNewNotes: () => {},
    newNotesFound: 0,
    setNewNotesFound: () => {},
    showNoNewNotesMessage: false,
    setShowNoNewNotesMessage: () => {},
    relayUrls: ["wss://test"],
    onNoRelays: () => {},
    fetchDisplayNames: async () => {},
    addDisplayNamesFromMetadata: () => {},
    getPubkeysNeedingFetch: () => [],
    queryClient: {} as any,
  } as any);

  React.useEffect(() => {
    onNotes(notes);
  }, [notes, onNotes]);

  React.useEffect(() => {
    (async () => {
      await operations.fetchNotesPage();
    })();
  }, []);

  return null;
};

describe("useNostrOperations - sorting with contacts", () => {
  it("should order fetched notes by created_at descending when contacts are provided", async () => {
    mockPool.events = [
      { id: "a", content: "1", pubkey: "alice", created_at: 1000, tags: [] },
      { id: "b", content: "2", pubkey: "bob", created_at: 3000, tags: [] },
      { id: "c", content: "3", pubkey: "alice", created_at: 2000, tags: [] },
    ];

    let latestNotes: Note[] = [];
    const onNotes = (ns: Note[]) => {
      latestNotes = ns;
    };

    await act(async () => {
      render(
        <NostrContext.Provider
          value={{
            nostrClient: {} as any,
            pubkey: "",
            nip07Available: false,
            refreshNip07Availability: () => {},
            setPubkey: () => {},
            signInWithNip07: async () => "",
            signInWithNsec: async () => "",
            signOut: () => {},
            listSavedAccounts: async () => [],
            signInWithSavedAccount: async () => "",
            loginMethod: "",
            nsecPersistedThisSession: false,
          }}
        >
          <TestHarness onNotes={onNotes} />
        </NostrContext.Provider>
      );
    });

    await waitFor(() => {
      expect(latestNotes.length).toBe(3);
      expect(latestNotes.map((n) => n.id)).toEqual(["b", "c", "a"]);
    });

    // Verify notes are returned in descending created_at order
    expect(latestNotes[0].id).toBe("b"); // created_at: 3000
    expect(latestNotes[1].id).toBe("c"); // created_at: 2000
    expect(latestNotes[2].id).toBe("a"); // created_at: 1000
  });
});

describe("Custom hashtag filter hash generation", () => {
  it("should generate different filter hashes for different custom hashtag combinations", () => {
    let operations1: any;
    let operations2: any;

    // Test harness with custom hashtags
    const TestHarnessWithHashtags: React.FC<{ hashtags: string[] }> = ({
      hashtags,
    }) => {
      const ops = useNostrOperations({
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
        customHashtags: hashtags,
        contacts: [],
        mutedPubkeys: [],
        isMobile: false,
        isCheckingForNewNotes: false,
        setIsCheckingForNewNotes: () => {},
        newNotesFound: 0,
        setNewNotesFound: () => {},
        showNoNewNotesMessage: false,
        setShowNoNewNotesMessage: () => {},
        relayUrls: ["wss://test"],
        onNoRelays: () => {},
        fetchDisplayNames: async () => {},
        addDisplayNamesFromMetadata: () => {},
        getPubkeysNeedingFetch: () => [],
        queryClient: {} as any,
      } as any);

      if (hashtags.length === 0) {
        operations1 = ops;
      } else {
        operations2 = ops;
      }

      return null;
    };

    render(
      <NostrContext.Provider value={{ nostrClient: {} } as any}>
        <TestHarnessWithHashtags hashtags={[]} />
        <TestHarnessWithHashtags hashtags={["memes"]} />
      </NostrContext.Provider>
    );

    // Verify different filter hashes are generated
    const hash1 = operations1.getCurrentFilterHash();
    const hash2 = operations2.getCurrentFilterHash();

    expect(hash1).not.toBe(hash2);
    expect(hash1).toContain("tags:none");
    expect(hash2).toContain("tags:memes");
  });

  it("should normalize and sort custom hashtags for consistent hashing", () => {
    let operations1: any;
    let operations2: any;

    const TestHarnessWithHashtags: React.FC<{ hashtags: string[] }> = ({
      hashtags,
    }) => {
      const ops = useNostrOperations({
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
        customHashtags: hashtags,
        contacts: [],
        mutedPubkeys: [],
        isMobile: false,
        isCheckingForNewNotes: false,
        setIsCheckingForNewNotes: () => {},
        newNotesFound: 0,
        setNewNotesFound: () => {},
        showNoNewNotesMessage: false,
        setShowNoNewNotesMessage: () => {},
        relayUrls: ["wss://test"],
        onNoRelays: () => {},
        fetchDisplayNames: async () => {},
        addDisplayNamesFromMetadata: () => {},
        getPubkeysNeedingFetch: () => [],
        queryClient: {} as any,
      } as any);

      if (hashtags.includes("Memes")) {
        operations1 = ops;
      } else {
        operations2 = ops;
      }

      return null;
    };

    render(
      <NostrContext.Provider value={{ nostrClient: {} } as any}>
        <TestHarnessWithHashtags hashtags={["Memes", "Bitcoin"]} />
        <TestHarnessWithHashtags hashtags={["bitcoin", "memes"]} />
      </NostrContext.Provider>
    );

    // Should generate same hash despite different order and case
    const hash1 = operations1.getCurrentFilterHash();
    const hash2 = operations2.getCurrentFilterHash();

    expect(hash1).toBe(hash2);
  });
});

import React, {
  useRef,
  useMemo,
  useState,
  useCallback,
  useEffect,
} from "react";
import {
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { nip19 } from "nostr-tools";

// Nostrify hooks for data fetching
import { useNostrifyFeed } from "../hooks/useNostrifyFeed";
import { useNostrifyMultipleProfileMetadata } from "../hooks/useNostrifyProfile";
import { useNostrifyMigration } from "../contexts/NostrifyMigrationProvider";
import { useUserContactsContext } from "../contexts/UserContactsContext";
import { useEnhancedOutboxDiscoveryStatus } from "./EnhancedOutboxDiscoveryManager";
import { useOutboxRelayManager } from "../hooks/useOutboxRelayManager";
// import { DEFAULT_RELAY_URLS } from "../utils/nostr/constants";

// Relay selector constant
import { FOLLOWING_RELAY_OPTION } from "./feed/RelaySelector";

// Legacy hooks for UI state and functionality
import { useNostrFeedSetup } from "../hooks/useNostrFeedSetup";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { useEnhancedPrefetch } from "../hooks/useEnhancedPrefetch";
import { setCustomHashtags } from "./lib/uiStore";
import { useUIStore } from "./lib/useUIStore";

// Essential components
import { FullScreenImageViewer } from "./FullScreenImageViewer";
import { NoteHeaderSection } from "./feed/NoteHeaderSection";
import { FeedControls } from "./feed/FeedControls";
// import { PullToRefreshIndicator } from "./ui/PullToRefreshIndicator";
import RestorationModal from "./RestorationModal";
// import LoadingSpinner from "./ui/LoadingSpinner";
import StandardLoader from "./ui/StandardLoader";

// Hotkey system
import { FeedWithHotkeys } from "./feed/FeedWithHotkeys";
// import { FocusableNoteCard } from "./feed/FocusableNoteCard";
import { VirtualizedFeed } from "./feed/VirtualizedFeed";

// Bookmark hook
import { useBookmarks } from "../hooks/useBookmarks";

// Styles
import "./NostrFeed.css";
import { feedStyles } from "./feed/styles";
import "../components/hotkeys/focus-styles.css";

// Modal state utilities
import { parseModalState } from "../utils/modalUrlState";

// Event handlers for hashtag functionality
import { createHashtagClickHandler } from "./feed/eventHandlers";
import { useNostrFeedModalState } from "../hooks/useNostrFeedModalState";

// URL parameter utilities
import {
  parseHashtagParams,
  updateUrlWithHashtags,
} from "../utils/hashtagUrlParams";

// Component that wraps the feed content with platform-specific adjustments
const FeedContentWithConditionalPadding: React.FC<{
  isMobile: boolean;
  children: React.ReactNode;
}> = ({ isMobile, children }) => {
  return (
    <div
      style={{
        height: "100%",
        maxWidth: "100%",
        width: "100%",
        flex: 1,
        minHeight: 0,
        position: "relative",
        overflow: "hidden", // Use hidden to clip any content that tries to escape the container
        // Add top padding on desktop equal to FeedControls height so the
        // first item never aligns flush to the top when navigating with hotkeys
        paddingTop: 0,
        paddingBottom: isMobile
          ? "calc(60px + var(--safe-area-inset-bottom, 0))"
          : "0",
      }}
    >
      {children}
    </div>
  );
};

const NostrifyFeedMigration: React.FC = () => {
  // Setup and initialization
  const setup = useNostrFeedSetup();
  
  // Read vimMode from UI store
  const vimMode = useUIStore((s) => s.vimMode || false);

  // Get outbox discovery status
  const { isDiscovering } = useEnhancedOutboxDiscoveryStatus();

  // Get outbox relay manager for dynamic relay count and outbox relays
  const { getHealthyRelays: _getHealthyRelays } = useOutboxRelayManager({
    autoInitialize: true,
  });

  // Bookmark functionality
  const { toggleBookmark } = useBookmarks();

  // Keyboard navigation state will be accessed in the wrapped component

  const parentRef = useRef<HTMLDivElement>(null!);
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { noteId?: string };
  // Hold a live reference to the virtualizer instance so hotkeys can scroll reliably
  const [virtualizer, setVirtualizer] = useState<any>(null);

  // Parse modal state from URL for thread modal awareness
  const modalState = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return parseModalState(params);
  }, [location.search]);

  // Check if thread modal is currently open
  const showThreadModal = Boolean(modalState.thread);

  // State for loading new notes and scroll tracking
  const [isLoadingNewNotes, setIsLoadingNewNotes] = useState(false);
  const [showFallbackError, setShowFallbackError] = useState(false);
  const loadingTimeoutRef = useRef<number | null>(null);
  // Removed dynamic overscan to prevent scroll jumping
  const hasLoadedOnceRef = useRef(false);
  const prevTopCreatedAtRef = useRef<number | null>(null);
  const [newNotesCount, setNewNotesCount] = useState(0);
  // Deprecated in favor of FeedControls NewNotesIndicator placement
  // const [showNewNotesBanner, setShowNewNotesBanner] = useState(false);
  const justRefreshedRef = useRef(false);
  // Removed isProgrammaticTopScrollRef to prevent scroll conflicts

  // Handle scroll-based refresh - jump to top and refresh
  const handleAddNewNotes = async () => {
    console.log("🔄 Scroll-based refresh: jumping to top and refreshing feed");
    console.log("📊 Current state:", {
      relayUrls: nostrifyRelayUrls,
      relayCount: nostrifyRelayUrls.length,
      notesCount: notes.length,
      isLoading,
      error: error?.message,
    });

    setIsLoadingNewNotes(true);
    // Clear the new notes indicator immediately and mark that we're about to refresh
    justRefreshedRef.current = true;
    setNewNotesCount(0);

    try {
      // STEP 1: Clear scroll restoration BEFORE we do anything else
      // This prevents any automatic scroll restoration from interfering
      try {
        sessionStorage.removeItem("virtualScrollRestorationLock");
        sessionStorage.removeItem("bufferRestorationActive");
        sessionStorage.removeItem("main-feed");
        sessionStorage.removeItem("virtualFeedScrollState");
        sessionStorage.removeItem("scrollState");
        // Clear any scroll-related keys
        Object.keys(sessionStorage).forEach((key) => {
          if (
            key.includes("scroll") ||
            key.includes("position") ||
            key.includes("restoration")
          ) {
            sessionStorage.removeItem(key);
          }
        });
      } catch {}

      // STEP 2: Scroll to top BEFORE refresh
      // This ensures we start from top when new data arrives
      if (parentRef.current) {
        parentRef.current.scrollTop = 0;
        console.log("📍 Pre-refresh: Scrolled container to top");
      }

      // STEP 3: Refresh the feed data (this removes old query data and refetches)
      // This is async - it will trigger TanStack Query to refetch
      await refresh();

      // STEP 4: Wait for the new data to actually arrive and render
      // Give TanStack Query time to fetch and React time to render
      await new Promise((r) => setTimeout(r, 300));

      // STEP 5: Force scroll to top
      if (parentRef.current) {
        parentRef.current.scrollTop = 0;
      }

      // STEP 7: Final verification after a short delay
      await new Promise((r) => setTimeout(r, 100));
      if (parentRef.current && parentRef.current.scrollTop !== 0) {
        console.warn("⚠️ Scroll position not at top, forcing again");
        parentRef.current.scrollTop = 0;
      }

      console.log("✅ Scroll-to-top complete");
    } catch (error) {
      console.error("Error refreshing feed:", error);
    } finally {
      setIsLoadingNewNotes(false);
    }
  };

  const {
    ctxPubkey, // User's public key for following feature
    state,
    uiIsDarkMode,
    uiShowReplies,
    uiShowReposts,
    uiNsfwBlock,
    uiLongFormMode,
    uiImageMode,
    uiCustomHashtags,
    uiUseAscii,
    uiUseColor,
    isNoteRoute,
    readRelays,
    // readRelaysKey, // Unused for Nostrify migration
    writeRelays,
    userContacts,
    contactsLoading,
    mutedPubkeys,
    relayStatuses,
    // isRelayConfigStable, // Property doesn't exist on setup
  } = setup;

  // (moved below after isFollowingMode and feed state are initialized)

  // Nostrify migration context
  const { legacyContext } = useNostrifyMigration();
  const {
    showRepostModal,
    setShowRepostModal,
    updateRepostModalState,
    // showReplyModal,
    setShowReplyModal,
    updateReplyModalState,
    showZapModal,
    setShowZapModal,
    updateZapModalState,
    isAnyModalOpen,
  } = useNostrFeedModalState();

  // Use Nostrify migration context to get the current relay configuration
  const {
    relayUrls: nostrifyRelayUrls,
    relayPermissions,
    nostrifyPool,
    resetPool,
  } = useNostrifyMigration();

  // Access contacts context so we can force a refresh when switching to Following
  const contactsCtx = useUserContactsContext();

  // Maintain a sticky cache of the last non-empty set of following pubkeys
  const followingAuthorsRef = useRef<string[]>([]);
  const normalizeContactsToPubkeys = useCallback(
    (contacts: any[] | undefined): string[] => {
      if (!Array.isArray(contacts)) return [];
      const list = contacts
        .map((c) => {
          // Support both Contact objects and raw pubkey strings
          const pk = typeof c === "string" ? c : c?.pubkey;
          return typeof pk === "string" && pk.length > 0 ? pk : undefined;
        })
        .filter((v): v is string => Boolean(v));
      return Array.from(new Set(list));
    },
    []
  );

  // Latch the last non-empty contacts list to avoid transient empty refetch states
  useEffect(() => {
    const current = normalizeContactsToPubkeys(userContacts);
    if (current.length > 0) {
      followingAuthorsRef.current = current;
    }
  }, [userContacts, normalizeContactsToPubkeys]);

  // Filter out indexer relays for display in RelaySelector - only show read and read/write relays
  const displayRelayUrls = useMemo(() => {
    return nostrifyRelayUrls.filter((url) => {
      const permission = relayPermissions.get(url);
      return permission !== "indexer";
    });
  }, [nostrifyRelayUrls, relayPermissions]);

  // Stabilize contacts presence: once we have contacts, keep it true until logout
  const hasContactsNow = Boolean(userContacts && userContacts.length > 0);
  const [hasContactsSticky, setHasContactsSticky] = useState<boolean>(false);
  useEffect(() => {
    if (hasContactsNow) setHasContactsSticky(true);
    if (!ctxPubkey) setHasContactsSticky(false); // reset on logout
  }, [hasContactsNow, ctxPubkey]);
  const hasContacts = hasContactsSticky || hasContactsNow;
  const canUseFollowing = Boolean(ctxPubkey && hasContacts);

  const [selectedRelay, setSelectedRelay] = useState<string>(() => {
    // If user can use following mode, default to it
    if (canUseFollowing) {
      return FOLLOWING_RELAY_OPTION;
    }
    return displayRelayUrls[0] || "";
  });

  // Check if "following" relay option is selected
  const isFollowingMode = selectedRelay === FOLLOWING_RELAY_OPTION;

  // Build feed filter for Nostrify
  const feedFilter = useMemo(() => {
    const baseFilter: any = {
      kinds: uiLongFormMode ? [30023] : [1, 6], // Long form vs regular notes/reposts
      limit: 20,
    };

    // Add hashtag filters if specified
    if (uiCustomHashtags && uiCustomHashtags.length > 0) {
      baseFilter["#t"] = uiCustomHashtags;
    }

    // When following mode is active, filter by authors
    if (isFollowingMode) {
      // Prefer fresh contacts; fall back to sticky cache if a transient refetch produced []
      const freshAuthors = normalizeContactsToPubkeys(userContacts);
      const authors =
        freshAuthors.length > 0 ? freshAuthors : followingAuthorsRef.current;
      if (authors.length > 0) {
        console.log("🔍 Following feed filter:", {
          isFollowingMode,
          contactsCount: authors.length,
          authors: authors.slice(0, 3),
          totalAuthors: authors.length,
        });
        return {
          ...baseFilter,
          authors,
        };
      }
    }

    console.log("🔍 Global feed filter:", {
      isFollowingMode,
      contactsCount: userContacts?.length || 0,
      hasContacts: !!userContacts,
    });
    return baseFilter;
  }, [
    isFollowingMode,
    userContacts,
    uiCustomHashtags,
    uiLongFormMode,
    normalizeContactsToPubkeys,
  ]);

  // Update selected relay when user logs in or contacts change
  useEffect(() => {
    // Only auto-select Following mode when first logging in (if no relay is selected)
    if (canUseFollowing && !selectedRelay) {
      setSelectedRelay(FOLLOWING_RELAY_OPTION);
    }
  }, [canUseFollowing]);

  // Handle share functionality
  const handleShare = () => {
    // Get the current note ID from the URL path
    const path = window.location.pathname || "";
    if (!path.startsWith("/note/")) return;

    const bech32 = path.slice("/note/".length);
    if (!bech32) return;

    // Try to decode the note ID to get the hex ID
    let hexNoteId: string | null = null;
    try {
      const decoded = nip19.decode(bech32);
      if (decoded.type === "note" && typeof decoded.data === "string") {
        hexNoteId = decoded.data;
      } else if (decoded.type === "nevent") {
        const data: any = decoded.data as any;
        if (typeof data?.id === "string") {
          hexNoteId = data.id;
        }
      }
    } catch {
      // If decoding fails, try to use the bech32 as-is
    }

    if (!hexNoteId) return;

    // Generate nevent link with relay hints
    let encoded: string;
    try {
      // Use the Nostrify relay URLs that are already available in the component
      const availableRelays = nostrifyRelayUrls?.slice(0, 4) || [];

      encoded =
        availableRelays.length > 0
          ? nip19.neventEncode({ id: hexNoteId, relays: availableRelays })
          : nip19.noteEncode(hexNoteId);
    } catch {
      encoded = nip19.noteEncode(hexNoteId);
    }

    const shareUrl = `${window.location.origin}/note/${encoded}`;

    if (navigator.share) {
      navigator
        .share({
          title: showThreadModal ? "Nostr Thread" : "Nostr Note",
          url: shareUrl,
        })
        .catch(() => {
          // Fallback to clipboard
          navigator.clipboard?.writeText(shareUrl);
        });
    } else {
      // Fallback to clipboard
      navigator.clipboard?.writeText(shareUrl);
    }
  };

  // Track discovery start time to implement timeout
  const discoveryStartTimeRef = useRef<number | null>(null);

  // Update discovery start time when discovery begins
  useEffect(() => {
    if (isDiscovering && discoveryStartTimeRef.current === null) {
      discoveryStartTimeRef.current = Date.now();
    } else if (!isDiscovering) {
      discoveryStartTimeRef.current = null;
    }
  }, [isDiscovering]);

  // (moved below after isFollowingMode is initialized)

  // Determine if feed should be enabled
  // For following mode, wait for contacts to actually load before enabling feed
  // Outbox discovery can happen in the background - we'll use regular relays initially
  const shouldEnableFeed = useMemo(() => {
    if (!isFollowingMode) {
      return true; // Non-following modes always enabled
    }

    // If user is logged in, wait for contacts to load
    if (ctxPubkey) {
      const freshAuthors = normalizeContactsToPubkeys(userContacts);
      const contactsLen =
        freshAuthors.length > 0
          ? freshAuthors.length
          : followingAuthorsRef.current.length;

      // If we have contacts, enable feed
      if (contactsLen > 0) {
        console.log("✅ Contacts loaded, enabling feed", { contactsLen });
        return true;
      }

      // If contacts are currently loading and we have none yet, hold off
      if (contactsLoading) {
        console.log("⏳ Waiting for contacts to load...");
        return false;
      }

      // If contacts finished loading but we have none, don't enable feed yet
      // The user might not have any contacts, or they're still loading
      if (contactsLen === 0 && !contactsLoading) {
        console.log(
          "⚠️ No contacts available. Following feed cannot be used without contacts."
        );
        return false;
      }
    }

    // Enable feed (non-following mode or no pubkey)
    return true;
  }, [
    isFollowingMode,
    ctxPubkey,
    userContacts,
    contactsLoading,
    normalizeContactsToPubkeys,
  ]);

  // Debug feed configuration
  console.log("🔧 Feed configuration:", {
    isFollowingMode,
    shouldEnableFeed,
    contactsLoading,
    contactsCount: userContacts?.length || 0,
    relayUrlsCount: nostrifyRelayUrls.length,
    relayUrls: nostrifyRelayUrls.slice(0, 3), // Show first 3 relays for debugging
    feedFilter,
    uiLongFormMode,
  });

  // Use Nostrify feed hook for data fetching with the current Nostrify pool configuration
  const {
    data: notes = [],
    isLoading,
    error,
    refetch,
    refresh,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useNostrifyFeed({
    // When in following mode, query ONLY regular relays (no outbox union)
    // When a specific relay is selected, use only that relay
    relayUrls: isFollowingMode
      ? displayRelayUrls
      : selectedRelay
        ? [selectedRelay] // Use selected relay as single-item array
        : nostrifyRelayUrls, // Fallback to all
    filter: feedFilter,
    enabled: shouldEnableFeed,
    // Unified page size across devices
    pageSize: isFollowingMode ? 30 : 20,
    // Let TanStack Virtual handle memory management - it only renders visible items
    // Manual page pruning causes jittering when pages get removed from the data array
    maxPagesInMemory: undefined, // No limit - Virtual handles this efficiently
    showReplies: uiShowReplies,
    showReposts: uiShowReposts,
    nsfwBlock: uiNsfwBlock,
    mutedPubkeys,
    customHashtags: uiCustomHashtags,
  });

  // Debug notes being returned
  console.log("📝 Feed notes debug:", {
    notesCount: notes.length,
    noteKinds: notes
      .slice(0, 5)
      .map((note) => ({ id: note.id.slice(0, 8), kind: note.kind })), // Show first 5 note kinds
    uiLongFormMode,
  });

  // Removed iOS Safari-specific soft-timeout banner — unified behavior across devices

  // Force a one-time refresh after Following becomes enabled but returns no data initially
  const didKickstartFollowingRef = useRef(false);
  useEffect(() => {
    if (!isFollowingMode) {
      didKickstartFollowingRef.current = false;
      return;
    }
    // When feed is enabled and the first load yields zero notes without error, proactively fetch next page once
    if (
      shouldEnableFeed &&
      !isLoading &&
      notes.length === 0 &&
      !error &&
      !didKickstartFollowingRef.current
    ) {
      didKickstartFollowingRef.current = true;
      // Kick TanStack to fetch more immediately; if nothing, next cursor logic will adjust
      setTimeout(() => {
        try {
          fetchNextPage();
        } catch {}
      }, 50);
    }
    if (notes.length > 0) {
      didKickstartFollowingRef.current = true;
    }
  }, [
    isFollowingMode,
    shouldEnableFeed,
    isLoading,
    notes.length,
    error,
    fetchNextPage,
  ]);

  // Auto-fetch next page when first page is empty to avoid blank screen + load more UX
  const autoFetchAfterEmptyRef = useRef(false);
  useEffect(() => {
    if (!isLoading && notes.length === 0) {
      if (
        hasNextPage &&
        !isFetchingNextPage &&
        !autoFetchAfterEmptyRef.current
      ) {
        autoFetchAfterEmptyRef.current = true;
        fetchNextPage();
      }
    }
    if (notes.length > 0) {
      autoFetchAfterEmptyRef.current = false;
      // Mark feed as ready on first actual data
      try {
        (globalThis as any).__feedFirstPageReady = true;
      } catch {}
    }
  }, [isLoading, notes.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Show helpful message when following feed is empty but not loading
  // Suppress during iOS soft-empty fallback and until we've auto-fetched once
  const showEmptyFollowingMessage =
    isFollowingMode &&
    !isLoading &&
    notes.length === 0 &&
    !error &&
    userContacts &&
    userContacts.length > 0 &&
    // Only show once we've attempted an auto-fetch of next page and we're not currently fetching
    autoFetchAfterEmptyRef.current === true &&
    !isFetchingNextPage;

  // Handle relay selection changes
  const handleRelaySelectionChange = useCallback(
    (newSelectedRelay: string) => {
      const isNewFollowing = newSelectedRelay === FOLLOWING_RELAY_OPTION;
      console.log("🔄 Relay selection changed:", {
        previous: selectedRelay,
        new: newSelectedRelay,
        mode: isNewFollowing
          ? "Following (uses regular relays)"
          : "Single Relay",
      });

      setSelectedRelay(newSelectedRelay);
      // Keep global UI filter in sync with relay selection
      try {
        // setFilterByFollow(isNewFollowing); // This line was removed from imports
      } catch {}
      // If switching to Following, ensure contacts are fresh before refreshing
      if (isNewFollowing) {
        (async () => {
          try {
            await contactsCtx.refetch();
          } catch {}
          setTimeout(() => refresh(), 50);
        })();
      } else {
        // Refresh feed with new relay selection (after a short tick)
        setTimeout(() => refresh(), 100);
      }
    },
    [selectedRelay, refresh, contactsCtx]
  );

  // Force refresh when relay configuration changes
  const prevRelayUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    const prevRelays = prevRelayUrlsRef.current;
    const currentRelays = nostrifyRelayUrls;

    // Check if relay URLs have changed
    const relaysChanged =
      prevRelays.length !== currentRelays.length ||
      !prevRelays.every((url, index) => url === currentRelays[index]);

    if (relaysChanged && prevRelays.length > 0) {
      console.log("🔄 Relay configuration changed, refreshing feed:", {
        prev: prevRelays,
        current: currentRelays,
      });
      // Force a refresh when relays change
      setTimeout(() => refresh(), 100);
    }

    prevRelayUrlsRef.current = currentRelays;
  }, [nostrifyRelayUrls, refresh]);

  // Read hashtag parameters from URL on component mount
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const urlHashtags = parseHashtagParams(searchParams);

    if (urlHashtags.length > 0) {
      console.log("🏷️ Loading hashtag filters from URL:", urlHashtags);
      setCustomHashtags(urlHashtags);
    }
  }, [location.search, setCustomHashtags]);

  // Update URL when hashtag filters change
  useEffect(() => {
    if (uiCustomHashtags.length > 0) {
      const newUrl = updateUrlWithHashtags(
        uiCustomHashtags,
        window.location.href
      );
      if (newUrl !== window.location.href) {
        console.log("🏷️ Updating URL with hashtag filters:", uiCustomHashtags);
        window.history.replaceState({}, "", newUrl);
      }
    } else {
      // Remove hashtag parameters if no hashtags are active
      const url = new URL(window.location.href);
      if (url.searchParams.has("hashtag")) {
        url.searchParams.delete("hashtag");
        const newUrl = url.toString();
        console.log("🏷️ Removing hashtag parameters from URL");
        window.history.replaceState({}, "", newUrl);
      }
    }
  }, [uiCustomHashtags]);

  // Calculate actual relay count for loading text (reflects what's actually being queried)
  const actualRelayCount = useMemo(() => {
    if (!isFollowingMode && selectedRelay) {
      // When a specific relay is selected, only query that one relay
      return 1;
    }

    if (isFollowingMode) {
      // Following now uses only regular relays displayed in the selector
      return displayRelayUrls.length;
    }

    // Fallback to all relays
    return nostrifyRelayUrls.length;
  }, [
    isFollowingMode,
    selectedRelay,
    displayRelayUrls.length,
    nostrifyRelayUrls.length,
  ]);

  // Fetch metadata for all note authors
  // IMPORTANT: Only enable metadata fetching AFTER the initial feed query completes SUCCESSFULLY
  // This prevents metadata queries from competing with the feed query for relay connections
  const uniqueAuthors = useMemo(() => {
    const authors = new Set<string>();
    notes.forEach((note) => {
      if (note.pubkey) authors.add(note.pubkey);
    });
    return Array.from(authors);
  }, [notes]);

  // Defer metadata fetching until:
  // 1. Feed query is not loading
  // 2. Feed query is not actively fetching the next page
  // 3. We have at least one note (feed loaded successfully)
  // 4. Feed is not in error state
  const shouldFetchMetadata =
    !isLoading && !isFetchingNextPage && notes.length > 0 && !error;

  const { metadataMap, isLoading: isLoadingMetadata } =
    useNostrifyMultipleProfileMetadata({
      pubkeys: uniqueAuthors,
      relayUrls: readRelays,
      enabled: shouldFetchMetadata, // Only fetch after feed query succeeds
    });

  // Show subtle indicator when metadata is loading (optional)
  if (isLoadingMetadata && import.meta.env.DEV) {
    console.log(
      "📝 Loading metadata for",
      uniqueAuthors.length,
      "authors (after feed query completed)"
    );
  }

  // Convert Map to plain object for VirtualizedFeed
  const metadataRecord = useMemo(() => {
    const obj: Record<string, any> = {};
    metadataMap.forEach((value, key) => {
      obj[key] = value as any;
    });
    return obj;
  }, [metadataMap]);

  // Note: Real-time updates are handled by the feed query system
  // No need for separate realtime subscription here

  // Enhanced prefetching for images, metadata, threads, reactions, and parent notes
  useEnhancedPrefetch({
    notes,
    currentIndex: 0,
    relayUrls: readRelays,
    enabled: true,
    prefetchWindow: 10,
    nostrClient: legacyContext?.nostrClient,
    myPubkey: legacyContext?.pk,
  });

  // Bottom sentinel + observer for IntersectionObserver-based infinite scroll
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastManualTriggerRef = useRef(0);

  const setBottomSentinel = useCallback(
    (node: HTMLDivElement | null) => {
      bottomSentinelRef.current = node;
      // Disconnect any previous observer
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      const root = parentRef.current;
      if (!node || !root) return;

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              if (hasNextPage && !isFetchingNextPage) {
                // Add debouncing to prevent rapid pagination
                const now = Date.now();
                if (now - lastManualTriggerRef.current > 1000) {
                  // 1 second debounce
                  lastManualTriggerRef.current = now;
                  console.log("📄 Loading next page...");
                  fetchNextPage();
                }
              }
            }
          }
        },
        {
          root,
          rootMargin: "200px",
          threshold: 0.01,
        }
      );

      observer.observe(node);
      observerRef.current = observer;
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  // Note: IntersectionObserver will also trigger when content does not fill viewport

  // Removed duplicate IntersectionObserver - using only the one in setBottomSentinel

  // Reattach observer on route changes to ensure intersection events resume
  useEffect(() => {
    const node = bottomSentinelRef.current;
    if (node) setBottomSentinel(node);
  }, [location.pathname, location.search, setBottomSentinel]);

  // Removed redundant scroll handler - using only IntersectionObserver for pagination

  // Removed automatic scroll to top on hashtag changes to prevent unwanted jumping

  // IntersectionObserver to trigger fetching next page
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, []);

  // Pull to refresh
  const pullToRefresh = usePullToRefresh({
    onRefresh: handleAddNewNotes,
    enabled: state.isMobile, // Only enable on mobile
  });

  // Bind pull-to-refresh to the scroll container
  useEffect(() => {
    if (parentRef.current && state.isMobile) {
      pullToRefresh.bindToContainer(parentRef.current);
    }
  }, [pullToRefresh, state.isMobile]);

  // Simplified scroll restoration - removed complex logic that was causing conflicts
  const scrollRestoration = {
    isRestoring: false,
  };

  // Track newest note to show a banner when newer notes arrive (after initial load)
  useEffect(() => {
    const topCreatedAt = notes[0]?.created_at;
    if (typeof topCreatedAt !== "number") return;
    if (!hasLoadedOnceRef.current) {
      hasLoadedOnceRef.current = true;
      prevTopCreatedAtRef.current = topCreatedAt;
      return;
    }
    if (justRefreshedRef.current) {
      // After an explicit refresh, adopt the new top as baseline without counting
      prevTopCreatedAtRef.current = topCreatedAt;
      setNewNotesCount(0);
      justRefreshedRef.current = false;
      return;
    }
    const prev = prevTopCreatedAtRef.current || 0;
    if (topCreatedAt > prev) {
      // Count how many are newer than prev
      const count = notes.filter((n) => n.created_at > prev).length;
      setNewNotesCount(count);
      prevTopCreatedAtRef.current = topCreatedAt;
    }
  }, [notes]);

  // Check if we're on a note detail route
  const isNoteDetailRoute = Boolean(params.noteId);

  // Handle note interactions
  // const handleLink = (url: string) => {
  //   window.open(url, "_blank", "noopener,noreferrer");
  // };

  const handleThread = (noteId: string) => {
    // Navigate to the thread route for the given hex note id
    navigate({ to: `/thread/${noteId}` });
  };

  const handleRepost = (noteId: string) => {
    // Open the repost modal for the focused note
    try {
      setShowRepostModal(true);
      updateRepostModalState(noteId);
    } catch {
      console.log("Repost note:", noteId);
    }
  };

  const handleReply = (noteId: string) => {
    try {
      setShowReplyModal(true);
      updateReplyModalState(noteId);
    } catch {
      console.log("Reply to note:", noteId);
    }
  };

  const handleLike = (noteId: string) => {
    console.log("Like note:", noteId);
  };

  const handleProfile = (pubkey: string) => {
    const npub = nip19.npubEncode(pubkey);
    navigate({ to: "/profile/$pubkey", params: { pubkey: npub } });
  };

  const handleOpenNote = (noteId: string) => {
    const noteIdBech32 = nip19.noteEncode(noteId);
    navigate({ to: "/note/$noteId", params: { noteId: noteIdBech32 } });
  };

  // Hotkey wrappers: operate on the currently focused note
  const getFocusedNote = () => {
    // Find the focused element - prefer the one with .focused class
    const focusedCandidates = document.querySelectorAll("[data-index].focused");

    let focusedElement: Element | null = null;

    // If we have focused candidates, find the first visible one
    if (focusedCandidates.length > 0) {
      for (const candidate of Array.from(focusedCandidates)) {
        const htmlEl = candidate as HTMLElement;
        const rect = htmlEl.getBoundingClientRect();
        // Check if element is visible and has dimensions
        if (rect.height > 0 && rect.width > 0 && htmlEl.offsetParent !== null) {
          focusedElement = candidate;
          break;
        }
      }
    }

    // Fallback: if no focused element found, try any data-index element
    if (!focusedElement) {
      focusedElement = document.querySelector("[data-index]");
    }

    if (!focusedElement) return null;

    const noteIndex = parseInt(
      focusedElement.getAttribute("data-index") || "-1"
    );
    if (Number.isNaN(noteIndex) || noteIndex < 0 || noteIndex >= notes.length) {
      return null;
    }
    return notes[noteIndex];
  };

  const onHotkeyThread = () => {
    const note = getFocusedNote();
    if (!note?.id) return;
    try {
      const currentState: any = { ...(window.history.state || {}) };
      currentState.fromFeed = true;
      window.history.replaceState(currentState, "");
    } catch {}
    handleThread(note.id);
  };

  const onHotkeyRepost = () => {
    const note = getFocusedNote();
    if (!note?.id) return;
    handleRepost(note.id);
  };

  const onHotkeyReply = () => {
    const note = getFocusedNote();
    if (!note?.id) return;
    handleReply(note.id);
  };

  const onHotkeyLike = () => {
    const note = getFocusedNote();
    if (!note?.id) return;
    handleLike(note.id);
  };

  const onHotkeyBookmark = () => {
    const note = getFocusedNote();
    if (!note?.id) return;
    const displayName = setup.getDisplayNameForPubkey?.(note.pubkey);
    toggleBookmark(note.id, note, displayName);
  };

  const onHotkeyProfile = () => {
    const note = getFocusedNote();
    if (!note?.pubkey) return;
    try {
      const currentState: any = { ...(window.history.state || {}) };
      currentState.fromFeed = true;
      window.history.replaceState(currentState, "");
    } catch {}
    handleProfile(note.pubkey);
  };

  const onHotkeyOpenNote = () => {
    const note = getFocusedNote();
    if (!note?.id) return;
    try {
      const currentState: any = { ...(window.history.state || {}) };
      currentState.fromFeed = true;
      window.history.replaceState(currentState, "");
    } catch {}
    handleOpenNote(note.id);
  };

  const onHotkeyLink = () => {
    const note = getFocusedNote();
    if (!note?.id) return;
    try {
      const encoded = nip19.noteEncode(note.id);
      const shareUrl = `${window.location.origin}/note/${encoded}`;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(shareUrl).catch(() => {});
      } else {
        // Fallback: open the link
        window.open(shareUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      // Fallback: open note route
      handleOpenNote(note.id);
    }
  };

  const onHotkeyToggleMedia = () => {
    // Find the focused note element
    const focusedCandidates = document.querySelectorAll("[data-index].focused");

    let focusedElement: Element | null = null;

    // Find the first visible focused element
    if (focusedCandidates.length > 0) {
      for (const candidate of Array.from(focusedCandidates)) {
        const htmlEl = candidate as HTMLElement;
        const rect = htmlEl.getBoundingClientRect();
        if (rect.height > 0 && rect.width > 0 && htmlEl.offsetParent !== null) {
          focusedElement = candidate;
          break;
        }
      }
    }

    if (!focusedElement) return;

    // Find the first media URL link (image or video) inside the focused note
    // These are span elements with role="button" that contain media URLs
    const mediaLink = focusedElement.querySelector(
      'span[role="button"][style*="link-image"]'
    );

    if (mediaLink) {
      // Simulate a click on the media link to toggle expansion
      (mediaLink as HTMLElement).click();
    }
  };

  const handleParentThread = () => {
    const note = getFocusedNote();
    if (!note) return;

    // Extract parent ID from note tags
    const eTags = (note.tags || []).filter(
      (t: any) => Array.isArray(t) && t[0] === "e"
    );
    const replyTag = eTags.find((t: any) => t[3] === "reply");
    const rootTag = eTags.find((t: any) => t[3] === "root");

    // Get parent ID (prefer marked reply tag, fallback to root tag for top-level replies)
    const parentId =
      replyTag?.[1] ||
      (rootTag?.[1] && rootTag[1] !== note.id ? rootTag[1] : null);

    if (!parentId) {
      console.log("No parent note found for this note");
      return;
    }

    try {
      navigate({
        to: `/thread/${parentId}`,
      });
    } catch (error) {
      console.error("Failed to open parent thread:", error);
    }
  };

  const handleRootThread = () => {
    const note = getFocusedNote();
    if (!note) return;

    // Extract root ID from note tags
    const eTags = (note.tags || []).filter(
      (t: any) => Array.isArray(t) && t[0] === "e"
    );
    const rootTag = eTags.find((t: any) => t[3] === "root");

    if (!rootTag?.[1]) {
      console.log("No root note found for this note");
      return;
    }

    try {
      navigate({
        to: `/thread/${rootTag[1]}`,
      });
    } catch (error) {
      console.error("Failed to open root thread:", error);
    }
  };

  // Handle hashtag clicks - add hashtag to filter
  const handleHashtagClick = useCallback(
    createHashtagClickHandler(
      () => uiCustomHashtags,
      (hashtags: string[]) => setCustomHashtags(hashtags)
    ),
    [uiCustomHashtags, setCustomHashtags]
  );

  // Handle ASCII rendering
  const handleAsciiRendered = (noteId: string, ascii: string) => {
    state.setAsciiCache((prev) => ({
      ...prev,
      [noteId]: { ascii, timestamp: Date.now() },
    }));
  };

  // Track failed media loads to prevent repeated attempts
  const failedMediaRef = useRef<Set<string>>(new Set());

  const handleMediaLoadError = (noteId: string) => {
    // Only log if this is the first time this note failed
    if (!failedMediaRef.current.has(noteId)) {
      console.warn(`Media load error for note: ${noteId}`);
      failedMediaRef.current.add(noteId);
    }
  };

  // Use unified display name resolver from thread/feed setup
  const getDisplayNameForPubkey = setup.getDisplayNameForPubkey;

  // Render individual note with focus support (unused with VirtualizedFeed)

  // Debug logging with mobile-specific info
  React.useEffect(() => {
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    const isSafari =
      /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

    console.log("🔍 Nostrify Feed Debug:", {
      status: isLoading ? "loading" : "success",
      notesCount: notes.length,
      isRestoring: scrollRestoration.isRestoring,
      relayConfigStable: true, // Always stable for Nostrify migration
      connectedRelays: relayStatuses.filter((s) => s.connected).length,
      nostrifyRelayUrls: nostrifyRelayUrls,
      relayCount: nostrifyRelayUrls.length,
      hasError: !!error,
      errorMessage: error ? (error as Error).message : null,
      isMobile,
      isSafari,
      userAgent: navigator.userAgent,
      scrollElement: parentRef.current
        ? {
            scrollHeight: parentRef.current.scrollHeight,
            clientHeight: parentRef.current.clientHeight,
            scrollTop: parentRef.current.scrollTop,
          }
        : null,
      timestamp: new Date().toISOString(),
    });

    // Log additional mobile debugging info
    if (isMobile && isLoading && notes.length === 0) {
      console.warn("📱 Mobile loading state detected:", {
        relayUrls: nostrifyRelayUrls,
        hasNostrifyPool: !!nostrifyPool,
        error: error?.message,
        loadingDuration: Date.now(), // Could track this better
      });
    }
  }, [
    isLoading,
    notes.length,
    scrollRestoration.isRestoring,
    relayStatuses,
    nostrifyRelayUrls,
    error,
    nostrifyPool,
  ]);

  // Add timeout mechanism for loading states (device-agnostic)
  React.useEffect(() => {
    if (isLoading && notes.length === 0 && !error) {
      // Clear any existing timeout first
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }

      // Set a timeout to prevent infinite loading
      // Following feeds need longer timeouts due to complex queries
      const isFollowingFeed =
        isFollowingMode && userContacts && userContacts.length > 10;
      const timeoutMs = isFollowingFeed ? 50000 : 35000; // unified timeouts

      loadingTimeoutRef.current = setTimeout(() => {
        console.error(
          `⏰ Loading timeout reached after ${timeoutMs}ms - showing fallback error`
        );
        setShowFallbackError(true);
      }, timeoutMs);
    } else {
      // Clear timeout when loading completes or error occurs
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      if (showFallbackError && (notes.length > 0 || error)) {
        setShowFallbackError(false);
      }
    }
  }, [isLoading, notes.length, error]); // Removed problematic dependencies

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  // Render loading state with fallback error handling
  if ((isLoading && notes.length === 0) || showFallbackError) {
    return (
      <div
        className="feed-container"
        style={feedStyles.mainContainer(state.isMobile)}
      >
        <NoteHeaderSection
          isNoteDetailRoute={isNoteDetailRoute}
          isMobile={state.isMobile}
          uiIsDarkMode={uiIsDarkMode}
          onShare={handleShare}
          replyCount={0}
        />
        {showFallbackError ? (
          <div
            className="error-container"
            style={{ padding: "2rem", textAlign: "center" }}
          >
            <p style={{ color: "var(--error-color)", marginBottom: "1rem" }}>
              {isFollowingMode
                ? "Loading your following feed is taking longer than expected."
                : "Loading is taking longer than expected on mobile."}
            </p>
            <p
              style={{
                fontSize: "0.875rem",
                marginBottom: "1rem",
                opacity: 0.7,
              }}
            >
              {isFollowingMode
                ? "This might be due to network connectivity or relay availability. Following feeds with many contacts can take longer to load."
                : "This might be due to network connectivity or relay availability."}
            </p>
            <button
              onClick={() => {
                setShowFallbackError(false);
                refetch();
              }}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "var(--accent-color)",
                color: "white",
                border: "none",
                cursor: "pointer",
              }}
            >
              Try Again
            </button>
            <div
              style={{ fontSize: "0.75rem", opacity: 0.7, marginTop: "1rem" }}
            >
              Relays:{" "}
              {nostrifyRelayUrls.length > 0
                ? nostrifyRelayUrls.join(", ")
                : "None configured"}
            </div>
          </div>
        ) : (
          <div className="loading-container">
            <StandardLoader
              style={{ paddingTop: "12rem" }}
              message={
                isFollowingMode
                  ? `Loading notes from ${normalizeContactsToPubkeys(userContacts).length || followingAuthorsRef.current.length || 0} contacts...`
                  : selectedRelay
                    ? `Loading notes from ${selectedRelay.replace(/^wss?:\/\//, "").replace(/\/$/, "")}...`
                    : `Loading notes from ${actualRelayCount} relay${actualRelayCount === 1 ? "" : "s"}...`
              }
              alignWithSplash={true}
            />
          </div>
        )}
      </div>
    );
  }

  // Render error state
  if (error) {
    const handleResetAndRetry = () => {
      try {
        console.warn("🔄 Manually resetting relay pool before retry...");
        resetPool();
      } catch (e) {
        console.warn("⚠️ Pool reset failed:", e);
      }
      try {
        refetch();
      } catch {}
    };
    return (
      <div
        className="feed-container"
        style={feedStyles.mainContainer(state.isMobile)}
      >
        <div style={{ padding: "1rem" }}>
          {isFollowingMode ? (
            <div>
              <p>Error loading following feed: {error.message}</p>
              <p
                style={{
                  fontSize: "0.75rem",
                  opacity: 0.7,
                  marginTop: "0.5rem",
                }}
              >
                This may take a moment while we discover your contacts' relay
                preferences.
              </p>
              <div
                style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}
              >
                <button onClick={refetch}>Retry</button>
                <button
                  onClick={handleResetAndRetry}
                  title="Close all connections and retry"
                >
                  Reset connections & retry
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p>Error loading feed: {error.message}</p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button onClick={refetch}>Retry</button>
                <button onClick={handleResetAndRetry}>
                  Reset connections & retry
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render empty following feed message
  if (showEmptyFollowingMessage) {
    return (
      <FeedWithHotkeys notes={notes} enabled={false}>
        <div
          className="feed-container"
          style={feedStyles.mainContainer(state.isMobile)}
        >
          <NoteHeaderSection
            isNoteDetailRoute={isNoteDetailRoute}
            isMobile={state.isMobile}
            uiIsDarkMode={uiIsDarkMode}
            onShare={handleShare}
            replyCount={0}
          />
          {!isNoteRoute && (
            <FeedControls
              isMobile={state.isMobile}
              isNoteRoute={isNoteRoute}
              showReplies={uiShowReplies}
              showReposts={uiShowReposts}
              customHashtags={uiCustomHashtags}
              longFormMode={uiLongFormMode}
              onHashtagRemove={(hashtag) => {
                const currentHashtags = Array.isArray(uiCustomHashtags)
                  ? uiCustomHashtags
                  : [];
                const updatedHashtags = currentHashtags.filter(
                  (tag) => tag.toLowerCase() !== hashtag.toLowerCase()
                );
                setCustomHashtags(updatedHashtags);
              }}
              showOptions={false}
              currentIndex={0}
              totalNotes={notes.length}
              onNavigation={() => {}}
              onRefreshFeed={handleAddNewNotes}
              onAddNewNotes={handleAddNewNotes}
              isRefreshingFeed={isLoadingNewNotes}
              relayUrls={displayRelayUrls}
              newNotesFound={newNotesCount}
              showNoNewNotesMessage={false}
              showClearCacheConfirm={false}
              selectedRelay={selectedRelay}
              onRelaySelectionChange={handleRelaySelectionChange}
              userPubkey={ctxPubkey}
              hasContacts={hasContacts}
              contactsLoading={contactsLoading}
            />
          )}
          <div
            className="empty-feed-container"
            style={{ padding: "2rem", textAlign: "center" }}
          >
            <h3 style={{ marginBottom: "1rem", color: "var(--text-color)" }}>
              Your following feed is empty
            </h3>
            <p style={{ marginBottom: "1rem", opacity: 0.7 }}>
              No recent posts from the {userContacts?.length || 0} people you
              follow.
            </p>
            <p
              style={{
                marginBottom: "2rem",
                opacity: 0.7,
                fontSize: "0.875rem",
              }}
            >
              Try switching to the global feed or check back later for new
              posts.
            </p>
            <button
              onClick={() => {
                setSelectedRelay(displayRelayUrls[0] || "");
              }}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "var(--accent-color)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "1rem",
              }}
            >
              Switch to Global Feed
            </button>
          </div>
        </div>
      </FeedWithHotkeys>
    );
  }

  // Check if we're on a profile route
  const isProfileRoute = location.pathname.startsWith("/npub/");

  return (
    <FeedWithHotkeys
      virtualizer={virtualizer}
      notes={notes}
      onLink={onHotkeyLink}
      onThread={onHotkeyThread}
      onRepost={onHotkeyRepost}
      onReply={onHotkeyReply}
      onLike={onHotkeyLike}
      onBookmark={onHotkeyBookmark}
      onProfile={onHotkeyProfile}
      onOpenNote={onHotkeyOpenNote}
      onParentThread={handleParentThread}
      onRootThread={handleRootThread}
      onToggleMedia={onHotkeyToggleMedia}
      isModalOpen={showThreadModal}
      enabled={
        !state.isMobile &&
        !isProfileRoute &&
        !location.pathname.startsWith("/thread/") &&
        vimMode
      } // Disable hotkeys for profile and thread routes, and when vim mode is off
    >
      {/* For profile routes and thread routes, render outlet directly without container constraints */}
      {isProfileRoute || location.pathname.startsWith("/thread/") ? (
        <Outlet />
      ) : (
        <div
          className="nostr-feed"
          style={{
            width: "100%",
            height: state.isMobile ? "100%" : "100vh",
            flex: state.isMobile ? 1 : "none",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "var(--app-bg-color)",
            overflow: "hidden",
          }}
        >
          {/* Header and Controls Wrapper - NOT scrollable, positioned absolutely */}
          <div
            style={{
              width: "100%",
              maxWidth: state.isMobile ? "100%" : "1000px",
              margin: state.isMobile ? "0" : "0 auto",
              display: "flex",
              flexDirection: "column",
              flex: "0 0 auto", // Don't grow, don't shrink
              zIndex: 10,
              position: "relative", // Anchor for children
              backgroundColor: "var(--app-bg-color)",
              pointerEvents: "auto", // Ensure controls remain clickable
              isolation: "isolate", // Create new stacking context
            }}
          >
            {/* Sticky banner removed; new-notes button appears in FeedControls refresh spot */}
            {/* Header Section - Show for note detail routes only (not thread routes), but hide when thread modal is open */}
            {isNoteDetailRoute &&
              !location.pathname.startsWith("/thread/") &&
              !showThreadModal && (
                <NoteHeaderSection
                  isNoteDetailRoute={isNoteDetailRoute}
                  isMobile={state.isMobile}
                  uiIsDarkMode={uiIsDarkMode}
                  onShare={handleShare}
                  replyCount={0} // Could be enhanced later with actual reply count from thread data
                  showThreadModal={showThreadModal}
                  noteId={params.noteId}
                />
              )}
            {/* Feed Controls - Show for main feed (not note routes) */}
            {!isNoteRoute && (
              <FeedControls
                isMobile={state.isMobile}
                isNoteRoute={isNoteRoute}
                showReplies={uiShowReplies}
                showReposts={uiShowReposts}
                customHashtags={uiCustomHashtags}
                longFormMode={uiLongFormMode}
                onHashtagRemove={(hashtag) => {
                  // Remove hashtag from the UI store
                  const currentHashtags = Array.isArray(uiCustomHashtags)
                    ? uiCustomHashtags
                    : [];
                  const updatedHashtags = currentHashtags.filter(
                    (tag) => tag.toLowerCase() !== hashtag.toLowerCase()
                  );
                  setCustomHashtags(updatedHashtags);
                  console.log(`Removed hashtag: ${hashtag}`);
                }}
                showOptions={false} // Keep simple for now
                // Navigation props
                currentIndex={0}
                totalNotes={notes.length}
                onNavigation={() => {}}
                // Refresh feed props
                onRefreshFeed={handleAddNewNotes}
                onAddNewNotes={handleAddNewNotes}
                isRefreshingFeed={isLoadingNewNotes}
                relayUrls={displayRelayUrls}
                newNotesFound={newNotesCount}
                showNoNewNotesMessage={false}
                showClearCacheConfirm={false}
                // Relay selection props
                selectedRelay={selectedRelay}
                onRelaySelectionChange={handleRelaySelectionChange}
                // User authentication for following option
                userPubkey={ctxPubkey}
                hasContacts={hasContacts}
                contactsLoading={contactsLoading}
              />
            )}
          </div>
          {/* Main Feed Content - Full width scrollable container for content only */}
          {!isNoteRoute && (
            <div
              style={{
                width: "100%",
                flex: 1,
                minHeight: 0,
                overflow: "auto",
                display: "flex",
                flexDirection: "column",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <FeedContentWithConditionalPadding isMobile={state.isMobile}>
                <VirtualizedFeed
                  notes={notes}
                  metadata={metadataRecord}
                  asciiCache={state.asciiCache}
                  setAsciiCache={state.setAsciiCache}
                  isDarkMode={uiIsDarkMode}
                  useAscii={uiUseAscii}
                  useColor={uiUseColor}
                  isMobile={state.isMobile}
                  copiedPubkeys={state.copiedPubkeys}
                  setCopiedPubkeys={state.setCopiedPubkeys}
                  setFullScreenImage={state.setFullScreenImage}
                  onAsciiRendered={handleAsciiRendered}
                  onMediaLoadError={handleMediaLoadError}
                  getDisplayNameForPubkey={getDisplayNameForPubkey}
                  imageMode={uiImageMode}
                  readRelayUrls={readRelays}
                  writeRelayUrls={writeRelays}
                  showZapModal={showZapModal}
                  setShowZapModal={setShowZapModal}
                  updateZapModalState={updateZapModalState}
                  showRepostModal={showRepostModal}
                  setShowRepostModal={setShowRepostModal}
                  updateRepostModalState={updateRepostModalState}
                  onHashtagClick={handleHashtagClick}
                  hasNextPage={hasNextPage}
                  isFetchingNextPage={isFetchingNextPage}
                  fetchNextPage={fetchNextPage}
                  onRefresh={state.isMobile ? handleAddNewNotes : undefined}
                  isAnyModalOpen={isAnyModalOpen}
                  storageKey={"main-feed"}
                  // Ensure hotkeys scroll the correct element (the virtualizer's container)
                  onVirtualizerReady={(v) => {
                    // Provide live virtualizer instance to hotkey layer via state
                    try {
                      setVirtualizer(v);
                      (window as any).__mainFeedVirtualizer = v; // retain as fallback
                    } catch {
                      setVirtualizer(v);
                    }
                  }}
                />
              </FeedContentWithConditionalPadding>
            </div>
          )}
          {/* Full Screen Image Viewer */}
          {state.fullScreenImage && (
            <FullScreenImageViewer
              imageUrl={state.fullScreenImage}
              onClose={() => state.setFullScreenImage(null)}
            />
          )}
          {/* Restoration Modal */}
          <RestorationModal isVisible={false} onCancel={() => {}} />
          {/* Outlet for nested routes (note routes) */}
          <Outlet />
        </div>
      )}
    </FeedWithHotkeys>
  );
};

export default NostrifyFeedMigration;

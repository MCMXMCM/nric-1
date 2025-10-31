import React, { useEffect, useRef, useContext } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { NostrContext } from "../contexts/NostrContext";
import { useRelayManager } from "./useRelayManager";
import { useDisplayNames } from "./useDisplayNames";
import { useNostrFeedState } from "./useNostrFeedState";
import { useUserContactsContext } from "../contexts/UserContactsContext";
import { useMuteList } from "./useMuteList";
import { useUIStore } from "../components/lib/useUIStore";
import { DEFAULT_RELAY_URLS } from "../utils/nostr/constants";

export const useNostrFeedSetup = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { nostrClient } = useContext(NostrContext);
  const queryClient = useQueryClient();
  const { pubkey: ctxPubkey } = useContext(NostrContext);
  const state = useNostrFeedState();

  // Global UI settings (select once at top-level)
  const uiIsDarkMode = useUIStore((s) => s.isDarkMode);
  const uiShowReplies = useUIStore((s) => s.showReplies);
  const uiShowReposts = useUIStore((s) => s.showReposts);
  const uiNsfwBlock = useUIStore((s) => s.nsfwBlock);
  const uiImageMode = useUIStore((s) => s.imageMode);
  const uiCustomHashtags = useUIStore((s) => s.customHashtags);
  const uiUseAscii = useUIStore((s) => s.useAscii);
  const uiUseColor = useUIStore((s) => s.useColor);
  const uiShowSettings = useUIStore((s) => s.showSettings);
  const uiLongFormMode = useUIStore((s) => s.longFormMode || false);

  // Helper function to determine if notes should render
  const shouldRenderNotes = (feedState: typeof state) => {
    const shouldRender =
      !feedState.isRestoringPosition &&
      feedState.currentIndex >= 0 &&
      feedState.notes.length > 0;

    return shouldRender;
  };

  const isNoteRoute =
    location.pathname.startsWith("/note/") ||
    location.pathname.startsWith("/thread/") ||
    location.pathname.startsWith("/article/") ||
    location.pathname.startsWith("/npub/") ||
    location.pathname.startsWith("/create");
  const isNoteDetailRoute = location.pathname.startsWith("/note/");

  // If a crawler or user hits the root with ?note=..., push to the client route
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const noteParam = params.get("note");
    if (noteParam && !isNoteRoute) {
      // Don't replace to preserve sharers' ability to go back
      navigate({
        to: `/note/${noteParam}`,
        replace: true,
      });
    }
  }, [location.search, isNoteRoute, navigate]);

  const { relayUrls, relayStatuses, addRelay, readRelays, writeRelays } =
    useRelayManager({
      nostrClient,
      initialRelays: DEFAULT_RELAY_URLS,
      pubkeyHex: ctxPubkey,
    });

  // Use centralized user contacts management with TanStack Query
  const { contacts: userContacts, isLoading: contactsLoading } = useUserContactsContext();

  // Use centralized mute list management
  const { mutedPubkeys } = useMuteList(readRelays);

  // Sync user contacts to feed state for backward compatibility
  useEffect(() => {
    state.setContacts(userContacts);
  }, [userContacts, state.setContacts]);

  // Track when we should automatically fetch after relays connect (e.g., after restoring defaults)
  const fetchAfterConnectRef = useRef(false);
  // Track previous state to prevent unnecessary URL updates
  const prevNotesLengthRef = useRef<number>(0);
  // Track current state for effects that need it
  const currentStateRef = useRef({
    notes: state.notes,
    currentIndex: state.currentIndex,
  });

  // Update the ref whenever state changes
  useEffect(() => {
    currentStateRef.current = {
      notes: state.notes,
      currentIndex: state.currentIndex,
    };
  }, [state.notes, state.currentIndex]);

  const {
    getDisplayNameForPubkey,
    fetchDisplayNames,
    addDisplayNamesFromMetadata,
    getPubkeysNeedingFetch,
  } = useDisplayNames(readRelays);

  // Stabilize relay key and prevent repeated metadata fetch/update loops
  const readRelaysKey = React.useMemo(() => {
    try {
      // Use a stable key that doesn't change between app sessions
      // This ensures TanStack Query can properly restore cached feed data
      const stableRelays = readRelays || [];
      if (stableRelays.length === 0) {
        return "default-relays";
      }

      // Create a stable key based on sorted relay URLs
      const sortedRelays = [...stableRelays].sort();
      const key = `relays-${sortedRelays.join("|")}`;

      return key;
    } catch {
      // Fallback to a stable key
      return "stable-relay-key";
    }
  }, [readRelays]);

  return {
    // Core state and context
    navigate,
    location,
    nostrClient,
    queryClient,
    ctxPubkey,
    state,
    
    // UI settings
    uiIsDarkMode,
    uiShowReplies,
    uiShowReposts,
    uiNsfwBlock,
    uiImageMode,
    uiCustomHashtags,
    uiLongFormMode,
    uiUseAscii,
    uiUseColor,
    uiShowSettings,
    
    // Helper functions
    shouldRenderNotes,
    isNoteRoute,
    isNoteDetailRoute,
    
    // Relay management
    relayUrls,
    relayStatuses,
    addRelay,
    readRelays,
    writeRelays,
    readRelaysKey,
    
    // User data
    userContacts,
    contactsLoading,
    mutedPubkeys,
    
    // Display names
    getDisplayNameForPubkey,
    fetchDisplayNames,
    addDisplayNamesFromMetadata,
    getPubkeysNeedingFetch,
    
    // Refs
    fetchAfterConnectRef,
    prevNotesLengthRef,
    currentStateRef,
  };
};

import React, {
  useEffect,
  useState,
  useContext,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useParams, useNavigate, useLocation } from "@tanstack/react-router";
import { NostrContext } from "../contexts/NostrContext";
import { NoteCard } from "./NoteCard";
import { NoteCardErrorBoundary } from "./ErrorBoundary";
import { NoteModals } from "./notecard/NoteModals";
import { useDisplayNames } from "../hooks/useDisplayNames";
import { useRelayManager } from "../hooks/useRelayManager";
import { useMuteList } from "../hooks/useMuteList";
import { useNostrFeedState } from "../hooks/useNostrFeedState";
import { useNostrOperations } from "../hooks/useNostrOperations";
import { useNote } from "../hooks/useNote";
import { useRelayConnectionStatus } from "../hooks/useRelayConnectionStatus";
import { DEFAULT_RELAY_URLS } from "../utils/nostr/constants";
import { useQueryClient } from "@tanstack/react-query";

import { nip19 } from "nostr-tools";
import { getGlobalRelayPool } from "../utils/nostr/relayConnectionPool";
import {
  parseModalState,
  updateUrlWithModalState,
  type ModalState,
} from "../utils/modalUrlState";
import { useUniversalHashtagHandler } from "../utils/hashtagNavigation";
import { useUIStore } from "./lib/useUIStore";

import StandardLoader from "./ui/StandardLoader";

import "./NostrFeed.css";

// Header and settings are provided by parent feed
// NoteView no longer manages cache/settings; header provides those controls

const NoteView: React.FC = () => {
  const { noteId: routeNoteId } = useParams({ strict: false }) as {
    noteId: string;
  };
  const location = useLocation();
  const navigate = useNavigate();
  const { nostrClient, pubkey } = useContext(NostrContext);
  const state = useNostrFeedState();
  const [isBroadeningRelays, setIsBroadeningRelays] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showZapModal, setShowZapModal] = useState<boolean>(false);

  // Pool ref for useNote hook
  const poolRef = useRef<ReturnType<typeof getGlobalRelayPool> | null>(null);

  // Parse modal state from URL
  const modalState = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return parseModalState(params);
  }, [location.search]);

  // Repost modal state
  const [showRepostModal, setShowRepostModal] = useState<boolean>(false);
  useEffect(() => {
    if (modalState.repost && !showRepostModal) {
      setShowRepostModal(true);
    } else if (!modalState.repost && showRepostModal) {
      setShowRepostModal(false);
    }
  }, [modalState.repost, showRepostModal]);

  // Sync URL modal state with local state for zap modal
  useEffect(() => {
    if (modalState.zap && !showZapModal) {
      setShowZapModal(true);
    } else if (!modalState.zap && showZapModal) {
      setShowZapModal(false);
    }
  }, [modalState.zap, showZapModal]);

  const updateRepostModalState = useCallback(
    (noteId: string | null) => {
      const newModalState: ModalState = { ...modalState };
      if (noteId) {
        newModalState.repost = noteId;
      } else {
        delete newModalState.repost;
      }
      updateUrlWithModalState(newModalState, navigate, location);
      // Note: setShowRepostModal is handled by the URL sync effect to prevent double state updates
    },
    [modalState, navigate, location]
  );

  const updateZapModalState = useCallback(
    (noteId: string | null) => {
      const newModalState: ModalState = { ...modalState };
      if (noteId) {
        newModalState.zap = noteId;
      } else {
        delete newModalState.zap;
      }
      updateUrlWithModalState(newModalState, navigate, location);
      // Note: setShowZapModal is handled by the URL sync effect to prevent double state updates
    },
    [modalState, navigate, location]
  );

  // Clean up sessionStorage when component unmounts
  useEffect(() => {
    return () => {
      // Only clean up if we're not navigating back to a profile
      const currentState = location.state as any;
      if (!currentState?.fromNoteView) {
        try {
          sessionStorage.removeItem("noteViewNavigationState");
        } catch (error) {
          // Ignore errors
        }
      }
    };
  }, [location.state]);

  // Fallback: parse note id from path if no route param
  const pathNoteId =
    !routeNoteId && location.pathname.startsWith("/note/")
      ? location.pathname.split("/note/")[1]
      : routeNoteId;

  // Decode NIP-19 note ID to hex
  const hexNoteId = useMemo(() => {
    if (!pathNoteId) return null;

    try {
      const decoded = nip19.decode(pathNoteId);
      if (decoded.type === "note" && typeof decoded.data === "string") {
        return decoded.data;
      } else if (decoded.type === "nevent") {
        const data: any = decoded.data as any;
        if (typeof data?.id === "string") {
          return data.id;
        }
      }
    } catch {
      // If decoding fails, assume it's already a hex ID
    }

    return pathNoteId;
  }, [pathNoteId]);

  // Debug: Log note loading state
  React.useEffect(() => {}, [routeNoteId, pathNoteId, hexNoteId, error]);

  const {
    addRelay,
    removeRelay: _removeRelay,
    readRelays,
    writeRelays,
  } = useRelayManager({
    nostrClient,
    initialRelays: DEFAULT_RELAY_URLS,
    pubkeyHex: pubkey,
  });

  // Check relay connection status
  const { hasMinimumConnections, isConnecting } = useRelayConnectionStatus();

  // Get the current user's mute list
  const { mutedPubkeys } = useMuteList(readRelays);

  const {
    getDisplayNameForPubkey,
    fetchDisplayNames,
    addDisplayNamesFromMetadata,
    getPubkeysNeedingFetch,
  } = useDisplayNames(readRelays);

  const queryClient = useQueryClient();

  const operationsConfig = {
    isPageVisible: true,
    isFetchingPage: false,
    isRateLimited: false,
    setIsRateLimited: state.setIsRateLimited,
    setIsInitialized: state.setIsInitialized,
    notes: state.notes,
    setNotes: state.setNotes,
    currentIndex: state.currentIndex,
    updateCurrentIndex: (i: number) => state.updateCurrentIndex(i),
    setCurrentIndex: state.setCurrentIndex,
    displayIndex: state.displayIndex,
    setDisplayIndex: state.setDisplayIndex,
    setHasMorePages: state.setHasMorePages,
    setIsFetchingPage: state.setIsFetchingPage,
    metadata: state.metadata,
    setMetadata: state.setMetadata,
    setContacts: state.setContacts,
    setIsLoadingContacts: state.setIsLoadingContacts,
    setContactLoadError: state.setContactLoadError,
    setContactStatus: state.setContactStatus,
    setCacheStats: state.setCacheStats,
    showReplies: state.showReplies,
    showReposts: state.showReposts,
    nsfwBlock: state.nsfwBlock,
    customHashtags: state.customHashtags,
    contacts: state.contacts,
    mutedPubkeys,
    isMobile: state.isMobile,
    isCheckingForNewNotes: state.isCheckingForNewNotes,
    setIsCheckingForNewNotes: state.setIsCheckingForNewNotes,
    newNotesFound: state.newNotesFound,
    setNewNotesFound: state.setNewNotesFound,
    showNoNewNotesMessage: state.showNoNewNotesMessage,
    setShowNoNewNotesMessage: state.setShowNoNewNotesMessage,
    relayUrls: readRelays,
    onNoRelays: () => {},
    fetchDisplayNames,
    addDisplayNamesFromMetadata,
    getPubkeysNeedingFetch,
    // TanStack Query client for cache invalidation
    queryClient,
  };

  const operations = useNostrOperations(operationsConfig);

  // Initialize pool for useNote hook
  useEffect(() => {
    if (!poolRef.current) {
      poolRef.current = getGlobalRelayPool();
    }
  }, []);

  // Build augmented relays function for useNote
  const buildAugmentedRelays = useCallback(
    (relayUrls: string[], hintTags?: any[]) => {
      // Extract relay hints from NIP-19 nevent if available
      const hintedRelays: string[] = [];
      if (hintTags && Array.isArray(hintTags)) {
        hintTags.forEach((tag) => {
          if (tag && tag[0] === "relay" && tag[1]) {
            hintedRelays.push(tag[1]);
          }
        });
      }

      // Add hinted relays to the list
      return Array.from(new Set([...relayUrls, ...hintedRelays]));
    },
    []
  );

  // Extract hint tags from NIP-19 nevent
  const hintTags = useMemo(() => {
    if (!pathNoteId) return undefined;

    try {
      const decoded = nip19.decode(pathNoteId);
      if (decoded.type === "nevent") {
        const data: any = decoded.data as any;
        return data?.tags || [];
      }
    } catch {
      // Ignore decoding errors
    }

    return undefined;
  }, [pathNoteId]);

  // Extract cached note from navigation state
  const cachedNote = useMemo(() => {
    try {
      return (location.state as any)?.cachedNote || null;
    } catch {
      return null;
    }
  }, [location.state]);

  // Build enhanced relay list that includes contact relays (same as feed)
  const enhancedRelayUrls = useMemo(() => {
    return operations.buildFollowFilterRelays(readRelays);
  }, [operations, readRelays]);

  // Use the modern useNote hook for caching and loading
  const {
    note,
    isLoading,
    error: noteError,
    refetch,
  } = useNote({
    noteId: hexNoteId || "",
    relayUrls: enhancedRelayUrls,
    enabled: !!hexNoteId && enhancedRelayUrls.length > 0,
    poolRef,
    buildAugmentedRelays,
    hintTags,
  });

  // Use cached note if available and matches the current note ID
  const effectiveNote = useMemo(() => {
    if (cachedNote && cachedNote.id === hexNoteId) {
      return cachedNote;
    }
    return note;
  }, [cachedNote, note, hexNoteId]);

  // Compute note validity
  const isValidNote = useMemo(() => {
    try {
      return Boolean(
        effectiveNote &&
          effectiveNote.id &&
          effectiveNote.pubkey &&
          typeof effectiveNote.created_at === "number" &&
          effectiveNote.created_at > 0
      );
    } catch {
      return false;
    }
  }, [effectiveNote]);

  // Universal hashtag click handler - navigates to main feed with hashtag filter
  const handleHashtagClick = useUniversalHashtagHandler();

  // Handle relay broadening for nevent without relay hints
  useEffect(() => {
    if (!hexNoteId || !pathNoteId || note || isLoading || noteError) return;

    const handleBroadening = async () => {
      try {
        // Check if this is a nevent without relay hints
        const decoded = nip19.decode(pathNoteId);
        if (decoded.type === "nevent") {
          const data: any = decoded.data as any;
          const hasRelayHints =
            data?.relays &&
            Array.isArray(data.relays) &&
            data.relays.length > 0;

          if (!hasRelayHints) {
            setIsBroadeningRelays(true);

            // Add popular relays temporarily
            const popularRelays = [
              "wss://nos.lol",
              "wss://relay.snort.social",
              "wss://nostr.mom",
              "wss://purplepag.es",
              "wss://relay.nostr.band",
              "wss://nostr-relay.wlvs.space",
            ];

            popularRelays.forEach((relay) => {
              try {
                addRelay(relay);
              } catch {}
            });

            // Retry the query with broader relay set
            await refetch();
            setIsBroadeningRelays(false);
          }
        }
      } catch {
        // Ignore decoding errors
      }
    };

    handleBroadening();
  }, [hexNoteId, pathNoteId, note, isLoading, noteError, refetch, addRelay]);

  // Set error state from note error
  useEffect(() => {
    if (noteError) {
      setError("Failed to load note");
    } else {
      setError(null);
    }
  }, [noteError]);

  // Prefetch parent note (if any) after current note loads to speed up RE: navigation
  useEffect(() => {
    if (!note) return;
    try {
      const eTags = (note.tags || []).filter((t) => t && t[0] === "e");
      const replyTag = eTags.find((t) => t[3] === "reply");
      const rootTag = eTags.find((t) => t[3] === "root");
      const parentNoteId =
        replyTag?.[1] ||
        rootTag?.[1] ||
        (eTags.length > 0 ? eTags[0][1] : null);
      if (parentNoteId && parentNoteId !== note.id) {
        // Note: fetchSpecificNote was removed from operations
      }
    } catch {}
  }, [note, operations]);

  // NoteView does not expose cache/settings handlers; handled in parent header

  // Read UI toggles from global UI store for consistent behavior across routes
  const { useAscii: uiUseAscii, useColor: uiUseColor } = useUIStore((s) => ({
    useAscii: s.useAscii,
    useColor: s.useColor,
  }));

  // Show loading state while relays are connecting or note is loading
  if ((isConnecting && !hasMinimumConnections) || (isLoading && !note)) {
    const message =
      isConnecting && !hasMinimumConnections
        ? "Connecting to relays..."
        : isBroadeningRelays
          ? "Broadening relay set..."
          : "Loading note...";
    return <StandardLoader message={message} alignWithSplash={true} />;
  }

  if (error || !note) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
          minHeight: "50vh",
          color: "var(--text-color)",

          fontSize: "var(--font-size-sm)",
          gap: "1rem",
        }}
      >
        <div>{error || "Note not found"}</div>
        <button
          onClick={() =>
            navigate({
              to: "/",
              search: {
                hashtag: "",
                note: "",
                action: "",
                thread: "",
                reply: "",
                zap: "",
                repost: "",
                passphrasePrompt: false,
              },
            })
          }
          style={{
            backgroundColor: "transparent",
            color: "var(--text-color)",
            border: "1px dotted var(--border-color)",
            padding: "0.5rem 1rem",
            cursor: "pointer",

            fontSize: "var(--font-size-sm)",
          }}
        >
          Back to Feed
        </button>
      </div>
    );
  }

  return (
    <div
      className="nostr-feed"
      style={{
        width: "100%",
        height: state.isMobile ? "100%" : "100vh", // Fixed height for desktop note detail view
        flex: state.isMobile ? 1 : "none",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--app-bg-color )",
        overflowY: "auto", // Allow scrolling in note view
        overflowX: "hidden",
      }}
    >
      {/* Main Content Wrapper */}
      <div
        style={{
          width: "100%",
          maxWidth: state.isMobile ? "100%" : "1000px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          flex: state.isMobile ? 1 : 1, // Take full height on desktop for note detail view
          overflow: "visible", // Allow content to be visible
        }}
      >
        {/* Header is provided by parent feed; no local header here to avoid duplicates */}

        {/* Back row and action buttons removed; replaced by NoteHeader in parent layout */}

        {/* Note Content aligned like feed */}
        <div
          style={{
            width: "100%",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            flex: "none", // Don't constrain height - let content determine size
            minHeight: "auto", // Remove height constraint
            overflowY: "visible", // Allow content to flow naturally without note-level scrollbars
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div
            className="notes-container"
            style={{
              width: "100%",
              flex: "none", // Don't constrain height - let content determine size
              minHeight: "auto", // Remove height constraint
              paddingTop: state.isMobile ? "1rem" : "1rem",
              paddingBottom: state.isMobile
                ? "calc(2rem + var(--safe-area-inset-bottom))"
                : 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              boxSizing: "border-box",
              backgroundColor: "var(--app-bg-color )",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "auto", // Always use auto height to let content determine size naturally
                overflow: "visible",
              }}
            >
              <div
                style={{
                  width: "100%",
                  position: "relative",
                  height: state.isMobile ? "auto" : "100%", // Take full height for desktop note detail view
                  touchAction: state.isMobile ? "pan-y pinch-zoom" : "auto",
                  cursor: state.isMobile ? "auto" : "auto",
                  willChange: "transform",
                  overflow: "visible",
                }}
              >
                <NoteCardErrorBoundary>
                  <NoteCard
                    note={effectiveNote}
                    index={0}
                    metadata={state.metadata}
                    asciiCache={state.asciiCache}
                    isDarkMode={state.isDarkMode}
                    useAscii={uiUseAscii}
                    useColor={uiUseColor}
                    isMobile={state.isMobile}
                    copiedPubkeys={state.copiedPubkeys}
                    setCopiedPubkeys={state.setCopiedPubkeys}
                    setFullScreenImage={state.setFullScreenImage}
                    onAsciiRendered={() => {}}
                    onMediaLoadError={() => {}}
                    getDisplayNameForPubkey={getDisplayNameForPubkey}
                    imageMode={state.imageMode}
                    readRelayUrls={readRelays}
                    writeRelayUrls={writeRelays}
                    showZapModal={showZapModal}
                    setShowZapModal={setShowZapModal}
                    updateZapModalState={updateZapModalState}
                    showRepostModal={showRepostModal}
                    setShowRepostModal={setShowRepostModal}
                    updateRepostModalState={updateRepostModalState}
                    onHashtagClick={handleHashtagClick}
                    showFullContent={true}
                  />
                </NoteCardErrorBoundary>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {effectiveNote && (
        <NoteModals
          note={effectiveNote}
          isValidNote={isValidNote}
          isMobile={state.isMobile}
          showRepostModal={showRepostModal}
          setShowRepostModal={setShowRepostModal}
          updateRepostModalState={updateRepostModalState}
          showZapModal={showZapModal}
          setShowZapModal={setShowZapModal}
          updateZapModalState={updateZapModalState}
          myPubkey={pubkey}
          _metadata={null}
          readRelayUrls={readRelays}
          writeRelayUrls={writeRelays}
          useAscii={false}
          useColor={false}
          getDisplayNameForPubkey={getDisplayNameForPubkey}
          onHashtagClick={handleHashtagClick}
          markNoteAsZapped={() => {}}
        />
      )}
    </div>
  );
};

export default NoteView;

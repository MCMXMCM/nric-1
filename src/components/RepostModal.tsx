import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useHaptic } from "use-haptic";
import { type Event, nip19 } from "nostr-tools";
import { getGlobalRelayPool } from "../utils/nostr/relayConnectionPool";
import type { Note } from "../types/nostr/types";
import { NostrContext } from "../contexts/NostrContext";
import { formatRelativeTime } from "../utils/nostr/utils";
import LoadingTextPlaceholder from "./ui/LoadingTextPlaceholder";
import NoteContentRenderer from "./NoteContentRenderer";
import { publishRepost, publishQuoteRepost } from "../utils/nostr/publish";
import { useNavigate, useLocation } from "@tanstack/react-router";
import {
  parseModalState,
  updateUrlWithModalState,
  type ModalState,
} from "../utils/modalUrlState";

import { invalidateCurrentUserProfileNotes } from "../utils/nostr/queryInvalidation";
import { useQueryClient } from "@tanstack/react-query";

import PostPublishView, {
  type RelayPublishStatus,
  type PublishState,
} from "./PostPublishView";
import { usePowState } from "../stores/powStore";
import { usePersistentInput } from "../hooks/usePersistentInput";
import { useIosKeyboardFix } from "../hooks/useIosKeyboardFix";

import { useMentionAutocomplete } from "../hooks/useMentionAutocomplete";
import MentionDropdown from "./ui/MentionDropdown";
import {
  insertMention,
  getCursorPositionAfterMention,
} from "../utils/mentions";

interface RepostModalProps {
  parentNoteId: string;
  parentNote?: Note;
  readRelayUrls: string[];
  writeRelayUrls: string[];
  isMobile: boolean;
  onClose: () => void;
  getDisplayNameForPubkey: (pubkey: string) => string;
  mountWithinContainer?: boolean;
  useAscii?: boolean;
  useColor?: boolean;
  imageMode?: boolean;
  onHashtagClick?: (hashtag: string) => void;
}

export const RepostModal: React.FC<RepostModalProps> = ({
  parentNoteId,
  parentNote,
  readRelayUrls,
  writeRelayUrls,
  isMobile,
  onClose,
  getDisplayNameForPubkey,
  mountWithinContainer = true,
  useAscii = false,
  useColor = true,
  imageMode = true,
  onHashtagClick,
}) => {
  const {
    nostrClient,
    pubkey: ctxPubkey,
    nip07Available,
    listSavedAccounts,
  } = useContext(NostrContext);
  const queryClient = useQueryClient();

  // Haptic feedback hook
  const { triggerHaptic } = useHaptic();

  const [loadedParent, setLoadedParent] = useState<Note | null>(
    parentNote || null
  );
  const [isLoadingParent, setIsLoadingParent] = useState<boolean>(!parentNote);
  const [content, setContent, clearPersistedContent] = usePersistentInput(
    `repost-modal-${parentNoteId}`,
    ""
  );
  const [isPosting, setIsPosting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isTextExpanded, setIsTextExpanded] = useState<boolean>(false);
  const [showMoreButton, setShowMoreButton] = useState<boolean>(false);
  const [isExpanding, setIsExpanding] = useState<boolean>(false);

  // iOS keyboard handling
  const {
    containerRef,
    textareaRef,
    autoResizeTextarea,
    handleTextareaInput,
    getInputAreaStyles,
    getTextareaStyles,
  } = useIosKeyboardFix(isMobile);

  // Mention autocomplete handling
  const mentionState = useMentionAutocomplete();

  // Auto-resize textarea for mobile
  useEffect(() => {
    autoResizeTextarea();
  }, [content, autoResizeTextarea]);

  // Post-publish state
  const [publishState, setPublishState] = useState<PublishState>("idle");
  const [publishMessage, setPublishMessage] = useState<string>("");
  const [isSigning, setIsSigning] = useState<boolean>(false);
  const [relayStatuses, setRelayStatuses] = useState<RelayPublishStatus[]>([]);
  const [broadcastingComplete, setBroadcastingComplete] = useState(false);
  const [publishedRepostId, setPublishedRepostId] = useState<string | null>(
    null
  );
  const [showPostPublishView, setShowPostPublishView] = useState(false);

  // Subscribe to POW state changes to ensure re-renders
  const { activeSession } = usePowState();

  // Authentication check hook

  const noteTextRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const goToNote = useCallback(() => {
    if (!loadedParent?.id) return;
    let bech32: string;
    try {
      bech32 = nip19.noteEncode(loadedParent.id);
    } catch {
      bech32 = loadedParent.id;
    }
    const backToPath = `${location.pathname}${location.search || ""}`;
    const prevState = location.state as any;
    const backToFromFeed = Boolean(
      prevState?.backToFromFeed || prevState?.fromFeed
    );
    const feedIndex =
      typeof prevState?.feedIndex === "number"
        ? prevState.feedIndex
        : undefined;
    const navigationState = {
      fromNoteView: true,
      backToPath,
      backToFromFeed,
      feedIndex,
    };
    try {
      sessionStorage.setItem(
        "noteViewNavigationState",
        JSON.stringify(navigationState)
      );
    } catch {}
    navigate({
      to: `/note/$noteId`,
      params: { noteId: bech32 },
      state: true,
    });
  }, [
    loadedParent?.id,
    navigate,
    location.pathname,
    location.search,
    location.state,
  ]);

  // POW state is now managed by TanStack Store - no manual event listeners needed

  // Get current pubkey for unlock modal
  const currentStored =
    ctxPubkey ||
    (typeof window !== "undefined"
      ? localStorage.getItem("nostrPubkey") || ""
      : "");
  const hexPubkey = useMemo(() => {
    if (!currentStored) return "";
    try {
      if (currentStored.startsWith("npub")) {
        const d = nip19.decode(currentStored);
        if (d.type === "npub" && typeof d.data === "string") return d.data;
      }
      return currentStored;
    } catch {
      return currentStored;
    }
  }, [currentStored]);

  // Load parent note if not provided
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (
        loadedParent ||
        !nostrClient ||
        !readRelayUrls ||
        readRelayUrls.length === 0
      ) {
        setIsLoadingParent(false);
        return;
      }
      try {
        setIsLoadingParent(true);
        const pool = getGlobalRelayPool();
        const events = await pool.querySync(readRelayUrls, {
          kinds: [1],
          ids: [parentNoteId],
          limit: 1,
        });
        if (!cancelled && events.length > 0) {
          const ev: Event = events[0];
          setLoadedParent({
            id: ev.id,
            pubkey: ev.pubkey,
            content: ev.content || "",
            created_at: ev.created_at,
            tags: ev.tags || [],
            imageUrls: [],
            videoUrls: [],
            receivedAt: Date.now(),
          });
        }
      } catch (_e) {
        // Ignore
      } finally {
        if (!cancelled) setIsLoadingParent(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nostrClient, readRelayUrls, parentNoteId, loadedParent]);

  const displayName = useMemo(
    () => (loadedParent ? getDisplayNameForPubkey(loadedParent.pubkey) : ""),
    [loadedParent, getDisplayNameForPubkey]
  );
  const createdRelative = useMemo(
    () => (loadedParent ? formatRelativeTime(loadedParent.created_at) : ""),
    [loadedParent]
  );
  // Check if text needs "Show more" button based on rendered height of full content
  useEffect(() => {
    const el = noteTextRef.current;
    if (el && loadedParent?.content) {
      setShowMoreButton(el.scrollHeight > 100);
    }
  }, [loadedParent?.content, isTextExpanded]);

  const canPost = useMemo(() => {
    const writeSet =
      writeRelayUrls && writeRelayUrls.length > 0
        ? writeRelayUrls
        : readRelayUrls;
    return !!nostrClient && writeSet.length > 0 && !!loadedParent;
  }, [nostrClient, writeRelayUrls.length, readRelayUrls.length, loadedParent]);

  const closeModal = useCallback(() => {
    // Clear any persisted content when canceling
    clearPersistedContent();
    onClose();
    // Also clear repost param from URL if present
    const state = parseModalState(new URLSearchParams(location.search));
    const next: ModalState = { ...state };
    delete next.repost;
    updateUrlWithModalState(next, navigate, location);
  }, [onClose, navigate, location, clearPersistedContent]);

  // Handle mention selection
  const handleSelectMention = useCallback(
    (match: any) => {
      const newContent = insertMention(
        content,
        mentionState.mentionStart,
        mentionState.query,
        match.npub
      );
      setContent(newContent);

      // Close mention popup
      mentionState.closeMention();

      // Set cursor position after mention
      setTimeout(() => {
        if (textareaRef.current) {
          const cursorPos = getCursorPositionAfterMention(
            mentionState.mentionStart,
            match.npub
          );
          textareaRef.current.setSelectionRange(cursorPos, cursorPos);
          textareaRef.current.focus();
        }
      }, 0);
    },
    [content, mentionState, setContent, textareaRef]
  );

  // Handle textarea change and mention detection
  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      setContent(text);

      // Detect mentions at cursor position
      const cursorPos = e.target.selectionStart;
      mentionState.detectMention(text, cursorPos);
    },
    [setContent, mentionState]
  );

  // Handle keyboard events for mention selection
  const handleTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!mentionState.isActive) return;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          mentionState.selectPrevious();
          break;
        case "ArrowDown":
          e.preventDefault();
          mentionState.selectNext();
          break;
        case "Enter":
        case "Tab":
          e.preventDefault();
          if (mentionState.selectedMention) {
            handleSelectMention(mentionState.selectedMention);
          }
          break;
        case "Escape":
          mentionState.closeMention();
          break;
      }
    },
    [mentionState, handleSelectMention]
  );

  const performRepost = useCallback(async () => {
    // This is the actual repost logic, extracted for reuse after unlock
    if (!nostrClient || !loadedParent) return;
    setError(null);
    if (!canPost) {
      setError("Cannot post");
      return;
    }

    // Check authentication before attempting to repost
    try {
      // Import authentication utilities
      const { getInMemorySecretKeyHex, hasNip07 } = await import(
        "../utils/nostr/nip07"
      );

      const hasInMemoryKey = Boolean(getInMemorySecretKeyHex());
      const hasExtension = hasNip07();

      if (!hasInMemoryKey && !hasExtension) {
        console.error("❌ No signing method available for repost");
        setError(
          "No signing method available. Please sign in or unlock your key."
        );
        return;
      }
    } catch (authError) {
      console.error("❌ Authentication check failed:", authError);
      setError("Authentication check failed. Please try again.");
      return;
    }

    // Initialize post-publish state
    setPublishState("publishing");
    setPublishMessage("Preparing repost...");
    setShowPostPublishView(true);

    try {
      setIsPosting(true);
      const isQuoteRepost = content.trim().length > 0;

      const writeSet =
        writeRelayUrls.length > 0 ? writeRelayUrls : readRelayUrls;

      // Set up relay statuses for display (only write-enabled relays)
      setRelayStatuses(
        writeRelayUrls.map((url) => ({ url, status: "pending" as const }))
      );

      setPublishMessage("Preparing to sign...");
      setIsSigning(true);

      let event;
      if (isQuoteRepost) {
        // Quote repost (kind 1 with q tag)
        const result = await publishQuoteRepost({
          pool: nostrClient,
          relayUrls: writeSet,
          target: {
            id: loadedParent.id,
            pubkey: loadedParent.pubkey,
            kind: 1,
            tags: loadedParent.tags,
          },
          content: content.trim(),
          relayHint: writeSet[0],
        });
        event = result.event;
        setPublishedRepostId(event.id);
      } else {
        // Simple repost (kind 6)
        const result = await publishRepost({
          pool: nostrClient,
          relayUrls: writeSet,
          target: {
            id: loadedParent.id,
            pubkey: loadedParent.pubkey,
            kind: 1,
            tags: loadedParent.tags,
            content: loadedParent.content,
            created_at: loadedParent.created_at,
          },
          relayHint: writeSet[0],
        });
        event = result.event;
        setPublishedRepostId(event.id);
      }

      setIsSigning(false);
      setPublishState("success");
      setPublishMessage("Repost published successfully");
      setBroadcastingComplete(true);

      // Invalidate cache for current user's profile notes so they see their new repost immediately
      if (ctxPubkey) {
        invalidateCurrentUserProfileNotes(queryClient, ctxPubkey);
      }

      // 🎯 TRIGGER HAPTIC AFTER SUCCESSFUL REPOST (outside user gesture context)

      try {
        triggerHaptic();
      } catch (error) {
        console.error("❌ Haptic feedback failed for repost:", error);
      }

      // Clear persisted content since repost was successful
      clearPersistedContent();

      // Keep the modal open to show success state briefly, then close
      setTimeout(() => {
        closeModal();
      }, 2000); // Show success for 2 seconds before closing
    } catch (e: any) {
      const msg = e?.message || "Failed to repost";
      setError(msg);
      setPublishState("error");
      setPublishMessage(msg);
      setIsSigning(false);

      // Authentication error handling is now done in PostPublishView
    } finally {
      setIsPosting(false);
      setIsSigning(false);
    }
  }, [
    nostrClient,
    writeRelayUrls,
    readRelayUrls,
    loadedParent,
    content,
    closeModal,
    canPost,
    nip07Available,
    hexPubkey,
    listSavedAccounts,
    triggerHaptic,
    ctxPubkey,
  ]);

  const handlePost = useCallback(async () => {
    // Let PostPublishView handle all authentication via "Sign In & Retry" button
    await performRepost();
  }, [performRepost]);

  // Detect PWA mode
  const isPWA = useMemo(() => {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true
    );
  }, []);

  const containerStyle: React.CSSProperties = mountWithinContainer
    ? {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "var(--app-bg-color )",
        display: "flex",
        flexDirection: "column",
        zIndex: 5,
        maxHeight: isMobile ? "100%" : "calc(100% - 60px)", // Desktop behavior for within-container mode
        overflow: "hidden",
      }
    : {
        position: "fixed",
        top: 0,
        marginTop: isMobile ? "6rem" : "0",
        left: 0,
        right: 0,
        bottom:
          isMobile && isPWA ? `calc(0px - var(--safe-area-inset-bottom))` : 0, // Extend beyond safe area in PWA mode
        height: "100dvh",
        minHeight: "100dvh",
        backgroundColor: isMobile
          ? "var(--app-bg-color )"
          : "rgba(0, 0, 0, 0.5)",
        display: "flex",
        flexDirection: "column",
        alignItems: isMobile ? "stretch" : "flex-start",
        justifyContent: isMobile ? "stretch" : "center",
        paddingTop: isMobile ? 0 : "100px",
        zIndex: 10000,
      };

  // Ensure interactions remain responsive after tab/app switches on mobile
  useEffect(() => {
    const restoreInteraction = () => {
      try {
        document.body.removeAttribute("data-radial-menu-active");
        document.body.style.touchAction = "auto";
        document.documentElement.style.touchAction = "auto";
        (document.body.style as any).webkitUserSelect = "auto";
        (document.documentElement.style as any).webkitUserSelect = "auto";
        document.body.style.userSelect = "auto";
        document.documentElement.style.userSelect = "auto";
      } catch {}
    };

    restoreInteraction();
    const onVisibility = () => {
      if (!document.hidden) restoreInteraction();
    };
    const onFocus = () => restoreInteraction();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const closeIfBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  return (
    <>
      <div
        style={containerStyle}
        onClick={closeIfBackdrop}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <div
          style={{
            flex: 1,
            backgroundColor: "var(--app-bg-color)",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            width: "100%",
            maxWidth: "1000px",
            margin: "0 auto",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {showPostPublishView ? (
            <PostPublishView
              publishState={publishState}
              publishMessage={publishMessage}
              isSigning={isSigning}
              relayStatuses={relayStatuses}
              broadcastingComplete={broadcastingComplete}
              isMobile={isMobile}
              onViewNote={() => {
                if (publishedRepostId) {
                  try {
                    const bech32 = nip19.noteEncode(publishedRepostId);
                    navigate({
                      to: `/note/$noteId`,
                      params: { noteId: bech32 },
                    });
                    onClose();
                  } catch (error) {
                    console.error("Failed to navigate to repost:", error);
                    // Fallback: navigate with raw hex ID
                    navigate({
                      to: `/note/$noteId`,
                      params: { noteId: publishedRepostId },
                    });
                    onClose();
                  }
                }
              }}
              error={error || undefined}
              powUpdateKey={activeSession ? activeSession.nonce : 0}
              onRetryWithAuth={performRepost}
              showAuthOptions={true}
              currentPubkeyHex={hexPubkey}
              getDisplayNameForPubkey={getDisplayNameForPubkey}
            />
          ) : (
            <>
              {/* Repost Header */}
              {/* Content */}
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  padding: "1rem",
                  boxSizing: "border-box",
                  position: "relative",
                }}
              >
                {/* Combined container for input and target note */}
                <div
                  style={{
                    borderLeft: "1px solid var(--border-color)",
                    borderTop: "1px solid var(--border-color)",
                    padding: "0.5rem 0 0.75rem 0",
                    borderRadius: "0px",
                    backgroundColor: "transparent",
                    position: "relative",
                    marginBottom: "0",
                  }}
                >
                  {/* Input area - at the top */}
                  <div
                    ref={containerRef}
                    style={{
                      padding: "0 0 0.75rem 0.75rem",
                      // borderBottom: "1px solid var(--border-color)",
                      ...getInputAreaStyles(),
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        position: "relative",
                        zIndex: 100,
                      }}
                    >
                      <textarea
                        autoFocus
                        ref={textareaRef}
                        value={content}
                        onChange={handleTextareaChange}
                        onInput={handleTextareaInput}
                        onKeyDown={handleTextareaKeyDown}
                        placeholder="Say something about the quoted note (optional)…"
                        style={getTextareaStyles()}
                      />
                      {error && (
                        <div
                          style={{
                            color: "var(--text-color)",
                            fontSize: "var(--font-size-sm)",
                            marginTop: "0.25rem",
                            opacity: 0.8,
                          }}
                        >
                          {error}
                        </div>
                      )}

                      <MentionDropdown
                        matches={mentionState.matches}
                        selectedIndex={mentionState.selectedIndex}
                        isActive={mentionState.isActive}
                        onSelect={handleSelectMention}
                        onClose={mentionState.closeMention}
                        style={
                          !isMobile
                            ? {
                                top:
                                  (textareaRef.current?.offsetTop ?? 0) +
                                  (textareaRef.current?.offsetHeight ?? 0) +
                                  4,
                                left: textareaRef.current?.offsetLeft ?? 0,
                              }
                            : {}
                        }
                        isMobile={isMobile}
                      />
                    </div>

                    {/* Buttons right-aligned under input */}
                    <div
                      style={{
                        marginTop: "0.75rem",
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: "0.5rem",
                        float: "right",
                        minHeight: "20px",
                      }}
                    >
                      <button
                        onClick={closeModal}
                        onTouchEnd={(e) => {
                          e.preventDefault();
                          closeModal();
                        }}
                        style={{
                          backgroundColor: "transparent",
                          color: "var(--text-color)",
                          border: "1px dotted var(--border-color)",
                          fontSize: "var(--font-size-base)",
                          padding: "0.25rem 0.75rem",
                          height: "28px",
                          minHeight: "20px",
                          cursor: "pointer",
                          opacity: 0.9,
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handlePost}
                        onTouchEnd={(e) => {
                          e.preventDefault();
                          handlePost();
                        }}
                        disabled={!canPost || isPosting}
                        style={{
                          backgroundColor: "transparent",
                          fontSize: "var(--font-size-base)",
                          padding: "0.25rem 0.75rem",
                          height: "28px",
                          minHeight: "20px",
                          cursor:
                            !canPost || isPosting ? "not-allowed" : "pointer",
                          opacity: !canPost || isPosting ? 0.5 : 0.9,

                          textTransform: "uppercase",
                          transition: "all 0.3s ease",
                          borderRadius: "0",
                          whiteSpace: "nowrap",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "1px solid var(--accent-color)", // Accent border
                          color: "var(--accent-color)", // Accent text color
                          fontWeight: "bold" as const,
                          filter: "var(--accent-glow-filter)", // Glow effect like SVG icons
                        }}
                      >
                        {isPosting
                          ? "Posting…"
                          : content.trim().length > 0
                            ? "Quote Repost"
                            : "Repost"}
                      </button>
                    </div>
                  </div>

                  {/* Original note content - with left margin and borders */}
                  <div
                    style={{
                      marginLeft: "1rem",
                      borderLeft: "1px solid var(--border-color)",
                      borderTop: "1px solid var(--border-color)",
                      borderRadius: "0px",
                      padding: "0.75rem",
                      backgroundColor: "transparent",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <a
                        href={`/npub/${nip19.npubEncode(
                          loadedParent?.pubkey || ""
                        )}`}
                        onClick={(e) => {
                          e.preventDefault();
                          if (loadedParent) {
                            const backToPath = `${location.pathname}${
                              location.search || ""
                            }`;
                            const navigationState = {
                              fromNoteView: true,
                              backToPath,
                            };

                            // Store navigation state in sessionStorage as backup
                            try {
                              sessionStorage.setItem(
                                "noteViewNavigationState",
                                JSON.stringify(navigationState)
                              );
                            } catch (error) {
                              // Ignore errors
                            }

                            navigate({
                              to: `/npub/${nip19.npubEncode(
                                loadedParent.pubkey
                              )}`,
                              state: true,
                            });
                          }
                        }}
                        style={{
                          color: "var(--link-color)",
                          textDecoration: "underline",
                          fontWeight: "bold",
                          fontSize: "var(--font-size-sm)",
                          cursor: "pointer",
                        }}
                      >
                        {isLoadingParent ? (
                          <LoadingTextPlaceholder
                            type="custom"
                            customLength={8}
                          />
                        ) : (
                          displayName
                        )}
                      </a>
                      <span
                        style={{
                          fontSize: "var(--font-size-base)",
                          opacity: 0.8,
                          color: "var(--text-color)",
                        }}
                      >
                        {createdRelative}
                      </span>
                      {!isLoadingParent && (
                        <button
                          onClick={goToNote}
                          title="Link to this note"
                          style={{
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                            color: "var(--link-color)",
                            display: "flex",
                            minWidth: "14px",
                            alignItems: "center",
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M10 13a5 5 0 0 0 7.07 0l1.83-1.83a5 5 0 1 0-7.07-7.07L9 5" />
                            <path d="M14 11a5 5 0 0 0-7.07 0L5.1 12.83a5 5 0 1 0 7.07 7.07L15 19" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {isLoadingParent ? (
                      <div style={{ width: "100%" }}>
                        <LoadingTextPlaceholder
                          type="custom"
                          customLength={24}
                        />
                      </div>
                    ) : (
                      loadedParent?.content && (
                        <div style={{ width: "100%" }}>
                          <div
                            ref={noteTextRef}
                            style={{
                              color: "var(--text-color)",
                              fontSize: "var(--font-size-base)",
                              lineHeight: "1.4",
                              textAlign: "left",
                              overflow: "hidden",
                              maxHeight: isTextExpanded ? "none" : "100px",
                            }}
                          >
                            <NoteContentRenderer
                              content={loadedParent.content}
                              useAscii={useAscii}
                              useColor={useColor}
                              imageMode={imageMode}
                              onExpandContainer={() => {}}
                              getDisplayNameForPubkey={getDisplayNameForPubkey}
                              onHashtagClick={onHashtagClick}
                              noteId={loadedParent.id}
                              index={0}
                              style={{
                                color: "var(--text-color)",
                                fontSize: "var(--font-size-base)",
                                textAlign: "left",
                                lineHeight: "1.4",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                overflowWrap: "break-word",
                              }}
                            />
                          </div>
                          {showMoreButton && !isTextExpanded && (
                            <span
                              onClick={() => {
                                setIsExpanding(true);
                                setTimeout(() => {
                                  setIsTextExpanded(true);
                                  setIsExpanding(false);
                                }, 100);
                              }}
                              style={{
                                color: "var(--text-color)",
                                cursor: isExpanding ? "not-allowed" : "pointer",
                                fontSize: "var(--font-size-base)",
                                textDecoration: "underline",
                                marginTop: "0.25rem",
                                display: "inline-block",
                                opacity: isExpanding ? 0.7 : 1,
                              }}
                              role="button"
                            >
                              {isExpanding ? (
                                <LoadingTextPlaceholder
                                  type="custom"
                                  customLength={9}
                                />
                              ) : (
                                "Show more"
                              )}
                            </span>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* All modals are now rendered globally in MainLayout */}
    </>
  );
};

export default RepostModal;

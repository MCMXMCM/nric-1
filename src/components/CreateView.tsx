import React, { useContext, useMemo, useState, useCallback } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { useHaptic } from "use-haptic";
import { NostrContext } from "../contexts/NostrContext";
import { useRelayManager } from "../hooks/useRelayManager";
import { useNostrFeedState } from "../hooks/useNostrFeedState";
import { useDisplayNames } from "../hooks/useDisplayNames";
import { useModalContext } from "../contexts/ModalContext";
import { DEFAULT_RELAY_URLS } from "../utils/nostr/constants";

import { usePowState } from "../stores/powStore";
// Header is provided by parent layout; no local imports needed
import { nip19 } from "nostr-tools";
// import { publishNote } from "../utils/nostr/publish";
import { hasInMemorySecretKey } from "../utils/nostr/nip07";
import { determinePowTargetBits } from "../utils/nostr/powConfig";
import {
  filterRelaysByEventKind,
  filterRelaysByEventKindAndCapabilities,
} from "../utils/nostr/publish";
import { useMultipleRelayInfo } from "../hooks/useRelayInfo";
import type { RelayInfo } from "../utils/nostr/relayInfo";
import PostPublishView, { type RelayPublishStatus } from "./PostPublishView";
import { usePersistentInput } from "../hooks/usePersistentInput";
import { useIosKeyboardFix } from "../hooks/useIosKeyboardFix";
import FileUploader from "./FileUploader";
import { navigateBackOrHome } from "../utils/modalUrlState";
import { invalidateCurrentUserProfileNotes } from "../utils/nostr/queryInvalidation";
import { useQueryClient } from "@tanstack/react-query";
import { useMentionAutocomplete } from "../hooks/useMentionAutocomplete";
import MentionDropdown from "./ui/MentionDropdown";
import {
  insertMention,
  getCursorPositionAfterMention,
} from "../utils/mentions";
// No cache controls needed in CreateView

const CreateView: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    nostrClient,
    pubkey: ctxPubkey,
    nip07Available,
  } = useContext(NostrContext);
  const queryClient = useQueryClient();
  const state = useNostrFeedState();
  const modalContext = useModalContext();

  const { relayUrls, writeRelays, relayPermissions } = useRelayManager({
    nostrClient,
    initialRelays: DEFAULT_RELAY_URLS,
    pubkeyHex: ctxPubkey,
  });

  // Fetch relay information for enhanced filtering
  const { relayInfos } = useMultipleRelayInfo({
    relayUrls: writeRelays,
    enabled: true,
  });

  // Subscribe to POW state changes to ensure re-renders
  const { activeSession } = usePowState();

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

  const { getDisplayNameForPubkey } = useDisplayNames(relayUrls);
  const displayNameOrNpub = useMemo(() => {
    if (!hexPubkey) return "";
    const dn = getDisplayNameForPubkey(hexPubkey);
    if (dn && dn.trim().length > 0) return dn;
    try {
      return nip19.npubEncode(hexPubkey);
    } catch {
      return hexPubkey;
    }
  }, [hexPubkey, getDisplayNameForPubkey]);

  const [content, setContent, clearPersistedContent] = usePersistentInput(
    "create-view-content",
    ""
  );
  const wordCount = useMemo(() => {
    const trimmed = content.trim();
    if (trimmed.length === 0) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
  }, [content]);
  const [error, setError] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState<boolean>(false);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);
  const [broadcastingComplete, setBroadcastingComplete] = useState(false);
  const [relayStatuses, setRelayStatuses] = useState<RelayPublishStatus[]>([]);
  const [uploadedFileTags, setUploadedFileTags] = useState<string[][]>([]);
  // No local cache stats required here
  const [publishState, setPublishState] = useState<
    "idle" | "publishing" | "success" | "error"
  >("idle");
  const [publishMessage, setPublishMessage] = useState<string>("");
  const [isSigning, setIsSigning] = useState<boolean>(false);
  // Track publish status only; navigation uses returned id directly

  // Mention autocomplete handling
  const mentionState = useMentionAutocomplete();

  // iOS keyboard handling
  const {
    containerRef,
    textareaRef,
    autoResizeTextarea,
    handleTextareaInput,
    getContentAreaStyles,
    getTextareaStyles,
  } = useIosKeyboardFix(state.isMobile);

  // Authentication check hook

  // Auto-resize textarea for mobile
  React.useEffect(() => {
    autoResizeTextarea();
  }, [content, autoResizeTextarea]);

  // POW state is now managed by TanStack Store - no manual event listeners needed

  const canPost = useMemo(() => {
    return (
      !!nostrClient &&
      !!hexPubkey &&
      (content.trim().length > 0 || uploadedFileTags.length > 0) &&
      writeRelays.length > 0
    );
  }, [nostrClient, hexPubkey, content, writeRelays.length]);

  // Haptic feedback hook
  const { triggerHaptic } = useHaptic();

  const handleBack = useCallback(() => {
    // Clear any persisted content when canceling/backing out
    clearPersistedContent();
    try {
      navigateBackOrHome(navigate, location as any);
    } catch {
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
      });
    }
  }, [navigate, location.state, clearPersistedContent]);

  const handleFileUploaded = useCallback(
    (tags: string[][]) => {
      console.log("📎 File uploaded successfully! Tags:", tags);
      setUploadedFileTags((prev) => [...prev, ...tags]);

      // Extract media URLs from NIP-94 tags
      // The first tag is guaranteed to be ['url', 'actual_url'] according to Blossom docs
      const mediaUrls: string[] = [];

      // Find the MIME type from tags
      const mimeTag = tags.find((tag) => tag[0] === "m");
      const mimeType = mimeTag ? mimeTag[1] : "";

      for (const tag of tags) {
        if (tag[0] === "url" && tag[1]) {
          const url = tag[1];
          // Include both image and video URLs (based on extension or MIME type)
          const mediaExtensions =
            /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|avi|mkv)$/i;
          const isImageMime = /^image\//.test(mimeType);
          const isVideoMime = /^video\//.test(mimeType);

          if (mediaExtensions.test(url) || isImageMime || isVideoMime) {
            mediaUrls.push(url);
            console.log("📎 Added media URL to content:", url);
          }
        }
      }

      if (mediaUrls.length > 0) {
        // Append media URLs to end of textarea content safely with line breaks.
        setContent((prev) => {
          const withoutTrailingWhitespace = prev.replace(/\s*$/, "");
          const needsSeparator = withoutTrailingWhitespace.trim().length > 0;
          const separator = needsSeparator ? "\n\n" : "";
          const batch = mediaUrls.join("\n");
          const next = `${withoutTrailingWhitespace}${separator}${batch}\n`;
          console.log("📎 Updated content with media URLs:", next);
          return next;
        });
      } else {
        console.log("📎 No media URLs found in tags");
      }
    },
    [setContent]
  );

  const handleUploadError = useCallback((error: string) => {
    setError(error);
  }, []);

  const handleUploadStart = useCallback(() => {
    setError(null);
  }, []);

  const handleUploadComplete = useCallback(() => {
    // Upload completed successfully
  }, []);

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

  // Check authentication before attempting to post
  const checkAuthAndPost = useCallback(async () => {
    // 🎯 TRIGGER HAPTIC IMMEDIATELY (in user gesture context)

    try {
      triggerHaptic();
    } catch (error) {
      console.error("❌ Haptic feedback failed for note creation:", error);
    }

    setError(null);
    if (!canPost) {
      if (!hexPubkey) setError("Not signed in");
      else if (!nostrClient) setError("Nostr client not ready");
      else if (writeRelays.length === 0)
        setError("No write-enabled relays configured");
      else if (content.trim().length === 0) setError("Write something first");
      return;
    }

    // Check if user is authenticated for signing
    if (!hexPubkey) {
      modalContext.requireLogin(async () => {
        await performPost();
      }, "publish");
      return;
    }

    // Check if user needs to unlock their key
    const inMemoryKey = hasInMemorySecretKey();
    if (!inMemoryKey && !nip07Available) {
      modalContext.showUnlockModal("Post", performPost);
      return;
    }

    // User is authenticated, perform the post
    await performPost();
  }, [
    canPost,
    hexPubkey,
    nostrClient,
    writeRelays,
    content,
    triggerHaptic,
    modalContext,
    nip07Available,
  ]);

  const performPost = useCallback(async () => {
    setError(null);
    if (!canPost) {
      return;
    }
    try {
      setIsPosting(true);
      setPublishState("publishing");
      setPublishMessage("Publishing...");
      const ac = new AbortController();
      setAbortController(ac);
      // Create relayInfoMap from the fetched relay information
      const relayInfoMap = new Map<string, RelayInfo>();
      relayInfos.forEach((result, url) => {
        if (result.info) {
          relayInfoMap.set(url, result.info);
        }
      });

      // Filter relays based on permissions and capabilities FIRST
      let filteredRelayUrls: string[];
      if (relayPermissions && relayInfoMap.size > 0) {
        // Use enhanced filtering with NIP-11 capabilities
        filteredRelayUrls = filterRelaysByEventKindAndCapabilities(
          writeRelays,
          relayPermissions,
          relayInfoMap,
          1
        );
        console.log("🔍 CreateView: Used enhanced filtering with relayInfoMap");
      } else if (relayPermissions) {
        // Fallback to basic permission filtering
        filteredRelayUrls = filterRelaysByEventKind(
          writeRelays,
          relayPermissions,
          1
        );
        console.log(
          "🔍 CreateView: Used basic permission filtering (no relayInfoMap)"
        );
      } else {
        // No filtering if no permissions provided
        filteredRelayUrls = writeRelays;
        console.log("🔍 CreateView: No filtering applied (no permissions)");
      }

      // Additional safety check: manually filter out Purple Pages if it's still in the list
      // Purple Pages only accepts kind 0, 3, and 10002 - not kind 1 (notes)
      const originalFilteredRelayUrls = [...filteredRelayUrls];
      filteredRelayUrls = filteredRelayUrls.filter((url) => {
        if (url === "wss://purplepag.es") {
          console.log(
            "🔍 CreateView: Filtering out Purple Pages for kind 1 event (notes not supported)"
          );
          return false;
        }
        return true;
      });

      if (originalFilteredRelayUrls.length !== filteredRelayUrls.length) {
        console.log(
          "🔍 CreateView: Manually filtered out Purple Pages from final list"
        );
      }

      // Determine PoW requirements from the FILTERED relays only
      const powBits = await determinePowTargetBits(filteredRelayUrls, {
        defaultBits: 16,
        relayInfoMap: relayInfoMap,
      });
      if (!filteredRelayUrls || filteredRelayUrls.length === 0) {
        throw new Error("No write-enabled relays configured for posts");
      }
      setRelayStatuses(
        filteredRelayUrls.map((url) => ({ url, status: "pending" as const }))
      );

      // Sign (with PoW if required)
      if (powBits && powBits > 0) {
        setPublishMessage("Mining PoW...");
        setPublishState("publishing");
        // Ensure the status view paints before mining begins
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      } else {
        setPublishMessage("Preparing to sign...");
        setIsSigning(true);
      }

      const signed = await (
        await import("../utils/nostr/nip07")
      ).nip07SignEvent(
        {
          kind: 1,
          content: content.trim(),
          tags: uploadedFileTags,
        },
        {
          powTargetBits: powBits,
          signal: ac.signal,
          timeoutMs: 30000, // 30 second timeout for signing
        }
      );

      // If we were mining, now we're signing
      if (powBits && powBits > 0) {
        setPublishMessage("Signing with extension...");
        setIsSigning(true);
      }

      setIsSigning(false);

      // Broadcast to relays
      setPublishMessage("Broadcasting to relays...");
      setPublishState("publishing");

      // Publish to each relay in parallel, collect results
      const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> => {
        return new Promise<T>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("publish-timeout")), ms);
          p.then(
            (v) => {
              clearTimeout(t);
              resolve(v);
            },
            (e) => {
              clearTimeout(t);
              reject(e);
            }
          );
        });
      };
      const publishPromises = filteredRelayUrls.map(async (relayUrl, index) => {
        try {
          await withTimeout(
            nostrClient!.publish([relayUrl], signed as any),
            8000
          );
          return { relayUrl, success: true, index };
        } catch (e: any) {
          return {
            relayUrl,
            success: false,
            error: e?.message || String(e),
            index,
          };
        }
      });
      const results = await Promise.allSettled(publishPromises);
      // Progressive UI updates similar to ProfileEditModal
      results.forEach((res, i) => {
        if (res.status === "fulfilled") {
          const { success, error, index } = res.value as any;
          setTimeout(
            () => {
              setRelayStatuses((prev) =>
                prev.map((s, idx) =>
                  idx === index
                    ? {
                        ...s,
                        status: success ? "success" : "failed",
                        error: success
                          ? undefined
                          : typeof error === "string"
                            ? error
                            : "Unknown error",
                      }
                    : s
                )
              );
            },
            (i + 1) * 600
          );
        }
      });
      // Wait for UI updates to complete
      await new Promise((r) =>
        setTimeout(r, (filteredRelayUrls.length + 1) * 800)
      );
      const successCount = results.filter(
        (r) => r.status === "fulfilled" && (r as any).value.success
      ).length;
      if (successCount === 0) {
        throw new Error("All relay publishes failed");
      }
      setBroadcastingComplete(true);
      setPublishState("success");
      setPublishMessage("Published to some relays");

      // Invalidate cache for current user's profile notes so they see their new note immediately
      if (ctxPubkey) {
        invalidateCurrentUserProfileNotes(queryClient, ctxPubkey);
      }

      // Clear persisted content since post was successful
      clearPersistedContent();
      // Store last id for navigation
      try {
        (window as any)._nostree_lastNoteId = signed.id;
      } catch {}
    } catch (e: any) {
      const msg = e?.message || "Failed to post";
      setError(msg);
      setPublishState("error");
      setPublishMessage(msg);
      setIsSigning(false); // Reset signing state on error
      // Authentication error handling is now done in PostPublishView
    } finally {
      setIsPosting(false);
      setIsSigning(false); // Ensure signing state is reset
      setAbortController(null);
    }
  }, [
    canPost,
    nostrClient,
    writeRelays,
    content,
    hexPubkey,
    relayPermissions,
    clearPersistedContent,
    relayInfos,
    ctxPubkey,
    queryClient,
  ]);

  // Create handlePost that wraps checkAuthAndPost for backward compatibility
  const handlePost = checkAuthAndPost;

  return (
    <>
      <div
        className="nostr-feed"
        style={{
          width: "100%",
          height: "100%",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--app-bg-color )",
          overflow: "hidden",
        }}
      >
        {/* App Header (title + relays + settings) like in NostrFeed */}

        <div
          style={{
            width: "100%",
            maxWidth: state.isMobile ? "100%" : "1000px",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            flex: 1,
            overflow: "hidden",
          }}
        >
          {/* Back / Title / Post row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              padding: state.isMobile ? "0.5rem 1rem" : "0.5rem 1rem",
              backgroundColor: "var(--app-bg-color )",
              position: "relative",
            }}
          >
            {/* Back button (left) */}
            <button
              onClick={handleBack}
              style={{
                backgroundColor: "transparent",
                color: "var(--text-color)",
                border: "1px dotted var(--border-color)",

                fontSize: "var(--font-size-base)",
                textTransform: "uppercase",
                transition: "all 0.3s ease",
                borderRadius: "0",
                whiteSpace: "nowrap",
                height: state.isMobile ? "1.5rem" : "2rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "unset",
                padding: " 0.75rem",
                marginTop: "0.25rem",
                marginBottom: "0.25rem",
              }}
              title="Back to main feed"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              {"< Back"}
            </button>

            {/* Center title */}
            {!state.isMobile && (
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  transform: "translateX(-50%)",
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    color: "var(--text-color)",

                    fontSize: "var(--font-size-sm)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  Create Note
                </span>
              </div>
            )}

            {/* Right: Post */}
            {state.isMobile ? (
              <div
                style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}
              >
                <button
                  onClick={handlePost}
                  disabled={!canPost || isPosting}
                  style={{
                    backgroundColor: "transparent",
                    color: "var(--text-color)",
                    border: "1px dotted var(--border-color)",

                    fontSize: "var(--font-size-base)",
                    textTransform: "uppercase",
                    transition: "all 0.3s ease",
                    borderRadius: "0",
                    whiteSpace: "nowrap",
                    height: state.isMobile ? "1.5rem" : "2rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "unset",
                    padding: " 0.75rem",
                    marginTop: "0.25rem",
                    marginBottom: "0.25rem",
                    cursor: !canPost || isPosting ? "not-allowed" : "pointer",
                    opacity: !canPost || isPosting ? 0.6 : 1,
                  }}
                  title="Post"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--app-text-secondary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--app-text-secondary)";
                  }}
                >
                  PUBLISH
                </button>
              </div>
            ) : (
              <div
                style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}
              >
                <button
                  onClick={handlePost}
                  disabled={!canPost || isPosting}
                  style={{
                    backgroundColor: "transparent",
                    color: "var(--text-color)",
                    border: "1px dotted var(--border-color)",

                    fontSize: "var(--font-size-base)",
                    textTransform: "uppercase",
                    transition: "all 0.3s ease",
                    borderRadius: "0",
                    whiteSpace: "nowrap",
                    height: "2rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "unset",
                    padding: "0 0.75rem",
                    opacity: !canPost || isPosting ? 0.6 : 1,
                  }}
                  title="Post"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  Post
                </button>
                {isPosting && (
                  <button
                    onClick={() => abortController?.abort()}
                    style={{
                      backgroundColor: "transparent",
                      color: "var(--btn-accent)",
                      border: "1px dotted var(--border-color)",
                      fontSize: "var(--font-size-base)",
                      textTransform: "uppercase",
                      height: "2rem",
                      padding: "0 0.75rem",
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Mobile identity and word count row (top-left/top-right) */}
          {state.isMobile && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 1rem 0.25rem 1rem",
                backgroundColor: "var(--app-bg-color )",
              }}
            >
              <span
                style={{
                  color: "var(--text-color)",

                  fontSize: "var(--font-size-base)",
                  opacity: 0.85,
                }}
              >
                {displayNameOrNpub || ""}
              </span>
              <span
                style={{
                  color: "var(--text-color)",

                  fontSize: "var(--font-size-base)",
                  opacity: 0.85,
                }}
              >
                {wordCount} {wordCount === 1 ? "word" : "words"}
              </span>
            </div>
          )}

          {/* Content area with textarea */}
          <div
            ref={containerRef}
            style={{
              width: "100%",
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              paddingBottom: "var(--keyboard-inset-height, 0px)",
              scrollPaddingBottom: "var(--keyboard-inset-height, 0px)",
              ...getContentAreaStyles(),
            }}
          >
            <div
              className="notes-container"
              style={{
                width: "100%",
                flex: 1,
                minHeight: 0,
                paddingBottom: state.isMobile
                  ? "calc(15dvh + var(--safe-area-inset-bottom))"
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
                  height: "100%",
                  overflow: "visible",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    position: "relative",
                    height: "100%",
                    willChange: "transform",
                    padding: "1rem",
                    boxSizing: "border-box",
                  }}
                >
                  {publishState === "idle" ? (
                    !hexPubkey ? (
                      // Show sign-in modal when not authenticated
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          height: "100%",
                          padding: "2rem",
                          textAlign: "center",
                        }}
                      >
                        <div
                          style={{
                            color: "var(--text-color)",
                            fontSize: "var(--font-size-lg)",
                            marginBottom: "1rem",
                          }}
                        >
                          Sign in to create notes
                        </div>
                        <button
                          onClick={() =>
                            modalContext.setShowLoginOptionsModal(true)
                          }
                          style={{
                            backgroundColor: "transparent",
                            color: "var(--text-color)",
                            border: "1px dotted var(--border-color)",
                            fontSize: "var(--font-size-base)",
                            textTransform: "uppercase",
                            padding: "0.75rem 1.5rem",
                            cursor: "pointer",
                            transition: "all 0.3s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "var(--hover-bg)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "transparent";
                          }}
                        >
                          Sign In
                        </button>
                      </div>
                    ) : (
                      // Show file uploader and textarea when authenticated
                      <>
                        <FileUploader
                          onFileUploaded={handleFileUploaded}
                          onUploadError={handleUploadError}
                          onUploadStart={handleUploadStart}
                          onUploadComplete={handleUploadComplete}
                          disabled={!nip07Available && !hasInMemorySecretKey()}
                          maxFileSize={10 * 1024 * 1024} // 10MB
                          acceptedTypes={["image/*", "video/*"]}
                          isMobile={state.isMobile}
                        />
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
                            onFocus={() =>
                              textareaRef.current?.scrollIntoView({
                                block: "nearest",
                              })
                            }
                            placeholder="Write your note…"
                            style={{
                              ...getTextareaStyles(),
                              maxHeight: state.isMobile ? "25vh" : undefined,
                              overflowY: state.isMobile ? "auto" : undefined,
                              WebkitOverflowScrolling: state.isMobile
                                ? ("touch" as any)
                                : undefined,
                              paddingBottom:
                                "var(--keyboard-inset-height, 0px)",
                            }}
                          />
                          <MentionDropdown
                            matches={mentionState.matches}
                            selectedIndex={mentionState.selectedIndex}
                            isActive={mentionState.isActive}
                            onSelect={handleSelectMention}
                            onClose={mentionState.closeMention}
                            style={
                              !state.isMobile
                                ? {
                                    top:
                                      (textareaRef.current?.offsetTop ?? 0) +
                                      (textareaRef.current?.offsetHeight ?? 0) +
                                      4,
                                    left: textareaRef.current?.offsetLeft ?? 0,
                                  }
                                : {}
                            }
                            isMobile={state.isMobile}
                          />
                        </div>
                      </>
                    )
                  ) : (
                    <PostPublishView
                      publishState={publishState}
                      publishMessage={publishMessage}
                      isSigning={isSigning}
                      relayStatuses={relayStatuses}
                      broadcastingComplete={broadcastingComplete}
                      isMobile={state.isMobile}
                      onViewNote={() => {
                        const id = (window as any)._nostree_lastNoteId;
                        if (id) {
                          navigate({
                            to: `/note/$noteId`,
                            params: { noteId: id },
                          });
                        }
                      }}
                      error={error || undefined}
                      powUpdateKey={activeSession ? activeSession.nonce : 0}
                      onRetryWithAuth={handlePost}
                      showAuthOptions={true}
                      currentPubkeyHex={hexPubkey}
                      getDisplayNameForPubkey={getDisplayNameForPubkey}
                    />
                  )}

                  {/* Desktop bottom identity and word count */}
                  {!state.isMobile && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: "0.5rem",
                      }}
                    >
                      <span
                        style={{
                          color: "var(--text-color)",

                          fontSize: "var(--font-size-base)",
                          opacity: 0.85,
                        }}
                      >
                        {displayNameOrNpub || ""}
                      </span>
                      <span
                        style={{
                          color: "var(--text-color)",

                          fontSize: "var(--font-size-base)",
                          opacity: 0.85,
                        }}
                      >
                        {wordCount} {wordCount === 1 ? "word" : "words"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* All modals are now rendered globally in MainLayout */}
    </>
  );
};

export default CreateView;

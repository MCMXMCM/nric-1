import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import { useHaptic } from "use-haptic";
import { type Event, nip19 } from "nostr-tools";
import { getGlobalRelayPool } from "../utils/nostr/relayConnectionPool";
import type { Note } from "../types/nostr/types";
import { NostrContext } from "../contexts/NostrContext";
import {
  formatRelativeTime,
  extractImageUrls,
  extractVideoUrls,
} from "../utils/nostr/utils";
import LoadingTextPlaceholder from "./ui/LoadingTextPlaceholder";
import NoteContentRenderer from "./NoteContentRenderer";
import {
  filterRelaysByEventKind,
  filterRelaysByEventKindAndCapabilities,
} from "../utils/nostr/publish";
import { useMultipleRelayInfo } from "../hooks/useRelayInfo";
import type { RelayInfo } from "../utils/nostr/relayInfo";
import { useNavigate, useLocation } from "@tanstack/react-router";
import {
  parseModalState,
  updateUrlWithModalState,
  type ModalState,
} from "../utils/modalUrlState";

import UnlockKeyModal from "./UnlockKeyModal";
import { invalidateCurrentUserProfileNotes } from "../utils/nostr/queryInvalidation";
import { useQueryClient } from "@tanstack/react-query";
import { addNodeToTree, saveThreadTreeToStorage } from "../utils/threadCache";

import { dispatchThreadRefresh } from "../utils/nostr/threadEventManager";
import PostPublishView, {
  type RelayPublishStatus,
  type PublishState,
} from "./PostPublishView";
import { usePowState } from "../stores/powStore";

import { useRelayManager } from "../hooks/useRelayManager";
import { DEFAULT_RELAY_URLS } from "../utils/nostr/constants";
import { determinePowTargetBits } from "../utils/nostr/powConfig";
import { usePersistentInput } from "../hooks/usePersistentInput";
import { useIosKeyboardFix } from "../hooks/useIosKeyboardFix";
import FileUploader from "./FileUploader";
import { hasInMemorySecretKey } from "../utils/nostr/nip07";
import { CACHE_KEYS } from "../utils/cacheKeys";

import { useMentionAutocomplete } from "../hooks/useMentionAutocomplete";
import MentionDropdown from "./ui/MentionDropdown";
import {
  insertMention,
  getCursorPositionAfterMention,
} from "../utils/mentions";
import { useThreadStore } from "../state/threadStore";

interface ReplyModalProps {
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

export const ReplyModal: React.FC<ReplyModalProps> = ({
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
    `reply-modal-${parentNoteId}`,
    ""
  );
  const [isPosting, setIsPosting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState<boolean>(false);

  const [abortController, setAbortController] =
    useState<AbortController | null>(null);

  // Post-publish state
  const [publishState, setPublishState] = useState<PublishState>("idle");
  const [publishMessage, setPublishMessage] = useState<string>("");
  const [isSigning, setIsSigning] = useState<boolean>(false);
  const [relayStatuses, setRelayStatuses] = useState<RelayPublishStatus[]>([]);
  const [broadcastingComplete, setBroadcastingComplete] = useState(false);
  const [publishedReplyId, setPublishedReplyId] = useState<string | null>(null);
  const [showPostPublishView, setShowPostPublishView] = useState(false);
  const [uploadedFileTags, setUploadedFileTags] = useState<string[][]>([]);
  const [isNoteExpanded, setIsNoteExpanded] = useState(false);
  const [showMoreButton, setShowMoreButton] = useState<boolean>(false);
  const noteTextRef = useRef<HTMLDivElement | null>(null);

  // iOS keyboard handling
  const {
    containerRef,
    textareaRef,
    autoResizeTextarea,
    handleTextareaInput,
    getContainerStyles,
    getContentAreaStyles,
    getInputAreaStyles,
    getTextareaStyles,
  } = useIosKeyboardFix(isMobile);

  // Mention autocomplete handling
  const mentionState = useMentionAutocomplete();

  const navigate = useNavigate();
  const location = useLocation();

  const { relayPermissions, writeRelays: internalWriteRelays } =
    useRelayManager({
      nostrClient,
      initialRelays: DEFAULT_RELAY_URLS,
      pubkeyHex: ctxPubkey,
    });

  // Use internal relay manager data for consistency between URLs and permissions
  // This ensures relay filtering works correctly for both nsec and nip-07 login
  const consistentWriteRelays =
    internalWriteRelays.length > 0 ? internalWriteRelays : writeRelayUrls;
  const consistentReadRelays = readRelayUrls;

  // Fetch relay information for enhanced filtering
  const { relayInfos } = useMultipleRelayInfo({
    relayUrls:
      consistentWriteRelays.length > 0
        ? consistentWriteRelays
        : consistentReadRelays,
    enabled: true,
  });

  // Subscribe to POW state changes to ensure re-renders
  const { activeSession } = usePowState();

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

  // Ensure text area is visible when modal opens
  useEffect(() => {
    if (textareaRef.current && !isLoadingParent) {
      // Small delay to ensure DOM is fully rendered
      const timer = setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [isLoadingParent]);

  // Auto-resize textarea as content changes (mobile comfort)
  useEffect(() => {
    autoResizeTextarea();
  }, [content, autoResizeTextarea]);

  const displayName = useMemo(
    () => (loadedParent ? getDisplayNameForPubkey(loadedParent.pubkey) : ""),
    [loadedParent, getDisplayNameForPubkey]
  );
  const createdRelative = useMemo(
    () => (loadedParent ? formatRelativeTime(loadedParent.created_at) : ""),
    [loadedParent]
  );
  // Determine if note text needs a "View more" control by measuring rendered height
  useEffect(() => {
    const el = noteTextRef.current;
    if (el && loadedParent?.content) {
      setShowMoreButton(el.scrollHeight > 100);
    }
  }, [loadedParent?.content, isNoteExpanded]);

  const canPost = useMemo(() => {
    const writeSet =
      writeRelayUrls && writeRelayUrls.length > 0
        ? writeRelayUrls
        : readRelayUrls;
    return (
      !!nostrClient &&
      writeSet.length > 0 &&
      !!loadedParent &&
      content.trim().length > 0
    );
  }, [
    nostrClient,
    writeRelayUrls.length,
    readRelayUrls.length,
    loadedParent,
    content,
  ]);

  const closeModal = useCallback(() => {
    // Clear any persisted content when canceling
    clearPersistedContent();
    onClose();
  }, [onClose, clearPersistedContent]);

  const performReply = useCallback(async () => {
    // 🎯 TRIGGER HAPTIC IMMEDIATELY (in user gesture context)

    try {
      triggerHaptic();
    } catch (error) {
      console.error("❌ Haptic feedback failed for reply:", error);
    }

    // This is the actual reply logic, extracted for reuse after unlock
    if (!nostrClient || !loadedParent) return;
    setError(null);
    if (!canPost) {
      setError("Cannot post");
      return;
    }

    // Initialize post-publish state
    setPublishState("publishing");
    setPublishMessage("Preparing reply...");
    setShowPostPublishView(true);

    try {
      setIsPosting(true);
      const ac = new AbortController();
      setAbortController(ac);
      const writeSet =
        consistentWriteRelays.length > 0
          ? consistentWriteRelays
          : consistentReadRelays;

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
          writeSet,
          relayPermissions,
          relayInfoMap,
          1
        );
        console.log("🔍 Used enhanced filtering with relayInfoMap");
      } else if (relayPermissions) {
        // Fallback to basic permission filtering
        filteredRelayUrls = filterRelaysByEventKind(
          writeSet,
          relayPermissions,
          1
        );
        console.log("🔍 Used basic permission filtering (no relayInfoMap)");
      } else {
        // No filtering if no permissions provided
        filteredRelayUrls = writeSet;
        console.log("🔍 No filtering applied (no permissions)");
      }

      // Additional safety check: manually filter out Purple Pages if it's still in the list
      // Purple Pages only accepts kind 0, 3, and 10002 - not kind 1 (replies)
      const originalFilteredRelayUrls = [...filteredRelayUrls];
      filteredRelayUrls = filteredRelayUrls.filter((url) => {
        if (url === "wss://purplepag.es") {
          console.log(
            "🔍 Filtering out Purple Pages for kind 1 event (replies not supported)"
          );
          return false;
        }
        return true;
      });

      if (originalFilteredRelayUrls.length !== filteredRelayUrls.length) {
        console.log("🔍 Manually filtered out Purple Pages from final list");
      }

      // Determine PoW requirements from the FILTERED relays only
      console.log("🔍 Determining PoW for filtered relays:", filteredRelayUrls);
      const powBits = await determinePowTargetBits(filteredRelayUrls, {
        defaultBits: 16,
        relayInfoMap: relayInfoMap,
      });
      console.log("🔍 Determined PoW bits:", powBits);

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

      // Create reply event structure (same as publishReply does internally)
      const parentTags = Array.isArray(loadedParent.tags)
        ? loadedParent.tags
        : [];
      const eTags = parentTags.filter((t) => Array.isArray(t) && t[0] === "e");
      const replyTag = eTags.find((t) => t[3] === "reply");
      const rootTag = eTags.find((t) => t[3] === "root");
      const inferredRootId =
        rootTag?.[1] || replyTag?.[1] || eTags[0]?.[1] || loadedParent.id;

      const tags: string[][] = [];
      // For a direct reply to the thread root, include only root
      const replyingToRoot = inferredRootId === loadedParent.id;
      if (replyingToRoot) {
        tags.push([
          "e",
          loadedParent.id,
          writeSet[0],
          "root",
          loadedParent.pubkey,
        ]);
      } else {
        // root marker first, then reply marker
        tags.push([
          "e",
          inferredRootId,
          writeSet[0],
          "root",
          loadedParent.pubkey,
        ]);
        tags.push([
          "e",
          loadedParent.id,
          writeSet[0],
          "reply",
          loadedParent.pubkey,
        ]);
      }
      // p tags: include all parent's p tags plus parent author
      const pSet = new Set<string>();
      parentTags.forEach((t) => {
        if (t[0] === "p" && t[1]) pSet.add(t[1]);
      });
      pSet.add(loadedParent.pubkey);
      pSet.forEach((pk) => tags.push(["p", pk, writeSet[0]]));

      // Add uploaded file tags
      tags.push(...uploadedFileTags);

      // Sign the reply event
      console.log("🔑 Starting reply signing process...");
      console.log("  Event to sign:", {
        kind: 1,
        content: content.trim().substring(0, 50) + "...",
        tags,
      });
      console.log("  PoW bits:", powBits);

      let signed;
      try {
        signed = await (
          await import("../utils/nostr/nip07")
        ).nip07SignEvent(
          { kind: 1, content: content.trim(), tags },
          {
            powTargetBits: powBits,
            signal: ac.signal,
            timeoutMs: 30000,
          }
        );

        console.log("✅ Reply signed successfully:", signed.id);
      } catch (signingError) {
        console.error("❌ Reply signing failed:", signingError);
        throw signingError;
      }

      // If we were mining, now we're signing
      if (powBits && powBits > 0) {
        setPublishMessage("Signing with extension...");
        setIsSigning(true);
      }

      setIsSigning(false);

      // Broadcast to relays manually (same as CreateView)
      setPublishMessage("Broadcasting to relays...");

      // Debug logging to help diagnose relay filtering issues
      console.log("🔍 Reply Publishing Debug:");
      console.log("  writeSet:", writeSet);
      console.log(
        "  relayPermissions:",
        relayPermissions ? Array.from(relayPermissions.entries()) : "none"
      );
      console.log("  relayInfoMap size:", relayInfoMap.size);
      console.log(
        "  relayInfoMap contents:",
        Array.from(relayInfoMap.entries())
      );
      console.log("  relayInfos from hook:", Array.from(relayInfos.entries()));
      console.log("  filteredRelayUrls:", filteredRelayUrls);

      // Check if Purple Pages is in the filtered list
      const purplePagesInFiltered =
        filteredRelayUrls.includes("wss://purplepag.es");
      console.log("  Purple Pages in filtered relays:", purplePagesInFiltered);

      // Set up relay statuses for display (only for relays we'll actually publish to)
      setRelayStatuses(
        filteredRelayUrls.map((url) => ({ url, status: "pending" as const }))
      );

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

      // Progressive UI updates for relay statuses
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

      setPublishedReplyId(signed.id);
      // Optimistic cache updates: make the reply visible immediately in thread and profile
      try {
        // 1) Write-through individual note cache
        const optimisticNote: Note = {
          id: signed.id,
          pubkey: (signed as any).pubkey || hexPubkey,
          content: (signed as any).content || content.trim(),
          created_at:
            (signed as any).created_at || Math.floor(Date.now() / 1000),
          kind: (signed as any).kind || 1,
          tags: (signed as any).tags || [],
          imageUrls: extractImageUrls(
            (signed as any).content || content.trim()
          ),
          videoUrls: extractVideoUrls(
            (signed as any).content || content.trim()
          ),
          receivedAt: Date.now(),
        };
        queryClient.setQueryData(
          CACHE_KEYS.NOTE(optimisticNote.id),
          optimisticNote
        );

        // 2) Optimistically append to thread LEVEL1 ids for the parent
        if (loadedParent?.id) {
          queryClient.setQueryData(
            CACHE_KEYS.THREAD.LEVEL1(loadedParent.id),
            (prev: any) => {
              const prevIds: string[] = Array.isArray(prev?.directChildrenIds)
                ? (prev!.directChildrenIds as string[])
                : [];
              const prevNotes: Note[] = Array.isArray(prev?.directChildren)
                ? (prev!.directChildren as Note[])
                : [];
              if (prevIds.includes(optimisticNote.id)) return prev;
              return {
                ...(prev && typeof prev === "object" ? prev : {}),
                directChildrenIds: [...prevIds, optimisticNote.id],
                directChildren: [...prevNotes, optimisticNote],
              };
            }
          );

          // 2b) CRITICAL: Also optimistically update the main nostrify-thread query
          // This is the query used by useNostrifyThread hook in ThreadPage
          queryClient.setQueriesData(
            {
              queryKey: ["nostrify-thread", loadedParent.id],
              exact: false,
            },
            (prev: any) => {
              if (!prev || !Array.isArray(prev.pages)) return prev;
              const pages = prev.pages as Array<{ notes: Note[] }>;
              if (pages.length === 0) return prev;
              const firstPage = pages[0];
              if (!firstPage || !Array.isArray(firstPage.notes)) return prev;
              // Check if note already exists
              if (firstPage.notes.some((n) => n.id === optimisticNote.id))
                return prev;
              // Append the new reply to the first page
              const updatedFirstPage = {
                ...firstPage,
                notes: [...firstPage.notes, optimisticNote],
              };
              return {
                ...prev,
                pages: [updatedFirstPage, ...pages.slice(1)],
              };
            }
          );

          // 2c) Optimistically update NESTED children maps so NestedReplies sees the new child immediately
          try {
            queryClient.setQueriesData(
              {
                queryKey: ["thread", "nested", loadedParent.id],
                exact: false,
              },
              (prev: any) => {
                if (!prev || typeof prev !== "object") return prev;
                const prevIdMap = (prev.childrenIdMap || {}) as Record<
                  string,
                  string[]
                >;
                const prevNotesMap = (prev.childrenByParentId || {}) as Record<
                  string,
                  Note[]
                >;
                const existingIds = Array.isArray(prevIdMap[loadedParent.id])
                  ? prevIdMap[loadedParent.id]
                  : [];
                const existingNotes = Array.isArray(
                  prevNotesMap[loadedParent.id]
                )
                  ? prevNotesMap[loadedParent.id]
                  : [];
                if (
                  existingIds.includes(optimisticNote.id) ||
                  existingNotes.some((n) => n.id === optimisticNote.id)
                ) {
                  return prev;
                }
                return {
                  ...prev,
                  childrenIdMap: {
                    ...prevIdMap,
                    [loadedParent.id]: [...existingIds, optimisticNote.id],
                  },
                  childrenByParentId: {
                    ...prevNotesMap,
                    [loadedParent.id]: [...existingNotes, optimisticNote],
                  },
                };
              }
            );
          } catch {}
        }

        // 3) Update the in-memory thread store used by ThreadPage so the reply appears immediately
        try {
          const addOptimisticReply = useThreadStore.getState().addOptimisticReply;
          const rootTag = (signed.tags || []).find(
            (t: any) => Array.isArray(t) && t[0] === "e" && t[3] === "root"
          );
          const computedRootId = (rootTag && rootTag[1]) || loadedParent.id;

          const storeNote: Note = {
            id: signed.id,
            pubkey: (signed as any).pubkey || hexPubkey || ctxPubkey || "",
            content: (signed as any).content || content.trim(),
            created_at:
              (signed as any).created_at || Math.floor(Date.now() / 1000),
            kind: (signed as any).kind || 1,
            tags: (signed as any).tags || [],
            imageUrls: extractImageUrls(
              (signed as any).content || content.trim()
            ),
            videoUrls: extractVideoUrls(
              (signed as any).content || content.trim()
            ),
            receivedAt: Date.now(),
          };

          // Update under the computed root id and also under the parent-as-root key
          addOptimisticReply(computedRootId, loadedParent.id, storeNote);
          if (computedRootId !== loadedParent.id) {
            addOptimisticReply(loadedParent.id, loadedParent.id, storeNote);
          }
        } catch {}

        // 4) Optimistically prepend into current user's profile feed first page if present
        if (ctxPubkey) {
          // Build partial prefix of profile feed query keys used by useNostrifyFeed
          // Key format: ['nostrify-feed', authorKey, kindsKey, relayKey, flagsKey, hashtagsKey, mutedLen, pageSize]
          // We match authorKey = ctxPubkey and kindsKey containing '1' or '1,6'
          queryClient.setQueriesData(
            {
              queryKey: ["nostrify-feed"],
              exact: false,
              predicate: (q) => {
                const k = q.queryKey as any[];
                // Ensure shape and author match
                if (!Array.isArray(k) || k.length < 3) return false;
                const authorKey = k[1];
                const kindsKey = k[2];
                if (authorKey !== ctxPubkey) return false;
                // Consider notes-only or notes+reposts feeds
                return (
                  typeof kindsKey === "string" &&
                  (kindsKey === "1" || kindsKey.includes("1"))
                );
              },
            },
            (prev: any) => {
              if (!prev || !Array.isArray(prev.pages)) return prev;
              const pages = prev.pages as Array<{ notes: Note[] }>;
              if (pages.length === 0) return prev;
              const first = pages[0];
              if (!first || !Array.isArray(first.notes)) return prev;
              if (first.notes.some((n) => n.id === optimisticNote.id))
                return prev;
              const updatedFirst = {
                ...first,
                notes: [optimisticNote, ...first.notes],
              };
              return {
                ...prev,
                pages: [updatedFirst, ...pages.slice(1)],
              };
            }
          );
        }

        // 5) If replying to a nested comment, also update the root thread
        try {
          const eTags = Array.isArray(signed?.tags)
            ? (signed.tags as any[])
            : [];
          const rootTag = eTags.find(
            (t) => Array.isArray(t) && t[0] === "e" && t[3] === "root"
          );
          const replyTag = eTags.find(
            (t) => Array.isArray(t) && t[0] === "e" && t[3] === "reply"
          );
          const rootId: string | null = rootTag?.[1] || replyTag?.[1] || null;

          // If there's a root thread different from the direct parent, optimistically update it too
          if (rootId && rootId !== loadedParent.id) {
            queryClient.setQueriesData(
              {
                queryKey: ["nostrify-thread", rootId],
                exact: false,
              },
              (prev: any) => {
                if (!prev || !Array.isArray(prev.pages)) return prev;
                const pages = prev.pages as Array<{ notes: Note[] }>;
                if (pages.length === 0) return prev;
                const firstPage = pages[0];
                if (!firstPage || !Array.isArray(firstPage.notes)) return prev;
                // Check if note already exists
                if (firstPage.notes.some((n) => n.id === optimisticNote.id))
                  return prev;
                // Append the new reply to the first page
                const updatedFirstPage = {
                  ...firstPage,
                  notes: [...firstPage.notes, optimisticNote],
                };
                return {
                  ...prev,
                  pages: [updatedFirstPage, ...pages.slice(1)],
                };
              }
            );

            // 4b) Also ensure NESTED maps under the immediate parent are updated in the root's NESTED cache
            try {
              queryClient.setQueriesData(
                {
                  queryKey: ["thread", "nested", rootId],
                  exact: false,
                },
                (prev: any) => {
                  if (!prev || typeof prev !== "object") return prev;
                  const prevIdMap = (prev.childrenIdMap || {}) as Record<
                    string,
                    string[]
                  >;
                  const prevNotesMap = (prev.childrenByParentId ||
                    {}) as Record<string, Note[]>;
                  const parentKey = loadedParent.id;
                  const existingIds = Array.isArray(prevIdMap[parentKey])
                    ? prevIdMap[parentKey]
                    : [];
                  const existingNotes = Array.isArray(prevNotesMap[parentKey])
                    ? prevNotesMap[parentKey]
                    : [];
                  if (
                    existingIds.includes(optimisticNote.id) ||
                    existingNotes.some((n) => n.id === optimisticNote.id)
                  ) {
                    return prev;
                  }
                  return {
                    ...prev,
                    childrenIdMap: {
                      ...prevIdMap,
                      [parentKey]: [...existingIds, optimisticNote.id],
                    },
                    childrenByParentId: {
                      ...prevNotesMap,
                      [parentKey]: [...existingNotes, optimisticNote],
                    },
                  };
                }
              );
            } catch {}
          }
        } catch {}
      } catch {}
      try {
        // Optimistically add the new reply to the thread tree
        // This ensures it appears immediately in the thread view
        const replyNote: Note = {
          id: signed.id,
          content: content,
          pubkey: ctxPubkey || "",
          created_at: signed.created_at,
          kind: 1,
          tags: signed.tags || [],
          imageUrls: [],
          videoUrls: [],
          receivedAt: Date.now(),
        };

        // Get the root ID from the reply tags to update the correct thread tree
        const eTags = Array.isArray(signed?.tags) ? (signed.tags as any[]) : [];
        const rootTag = eTags.find(
          (t) => Array.isArray(t) && t[0] === "e" && t[3] === "root"
        );
        const rootId = rootTag?.[1] || loadedParent.id;

        const treeKey = CACHE_KEYS.THREAD.GLOBAL_TREE(rootId);
        const currentTree = queryClient.getQueryData(treeKey) as any;

        if (currentTree && currentTree.rootId) {
          // Add the new note to the tree
          const updatedTree = addNodeToTree(
            currentTree,
            replyNote,
            loadedParent.id
          );
          queryClient.setQueryData(treeKey, updatedTree);
          saveThreadTreeToStorage(updatedTree);
        }

        // Also add to individual note cache
        queryClient.setQueryData(CACHE_KEYS.NOTE(signed.id), replyNote);

        // Store the reply ID for navigation
        (window as any)._nostree_lastReply = {
          parentId: loadedParent.id,
          event: signed,
        };

        // Now invalidate to fetch any updates from relays
        dispatchThreadRefresh(loadedParent.id);
        // Also invalidate the thread for the root of the conversation if available
        try {
          const eTags = Array.isArray(signed?.tags)
            ? (signed.tags as any[])
            : [];
          const rootTag = eTags.find(
            (t) => Array.isArray(t) && t[0] === "e" && t[3] === "root"
          );
          const replyTag = eTags.find(
            (t) => Array.isArray(t) && t[0] === "e" && t[3] === "reply"
          );
          const rootId: string | null = rootTag?.[1] || replyTag?.[1] || null;
          if (rootId && rootId !== loadedParent.id) {
            dispatchThreadRefresh(rootId);
          }
          // Best effort: dispatch again after a short delay to catch late relay propagation
          setTimeout(() => {
            dispatchThreadRefresh(loadedParent.id);
            if (rootId && rootId !== loadedParent.id) {
              dispatchThreadRefresh(rootId);
            }
          }, 600);
        } catch {}
      } catch {}
      setPublishState("success");
      setPublishMessage("Reply published successfully");
      setBroadcastingComplete(true);

      // Invalidate cache for current user's profile notes so they see their new reply immediately
      if (ctxPubkey) {
        invalidateCurrentUserProfileNotes(queryClient, ctxPubkey);
      }

      // Clear persisted content since reply was successful
      clearPersistedContent();

      // Keep the modal open to show success state - user can click "View Thread" when ready
    } catch (e: any) {
      const msg = e?.message || "Failed to post reply";
      setError(msg);
      setPublishState("error");
      setPublishMessage(msg);
      setIsSigning(false);

      // Authentication error handling is now done in PostPublishView
    } finally {
      setIsPosting(false);
      setIsSigning(false);
      setAbortController(null);
    }
  }, [
    nostrClient,
    writeRelayUrls,
    readRelayUrls,
    loadedParent,
    content,
    navigate,
    location,
    onClose,
    canPost,
    nip07Available,
    hexPubkey,
    listSavedAccounts,
    ctxPubkey,
    relayPermissions,
    triggerHaptic,
  ]);

  const handlePost = useCallback(async () => {
    // Let PostPublishView handle all authentication via "Sign In & Retry" button
    await performReply();
  }, [performReply]);

  // Load saved accounts when needed

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
        marginTop: "4rem",
        maxHeight: isMobile ? "100%" : "80vh", // Desktop behavior for within-container mode
        overflow: "hidden",
        ...getContainerStyles(),
      }
    : {
        position: "fixed",
        top: 0,
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
        paddingTop: isMobile ? 0 : "",
        zIndex: 10000,
        ...getContainerStyles(),
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
            marginTop: "6rem",
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
                if (publishedReplyId) {
                  try {
                    const bech32 = nip19.noteEncode(publishedReplyId);
                    navigate({
                      to: `/note/$noteId`,
                      params: { noteId: bech32 },
                    });
                    onClose();
                  } catch (error) {
                    console.error("Failed to navigate to reply:", error);
                    // Fallback: navigate with raw hex ID
                    navigate({
                      to: `/note/$noteId`,
                      params: { noteId: publishedReplyId },
                    });
                    onClose();
                  }
                }
              }}
              onViewThread={() => {
                // Navigate to thread view of the parent note
                if (!loadedParent?.id) return;
                const state = parseModalState(
                  new URLSearchParams(location.search)
                );
                const next: ModalState = { ...state, thread: loadedParent.id };
                delete next.reply;
                updateUrlWithModalState(next, navigate, location);
                onClose();
              }}
              error={error || undefined}
              powUpdateKey={activeSession ? activeSession.nonce : 0}
              onRetryWithAuth={performReply}
              showAuthOptions={true}
              currentPubkeyHex={hexPubkey}
              getDisplayNameForPubkey={getDisplayNameForPubkey}
            />
          ) : (
            <>
              {/* Reply Header */}
              <div
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 100,
                  backgroundColor: "var(--app-bg-color, #f5f5f0)",
                  borderBottom: "1px solid var(--border-color)",
                  padding: "0rem 1rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              >
                <div style={{ flex: 1 }} />
                <div
                  style={{
                    fontSize: "var(--font-size-lg)",
                    fontWeight: "600",
                    color: "var(--text-color)",
                    textAlign: "center",
                    flex: 1,
                  }}
                >
                  Replying
                </div>
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    onClick={onClose}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      onClose();
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-color)",
                      cursor: "pointer",
                      padding: "0.25rem",
                      borderRadius: "0.25rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.25rem",
                      lineHeight: 1,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        "var(--hover-bg-color)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Content - same structure as ThreadModal content */}
              <div
                ref={containerRef}
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  padding: isMobile
                    ? "0.5rem 1rem calc(8rem + var(--safe-area-inset-bottom)) 1rem"
                    : "1rem 1rem 6rem 1rem",
                  scrollPaddingBottom: isMobile
                    ? "calc(8rem + var(--safe-area-inset-bottom))"
                    : "6rem",
                  boxSizing: "border-box",
                  ...getContentAreaStyles(),
                }}
              >
                {/* Parent note header - same structure as ThreadModal parent */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: "0.5rem",

                    marginBottom: "1rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
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
                        color: isMobile
                          ? "var(--link-color)"
                          : "var(--text-color)",
                        textDecoration: isMobile ? "underline" : "none",
                        fontWeight: "bold",
                        maxWidth: isMobile ? "40vw" : "750px",
                        textAlign: "left",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                        fontSize: "var(--font-size-sm)",
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => {
                        if (!isMobile) {
                          (
                            e.currentTarget as HTMLAnchorElement
                          ).style.textDecoration = "underline";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isMobile) {
                          (
                            e.currentTarget as HTMLAnchorElement
                          ).style.textDecoration = "none";
                        }
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
                      <LoadingTextPlaceholder type="custom" customLength={24} />
                    </div>
                  ) : (
                    loadedParent?.content && (
                      <div style={{ width: "100%" }}>
                        <div
                          ref={noteTextRef}
                          style={{
                            color: "var(--text-color)",
                            fontSize: "var(--font-size-sm)",
                            textAlign: "left",
                            lineHeight: "1.4",
                            whiteSpace: "pre-wrap",
                            overflow: "hidden",
                            maxHeight: isNoteExpanded ? "none" : "100px",
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
                              fontSize: "var(--font-size-sm)",
                              textAlign: "left",
                              lineHeight: "1.4",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              overflowWrap: "break-word",
                            }}
                          />
                        </div>
                        {showMoreButton && (
                          <div style={{ marginTop: "0rem" }}>
                            <button
                              onClick={() => setIsNoteExpanded(!isNoteExpanded)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "var(--link-color)",
                                cursor: "pointer",
                                fontSize: "var(--font-size-sm)",
                                textDecoration: "underline",
                                padding: 0,
                              }}
                            >
                              {isNoteExpanded ? "Show less" : "View more"}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>

                {/* Reply input list - same structure as ThreadModal comments list */}
                <ul
                  style={{
                    position: "relative",
                    margin: "0 0 0 1rem",
                    padding: 0,
                    listStyleType: "none",
                  }}
                >
                  <li
                    style={{
                      position: "relative",
                      paddingLeft: "1.5rem",
                      paddingTop: "1rem",
                      paddingBottom: "0.5rem",
                    }}
                  >
                    {/* Horizontal connector */}
                    <div
                      style={{
                        position: "absolute",
                        left: "0",
                        top: "50%",
                        width: "1rem",
                        height: "1px",
                        backgroundColor: "var(--border-color)",
                      }}
                    />
                    {/* Vertical line - truncated for last item */}
                    <div
                      style={{
                        position: "absolute",
                        left: "0",
                        top: "0",
                        bottom: "50%", // Always truncated as this is the only/last item
                        width: "1px",
                        backgroundColor: "var(--border-color)",
                      }}
                    />

                    {/* Content */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.25rem",
                        ...getInputAreaStyles(),
                      }}
                    >
                      <FileUploader
                        onFileUploaded={handleFileUploaded}
                        onUploadError={handleUploadError}
                        onUploadStart={handleUploadStart}
                        onUploadComplete={handleUploadComplete}
                        disabled={!nip07Available && !hasInMemorySecretKey()}
                        maxFileSize={10 * 1024 * 1024} // 10MB
                        acceptedTypes={["image/*", "video/*"]}
                        isMobile={isMobile}
                      />
                      <div style={{ width: "100%" }}>
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
                            onFocus={() =>
                              textareaRef.current?.scrollIntoView({
                                block: "nearest",
                              })
                            }
                            onKeyDown={handleTextareaKeyDown}
                            placeholder="Your reply…"
                            style={{
                              ...getTextareaStyles(),
                              maxHeight: isMobile ? "25vh" : undefined,
                              overflowY: isMobile ? "auto" : undefined,
                              WebkitOverflowScrolling: isMobile
                                ? ("touch" as any)
                                : undefined,
                            }}
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
                        <div
                          style={{
                            marginTop: "0.25rem",
                            textAlign: "right",
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: "0.5rem",
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
                              padding: "0.25rem 0.5rem",
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
                              color: "var(--text-color)",
                              border: "1px dotted var(--border-color)",

                              fontSize: "var(--font-size-base)",
                              padding: "0.25rem 0.5rem",
                              cursor:
                                !canPost || isPosting
                                  ? "not-allowed"
                                  : "pointer",
                              opacity: !canPost || isPosting ? 0.5 : 0.9,
                            }}
                          >
                            {isPosting ? "Posting…" : "Post"}
                          </button>
                          {isPosting && (
                            <button
                              onClick={() => abortController?.abort()}
                              style={{
                                backgroundColor: "transparent",
                                color: "var(--btn-accent)",
                                border: "1px dotted var(--border-color)",
                                fontSize: "var(--font-size-base)",
                                padding: "0.25rem 0.5rem",
                                cursor: "pointer",
                                opacity: 0.9,
                              }}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Authentication Modals - only show when NOT in PostPublishView */}
      {!showPostPublishView && (
        <>
          {/* Unlock Key Modal */}
          {showUnlockModal && (
            <UnlockKeyModal
              isOpen={showUnlockModal}
              onClose={() => setShowUnlockModal(false)}
              actionLabel="Post Reply"
              currentPubkeyHex={hexPubkey}
              onUnlocked={async (_selectedPubkeyHex: string) => {
                setShowUnlockModal(false);
                // After unlocking, perform the reply
                await performReply();
              }}
              getDisplayNameForPubkey={getDisplayNameForPubkey}
              metadata={{}} // Empty metadata since we don't need it for reply
            />
          )}
        </>
      )}
    </>
  );
};

export default ReplyModal;

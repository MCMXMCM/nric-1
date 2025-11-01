import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useHaptic } from "use-haptic";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { nip19, type Event, type Filter } from "nostr-tools";
import type { Note, Metadata } from "../types/nostr/types";
import {
  extractImageUrls,
  extractVideoUrls,
  removeMediaUrls,
} from "../utils/nostr/utils";
import { DesktopNoteHeader } from "./notecard/DesktopNoteHeader";
import { NoteContentContainer } from "./notecard/NoteContentContainer";
import { NoteModals } from "./notecard/NoteModals";

import { useZapTotalsQuery } from "../hooks/useZapTotalsQuery";
import { useUserZaps } from "../hooks/useUserZaps";
import { useReactionCountsQuery } from "../hooks/useReactionCountsQuery";
import { useReplyCountQuery } from "../hooks/useReplyCountQuery";
import { useBookmarks } from "../hooks/useBookmarks";
import ZapComments from "./ZapComments";
import { useReactionMutation } from "../hooks/useReactionMutation";
import { useParentNoteData } from "../hooks/useParentNoteData";
import { useRepostTargetData } from "../hooks/useRepostTargetData";
import { NostrContext } from "../contexts/NostrContext";
import { useRelayManager } from "../hooks/useRelayManager";
import { useAuthenticationCheck } from "../utils/authenticationUtils";
import { useModalContext } from "../contexts/ModalContext";

import { prefetchRoute } from "../utils/prefetch";
import { useCreatedByDisplayName } from "../hooks/useCreatedByDisplayName";
import { CACHE_KEYS } from "../utils/cacheKeys";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGlobalRelayPool,
  type RelayConnectionPool,
} from "../utils/nostr/relayConnectionPool";
import { prefetchThread } from "../utils/thread/prefetch";

interface NoteCardProps {
  note: Note;
  index: number;
  metadata: Record<string, Metadata>;
  asciiCache: Record<string, { ascii: string; timestamp: number }>;
  isDarkMode: boolean;
  useAscii: boolean;
  useColor: boolean;
  isMobile: boolean;
  copiedPubkeys: Set<string>;
  setCopiedPubkeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  setFullScreenImage: (url: string | null) => void;
  onAsciiRendered: (url: string, ascii: string) => void;
  onMediaLoadError: (noteId: string) => void;
  onImageDimensionsLoaded?: (
    noteId: string,
    imageUrl: string,
    dimensions: { width: number; height: number }
  ) => void;
  getDisplayNameForPubkey: (pubkey: string) => string;
  imageMode: boolean;
  readRelayUrls: string[];
  writeRelayUrls: string[];
  showZapModal?: boolean;
  setShowZapModal?: (show: boolean) => void;
  updateZapModalState?: (noteId: string | null) => void;
  showRepostModal?: boolean;
  setShowRepostModal?: (show: boolean) => void;
  updateRepostModalState?: (noteId: string | null) => void;
  onHashtagClick?: (hashtag: string) => void;
  showFullContent?: boolean;
}

const NoteCardComponent: React.FC<NoteCardProps> = ({
  note,
  index,
  metadata: _metadata,
  asciiCache,
  useAscii,
  useColor,
  isMobile,
  copiedPubkeys: _copiedPubkeys,
  setCopiedPubkeys: _setCopiedPubkeys,
  setFullScreenImage,
  onAsciiRendered,
  onMediaLoadError,
  onImageDimensionsLoaded,
  getDisplayNameForPubkey,
  imageMode,
  readRelayUrls,
  writeRelayUrls,
  showZapModal,
  setShowZapModal,
  updateZapModalState,
  showRepostModal,
  setShowRepostModal,
  updateRepostModalState,
  onHashtagClick,
  showFullContent = false,
}) => {
  // Do not early-return before hooks; compute validity and handle later in render
  const isValidNote = useMemo(() => {
    try {
      return Boolean(
        note &&
          typeof note === "object" &&
          (note as any).id &&
          (note as any).pubkey
      );
    } catch {
      return false;
    }
  }, [note]);

  const navigate = useNavigate();
  const location = useLocation();

  const { nostrClient, pubkey: myPubkey } = useContext(NostrContext) as any;

  const { relayPermissions, relayStatuses } = useRelayManager({
    nostrClient,
    pubkeyHex: myPubkey,
  });
  const queryClient = useQueryClient();

  // Bookmarks hook
  const { isBookmarked, toggleBookmark: toggleBookmarkFn } = useBookmarks();

  // Pool ref for note fetching
  const poolRef = useRef<RelayConnectionPool | null>(null);

  // Initialize pool
  React.useEffect(() => {
    if (!poolRef.current) {
      poolRef.current = getGlobalRelayPool();
    }
  }, []);

  // Build augmented relays function (same as NoteView)
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

  // Prefetch note data on hover/focus for better UX
  const prefetchNote = useCallback(
    async (noteId: string) => {
      if (!noteId || !readRelayUrls || readRelayUrls.length === 0) return;

      // Check if already cached
      const cached = queryClient.getQueryData<Note>(CACHE_KEYS.NOTE(noteId));
      if (cached) {
        return;
      }

      // Only prefetch if pool is initialized
      if (!poolRef.current) {
        return;
      }

      try {
        const filter: Filter = {
          kinds: [1],
          ids: [noteId],
          limit: 1,
        };

        const augmentedRelays = buildAugmentedRelays(readRelayUrls, note.tags);
        const pool = poolRef.current;

        let events: Event[] = await pool.querySync(augmentedRelays, filter);

        // If no events found with augmented relays, try with original relays only
        if (
          events.length === 0 &&
          augmentedRelays.length !== readRelayUrls.length
        ) {
          events = await pool.querySync(readRelayUrls, filter);
        }

        // If still no events, try with popular relays as fallback
        if (events.length === 0) {
          const popularRelays = [
            "wss://nos.lol",
            "wss://relay.snort.social",
            "wss://nostr.mom",
            "wss://purplepag.es",
            "wss://relay.nostr.band",
          ];
          events = await pool.querySync(popularRelays, filter);
        }

        if (events.length === 0) {
          console.warn(
            `❌ Note ${noteId.slice(0, 8)} not found during prefetch`
          );
          return;
        }

        const event = events[0];
        const mappedNote: Note = {
          id: event.id,
          content: event.content || "",
          pubkey: event.pubkey,
          created_at: event.created_at,
          tags: event.tags || [],
          imageUrls: [],
          videoUrls: [],
          receivedAt: Date.now(),
        };

        // Cache the prefetched note
        queryClient.setQueryData(CACHE_KEYS.NOTE(noteId), mappedNote);
      } catch (error) {
        console.error(
          `❌ Failed to prefetch note ${noteId.slice(0, 8)}:`,
          error
        );
      }
    },
    [queryClient, readRelayUrls, buildAugmentedRelays, note.tags]
  );

  const isNotePage = location.pathname.split("/")[1] === "note";

  // Bookmark toggle handler
  const handleToggleBookmark = useCallback(() => {
    if (isValidNote) {
      toggleBookmarkFn(note.id, note, getDisplayNameForPubkey(note.pubkey));
    }
  }, [isValidNote, note, toggleBookmarkFn, getDisplayNameForPubkey]);

  // Track image loading and errors using refs to avoid re-render loops

  // Detect iOS PWA mode for specific styling
  const isIOSPWA = useMemo(() => {
    return (
      isMobile &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true) &&
      /iPad|iPhone|iPod/.test(navigator.userAgent)
    );
  }, [isMobile]);

  // Safely handle note content
  const safeContent: string = useMemo(() => {
    try {
      const c: any = (note as any)?.content;
      return typeof c === "string" ? c : String(c ?? "");
    } catch {
      return "";
    }
  }, [note]);
  const imageUrls = useMemo(() => extractImageUrls(safeContent), [safeContent]);
  const videoUrls = useMemo(() => extractVideoUrls(safeContent), [safeContent]);
  const textContent = useMemo(
    () => (imageMode && note.kind !== 30023 ? removeMediaUrls(safeContent) : safeContent),
    [safeContent, imageMode, note.kind]
  );

  // Safely handle display name
  const {
    displayText: displayUserNameOrNpub,
    isLoading: isDisplayNameLoading,
  } = useCreatedByDisplayName({
    pubkey: note.pubkey,
    relayUrls: readRelayUrls,
    isMobile,
    getDisplayNameForPubkey,
  });

  const hasNoteText = textContent.trim().length > 0;
  const hasMediaError = note.mediaLoadError;

  // Safely call useZapTotalsQuery with validated data
  const { data: zapTotals } = useZapTotalsQuery({
    noteId: note.id || null,
    relayUrls: readRelayUrls,
    noteAuthorPubkey: note.pubkey || undefined,
  });

  const totalSats = zapTotals?.totalSats || 0;

  // Track user's zaps for UI state
  const { hasZappedNote, markNoteAsZapped } = useUserZaps();
  const hasZappedByMe = note.id ? hasZappedNote(note.id) : false;
  const reactionRelayUrls = useMemo(() => {
    const read = Array.isArray(readRelayUrls) ? readRelayUrls : [];
    const write = Array.isArray(writeRelayUrls) ? writeRelayUrls : [];
    const set = new Set<string>([...read, ...write]);
    return Array.from(set);
  }, [readRelayUrls, writeRelayUrls]);

  const { data: reactionData, isLoading: isReactionsLoading } =
    useReactionCountsQuery(
      note.id || null,
      reactionRelayUrls,
      nostrClient,
      myPubkey
    );

  const { count: replyCount } = useReplyCountQuery(
    note.id || null,
    reactionRelayUrls,
    nostrClient
  );

  // Haptic feedback hook
  const { triggerHaptic } = useHaptic();

  const { publishReaction, isPending: isSendingReaction } =
    useReactionMutation(myPubkey);

  // Extract data from the query result
  const likes = reactionData?.likes || 0;
  const hasLikedByMe = reactionData?.hasLikedByMe || false;

  // Animate total notes roll when totalNotes changes (removed unused totalRollDirection and prevTotalNotesRef)

  // Determine parent note id from 'e' tags (prefer 'reply', then 'root', else first 'e')
  const tagList: any[] = Array.isArray((note as any)?.tags)
    ? ((note as any).tags as any[]) || []
    : [];
  const eTags = tagList.filter((t) => Array.isArray(t) && t[0] === "e");
  const qTag = tagList.find((t) => Array.isArray(t) && t[0] === "q");
  const noteKind: number = (note as any)?.kind ?? 1;
  const isRepostKind = noteKind === 6 || noteKind === 16;
  const isQuoteRepost = noteKind === 1 && Boolean(qTag);
  const replyTag = eTags.find((t) => t[3] === "reply");
  const rootTag = eTags.find((t) => t[3] === "root");

  // Extract root ID from root tag
  const rootNoteId = rootTag?.[1] || null;
  const hasRoot = Boolean(rootNoteId && rootNoteId !== note.id);

  // Only consider parent for replies (not reposts/quotes)
  const parentNoteId =
    isRepostKind || isQuoteRepost
      ? null
      : replyTag?.[1] ||
        (rootTag?.[1] && rootTag[1] !== note.id ? rootTag[1] : null) ||
        (eTags.length > 0 ? eTags[0][1] : null);
  const hasParent = Boolean(parentNoteId && parentNoteId !== note.id);

  // Repost/Quote target id
  const repostTargetId: string | null = useMemo(() => {
    if (isRepostKind) {
      return eTags.length > 0 ? (eTags[0]?.[1] as string) || null : null;
    }
    if (isQuoteRepost && qTag) {
      return (qTag[1] as string) || null;
    }
    return null;
  }, [isRepostKind, isQuoteRepost, eTags, qTag]);
  const hasRepostTarget = Boolean(repostTargetId);

  // Get parent note data for reply context
  const {
    parentDisplayName,
    isParentDisplayNameLoading,
    parentNpubForLinks,
    parentNoteNotFound,
  } = useParentNoteData({
    parentNoteId: parentNoteId || undefined,
    parentNote: null, // We don't have the parent note data yet, will need to fetch it
    relayUrls: readRelayUrls,
  });

  // Get repost target data for repost context
  const {
    repostTargetDisplayName,
    isRepostTargetDisplayNameLoading,
    repostTargetNpubForLinks,
  } = useRepostTargetData({
    repostTargetId: repostTargetId || undefined,
    repostTargetNote: null, // We don't have the repost target note data yet, will need to fetch it
    relayUrls: readRelayUrls,
  });

  const goToNote = useCallback(() => {
    if (!note?.id) return;

    // For simple reposts (kind 6), navigate to the original note
    // For quote reposts (kind 1 with q tag), navigate to the quote note itself
    const targetNoteId = isRepostKind ? repostTargetId : note.id;
    if (!targetNoteId) return;

    let bech32: string;
    try {
      bech32 = nip19.noteEncode(targetNoteId);
    } catch {
      bech32 = targetNoteId;
    }

    // Simple navigation with proper state for scroll restoration
    const currentIndex = typeof index === "number" ? index : 0;

    navigate({
      to: "/note/$noteId",
      params: { noteId: bech32 },
      state: {
        restoreIndex: currentIndex,
        feedIndex: currentIndex,
        backToPath: `${location.pathname}${location.search || ""}`,
        timestamp: Date.now(),
        fromFeed: true, // Key flag for scroll restoration
        virtualScrollIndex: currentIndex,
      } as any,
      replace: false,
    });
  }, [
    note?.id,
    isRepostKind,
    repostTargetId,
    navigate,
    location.pathname,
    location.search,
    index,
  ]);

  // Load original note for repost/quote
  const [repostOriginal, setRepostOriginal] = useState<Note | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasRepostTarget || !repostTargetId) {
        setRepostOriginal(null);
        return;
      }
      // Try parse embedded content for kind 6 if available
      if (isRepostKind) {
        try {
          const parsed = JSON.parse(safeContent);
          if (
            parsed &&
            typeof parsed === "object" &&
            parsed.id &&
            parsed.pubkey
          ) {
            const mapped: Note = {
              id: String(parsed.id),
              content: String(parsed.content || ""),
              pubkey: String(parsed.pubkey || ""),
              created_at: Number(parsed.created_at || 0),
              kind: Number(parsed.kind || 1),
              tags: Array.isArray(parsed.tags)
                ? (parsed.tags as string[][])
                : [],
              imageUrls: [],
              videoUrls: [],
              receivedAt: Date.now(),
            };
            if (!cancelled) setRepostOriginal(mapped);
          }
        } catch {}
      }
      if (
        !nostrClient ||
        !Array.isArray(readRelayUrls) ||
        readRelayUrls.length === 0
      ) {
        return;
      }
      try {
        const events = await nostrClient.querySync(readRelayUrls, {
          kinds: [1],
          ids: [repostTargetId],
          limit: 1,
        } as any);
        if (cancelled) return;
        if (Array.isArray(events) && events.length > 0) {
          const ev: any = events[0];
          const mapped: Note = {
            id: ev.id,
            content: ev.content || "",
            pubkey: ev.pubkey,
            created_at: ev.created_at,
            kind: ev.kind,
            tags: ev.tags || [],
            imageUrls: [],
            videoUrls: [],
            receivedAt: Date.now(),
          };
          setRepostOriginal(mapped);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [
    hasRepostTarget,
    repostTargetId,
    isRepostKind,
    safeContent,
    nostrClient,
    readRelayUrls,
  ]);

  // For pure reposts (no quote text), actions should target the original note
  // For quote reposts or regular notes, actions target the note itself
  const actionTargetNote = useMemo(() => {
    // Pure repost: kind 6/16 with no quote text
    if (isRepostKind && hasRepostTarget && repostOriginal) {
      return repostOriginal;
    }
    // Quote repost or regular note
    return note;
  }, [isRepostKind, hasRepostTarget, repostOriginal, note]);

  // Reaction and reply actions
  const [actionError, setActionError] = useState<string | null>(null);

  // Use global modal context
  const modalContext = useModalContext();

  // Authentication check hook
  const { isAuthenticatedForSigning, needsUnlock } = useAuthenticationCheck();

  const performLike = useCallback(async () => {
    const publishRelays =
      writeRelayUrls && writeRelayUrls.length > 0
        ? writeRelayUrls
        : readRelayUrls;

    // 🎯 TRIGGER HAPTIC IMMEDIATELY (in user gesture context)

    try {
      triggerHaptic();
    } catch (error) {
      console.error("❌ Haptic feedback failed in performLike:", error);
    }

    if (
      !nostrClient ||
      !Array.isArray(publishRelays) ||
      publishRelays.length === 0
    ) {
      console.error("❌ No relays configured or client not ready");
      setActionError("No relays configured");
      return;
    }
    try {
      setActionError(null);

      // Use the mutation which handles optimistic updates and UI changes
      await publishReaction({
        pool: nostrClient,
        relayUrls: publishRelays,
        target: {
          id: actionTargetNote.id,
          pubkey: actionTargetNote.pubkey,
          kind: 1,
          tags: actionTargetNote.tags as any,
        },
        content: "+",
        relayHint: publishRelays[0],
        relayPermissions,
      });
    } catch (e: any) {
      console.error("❌ publishReaction failed:", e);
      setActionError(e?.message || "Failed to react");
    }
  }, [
    nostrClient,
    readRelayUrls,
    writeRelayUrls,
    actionTargetNote.id,
    actionTargetNote.pubkey,
    actionTargetNote.tags,
    publishReaction,
    relayPermissions,
    triggerHaptic,
  ]);

  const handleLike = useCallback(async () => {
    // Avoid duplicate likes from this client session: no toggle behavior for now
    if (hasLikedByMe) {
      return;
    }

    // Check if user is authenticated
    if (!isAuthenticatedForSigning()) {
      modalContext.requireLogin(async () => {
        await performLike();
      }, "like");
      return;
    }

    // Check if user needs to unlock their key
    const needsUnlockResult = await needsUnlock();

    if (needsUnlockResult) {
      modalContext.showUnlockModal("Like", performLike);
      return;
    }

    try {
      await performLike();
    } catch (error) {
      console.error("❌ Like failed:", error);
      setActionError((error as any)?.message || "Failed to react");
    }
  }, [
    hasLikedByMe,
    isAuthenticatedForSigning,
    needsUnlock,
    performLike,
    modalContext,
  ]);

  const performOpenReply = useCallback(() => {
    try {
      const encodedId = nip19.noteEncode(actionTargetNote.id);
      // backToPath removed - unused variable
      // prevState removed - unused variable
      // backToFromFeed removed - unused variable
      // feedIndex removed - unused variable
      // Navigation state simplified for TanStack Router
      // TODO: Restore navigation state if needed
      navigate({
        to: `/note/${encodedId}`,
        search: { reply: actionTargetNote.id },
        state: true,
      });
    } catch (error) {
      // Fallback to direct modal opening if encoding fails
      const currentParams = new URLSearchParams(location.search);
      currentParams.set("reply", actionTargetNote.id);
      navigate({
        to: location.pathname,
        search: Object.fromEntries(currentParams),
        replace: true,
      });
    }
  }, [
    actionTargetNote.id,
    navigate,
    location.pathname,
    location.search,
    location.state,
    index,
  ]);

  const openReply = useCallback(async () => {
    // Check if user is authenticated
    if (!isAuthenticatedForSigning()) {
      modalContext.requireLogin(async () => {
        performOpenReply();
      }, "reply");
      return;
    }

    // Check if user needs to unlock their key
    const needsUnlockResult = await needsUnlock();

    if (needsUnlockResult) {
      modalContext.showUnlockModal("Reply", performOpenReply);
      return;
    }

    // User is authenticated, open reply modal
    performOpenReply();
  }, [isAuthenticatedForSigning, needsUnlock, performOpenReply, modalContext]);

  const performOpenRepost = useCallback(() => {
    try {
      const encodedId = nip19.noteEncode(actionTargetNote.id);
      // backToPath removed - unused variable
      // prevState removed - unused variable
      // backToFromFeed removed - unused variable
      // feedIndex removed - unused variable
      // Navigation state simplified for TanStack Router
      // TODO: Restore navigation state if needed
      navigate({
        to: `/note/${encodedId}`,
        search: { repost: actionTargetNote.id },
        state: true,
      });
    } catch (error) {
      // Fallback to direct modal opening if encoding fails
      if (updateRepostModalState) {
        updateRepostModalState(actionTargetNote.id);
      }
    }
  }, [
    actionTargetNote.id,
    navigate,
    updateRepostModalState,
    location.pathname,
    location.search,
    location.state,
    index,
  ]);

  const openRepost = useCallback(async () => {
    // Check if user is authenticated
    if (!isAuthenticatedForSigning()) {
      modalContext.requireLogin(async () => {
        performOpenRepost();
      }, "repost");
      return;
    }

    // Check if user needs to unlock their key
    const needsUnlockResult = await needsUnlock();

    if (needsUnlockResult) {
      modalContext.showUnlockModal("Repost", performOpenRepost);
      return;
    }

    // User is authenticated, open repost modal
    performOpenRepost();
  }, [isAuthenticatedForSigning, needsUnlock, performOpenRepost, modalContext]);

  useEffect(() => {
    if (isMobile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable)
        return;
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobile, note.id]);

  // Share handler
  const handleShare = useCallback(() => {
    let encoded: string;
    try {
      // Use readRelayUrls if available, otherwise try to get connected relays from relayStatuses
      const availableRelays =
        readRelayUrls && readRelayUrls.length > 0
          ? readRelayUrls.slice(0, 4)
          : relayStatuses
              ?.filter((r) => r.connected && r.read)
              ?.map((r) => r.url)
              ?.slice(0, 4) || [];

      encoded =
        availableRelays.length > 0
          ? nip19.neventEncode({ id: note.id, relays: availableRelays })
          : nip19.noteEncode(note.id);
    } catch {
      encoded = nip19.noteEncode(note.id);
    }
    const shareUrl = `${window.location.origin}/note/${encoded}`;
    if (navigator.share) {
      navigator
        .share({
          title: isMobile ? "Nostr Note" : "NRIC-1 Link:",
          url: shareUrl,
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl).catch(() => {});
    }
  }, [note.id, relayStatuses, readRelayUrls, isMobile]);

  // Thread handler

  const uniqueKey = `${note.id}-${note.pubkey}-${note.created_at}`;
  let npubForLinks: string = note.pubkey;
  try {
    npubForLinks = nip19.npubEncode(note.pubkey);
  } catch (_e) {
    // keep raw pubkey
    npubForLinks = note.pubkey;
  }

  // Calculate article naddr for NIP-23 articles
  const articleNaddr: string | null = useMemo(() => {
    try {
      if (note.kind !== 30023) return null;
      const dTag = (note.tags || []).find(
        (t) => Array.isArray(t) && t[0] === "d"
      );
      const identifier = (dTag?.[1] as string) || "";
      if (!identifier) return null;
      return nip19.naddrEncode({
        kind: 30023,
        pubkey: note.pubkey,
        identifier,
      });
    } catch {
      return null;
    }
  }, [note.kind, note.tags, note.pubkey]);

  return (
    <div
      key={uniqueKey}
      className="note-card"
      data-note-id={note.id}
      onMouseEnter={() => {
        // Prefetch thread: use root if present, otherwise note as root
        const rootId = rootNoteId || note.id;
        const parent = note.id;
        prefetchThread({
          rootId,
          parentId: parent,
          relayUrls: readRelayUrls || [],
          nostrClient,
          maxFetch: 150,
          timeBudget: 700,
        });
        // Also prefetch parent-of-reply path if available
        if (parentNoteId) {
          prefetchThread({
            rootId: rootId,
            parentId: parentNoteId,
            relayUrls: readRelayUrls || [],
            nostrClient,
            maxFetch: 120,
            timeBudget: 600,
          });
        }
      }}
      onTouchStart={() => {
        const rootId = rootNoteId || note.id;
        const parent = note.id;
        prefetchThread({
          rootId,
          parentId: parent,
          relayUrls: readRelayUrls || [],
          nostrClient,
          maxFetch: 150,
          timeBudget: 700,
        });
      }}
      style={{
        // backgroundColor:
        //   isDarkMode || isMobile ? "var(--app-secondary-bg-color)" : "#ffffff",
        borderRadius: "0",
        // border: isMobile ? "none" : "1px solid var(--border-color)",
        // borderTop: "1px solid var(--border-color)",
        // borderBottom: "1px dotted var(--border-color)",
        marginBottom: isMobile ? "0rem" : "1rem",
        display: "flex",
        flexDirection: "column",
        height: "auto", // Always use auto height to let content determine size
        minHeight: "auto", // Changed from fit-content to auto for better performance
        width: "100%",
        maxWidth: "100%",
        // borderLeft: "1px solid var(--border-color)",
        overflowX: "visible", // Allow radial menu to extend outside
        boxSizing: "border-box",
      }}
    >
      {!isValidNote && (
        <div style={{ color: "var(--btn-accent)", padding: "1rem" }}>
          Invalid note
        </div>
      )}

      {/* Desktop Note Info Section - Full width below both columns */}
      {!isMobile && (
        <div style={{ position: "relative" }}>
          <DesktopNoteHeader
            noteId={note.id}
            noteCreatedAt={note.created_at || 0}
            note={note}
            displayUserNameOrNpub={displayUserNameOrNpub}
            isDisplayNameLoading={isDisplayNameLoading}
            npubForLinks={npubForLinks}
            index={index}
            hasParent={hasParent}
            parentNoteId={parentNoteId || undefined}
            parentDisplayName={parentDisplayName}
            isParentDisplayNameLoading={isParentDisplayNameLoading}
            parentNpubForLinks={parentNpubForLinks || undefined}
            parentNoteNotFound={parentNoteNotFound}
            hasRepostTarget={hasRepostTarget}
            repostTargetId={repostTargetId || undefined}
            repostTargetDisplayName={repostTargetDisplayName}
            isRepostTargetDisplayNameLoading={isRepostTargetDisplayNameLoading}
            repostTargetNpubForLinks={repostTargetNpubForLinks || undefined}
            noteKind={
              hasRepostTarget
                ? "repost"
                : hasParent
                  ? "reply"
                  : note.kind === 30023
                    ? "article"
                    : "note"
            }
            targetNoteId={
              hasRepostTarget
                ? repostTargetId
                : hasParent
                  ? parentNoteId
                  : undefined
            }
            prefetchRoute={prefetchRoute}
            prefetchNote={prefetchNote}
            goToNote={goToNote}
            openRepost={openRepost}
            openReply={openReply}
            handleLike={handleLike}
            likes={likes}
            hasLikedByMe={hasLikedByMe}
            isReactionsLoading={isReactionsLoading}
            isSendingReaction={isSendingReaction}
            hasZappedByMe={hasZappedByMe}
            actionError={actionError}
            noteAuthorPubkey={note.pubkey}
            readRelayUrls={readRelayUrls}
            getDisplayNameForPubkey={getDisplayNameForPubkey}
            setShowZapModal={setShowZapModal}
            replyCount={replyCount}
            articleNaddr={articleNaddr}
            isBookmarked={isBookmarked(note.id)}
            toggleBookmark={handleToggleBookmark}
          />
        </div>
      )}

      {isValidNote && (
        <NoteContentContainer
          note={note}
          actionTargetNote={actionTargetNote}
          index={index}
          textContent={textContent}
          repostOriginal={repostOriginal}
          isMobile={isMobile}
          isNotePage={isNotePage}
          imageMode={imageMode}
          hasNoteText={hasNoteText}
          hasRepostTarget={hasRepostTarget}
          isQuoteRepost={isQuoteRepost}
          imageUrls={imageUrls}
          videoUrls={videoUrls}
          hasMediaError={hasMediaError || false}
          asciiCache={asciiCache}
          displayUserNameOrNpub={displayUserNameOrNpub}
          isDisplayNameLoading={isDisplayNameLoading}
          npubForLinks={npubForLinks}
          hasParent={hasParent}
          hasRoot={hasRoot}
          parentNoteId={parentNoteId || undefined}
          rootNoteId={rootNoteId || undefined}
          parentDisplayName={parentDisplayName}
          isParentDisplayNameLoading={isParentDisplayNameLoading}
          parentNpubForLinks={parentNpubForLinks || undefined}
          parentNoteNotFound={parentNoteNotFound}
          repostTargetId={repostTargetId || undefined}
          repostTargetDisplayName={repostTargetDisplayName}
          isRepostTargetDisplayNameLoading={isRepostTargetDisplayNameLoading}
          repostTargetNpubForLinks={repostTargetNpubForLinks || undefined}
          likes={likes}
          hasLikedByMe={hasLikedByMe}
          isReactionsLoading={isReactionsLoading}
          isSendingReaction={isSendingReaction}
          hasZappedByMe={hasZappedByMe}
          useAscii={useAscii}
          useColor={useColor}
          isIOSPWA={isIOSPWA}
          getDisplayNameForPubkey={getDisplayNameForPubkey}
          onHashtagClick={onHashtagClick}
          setFullScreenImage={setFullScreenImage}
          onAsciiRendered={onAsciiRendered}
          onMediaLoadError={onMediaLoadError}
          onImageDimensionsLoaded={onImageDimensionsLoaded}
          prefetchRoute={prefetchRoute}
          prefetchNote={prefetchNote}
          goToNote={goToNote}
          openRepost={openRepost}
          openReply={openReply}
          handleLike={handleLike}
          readRelayUrls={readRelayUrls}
          setShowZapModal={setShowZapModal}
          onShare={handleShare}
          replyCount={replyCount}
          showFullContent={showFullContent}
          totalSats={totalSats}
          recipientName={getDisplayNameForPubkey(note.pubkey)}
          isBookmarked={isBookmarked(note.id)}
          toggleBookmark={handleToggleBookmark}
        />
      )}

      {/* Zap Comments */}
      {isValidNote && (
        <ZapComments
          noteId={note.id}
          relayUrls={readRelayUrls}
          noteAuthorPubkey={note.pubkey}
          getDisplayNameForPubkey={getDisplayNameForPubkey}
          isDarkMode={
            document.documentElement.getAttribute("data-theme") === "dark"
          }
        />
      )}

      <NoteModals
        note={note}
        isValidNote={isValidNote}
        isMobile={isMobile}
        showRepostModal={showRepostModal}
        setShowRepostModal={setShowRepostModal}
        updateRepostModalState={updateRepostModalState}
        showZapModal={showZapModal}
        setShowZapModal={setShowZapModal}
        updateZapModalState={updateZapModalState}
        myPubkey={myPubkey}
        _metadata={_metadata}
        readRelayUrls={readRelayUrls}
        writeRelayUrls={writeRelayUrls}
        useAscii={useAscii}
        useColor={useColor}
        getDisplayNameForPubkey={getDisplayNameForPubkey}
        onHashtagClick={onHashtagClick}
        markNoteAsZapped={markNoteAsZapped}
      />

      {/* All modals are now rendered globally in MainLayout */}
    </div>
  );
};

export const NoteCard = React.memo(NoteCardComponent);

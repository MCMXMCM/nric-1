import React, {
  useCallback,
  useRef,
  useEffect,
  useState,
  useContext,
  useMemo,
} from "react";
import { useParams, useNavigate, useLocation } from "@tanstack/react-router";
import { nip19 } from "nostr-tools";
import ThreadHeader from "./ThreadHeader";
import { useUIStore } from "./lib/useUIStore";
import { useRelayManager } from "../hooks/useRelayManager";
import { useDisplayNames } from "../hooks/useDisplayNames";
import { NostrContext } from "../contexts/NostrContext";
import { useUniversalHashtagHandler } from "../utils/hashtagNavigation";
import ThreadLoading from "./thread/ThreadLoading";
import MainNote from "./thread/MainNote";
import CommentsList from "./thread/CommentsList";
import { ThreadWithHotkeys } from "./thread/ThreadWithHotkeys";
import { buildFlattenedThread } from "../utils/thread/flatten";
import ThreadSummary from "./thread/ThreadSummary";
import { useThreadStore } from "../state/threadStore";
import { useThreadLoader } from "../hooks/useThreadLoader";
import { useScrollRestoration } from "../hooks/useScrollRestoration";
import { prefetchThread } from "../utils/thread/prefetch";

const ThreadPage: React.FC = () => {
  const { noteId } = useParams({ strict: false }) as { noteId: string };
  const navigate = useNavigate();
  const location = useLocation();
  const { pubkey, nostrClient } = useContext(NostrContext) as any;
  const { relayUrls } = useRelayManager({
    nostrClient,
    initialRelays: [],
    pubkeyHex: pubkey,
  });
  const { getDisplayNameForPubkey } = useDisplayNames(relayUrls);
  const { useAscii, useColor, imageMode } = useUIStore((s: any) => ({
    useAscii: s.useAscii,
    useColor: s.useColor,
    imageMode: s.imageMode,
  }));

  // Decode NIP-19 note ID to hex
  const hexNoteId = useMemo(() => {
    if (!noteId) return null;
    if (noteId.length === 64 && /^[a-fA-F0-9]+$/.test(noteId)) {
      return noteId;
    }
    try {
      const decoded = nip19.decode(noteId);
      if (decoded.type === "note" && typeof decoded.data === "string") {
        return decoded.data;
      }
    } catch (error) {
      console.warn("Failed to decode note ID:", error);
    }
    return noteId;
  }, [noteId]);

  const handleHashtagClick = useUniversalHashtagHandler();
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [uiStateHydrated, setUiStateHydrated] = useState(false);
  const [showFullMainNoteContent, setShowFullMainNoteContent] = useState(false);
  const [collapsedNotes, setCollapsedNotes] = useState<Set<string>>(
    new Set()
  );

  const isMobileLayout = window.innerWidth <= 768;

  // Navigation state from location
  const navigationState = location.state as any;
  const rootThreadIdFromState: string | null =
    navigationState?.rootThreadId || null;

  // Determine effective root id (canonical thread root for all navigation)
  const effectiveRootId = rootThreadIdFromState || hexNoteId || noteId;
  const effectiveParentId = hexNoteId || noteId;

  // Store accessors
  const setCurrentParentId = useThreadStore((s: any) => s.setCurrentParentId);
  const threadState = useThreadStore(
    useCallback((s: any) => s.threads[effectiveRootId as string] || null, [
      effectiveRootId,
    ])
  );
  const status = threadState?.status || { isLoading: false, hasMore: false, lastUpdated: 0 };
  const notesById = threadState?.notesById as Map<string, any> | undefined;
  const currentParentId = threadState?.currentParentId as string | null | undefined;
  const directChildrenIds = (threadState?.directChildrenIds || []) as string[];
  const childrenIdMap = (threadState?.childrenIdMap || {}) as Record<string, string[]>;

  const safeParentNote = useMemo(() => {
    if (!notesById || !currentParentId) return null;
    return (notesById.get(currentParentId) || null) as any;
  }, [notesById, currentParentId]);

  const comments = useMemo(() => {
    if (!notesById || !directChildrenIds) return [] as any[];
    const arr = directChildrenIds
      .map((id) => notesById.get(id))
      .filter((n) => Boolean(n));
    return arr as any[];
  }, [notesById, directChildrenIds]);

  const threadStructure = useMemo(() => {
    if (!notesById || !childrenIdMap) return null as Map<string, any[]> | null;
    const map = new Map<string, any[]>();
    for (const [pid, childIds] of Object.entries(childrenIdMap)) {
      const children = (childIds || [])
        .map((cid) => notesById.get(cid))
        .filter((n) => Boolean(n));
      if (children.length > 0) map.set(pid, children as any[]);
    }
    return map;
  }, [notesById, childrenIdMap]);

  // Always-expanded set derived from structure
  const expandedNestedReplies = useMemo(() => {
    const expanded = new Set<string>();
    if (!threadStructure) return expanded;
    const maxDepth = 4;
    const visit = (id: string, depth: number) => {
      if (depth >= maxDepth) return;
      expanded.add(id);
      const kids = threadStructure.get(id) || [];
      for (const child of kids) visit(child.id, depth + 1);
    };
    for (const comment of comments) visit(comment.id, 1);
    return expanded;
  }, [comments, threadStructure]);

  // Initialize loader
  useThreadLoader({
    rootId: effectiveRootId as string,
    parentId: effectiveParentId as string,
    relayUrls,
    nostrClient,
    enabled: Boolean(effectiveRootId && relayUrls.length),
  });

  const prefetchThreadFn = useCallback(
    (targetNoteId: string) => {
      if (!targetNoteId) return;
      prefetchThread({
        rootId: effectiveRootId as string,
        parentId: targetNoteId,
        relayUrls,
        nostrClient,
        maxFetch: 150,
        timeBudget: 800,
      });
    },
    [effectiveRootId, relayUrls, nostrClient]
  );

  // Update current parent when effectiveParentId changes
  useEffect(() => {
    if (effectiveRootId && effectiveParentId) {
      setCurrentParentId(effectiveRootId, effectiveParentId);
    }
  }, [effectiveRootId, effectiveParentId, setCurrentParentId]);

  // Enable scroll restoration
  useScrollRestoration(containerRef, `thread:${noteId}`, {
    enabled: uiStateHydrated && !status.isLoading,
  });

  // Force scroll to top on thread id change (covers [select] and Continue thread)
  useEffect(() => {
    try {
      scrollAreaRef.current?.scrollTo({ top: 0, behavior: "auto" });
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch {}
  }, [hexNoteId]);

  // Hydrate UI state
  useEffect(() => {
    setUiStateHydrated(true);
  }, [effectiveRootId]);

  // Local UI state
  const [visibleCount, setVisibleCount] = useState(20);
  const visibleComments = useMemo(() => {
    return comments.slice(0, Math.max(0, visibleCount));
  }, [comments, visibleCount]);

  // MediaGallery state
  const [asciiCache, setAsciiCache] = useState<
    Record<string, { ascii: string; timestamp: number }>
  >({});

  const handleAsciiRendered = useCallback((url: string, ascii: string) => {
    setAsciiCache((prev) => ({
      ...prev,
      [url]: { ascii, timestamp: Date.now() },
    }));
  }, []);

  const handleMediaLoadError = useCallback((url: string) => {
    console.warn(`Failed to load media: ${url}`);
  }, []);

  const handleImageDimensionsLoaded = useCallback(
    (
      _noteId: string,
      imageUrl: string,
      dimensions: { width: number; height: number }
    ) => {
      console.log(`Image dimensions loaded for ${imageUrl}:`, dimensions);
    },
    []
  );

  // Navigation helpers
  const handleFocusThreadOnNote = useCallback(
    (targetNoteId: string) => {
      try {
        const rootId = effectiveRootId;
        console.log(
          `[Thread Navigation] Navigating to ${targetNoteId.slice(0, 8)}`
        );

        navigate({
          to: `/thread/${targetNoteId}`,
          replace: false,
          state: {
            rootThreadId: rootId,
            focusedReplyId: effectiveParentId || undefined,
          } as any,
        });
      } catch (error) {
        console.error("Error navigating to note:", error);
      }
    },
    [effectiveRootId, effectiveParentId, navigate]
  );

  const toggleNoteCollapse = useCallback((noteId: string) => {
    setCollapsedNotes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(noteId)) {
        newSet.delete(noteId);
      } else {
        newSet.add(noteId);
      }
      return newSet;
    });
  }, []);

  // Show loading only when no data at all
  const isEmptyThread = !safeParentNote && comments.length === 0;
  const shouldShowInitialSpinner = isEmptyThread && (status.isLoading || Boolean(rootThreadIdFromState));
  if (shouldShowInitialSpinner) {
    return <ThreadLoading isMobile={isMobileLayout} noteId={noteId} />;
  }

  const getFocusedNote = () => {
    try {
      const focusedCandidates = document.querySelectorAll(
        "[data-index][data-note-id].focused"
      );
      let focusedElement: Element | null = null;
      for (const candidate of Array.from(focusedCandidates)) {
        const htmlEl = candidate as HTMLElement;
        const rect = htmlEl.getBoundingClientRect();
        if (rect.height > 0 && rect.width > 0 && htmlEl.offsetParent !== null) {
          focusedElement = candidate;
          break;
        }
      }
      if (!focusedElement) {
        focusedElement = document.querySelector("[data-index][data-note-id]");
      }
      if (!focusedElement) return null;

      const idx = parseInt(
        focusedElement.getAttribute("data-index") || "-1",
        10
      );
      if (
        Number.isNaN(idx) ||
        idx < 0 ||
        idx >= (flattened.nodes ? flattened.nodes.length : 0)
      ) {
        return null;
      }
      return flattened.nodes[idx]?.note || null;
    } catch {
      return null;
    }
  };

  const flattened = buildFlattenedThread({
    parent: safeParentNote,
    topLevelReplies: visibleComments || comments,
    includeNested: false,
  });
  const totalItemsForHotkeys = 1 + ((visibleComments || comments)?.length || 0);

  return (
    <ThreadWithHotkeys
      totalItems={totalItemsForHotkeys}
      enabled={!isMobileLayout}
      isLoadingComments={status.isLoading && comments.length === 0}
      onLink={() => {
        const note = getFocusedNote();
        if (!note?.id) return;
        try {
          const encoded = nip19.noteEncode(note.id);
          const shareUrl = `${window.location.origin}/thread/${encoded}`;
          if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(shareUrl).catch(() => {});
          } else {
            window.open(shareUrl, "_blank", "noopener,noreferrer");
          }
        } catch {
          navigate({ to: `/thread/${note.id}` });
        }
      }}
      onReply={() => {
        const note = getFocusedNote();
        if (!note?.id) return;
        const currentParams = new URLSearchParams(location.search);
        currentParams.set("reply", note.id);
        navigate({
          to: location.pathname,
          search: Object.fromEntries(currentParams),
          replace: true,
        });
      }}
      onLike={() => {
        const focused = document.querySelector(
          "[data-index][data-note-id].focused"
        ) as HTMLElement | null;
        if (!focused) return;
        const likeButton =
          focused.querySelector(
            '[data-action="like"], [data-like-button], button[aria-label*="Like" i], button[title*="Like" i]'
          ) || null;
        if (likeButton) (likeButton as HTMLElement).click();
      }}
      onBookmark={() => {
        const focused = document.querySelector(
          "[data-index][data-note-id].focused"
        ) as HTMLElement | null;
        if (!focused) return;
        const bookmarkButton =
          focused.querySelector(
            '[data-action="bookmark"], [data-bookmark-button], button[aria-label*="Bookmark" i], button[title*="Bookmark" i]'
          ) || null;
        if (bookmarkButton) (bookmarkButton as HTMLElement).click();
      }}
      onCollapse={() => {
        const note = getFocusedNote();
        if (!note?.id) return;
        toggleNoteCollapse(note.id);
      }}
      onFocusThread={() => {
        const note = getFocusedNote();
        if (!note?.id) return;
        handleFocusThreadOnNote(note.id);
      }}
      onScrollToParent={() => {
        const focused = getFocusedNote();
        if (!focused) return;

        if (safeParentNote && focused.id === safeParentNote.id) {
          try {
            const tags = safeParentNote.tags || [];
            const eTags = tags.filter(
              (t: any) => Array.isArray(t) && t[0] === "e"
            );
            const replyTag = eTags.find((t: any) => t[3] === "reply");
            const rootTag = eTags.find((t: any) => t[3] === "root");
            const parentId =
              (replyTag && replyTag[1]) ||
              (eTags.length === 1 ? eTags[0][1] : null) ||
              (rootTag?.[1] && rootTag[1] !== safeParentNote.id
                ? rootTag[1]
                : null);

            if (parentId) {
              handleFocusThreadOnNote(parentId);
              return;
            }
          } catch {}
        }

        if (safeParentNote) {
          document
            .getElementById(`note-${safeParentNote.id}`)
            ?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
        }
      }}
      onBackToFeed={() => {
        try {
          const s: any = { ...(window.history.state || {}) };
          s.fromThread = true;
          s.scrollRestored = true;
          window.history.replaceState(s, "");
        } catch {}
        navigate({ to: "/" });
      }}
      onHelpToggle={() => {}}
      onEscape={() => {}}
    >
      <div
        className="nostr-feed"
        style={{
          width: "100%",
          height: "100%",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--app-bg-color)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: isMobileLayout ? "100%" : "1000px",
            margin: isMobileLayout ? "0" : "0 auto",
            backgroundColor: "var(--app-bg-color)",
            flex: "0 0 auto",
          }}
        >
          <div
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: "1000px",
              }}
            >
              <ThreadHeader isMobile={isMobileLayout} noteId={noteId} />
            </div>
          </div>
        </div>

        <div
          ref={scrollAreaRef}
          style={{
            width: "100%",
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            ref={containerRef}
            style={{
              padding: isMobileLayout ? "0 0.5rem" : "0 1rem",
              paddingBottom: isMobileLayout
                ? "calc(15dvh + var(--safe-area-inset-bottom))"
                : "2rem",
              width: "100%",
              margin: "0 auto",
            }}
          >
            <div
              style={{
                width: "100%",
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                boxSizing: "border-box",
                backgroundColor: "var(--app-bg-color)",
              }}
            >
              <div
                style={{
                  width: "100%",
                  position: "relative",
                  height: isMobileLayout ? "auto" : "100%",
                  overflow: "visible",
                }}
              >
                <div
                  style={{
                    display: isMobileLayout ? "block" : "grid",
                    gridTemplateColumns: isMobileLayout ? "1fr" : "240px 1fr",
                    alignItems: "start",
                    gap: isMobileLayout ? 0 : "0",
                    width: "100%",
                    maxWidth: isMobileLayout ? "100%" : "1000px",
                    margin: isMobileLayout ? "0" : "0 auto",
                  }}
                >
                  {!isMobileLayout && (
                    <div
                      style={{
                        position: "sticky",
                        top: 0,
                        alignSelf: "start",
                        maxHeight: "100vh",
                        overflowY: "auto",
                        overflowX: "hidden",
                      }}
                    >
                      <ThreadSummary
                        parentNote={safeParentNote}
                        directReplies={comments}
                        threadStructure={threadStructure as any}
                        getDisplayNameForPubkey={getDisplayNameForPubkey}
                        isMobileLayout={isMobileLayout}
                        relayUrls={relayUrls}
                        expandedNestedReplies={expandedNestedReplies}
                        navigate={navigate}
                        isLoading={status.isLoading}
                        prefetchThreadFn={prefetchThreadFn}
                      />
                    </div>
                  )}

                  <div style={{ width: "100%", minWidth: 0 }}>
                    {!safeParentNote && comments.length === 0 && (
                      <div
                        style={{
                          width: "100%",
                          padding: isMobileLayout ? "1rem" : "2rem",
                          textAlign: "center",
                          color: "var(--app-text-secondary)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "1.25rem",
                            marginBottom: "0.5rem",
                            color: "var(--text-color)",
                          }}
                        >
                          Note not found
                        </div>
                        <div style={{ fontSize: "0.875rem" }}>
                          This note may have been deleted or is not available on
                          your connected relays.
                        </div>
                      </div>
                    )}

                    {(safeParentNote || comments.length > 0) && (
                        <MainNote
                          currentParentNote={safeParentNote}
                          hexNoteId={hexNoteId}
                          noteId={noteId}
                          isMobileLayout={isMobileLayout}
                          relayUrls={relayUrls}
                          getDisplayNameForPubkey={getDisplayNameForPubkey}
                          navigate={navigate}
                          handleHashtagClick={handleHashtagClick}
                          handleFocusThreadOnNote={handleFocusThreadOnNote}
                          collapsedNotes={collapsedNotes}
                          toggleNoteCollapse={toggleNoteCollapse}
                          showFullMainNoteContent={showFullMainNoteContent}
                        isQuoteRepostMain={false}
                        mainRepostOriginal={null}
                          useAscii={useAscii}
                          useColor={useColor}
                          imageMode={imageMode}
                          asciiCache={asciiCache}
                          setFullScreenImage={() => {}}
                          onAsciiRendered={handleAsciiRendered}
                          onMediaLoadError={handleMediaLoadError}
                          onImageDimensionsLoaded={handleImageDimensionsLoaded}
                        />
                      )}

                    {safeParentNote &&
                      !collapsedNotes.has(safeParentNote.id) && (
                        <div
                          style={{
                            width: "100%",
                            padding: isMobileLayout ? "0.25rem" : "1rem",
                            textAlign: "left",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              gap: "0.5rem",
                              alignItems: "center",
                            }}
                          >
                            <button
                              onClick={() => {
                                const currentParams = new URLSearchParams(
                                  location.search
                                );
                                currentParams.set("reply", safeParentNote.id);
                                navigate({
                                  to: location.pathname,
                                  search: Object.fromEntries(currentParams),
                                  replace: true,
                                });
                              }}
                              style={{
                                backgroundColor: "transparent",
                                color: "var(--accent-color)",
                                border: "none",
                                padding: 0,
                                cursor: "pointer",
                                minHeight: "20px",
                                height: "20px",
                                fontSize: "0.875rem",
                                textDecoration: "none",
                              }}
                            >
                              reply
                            </button>

                            {(safeParentNote?.content?.length || 0) > 280 && (
                              <>
                                <span
                                  style={{
                                    color: "var(--text-color)",
                                    opacity: 0.3,
                                  }}
                                >
                                  |
                                </span>
                                <button
                                  onClick={() =>
                                    setShowFullMainNoteContent(
                                      !showFullMainNoteContent
                                    )
                                  }
                                  style={{
                                    backgroundColor: "transparent",
                                    color: "var(--text-color)",
                                    border: "none",
                                    padding: 0,
                                    minHeight: isMobileLayout ? "20px" : "auto",
                                    height: isMobileLayout ? "20px" : "auto",
                                    cursor: "pointer",
                                    fontSize: "0.875rem",
                                    textDecoration: "none",
                                  }}
                                >
                                  {showFullMainNoteContent
                                    ? "View Less"
                                    : "View More"}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                    {!collapsedNotes.has(safeParentNote?.id || "") && (
                      <div
                        style={{
                          width: "100%",
                          padding: isMobileLayout ? "0" : "1rem",
                        }}
                      >
                        <CommentsList
                          isLoadingComments={status.isLoading && comments.length === 0}
                          comments={comments}
                          visibleComments={visibleComments}
                          isMobileLayout={isMobileLayout}
                          relayUrls={relayUrls}
                          getDisplayNameForPubkey={
                            getDisplayNameForPubkey as any
                          }
                          navigate={navigate as any}
                          location={location as any}
                          currentParentNote={safeParentNote}
                          collapsedNotes={collapsedNotes}
                          toggleNoteCollapse={toggleNoteCollapse}
                          handleFocusThreadOnNote={handleFocusThreadOnNote}
                          useAscii={useAscii}
                          useColor={useColor}
                          imageMode={imageMode}
                          handleHashtagClick={handleHashtagClick}
                          expandedNestedReplies={expandedNestedReplies}
                          toggleNestedReplies={() => {}}
                          threadStructure={threadStructure as any}
                          childrenIdMap={{}}
                          hasNextPage={status.hasMore}
                          THREAD_PAGE_SIZE={20}
                          isLoadingMore={false}
                          handleLoadMore={async () => {}}
                          setVisibleCount={setVisibleCount}
                          allNotes={comments}
                          asciiCache={asciiCache}
                          setFullScreenImage={() => {}}
                          onAsciiRendered={handleAsciiRendered}
                          onMediaLoadError={handleMediaLoadError}
                          onImageDimensionsLoaded={handleImageDimensionsLoaded}
                          prefetchThreadFn={prefetchThreadFn}
                        />
                      </div>
                    )}

                    {isMobileLayout && (
                      <div
                        style={{
                          height: "10rem",
                          width: "100%",
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ThreadWithHotkeys>
  );
};

export default ThreadPage;

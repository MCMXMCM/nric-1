import React from "react";
import { Outlet } from "@tanstack/react-router";
import { VirtualizedFeed } from "./VirtualizedFeed";
// BufferEdgeIndicator removed - using TanStack Query native patterns
import { EmptyState } from "./EmptyState";

interface FeedContentProps {
  isNoteRoute: boolean;
  isNoteDetailRoute: boolean;
  isMobile: boolean;
  shouldRenderNotes: boolean;
  isRestoringPosition: boolean;
  state: any;
  feedQuery: any;
  // bufferIntegration removed - using TanStack Query native patterns
  // Optional sliding window feed hook
  uiIsDarkMode: boolean;
  uiUseAscii: boolean;
  uiUseColor: boolean;
  uiFilterByImageNotesOnly: boolean;
  uiImageMode: boolean;
  readRelays: string[];
  writeRelays: string[];
  showZapModal: boolean;
  setShowZapModal: (show: boolean) => void;
  updateZapModalState: (noteId: string | null) => void;
  showRepostModal: boolean;
  setShowRepostModal: (show: boolean) => void;
  updateRepostModalState: (noteId: string | null) => void;
  onHashtagClick: (hashtag: string) => void;
  isAnyModalOpen: boolean;
  handleAsciiRendered: (noteId: string, ascii: string) => void;
  handleMediaLoadError: (noteId: string) => void;
  getDisplayNameForPubkey: (pubkey: string) => string;
  handlePrefetch: (newIndex: number, totalNotes: number) => void;
  relayUrls: string[];
  addRelay: (url: string) => void;
  fetchAfterConnectRef: React.MutableRefObject<boolean>;
  onRefresh?: () => Promise<void> | void;
  onScrollToTopRef?: React.MutableRefObject<(() => void) | null>;
}

export const FeedContent: React.FC<FeedContentProps> = ({
  isNoteRoute,
  isMobile,
  shouldRenderNotes,
  isRestoringPosition,
  state,
  feedQuery,
  // bufferIntegration removed
  uiIsDarkMode,
  uiUseAscii,
  uiUseColor,
  uiImageMode,
  readRelays,
  writeRelays,
  showZapModal,
  setShowZapModal,
  updateZapModalState,
  showRepostModal,
  setShowRepostModal,
  updateRepostModalState,
  onHashtagClick,
  isAnyModalOpen,
  handleAsciiRendered,
  handleMediaLoadError,
  getDisplayNameForPubkey,
  relayUrls,
  addRelay,
  fetchAfterConnectRef,
  onRefresh,
  onScrollToTopRef,
}) => {
  return (
    <div
      style={{
        width: "100%",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        overflowY: "visible", // Allow content to flow naturally without container-level scrollbars
        WebkitOverflowScrolling: "touch",
      }}
    >
      {/* Nested routed content will render here (NoteView) without unmounting the feed header/status */}
      <Outlet />
      {!isNoteRoute && (
        <div
          className="notes-container"
          style={{
            width: "100%",
            flex: 1,
            minHeight: 0,
            paddingBottom: isMobile ? "0" : 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            boxSizing: "border-box",
            backgroundColor: "var(--app-bg-color )",
          }}
        >
          {/* Keep VirtualizedFeed ALWAYS mounted and visible to prevent any remounting */}
          <div
            style={{
              width: "100%",
              height: "100%",
              position: "relative",
            }}
          >
            <VirtualizedFeed
              notes={feedQuery.notes || []}
              metadata={state.metadata}
              asciiCache={state.asciiCache}
              isDarkMode={uiIsDarkMode}
              useAscii={uiUseAscii}
              useColor={uiUseColor}
              isMobile={isMobile}
              copiedPubkeys={state.copiedPubkeys}
              setCopiedPubkeys={state.setCopiedPubkeys}
              setFullScreenImage={state.setFullScreenImage}
              onAsciiRendered={handleAsciiRendered}
              setAsciiCache={state.setAsciiCache}
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
              onHashtagClick={onHashtagClick}
              isAnyModalOpen={isAnyModalOpen}
              hasNextPage={feedQuery.query.hasNextPage || false}
              isFetchingNextPage={feedQuery.query.isFetchingNextPage || false}
              fetchNextPage={() => feedQuery.query.fetchNextPage()}
              onScrollToTopRef={onScrollToTopRef}
              onRefresh={onRefresh}
            />

            {/* Show loading overlay when notes are not ready or restoring position */}
            {/* Only show when not in note routes and no modals are open */}
            {(isRestoringPosition || !shouldRenderNotes) &&
              !isNoteRoute &&
              !isAnyModalOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: "var(--app-bg-color)",
                    color: "var(--text-color)",
                    fontSize: "var(--font-size-base)",
                    opacity: 0.9,
                    zIndex: 100, // Lower z-index to stay under header
                    backdropFilter: "blur(2px)",
                  }}
                >
                  {isRestoringPosition
                    ? "Restoring position..."
                    : "Loading feed..."}
                </div>
              )}
          </div>

          {/* Buffer edge indicator - always mounted, conditionally visible */}
          <div
            style={{
              opacity: !isRestoringPosition && shouldRenderNotes ? 1 : 0,
              pointerEvents:
                !isRestoringPosition && shouldRenderNotes ? "auto" : "none",
            }}
          >
            {/* BufferEdgeIndicator removed - using TanStack Query native patterns */}
          </div>

          {state.notes.length === 0 && (
            <div
              style={{
                textAlign: "center",
                color: "var(--text-color)",
                padding: "2rem",
                fontSize: "var(--font-size-base)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              <EmptyState
                relayUrls={relayUrls}
                addRelay={addRelay}
                fetchAfterConnectRef={fetchAfterConnectRef}
                isMobile={isMobile}
                state={state}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

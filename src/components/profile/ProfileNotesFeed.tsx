import React from "react";
import { VirtualizedFeed } from "../feed/VirtualizedFeed";
import type { Note, Metadata } from "../../types/nostr/types";
import StandardLoader from "../ui/StandardLoader";

interface ProfileNotesFeedProps {
  notes: Note[];
  isLoadingNotes?: boolean;
  profileDisplayName?: string;
  metadata: Record<string, Metadata>;
  asciiCache: Record<string, { ascii: string; timestamp: number }>;
  setAsciiCache?: React.Dispatch<
    React.SetStateAction<Record<string, { ascii: string; timestamp: number }>>
  >;
  // UI/state from global feed state
  isDarkMode: boolean;
  useAscii: boolean;
  useColor: boolean;
  copiedPubkeys: Set<string>;
  setCopiedPubkeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  setFullScreenImage: (url: string | null) => void;
  onAsciiRendered: (noteId: string, ascii: string) => void;
  onMediaLoadError: (noteId: string) => void;
  getDisplayNameForPubkey: (pubkey: string) => string;
  imageMode: boolean;
  readRelayUrls: string[];
  writeRelayUrls: string[];
  showZapModal: boolean;
  setShowZapModal: (show: boolean) => void;
  updateZapModalState: (noteId: string | null) => void;
  showRepostModal: boolean;
  setShowRepostModal: (show: boolean) => void;
  updateRepostModalState: (noteId: string | null) => void;
  onHashtagClick: (hashtag: string) => void;
  isAnyModalOpen?: boolean;
  // Infinite scroll inputs from profile notes hook
  hasMore: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  // Optional scroll handlers
  onRefresh?: () => Promise<void> | void;
  onScrollToTopRef?: React.MutableRefObject<(() => void) | null>;
  // Scroll restoration storage key
  storageKey?: string;
  // Debug logging for scroll restoration
  debug?: boolean;
}

/**
 * Wrapper that reuses the main feed VirtualizedFeed to render profile notes.
 * Forces mobile layout so NoteCard uses mobile styling and action bar.
 */
export const ProfileNotesFeed: React.FC<ProfileNotesFeedProps> = ({
  notes,
  isLoadingNotes,
  profileDisplayName,
  metadata,
  asciiCache,
  setAsciiCache,
  isDarkMode,
  useAscii,
  useColor,
  copiedPubkeys,
  setCopiedPubkeys,
  setFullScreenImage,
  onAsciiRendered,
  onMediaLoadError,
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
  isAnyModalOpen,
  hasMore,
  isFetchingNextPage,
  onLoadMore,
  onRefresh,
  onScrollToTopRef,
  storageKey,
  debug,
}) => {
  // Debug logging for loading state
  if (debug) {
    console.log("🔍 ProfileNotesFeed:", {
      notesLength: notes.length,
      isLoadingNotes,
      profileDisplayName,
      showLoadingSpinner: isLoadingNotes && notes.length === 0,
      showNoNotes: !isLoadingNotes && notes.length === 0,
    });
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Show loading spinner when loading and no notes */}
      {isLoadingNotes && notes.length === 0 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10,
          }}
        >
          <StandardLoader
            message={`Loading ${
              profileDisplayName ? `${profileDisplayName}'s` : "profile"
            } notes...`}
            alignWithSplash={true}
          />
        </div>
      )}

      {/* Show "no notes" message when not loading and no notes */}
      {!isLoadingNotes && notes.length === 0 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            color: "var(--text-color)",
            opacity: 0.9,
            padding: "1rem",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "1rem",
            }}
          >
            <div
              style={{
                fontSize: "0.875rem",
                letterSpacing: "0.03em",
                opacity: 0.8,
              }}
            >
              No notes to display
            </div>
          </div>
        </div>
      )}

      <VirtualizedFeed
        // Data
        notes={notes}
        metadata={metadata}
        asciiCache={asciiCache}
        // UI configuration
        isDarkMode={isDarkMode}
        useAscii={useAscii}
        useColor={useColor}
        // Force mobile layout regardless of viewport
        isMobile={true}
        // Global feed state handlers
        copiedPubkeys={copiedPubkeys}
        setCopiedPubkeys={setCopiedPubkeys}
        setFullScreenImage={setFullScreenImage}
        // Scroll restoration - use simple restoration like contacts list for mobile reliability
        storageKey={storageKey}
        useSimpleScrollRestoration={true}
        debug={debug}
        onAsciiRendered={onAsciiRendered}
        setAsciiCache={setAsciiCache}
        onMediaLoadError={onMediaLoadError}
        getDisplayNameForPubkey={getDisplayNameForPubkey}
        imageMode={imageMode}
        readRelayUrls={readRelayUrls}
        writeRelayUrls={writeRelayUrls}
        showZapModal={showZapModal}
        setShowZapModal={setShowZapModal}
        updateZapModalState={updateZapModalState}
        showRepostModal={showRepostModal}
        setShowRepostModal={setShowRepostModal}
        updateRepostModalState={updateRepostModalState}
        onHashtagClick={onHashtagClick}
        isAnyModalOpen={isAnyModalOpen}
        // Infinite scroll mapping
        hasNextPage={hasMore}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={onLoadMore}
        // Optional scroll handlers
        onRefresh={onRefresh}
        onScrollToTopRef={onScrollToTopRef}
      />
    </div>
  );
};

export default ProfileNotesFeed;

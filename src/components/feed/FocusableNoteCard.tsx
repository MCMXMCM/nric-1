import React from "react";
import { NoteCard } from "../NoteCard";
import { NoteCardErrorBoundary } from "../ErrorBoundary";

interface FocusableNoteCardProps {
  note: any;
  index: number;
  metadata: Record<string, any>;
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
  getDisplayNameForPubkey: (pubkey: string) => string;
  imageMode: boolean;
  readRelayUrls: string[];
  writeRelayUrls: string[];
  onHashtagClick?: (hashtag: string) => void;
  onClick?: () => void;
}

export const FocusableNoteCard: React.FC<FocusableNoteCardProps> = ({
  note,
  index,
  metadata,
  asciiCache,
  isDarkMode,
  useAscii,
  useColor,
  isMobile,
  copiedPubkeys,
  setCopiedPubkeys,
  setFullScreenImage,
  onAsciiRendered,
  onMediaLoadError,
  getDisplayNameForPubkey,
  imageMode,
  readRelayUrls,
  writeRelayUrls,
  onHashtagClick,
  onClick,
}) => {
  return (
    <NoteCardErrorBoundary key={note.id}>
      <div
        data-note-id={note.id}
        data-index={index}
        onClick={onClick}
        style={{
          width: "100%",
          minHeight: "100px", // Ensure minimum height for focus indicator
        }}
      >
        <NoteCard
          note={note}
          index={index}
          metadata={metadata}
          asciiCache={asciiCache}
          isDarkMode={isDarkMode}
          useAscii={useAscii}
          useColor={useColor}
          isMobile={isMobile}
          copiedPubkeys={copiedPubkeys}
          setCopiedPubkeys={setCopiedPubkeys}
          setFullScreenImage={setFullScreenImage}
          onAsciiRendered={onAsciiRendered}
          onMediaLoadError={onMediaLoadError}
          getDisplayNameForPubkey={getDisplayNameForPubkey}
          imageMode={imageMode}
          readRelayUrls={readRelayUrls}
          writeRelayUrls={writeRelayUrls}
          onHashtagClick={onHashtagClick}
        />
      </div>
    </NoteCardErrorBoundary>
  );
};

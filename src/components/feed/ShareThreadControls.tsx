import React from "react";
import { nip19 } from "nostr-tools";
import { useUIStore } from "../lib/useUIStore";

interface ShareThreadControlsProps {
  isMobile: boolean;
  notes: any[];
  currentIndex: number;
  relayStatuses: {
    url: string;
    connected: boolean;
    read: boolean;
    write: boolean;
  }[];
  showThreadModal: boolean;
  onUpdateThreadModalState: (noteId: string | null) => void;
  replyCount?: number;
}

export const ShareThreadControls: React.FC<ShareThreadControlsProps> = ({
  isMobile,
  notes,
  currentIndex,
  relayStatuses,
  showThreadModal,
  onUpdateThreadModalState,
  replyCount = 0,
}) => {
  const uiIsDarkMode = useUIStore((s) => s.isDarkMode);
  const handleShare = () => {
    if (notes.length === 0 || !notes[currentIndex]) return;
    const currentNote = notes[currentIndex];
    let encoded: string;
    try {
      const connectedRelays = relayStatuses
        .filter((s) => s.connected && s.read)
        .map((s) => s.url)
        .slice(0, 4);
      encoded =
        connectedRelays.length > 0
          ? nip19.neventEncode({ id: currentNote.id, relays: connectedRelays })
          : nip19.noteEncode(currentNote.id);
    } catch {
      encoded = nip19.noteEncode(currentNote.id);
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
  };

  const handleThread = () => {
    const currentNote = notes[currentIndex];
    onUpdateThreadModalState(showThreadModal ? null : currentNote?.id || null);
  };

  if (isMobile) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "2rem",
        }}
      >
        {/* Share button */}
        <button
          onClick={handleShare}
          style={{
            backgroundColor: "transparent",
            fontSize: "0.75rem",
            textTransform: "uppercase" as const,
            transition: "all 0.3s ease",
            whiteSpace: "nowrap" as const,
            height: "1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "unset",
            padding: "0 0.75rem",
            cursor: "pointer",
            color: uiIsDarkMode ? "var(--text-color)" : "var(--ibm-cream)",
          }}
          title="Share this note"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16,6 12,2 8,6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
        </button>

        {/* View Thread button */}
        <button
          onClick={handleThread}
          style={{
            backgroundColor: "transparent",
            fontSize: "0.75rem",
            textTransform: "uppercase" as const,
            transition: "all 0.3s ease",
            whiteSpace: "nowrap" as const,
            height: "1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "unset",
            padding: "0 0.75rem",
            cursor: "pointer",
            color: uiIsDarkMode ? "var(--text-color)" : "var(--ibm-cream)",
          }}
          title="View thread"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill={
              showThreadModal
                ? uiIsDarkMode
                  ? "var(--accent-color)"
                  : "var(--ibm-mustard)"
                : "none"
            }
            stroke={
              replyCount > 0
                ? uiIsDarkMode
                  ? "var(--accent-color)"
                  : "var(--ibm-mustard)"
                : "currentColor"
            }
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              filter: replyCount > 0 ? "var(--accent-glow-filter)" : undefined,
              transition: "stroke 0.2s, filter 0.2s",
            }}
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      {/* Share button (desktop) */}
      {notes.length > 0 &&
        currentIndex >= 0 &&
        currentIndex < notes.length &&
        notes[currentIndex] && (
          <button
            onClick={handleShare}
            style={{
              backgroundColor: "transparent",
              fontSize: "0.75rem",
              textTransform: "uppercase" as const,
              transition: "all 0.3s ease",
              whiteSpace: "nowrap" as const,
              height: "1.25rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "unset",
              padding: "0 0.75rem",
              cursor: "pointer",
              marginRight: "0.5rem",
              color: uiIsDarkMode ? "var(--text-color)" : "var(--ibm-cream)",
            }}
            title="Share this note"
          >
            Share Note
          </button>
        )}
      {/* View Thread button (desktop) */}
      <button
        onClick={handleThread}
        style={{
          backgroundColor: "transparent",
          border: showThreadModal
            ? uiIsDarkMode
              ? "1px solid var(--accent-color)"
              : "1px solid var(--ibm-mustard)"
            : "none",
          fontSize: "0.75rem",
          textTransform: "uppercase" as const,
          transition: "all 0.3s ease",
          whiteSpace: "nowrap" as const,
          height: "1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "unset",
          padding: "0 0.75rem",
          cursor: "pointer",
          color: showThreadModal
            ? uiIsDarkMode
              ? "var(--accent-color)"
              : "var(--ibm-mustard)"
            : uiIsDarkMode
            ? "var(--text-color)"
            : "var(--ibm-cream)",
          fontWeight: showThreadModal ? "bold" : "normal",
          filter: showThreadModal ? "var(--accent-glow-filter)" : "none",
        }}
        title="View Thread (o)"
      >
        View Thread (T)
      </button>
    </div>
  );
};

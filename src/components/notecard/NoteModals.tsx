import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Note, Metadata } from "../../types/nostr/types";
import RepostModal from "../RepostModal";
import ZapModal from "../ZapModal";
import { CACHE_KEYS } from "../../utils/cacheKeys";

export interface NoteModalsProps {
  // Note data
  note: Note;
  isValidNote: boolean;
  isMobile: boolean;

  // Modal states
  showRepostModal?: boolean;
  setShowRepostModal?: (show: boolean) => void;
  updateRepostModalState?: (noteId: string | null) => void;
  showZapModal?: boolean;
  setShowZapModal?: (show: boolean) => void;
  updateZapModalState?: (noteId: string | null) => void;

  // User data
  myPubkey: string | null;
  _metadata: Metadata | null;

  // Relay URLs
  readRelayUrls: string[];
  writeRelayUrls: string[];

  // Display options
  useAscii?: boolean;
  useColor?: boolean;

  // Handlers
  getDisplayNameForPubkey: (pubkey: string) => string;
  onHashtagClick?: (hashtag: string) => void;
  markNoteAsZapped: (noteId: string) => void;
}

export const NoteModals: React.FC<NoteModalsProps> = ({
  note,
  isValidNote,
  isMobile,
  showRepostModal,
  setShowRepostModal,
  updateRepostModalState: _updateRepostModalState,
  showZapModal,
  setShowZapModal,
  updateZapModalState: _updateZapModalState,
  myPubkey: _myPubkey,
  _metadata: __metadata,
  readRelayUrls,
  writeRelayUrls,
  useAscii = false,
  useColor = false,
  getDisplayNameForPubkey,
  onHashtagClick,
  markNoteAsZapped,
}) => {
  const queryClient = useQueryClient();

  return (
    <>
      {/* Repost Modal - Desktop */}
      {isValidNote && showRepostModal && !isMobile && (
        <RepostModal
          parentNoteId={note.id}
          parentNote={note}
          readRelayUrls={readRelayUrls}
          writeRelayUrls={writeRelayUrls}
          isMobile={isMobile}
          onClose={() => setShowRepostModal?.(false)}
          getDisplayNameForPubkey={getDisplayNameForPubkey}
          mountWithinContainer={true}
          useAscii={useAscii}
          useColor={useColor}
          onHashtagClick={onHashtagClick}
        />
      )}

      {/* Repost Modal - Mobile */}
      {isValidNote && showRepostModal && isMobile && (
        <RepostModal
          parentNoteId={note.id}
          parentNote={note}
          readRelayUrls={readRelayUrls}
          writeRelayUrls={writeRelayUrls}
          isMobile={isMobile}
          onClose={() => setShowRepostModal?.(false)}
          getDisplayNameForPubkey={getDisplayNameForPubkey}
          mountWithinContainer={false}
          useAscii={useAscii}
          useColor={useColor}
          onHashtagClick={onHashtagClick}
        />
      )}

      {/* All authentication and unlock modals are now rendered globally in MainLayout */}

      {/* Zap Modal - Desktop */}
      {showZapModal && !isMobile && (
        <ZapModal
          noteId={note.id}
          recipientPubkey={note.pubkey}
          recipientName={getDisplayNameForPubkey(note.pubkey)}
          relayUrls={readRelayUrls}
          isOpen={showZapModal}
          onClose={() => setShowZapModal?.(false)}
          isMobile={isMobile}
          mountWithinContainer={true}
          onZapSuccess={(amount) => {
            // Mark note as zapped for UI feedback
            markNoteAsZapped(note.id);

            // Optimistically update zap totals immediately
            const zapTotalsKey = CACHE_KEYS.ZAP_TOTALS(note.id);
            queryClient.setQueryData(zapTotalsKey, (oldData: any) => {
              // Handle case where there's no existing zap data
              const currentSats = oldData?.totalSats ?? 0;
              const currentMsats = oldData?.totalMsats ?? 0;
              const newData = {
                totalSats: currentSats + amount,
                totalMsats: currentMsats + amount * 1000,
              };
              return newData;
            });

            // Schedule multiple retries with increasing delays to handle relay propagation
            const retryDelays = [3000, 8000, 15000]; // 3s, 8s, 15s

            retryDelays.forEach((delay) => {
              setTimeout(async () => {
                // Force invalidation and refetch
                queryClient.invalidateQueries({ queryKey: zapTotalsKey });

                // If this is the last retry and we still don't have the expected amount,
                // the optimistic update will remain as the source of truth
              }, delay);
            });
          }}
          onZapError={(error) => {
            console.error("Zap failed:", error);
            // Could show a toast notification here
          }}
        />
      )}

      {/* Zap Modal - Mobile */}
      {showZapModal && isMobile && (
        <ZapModal
          noteId={note.id}
          recipientPubkey={note.pubkey}
          recipientName={getDisplayNameForPubkey(note.pubkey)}
          relayUrls={readRelayUrls}
          isOpen={showZapModal}
          onClose={() => setShowZapModal?.(false)}
          isMobile={isMobile}
          mountWithinContainer={false}
          onZapSuccess={(amount) => {
            // Mark note as zapped for UI feedback
            markNoteAsZapped(note.id);

            // Optimistically update zap totals immediately
            const zapTotalsKey = CACHE_KEYS.ZAP_TOTALS(note.id);
            queryClient.setQueryData(zapTotalsKey, (oldData: any) => {
              // Handle case where there's no existing zap data
              const currentSats = oldData?.totalSats ?? 0;
              const currentMsats = oldData?.totalMsats ?? 0;
              const newData = {
                totalSats: currentSats + amount,
                totalMsats: currentMsats + amount * 1000,
              };
              return newData;
            });

            // Schedule multiple retries with increasing delays to handle relay propagation
            const retryDelays = [3000, 8000, 15000]; // 3s, 8s, 15s

            retryDelays.forEach((delay) => {
              setTimeout(async () => {
                // Force invalidation and refetch
                queryClient.invalidateQueries({ queryKey: zapTotalsKey });

                // If this is the last retry and we still don't have the expected amount,
                // the optimistic update will remain as the source of truth
              }, delay);
            });
          }}
          onZapError={(error) => {
            console.error("Zap failed:", error);
            // Could show a toast notification here
          }}
        />
      )}
    </>
  );
};

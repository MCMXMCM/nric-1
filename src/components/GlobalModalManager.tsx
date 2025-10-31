import React, { useContext, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { NostrContext } from "../contexts/NostrContext";
import { useRelayManager } from "../hooks/useRelayManager";
import { useDisplayNames } from "../hooks/useDisplayNames";
import { DEFAULT_RELAY_URLS } from "../utils/nostr/constants";
import {
  parseModalState,
  updateUrlWithModalState,
  type ModalState,
} from "../utils/modalUrlState";
import ReplyModal from "./ReplyModal";
import RepostModal from "./RepostModal";
import ZapModal from "./ZapModal";
import { useUserZaps } from "../hooks/useUserZaps";
import { CACHE_KEYS } from "../utils/cacheKeys";

interface GlobalModalManagerProps {
  isMobile: boolean;
}

const GlobalModalManager: React.FC<GlobalModalManagerProps> = ({
  isMobile,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { nostrClient, pubkey: ctxPubkey } = useContext(NostrContext);

  const { relayUrls } = useRelayManager({
    nostrClient,
    initialRelays: DEFAULT_RELAY_URLS,
    pubkeyHex: ctxPubkey,
  });

  const { getDisplayNameForPubkey } = useDisplayNames(relayUrls);
  const queryClient = useQueryClient();
  const { markNoteAsZapped } = useUserZaps();

  // Parse modal state from URL
  const modalState = useMemo(() => {
    return parseModalState(new URLSearchParams(location.search));
  }, [location.search]);

  // Handle modal close by clearing the specific modal from URL
  const handleModalClose = (modalType: keyof ModalState) => {
    const newState: ModalState = { ...modalState };
    delete newState[modalType];
    updateUrlWithModalState(newState, navigate, location);
  };

  return (
    <>
      {/* Reply Modal */}
      {modalState.reply && (
        <ReplyModal
          parentNoteId={modalState.reply}
          parentNote={undefined} // Will be loaded by the modal
          readRelayUrls={relayUrls}
          writeRelayUrls={relayUrls}
          isMobile={isMobile}
          onClose={() => handleModalClose("reply")}
          getDisplayNameForPubkey={getDisplayNameForPubkey}
          mountWithinContainer={false}
          useAscii={false}
          useColor={true}
          imageMode={true}
        />
      )}

      {/* Repost Modal */}
      {modalState.repost && (
        <RepostModal
          parentNoteId={modalState.repost}
          parentNote={undefined} // Will be loaded by the modal
          readRelayUrls={relayUrls}
          writeRelayUrls={relayUrls}
          isMobile={isMobile}
          onClose={() => handleModalClose("repost")}
          getDisplayNameForPubkey={getDisplayNameForPubkey}
          mountWithinContainer={false}
          useAscii={false}
          useColor={true}
          imageMode={true}
        />
      )}

      {/* Zap Modal */}
      {modalState.zap && (
        <ZapModal
          noteId={modalState.zap}
          recipientPubkey="" // Will be loaded by the modal
          relayUrls={relayUrls}
          isOpen={true}
          onClose={() => handleModalClose("zap")}
          isMobile={isMobile}
          mountWithinContainer={false}
          onZapSuccess={(amount) => {
            // Optimistic UI: mark as zapped and bump totals
            try {
              if (modalState.zap) {
                markNoteAsZapped(modalState.zap);
                const zapTotalsKey = CACHE_KEYS.ZAP_TOTALS(modalState.zap);
                queryClient.setQueryData(zapTotalsKey, (oldData: any) => {
                  const currentSats = oldData?.totalSats ?? 0;
                  const currentMsats = oldData?.totalMsats ?? 0;
                  return {
                    totalSats: currentSats + amount,
                    totalMsats: currentMsats + amount * 1000,
                  };
                });
              }
            } catch {}
            handleModalClose("zap");
          }}
          onZapError={() => {
            // leave modal open; ZapModal handles displaying error
          }}
        />
      )}
    </>
  );
};

export default GlobalModalManager;

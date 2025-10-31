import React, { useState, useCallback, useContext, useMemo } from "react";
import { useNdkWallet } from "../contexts/NdkWalletContext";
import { NostrContext } from "../contexts/NostrContext";
import { useDisplayNames } from "../hooks/useDisplayNames";
import UnlockKeyModal from "./UnlockKeyModal";
import { useHaptic } from "use-haptic";
import {
  prepareMetadataForModal,
  getCurrentPubkeyHex,
} from "../utils/nostr/pubkeyUtils";
import { useNostrifyNote } from "../hooks/useNostrifyThread";

interface ZapModalProps {
  noteId: string;
  recipientPubkey: string;
  recipientName?: string;
  relayUrls: string[];
  isOpen: boolean;
  onClose: () => void;
  onZapSuccess?: (amount: number) => void;
  onZapError?: (error: string) => void;
  isMobile?: boolean;
  mountWithinContainer?: boolean;
}

const ZapModal: React.FC<ZapModalProps> = ({
  noteId,
  recipientPubkey,
  recipientName,
  relayUrls,
  isOpen,
  onClose,
  onZapSuccess,
  onZapError,
  isMobile: propIsMobile,
  mountWithinContainer = false,
}) => {
  const { sendZap, walletInfo, error: walletError } = useNdkWallet();
  const { pubkey: currentPubkey, getCachedMetadataForPubkey } =
    useContext(NostrContext);
  const { getDisplayNameForPubkey } = useDisplayNames(relayUrls);

  // Haptic feedback hook
  const { triggerHaptic } = useHaptic();

  // Use provided isMobile prop or detect from window size
  const isMobile = propIsMobile ?? window.innerWidth <= 768;
  const [isZapping, setIsZapping] = useState(false);
  const [zapAmount, setZapAmount] = useState("1000"); // Default 1000 sats as string
  const [zapComment, setZapComment] = useState("");
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [zapError, setZapError] = useState<string | null>(null);

  // Resolve recipient pubkey if not provided (e.g., when opened from global modal)
  const { note: targetNote } = useNostrifyNote({
    noteId,
    relayUrls,
    enabled: isOpen && !recipientPubkey,
  });
  const effectiveRecipientPubkey = recipientPubkey || targetNote?.pubkey || "";

  const handleZap = useCallback(async () => {
    if (!walletInfo.connected) {
      onZapError?.("Wallet not connected");
      return;
    }

    const numericAmount = Number(zapAmount);

    if (!numericAmount || numericAmount <= 0) {
      onZapError?.("Please enter a valid amount greater than 0");
      return;
    }

    setIsZapping(true);
    setZapError(null); // Clear any previous errors
    let timeoutId: number | undefined;

    try {
      if (!effectiveRecipientPubkey) {
        throw new Error(
          "Unable to load note author. Please wait for the note to load and try again."
        );
      }
      // Add timeout protection to prevent indefinite hanging
      const zapPromise = sendZap({
        amount: numericAmount,
        comment: zapComment.trim() || undefined,
        recipientPubkey: effectiveRecipientPubkey,
        eventId: noteId,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new Error(
              "Zap request timed out. Please open your Nostr extension/NWC wallet to approve the request, check your connection, and try again."
            )
          );
        }, 60000); // 60 second timeout to allow user approval
      });

      const result = await Promise.race([zapPromise, timeoutPromise]);

      if (result.success) {
        // 🎯 TRIGGER HAPTIC AFTER SUCCESSFUL ZAP (outside user gesture context)
        console.log("🎯 Triggering haptic feedback for successful zap");
        try {
          triggerHaptic();
          console.log("✅ Haptic feedback triggered successfully for zap");
        } catch (error) {
          console.error("❌ Haptic feedback failed for zap:", error);
        }

        onZapSuccess?.(numericAmount);
        onClose();
        setZapComment("");
      } else {
        const errorMsg = result.error || "Failed to send zap";
        setZapError(errorMsg);
        onZapError?.(errorMsg);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to send zap";

      // Check if this is a key unlock error
      if (
        errorMessage.includes("Key is locked") ||
        errorMessage.includes("unlock your NSEC key")
      ) {
        setIsZapping(false);
        setShowUnlockModal(true);
        return;
      }

      // Handle timeout errors specifically
      let displayError = errorMessage;
      if (errorMessage.includes("Payment request timed out")) {
        displayError =
          "Payment timed out. Open your NWC wallet to approve the payment, or reconnect and try again.";
      } else if (errorMessage.includes("timed out")) {
        displayError =
          "Zap request timed out. Please check your connection and try again.";
      }

      setZapError(displayError);
      onZapError?.(displayError);
    } finally {
      setIsZapping(false);
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }, [
    sendZap,
    walletInfo.connected,
    zapAmount,
    zapComment,
    effectiveRecipientPubkey,
    noteId,
    onZapSuccess,
    onZapError,
    onClose,
    triggerHaptic,
  ]);

  const handleUnlockSuccess = useCallback(async () => {
    setShowUnlockModal(false);
    // Retry the zap after successful unlock
    await handleZap();
  }, [handleZap]);

  // Detect PWA mode
  const isPWA = useMemo(() => {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true
    );
  }, []);

  if (!isOpen) return null;

  const containerStyle: React.CSSProperties = mountWithinContainer
    ? {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "var(--app-bg-color)",
        display: "flex",
        flexDirection: "column",
        zIndex: 5,
        maxHeight: isMobile ? "100%" : "calc(100% - 60px)", // Desktop behavior for within-container mode
        overflow: "hidden",
      }
    : {
        position: "fixed",
        top: 0,
        marginTop: isMobile ? "6rem" : "0",
        left: 0,
        right: 0,
        bottom:
          isMobile && isPWA ? `calc(0px - var(--safe-area-inset-bottom))` : 0, // Extend beyond safe area in PWA mode
        height: "100dvh",
        minHeight: "100dvh",
        backgroundColor: "var(--app-bg-color)",
        display: "flex",
        flexDirection: "column",
        alignItems: isMobile ? "stretch" : "flex-start",
        justifyContent: isMobile ? "flex-start" : "center",
        paddingTop: isMobile ? 0 : "100px",
        zIndex: 10000,
      };

  const closeIfBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <div style={containerStyle} onClick={closeIfBackdrop}>
      <div
        style={
          mountWithinContainer
            ? {
                backgroundColor: "var(--card-bg-color)",
                padding: "20px",
                flex: 1,
                overflow: "auto",
                display: "flex",
                flexDirection: "column",
              }
            : {
                backgroundColor: "var(--card-bg-color)",
                padding: "20px",
                maxWidth: "400px",
                width: isMobile ? "100%" : "90%",
                maxHeight: isMobile ? "calc(100vh - 6rem)" : "80vh",
                overflow: "auto",
                margin: isMobile ? 0 : "0 auto",
              }
        }
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            marginTop: 0,
            color: "var(--text-color)",
            overflowWrap: "anywhere",
          }}
        >
          Zap {recipientName || "User"}
        </h3>

        <div style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              color: "var(--text-color)",
            }}
          >
            Amount (sats):
          </label>
          <input
            type="number"
            pattern="\d*"
            value={zapAmount}
            onChange={(e) => setZapAmount(e.target.value)}
            min="1"
            style={{
              width: "100%",
              padding: "8px",
              borderRadius: "0px",
              border: "1px solid var(--border-color)",
              backgroundColor: "var(--input-bg-color)",
              color: "var(--text-color)",
            }}
          />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              color: "var(--text-color)",
            }}
          >
            Comment (optional):
          </label>
          <textarea
            value={zapComment}
            onChange={(e) => setZapComment(e.target.value)}
            placeholder="Add a message with your zap..."
            rows={3}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid var(--border-color)",
              backgroundColor: "var(--input-bg-color)",
              color: "var(--text-color)",
              resize: "vertical",
            }}
          />
        </div>

        {!walletInfo.connected && (
          <div
            style={{
              backgroundColor: "#ffebee",
              color: "#c62828",
              padding: "8px",
              marginBottom: "16px",
              fontSize: "0.9rem",
            }}
          >
            ⚠️ Wallet not connected. Please connect your wallet first.
          </div>
        )}

        {walletError && (
          <div
            style={{
              backgroundColor: "#ffebee",
              color: "#c62828",
              padding: "8px",
              marginBottom: "16px",
              fontSize: "0.9rem",
            }}
          >
            Error: {walletError}
          </div>
        )}

        {zapError && (
          <div
            style={{
              backgroundColor: "#ffebee",
              color: "#c62828",
              padding: "8px",
              marginBottom: "16px",
              fontSize: "0.9rem",
            }}
          >
            Error: {zapError}
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: "8px",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              border: "1px solid var(--border-color)",
              backgroundColor: "transparent",
              color: "var(--text-color)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleZap}
            disabled={
              !walletInfo.connected ||
              isZapping ||
              !zapAmount ||
              Number(zapAmount) <= 0
            }
            style={{
              padding: "8px 16px",
              border: "none",
              backgroundColor:
                !walletInfo.connected ||
                isZapping ||
                !zapAmount ||
                Number(zapAmount) <= 0
                  ? "#ccc"
                  : "#ff9900",
              color: "white",
              cursor:
                !walletInfo.connected ||
                isZapping ||
                !zapAmount ||
                Number(zapAmount) <= 0
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {isZapping
              ? "Sending..."
              : zapError
              ? "Retry Zap"
              : `Zap ${zapAmount || 0} sats`}
          </button>
        </div>
      </div>

      {/* Unlock Key Modal */}
      <UnlockKeyModal
        isOpen={showUnlockModal}
        onClose={() => setShowUnlockModal(false)}
        actionLabel="Unlock to Zap"
        currentPubkeyHex={getCurrentPubkeyHex(currentPubkey)}
        onUnlocked={handleUnlockSuccess}
        getDisplayNameForPubkey={getDisplayNameForPubkey}
        metadata={prepareMetadataForModal(
          currentPubkey,
          getCachedMetadataForPubkey(currentPubkey || "")
        )}
      />
    </div>
  );
};

export default ZapModal;

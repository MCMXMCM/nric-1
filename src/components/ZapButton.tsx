import React from "react";
import { useNavigate } from "@tanstack/react-router";
import { nip19 } from "nostr-tools";
import { useNdkWallet } from "../contexts/NdkWalletContext";

interface ZapButtonProps {
  noteId: string;
  recipientName?: string;
  onShowModal?: () => void;
  hasZappedByMe?: boolean; // New prop to indicate if current user has zapped
  // Navigation props for URL-based modal opening (optional for backward compatibility)
  index?: number;
}

const ZapButton: React.FC<ZapButtonProps> = ({
  noteId,
  recipientName,
  onShowModal,
  hasZappedByMe = false,
  index,
}) => {
  const { walletInfo, isLoading: isWalletLoading } = useNdkWallet();
  const navigate = useNavigate();
  // location removed - unused variable

  const handleZapClick = () => {
    // If we have navigation context (index is provided), navigate to note page with zap modal
    if (typeof index === "number") {
      try {
        const encodedId = nip19.noteEncode(noteId);
        // Navigation variables removed - unused
        // navigationState removed - unused variable
        navigate({
          to: `/note/${encodedId}`,
          search: { zap: noteId, reply: "", repost: "", thread: "" },
          state: true,
        });
      } catch (error) {
        // Fallback to direct modal opening if encoding fails
        onShowModal?.();
      }
    } else {
      // Fallback to old behavior for backward compatibility
      onShowModal?.();
    }
  };

  return (
    <>
      {/* Zap button */}
      <button
        onClick={handleZapClick}
        disabled={!walletInfo.connected || isWalletLoading}
        style={{
          backgroundColor: "transparent",
          border: "none",
          color: hasZappedByMe ? "#D4A574" : "var(--text-color)", // ibm-mustard when zapped
          cursor:
            !walletInfo.connected || isWalletLoading
              ? "not-allowed"
              : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "24px",
          height: "24px",
          opacity: !walletInfo.connected || isWalletLoading ? 0.5 : 1,
        }}
        title={
          !walletInfo.connected
            ? "Connect wallet to zap"
            : `Zap ${recipientName || "user"} `
        }
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill={hasZappedByMe ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      </button>
    </>
  );
};

export default ZapButton;

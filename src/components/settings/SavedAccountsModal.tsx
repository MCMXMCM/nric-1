import React, { useState, useContext } from "react";
import { NostrContext } from "../../contexts/NostrContext";
import type { Metadata } from "../../types/nostr/types";
// import { getDisplayInfo } from "./settingsUtils"; // Removed - no longer needed
import UserInfoCard from "../UserInfoCard";

interface SavedAccountsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (pubkey: string) => void;
  savedAccounts: Array<{ pubkey: string; timestamp: number }>;
  metadata: Record<string, Metadata>;
}

export const SavedAccountsModal: React.FC<SavedAccountsModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  savedAccounts,
  metadata,
}) => {
  const { signInWithSavedAccount, getCachedMetadataForPubkey } =
    useContext(NostrContext);

  const [selectedSavedAccount, setSelectedSavedAccount] = useState<
    string | null
  >(null);
  const [savedPassphrase, setSavedPassphrase] = useState("");
  const [savedPassphraseError, setSavedPassphraseError] = useState("");

  const handleLogin = async () => {
    try {
      setSavedPassphraseError("");
      if (!savedPassphrase || savedPassphrase.length < 1) {
        setSavedPassphraseError("Enter your passphrase");
        return;
      }
      const pk = await signInWithSavedAccount(
        selectedSavedAccount!,
        savedPassphrase
      );
      onSuccess(pk);
      onClose();
    } catch (e: any) {
      setSavedPassphraseError(e?.message || "Failed to unlock saved account");
    }
  };

  // Create enhanced metadata object that includes cached metadata
  const enhancedMetadata = React.useMemo(() => {
    const enhanced: Record<string, Metadata> = { ...metadata };

    // Add cached metadata for saved accounts
    savedAccounts.forEach((account) => {
      const cached = getCachedMetadataForPubkey(account.pubkey);
      if (cached) {
        enhanced[account.pubkey] = cached;
      }
    });

    return enhanced;
  }, [metadata, savedAccounts, getCachedMetadataForPubkey]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 10000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "var(--app-bg-color)",
          padding: "1rem",
          width: "100%",
          maxWidth: "520px",
          border: "1px dotted var(--border-color)",
          margin: "1rem",
          maxHeight: "calc(100vh - 2rem)",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            margin: 0,
            color: "var(--text-color)",

            fontSize: "1rem",
          }}
        >
          Saved Accounts
        </h3>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            marginTop: "0.75rem",
            maxHeight: "50vh",
            overflowY: "auto",
          }}
        >
          {savedAccounts.length === 0 ? (
            <div
              style={{
                color: "var(--text-color)",

                fontSize: "0.875rem",
                opacity: 0.75,
              }}
            >
              No saved accounts found on this device.
            </div>
          ) : (
            savedAccounts.map((acc) => {
              const isSelected = selectedSavedAccount === acc.pubkey;

              return (
                <div
                  key={acc.pubkey}
                  style={{
                    // border: "1px dotted var(--border-color)",
                    padding: "0.5rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <div
                    onClick={() => {
                      setSelectedSavedAccount(acc.pubkey);
                      setSavedPassphrase("");
                      setSavedPassphraseError("");
                    }}
                    style={{ cursor: "pointer" }}
                    title="Click to select account"
                  >
                    <UserInfoCard
                      pubkeyHex={acc.pubkey}
                      metadata={enhancedMetadata}
                      size={36}
                    />
                  </div>

                  {isSelected && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                      }}
                    >
                      <input
                        type="password"
                        value={savedPassphrase}
                        onChange={(e) => setSavedPassphrase(e.target.value)}
                        placeholder="Enter passphrase"
                        autoComplete="current-password"
                        style={{
                          backgroundColor: "transparent",
                          color: "var(--text-color)",
                          border: "1px dotted var(--border-color)",
                          padding: "0.5rem",

                          fontSize: "0.875rem",
                          width: "100%",
                          boxSizing: "border-box",
                        }}
                      />
                      {savedPassphraseError && (
                        <div
                          style={{
                            color: "#ff0000",

                            fontSize: "0.75rem",
                          }}
                        >
                          {savedPassphraseError}
                        </div>
                      )}
                      <div
                        style={{
                          display: "flex",
                          gap: "0.5rem",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          onClick={onClose}
                          style={{
                            backgroundColor: "transparent",
                            color: "var(--text-color)",
                            border: "1px dotted var(--border-color)",
                            padding: "0.5rem 0.75rem",

                            fontSize: "0.875rem",
                            cursor: "pointer",
                          }}
                        >
                          Close
                        </button>
                        <button
                          onClick={handleLogin}
                          style={{
                            backgroundColor: "transparent",
                            color: "var(--text-color)",
                            border: "1px dotted var(--border-color)",
                            padding: "0.5rem 0.75rem",

                            fontSize: "0.875rem",
                            cursor: "pointer",
                          }}
                        >
                          Login
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: "0.75rem",
          }}
        ></div>
      </div>
    </div>
  );
};

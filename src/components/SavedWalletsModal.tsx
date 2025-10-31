import React, { useState, useEffect } from "react";
import { useNdkWallet } from "../contexts/NdkWalletContext";
import { useNostr } from "../contexts/NostrContext";
import {
  getStoredWalletConnections,
  getStoredWalletConnection,
} from "../utils/walletStorage";
import type { StoredWalletConnection } from "../utils/walletStorage";

interface SavedWalletsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const SavedWalletsModal: React.FC<SavedWalletsModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { connectNWCWallet } = useNdkWallet();
  const { listSavedAccounts, pubkey, loginMethod } = useNostr();
  
  // Generate user identifier for password manager autocomplete (format: pubkey...NWC-Passphrase)
  const userIdentifier = pubkey ? `${pubkey.slice(0, 12)}...NWC-Passphrase` : 'NWC-Passphrase';
  const [savedWallets, setSavedWallets] = useState<StoredWalletConnection[]>(
    []
  );
  const [, setSavedAccounts] = useState<
    Array<{ pubkey: string; timestamp: number }>
  >([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [passphraseError, setPassphraseError] = useState("");
  const [showPassphrasePrompt, setShowPassphrasePrompt] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load saved wallets and accounts
  useEffect(() => {
    const loadData = async () => {
      try {
        const wallets = await getStoredWalletConnections(pubkey);
        setSavedWallets(wallets);

        const accounts = await listSavedAccounts();
        setSavedAccounts(accounts);
      } catch (err) {
        console.error("Failed to load saved data:", err);
      }
    };

    if (isOpen) {
      loadData();
    }
  }, [isOpen, listSavedAccounts]);

  const handleConnectWallet = async () => {
    if (!selectedWalletId) {
      setError("Please select a wallet");
      return;
    }

    setIsConnecting(true);
    setError(null);
    setPassphraseError("");

    try {
      // Try to get the decrypted wallet connection
      const decryptedWallet = await getStoredWalletConnection(
        selectedWalletId,
        {
          pubkey,
          decrypt: true,
          passphrase: passphrase || undefined,
        }
      );

      if (!decryptedWallet) {
        setError("Wallet not found or could not be decrypted");
        setIsConnecting(false);
        return;
      }

      // If still encrypted, and it's a NIP-07 user, prompt for passphrase
      if (decryptedWallet.connectionString === "encrypted") {
        if (loginMethod === "nip07" && !showPassphrasePrompt) {
          setShowPassphrasePrompt(true);
          setIsConnecting(false);
          return;
        } else if (loginMethod === "nip07" && !passphrase) {
          setPassphraseError("Please enter your passphrase");
          setIsConnecting(false);
          return;
        } else if (loginMethod === "nip07") {
          // Passphrase was provided but still didn't decrypt
          setPassphraseError("Incorrect passphrase. Please try again.");
          setIsConnecting(false);
          return;
        } else {
          setError(
            "Unable to decrypt wallet. This wallet may have been created with the old system - please delete and reconnect it, or ensure your NSEC key is unlocked."
          );
          setIsConnecting(false);
          return;
        }
      }

      // Connect the wallet using the decrypted connection string
      const success = await connectNWCWallet(
        decryptedWallet.connectionString,
        decryptedWallet.name,
        false,
        { pubkey }
      );
      if (success) {
        onSuccess?.();
        onClose();
      } else {
        setError("Failed to connect to wallet");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to connect to wallet";
      setError(errorMessage);
    } finally {
      setIsConnecting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "var(--app-bg-color)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "var(--card-bg-color)",
          padding: "20px",
          maxWidth: "500px",
          width: "100%",
          maxHeight: "80vh",
          overflow: "auto",
          borderRadius: "8px",
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
          Saved Wallets
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
          {savedWallets.length === 0 ? (
            <div
              style={{
                color: "var(--text-color)",
                fontSize: "0.875rem",
                opacity: 0.75,
              }}
            >
              No saved wallets found on this device.
            </div>
          ) : (
            savedWallets.map((wallet) => {
              const isSelected = selectedWalletId === wallet.id;

              return (
                <div
                  key={wallet.id}
                  style={{
                    padding: "0.5rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <div
                    onClick={() => {
                      setSelectedWalletId(wallet.id);
                      setPassphrase("");
                      setPassphraseError("");
                      setShowPassphrasePrompt(false);
                      setError(null);
                    }}
                    style={{ cursor: "pointer" }}
                    title="Click to select wallet"
                  >
                    <div
                      style={{
                        backgroundColor: "var(--card-bg-color)",
                        border: "1px dotted var(--border-color)",
                        padding: "0.75rem",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: "bold",
                          color: "var(--text-color)",
                        }}
                      >
                        {wallet.name}
                      </div>
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-color)",
                          opacity: 0.7,
                        }}
                      >
                        {wallet.walletType.toUpperCase()} • Connected{" "}
                        {new Date(wallet.connectedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                      }}
                    >
                      {showPassphrasePrompt && loginMethod === "nip07" && (
                        <div
                          style={{
                            padding: "0.75rem",
                            backgroundColor: "var(--hover-bg)",
                            borderRadius: "4px",
                          }}
                        >
                          {/* Hidden username field for password manager integration */}
                          <input
                            type="text"
                            value={userIdentifier}
                            readOnly
                            style={{ display: "none" }}
                            autoComplete="username"
                          />
                          <p
                            style={{
                              marginTop: 0,
                              marginBottom: "0.5rem",
                              fontSize: "0.875rem",
                              color: "var(--text-color)",
                              fontWeight: "500",
                            }}
                          >
                            Enter {userIdentifier} - NWC Passphrase:
                          </p>
                          <input
                            type="password"
                            value={passphrase}
                            onChange={(e) => {
                              setPassphrase(e.target.value);
                              setPassphraseError("");
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleConnectWallet();
                              }
                            }}
                            placeholder="Enter passphrase..."
                            autoComplete="current-password"
                            autoFocus
                            style={{
                              width: "100%",
                              padding: "0.5rem",
                              border: "1px solid var(--border-color)",
                              backgroundColor: "var(--input-bg-color)",
                              color: "var(--text-color)",
                              borderRadius: "4px",
                              boxSizing: "border-box",
                            }}
                          />
                        </div>
                      )}

                      {!showPassphrasePrompt && loginMethod !== "nip07" && (
                        <div
                          style={{
                            fontSize: "0.8rem",
                            color: "var(--text-color)",
                            opacity: 0.8,
                            fontStyle: "italic",
                          }}
                        >
                          Using signature-based authentication - no passphrase
                          required
                        </div>
                      )}

                      {(error || passphraseError) && (
                        <div
                          style={{
                            color: "#ff0000",
                            fontSize: "0.75rem",
                          }}
                        >
                          {error || passphraseError}
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
                          onClick={() => {
                            if (showPassphrasePrompt) {
                              setShowPassphrasePrompt(false);
                              setPassphrase("");
                              setPassphraseError("");
                            } else {
                              onClose();
                            }
                          }}
                          style={{
                            backgroundColor: "transparent",
                            color: "var(--text-color)",
                            border: "1px dotted var(--border-color)",
                            padding: "0.5rem 0.75rem",
                            fontSize: "0.875rem",
                            cursor: "pointer",
                          }}
                        >
                          {showPassphrasePrompt ? "Back" : "Close"}
                        </button>
                        <button
                          onClick={handleConnectWallet}
                          disabled={isConnecting}
                          style={{
                            backgroundColor: "transparent",
                            color: "var(--text-color)",
                            border: "1px dotted var(--border-color)",
                            padding: "0.5rem 0.75rem",
                            fontSize: "0.875rem",
                            cursor: isConnecting ? "not-allowed" : "pointer",
                            opacity: isConnecting ? 0.5 : 1,
                          }}
                        >
                          {isConnecting ? "Connecting..." : "Connect"}
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

export default SavedWalletsModal;

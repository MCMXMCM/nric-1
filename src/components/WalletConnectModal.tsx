import React, { useState, useCallback } from "react";
import { useNdkWallet } from "../contexts/NdkWalletContext";
import { useNostr } from "../contexts/NostrContext";

interface WalletConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const WalletConnectModal: React.FC<WalletConnectModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const {
    connectNWCWallet,
    connectWebLNWallet,
    walletInfo,
    disconnectWallet,
    isLoading,
    error,
  } = useNdkWallet();
  const { loginMethod, pubkey } = useNostr();
  const [connectionString, setConnectionString] = useState("");
  const [walletName, setWalletName] = useState("");
  const [persistWallet, setPersistWallet] = useState(true);
  const [connectionMethod] = useState<"nwc" | "webln">("nwc");
  const [passphrase, setPassphrase] = useState("");
  const [passphraseConfirm, setPassphraseConfirm] = useState("");
  const [passphraseError, setPassphraseError] = useState("");
  // Signature-based authentication eliminates need for passphrase modal

  // Check if user can connect wallets (must be logged in with nsec or nip07)
  const canConnectWallet = loginMethod === "nsec" || loginMethod === "nip07";

  // Check if NIP-07 user needs to provide passphrase when persisting
  const isNip07User = loginMethod === "nip07";
  const needsPassphrase = isNip07User && persistWallet;
  // Generate user identifier for password manager autocomplete (format: pubkey...NWC-Passphrase)
  const userIdentifier = pubkey ? `${pubkey.slice(0, 12)}...NWC-Passphrase` : 'NWC-Passphrase';

  // Detect mobile for better modal positioning
  const isMobile = window.innerWidth <= 768;

  const handleConnect = useCallback(async () => {
    let success = false;

    if (connectionMethod === "nwc") {
      if (!connectionString.trim()) {
        return;
      }

      // Validate passphrase for NIP-07 users
      if (needsPassphrase) {
        if (!passphrase.trim()) {
          setPassphraseError("Passphrase is required to save your wallet");
          return;
        }
        if (passphrase !== passphraseConfirm) {
          setPassphraseError("Passphrases do not match");
          return;
        }
        if (passphrase.length < 8) {
          setPassphraseError("Passphrase must be at least 8 characters");
          return;
        }
      }
      setPassphraseError("");

      // Generate wallet name if not provided
      const finalWalletName =
        walletName.trim() || `NWC Wallet ${new Date().toLocaleDateString()}`;

      // Connect with passphrase if needed (NIP-07 users)
      const options: { pubkey?: string; passphrase?: string } = { pubkey: pubkey };
      if (needsPassphrase) {
        options.passphrase = passphrase;
      }

      success = await connectNWCWallet(
        connectionString.trim(),
        finalWalletName,
        persistWallet,
        options
      );
    } else {
      success = await connectWebLNWallet();
    }

    if (success) {
      onSuccess?.();
      onClose();
    }
  }, [
    connectionMethod,
    connectionString,
    walletName,
    persistWallet,
    pubkey,
    needsPassphrase,
    passphrase,
    passphraseConfirm,
    connectNWCWallet,
    connectWebLNWallet,
    onSuccess,
    onClose,
  ]);

  // Passphrase modal no longer needed with signature-based authentication

  const handleDisconnect = useCallback(() => {
    disconnectWallet();
  }, [disconnectWallet]);

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
        alignItems: isMobile ? "flex-start" : "center",
        justifyContent: "center",
        paddingTop: isMobile ? "100px" : 0,
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "var(--card-bg-color)",
          padding: "20px",
          maxWidth: "500px",
          width: "90%",
          maxHeight: "80vh",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            marginTop: 0,
            color: "var(--text-color)",
            textAlign: "left",
          }}
        >
          {walletInfo.connected
            ? "Wallet Connected"
            : "Connect Lightning Wallet"}
        </h3>

        {walletInfo.connected ? (
          <div>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ marginBottom: "8px" }}>
                <strong>Balance:</strong>{" "}
                {walletInfo.balance ? `${walletInfo.balance} sats` : "Unknown"}
              </div>
              {walletInfo.lud16 && (
                <div style={{ marginBottom: "8px" }}>
                  <strong>Lightning Address:</strong> {walletInfo.lud16}
                </div>
              )}
              {walletInfo.lud06 && (
                <div style={{ marginBottom: "8px" }}>
                  <strong>LNURL:</strong> {walletInfo.lud06}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: "8px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={handleDisconnect}
                style={{
                  padding: "8px 16px",
                  border: "1px solid #dc3545",
                  backgroundColor: "transparent",
                  color: "#dc3545",
                  cursor: "pointer",
                }}
              >
                Disconnect
              </button>
              <button
                onClick={onClose}
                style={{
                  padding: "8px 55px",
                  border: "none",
                  backgroundColor: "var(--accent-color)",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div>
            {!canConnectWallet && (
              <div
                style={{
                  padding: "12px",
                  marginBottom: "16px",
                }}
              >
                <strong>Login Required:</strong> You must be logged in with an
                NSEC key or browser extension to connect a Lightning wallet.
              </div>
            )}

            <p
              style={{
                color: "var(--text-color)",
                marginBottom: "16px",
                textAlign: "left",
              }}
            >
              Connect your Lightning wallet to send and receive zaps. You'll
              need a wallet that supports NIP-47 (Nostr Wallet Connect).
            </p>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  color: "var(--text-color)",
                  textAlign: "left",
                }}
              >
                Wallet Name:
              </label>
              <input
                type="text"
                value={walletName}
                onChange={(e) => setWalletName(e.target.value)}
                placeholder={`NWC Wallet ${new Date().toLocaleDateString()}`}
                style={{
                  width: "100%",
                  padding: "8px",
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
                  textAlign: "left",
                }}
              >
                Wallet Connection String:
              </label>
              <textarea
                value={connectionString}
                onChange={(e) => setConnectionString(e.target.value)}
                placeholder="Paste your wallet's NIP-47 connection string here..."
                rows={4}
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--input-bg-color)",
                  color: "var(--text-color)",
                  fontFamily: "monospace",
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  color: "var(--text-color)",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={persistWallet}
                  onChange={(e) => setPersistWallet(e.target.checked)}
                  style={{ marginRight: "8px" }}
                />
                Save this wallet for future use
              </label>
            </div>

            {/* Passphrase section for NIP-07 users saving wallet */}
            {needsPassphrase && (
              <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "var(--hover-bg)", borderRadius: "4px" }}>
                <p style={{ marginTop: 0, marginBottom: "12px", color: "var(--text-color)", fontSize: "0.875rem" }}>
                  Since you're using a browser extension, create a passphrase to encrypt your wallet connection:
                </p>
                
                {/* Hidden username field for password manager integration */}
                <input
                  type="text"
                  value={userIdentifier}
                  readOnly
                  style={{ display: "none" }}
                  autoComplete="username"
                />
                
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    color: "var(--text-color)",
                    textAlign: "left",
                  }}
                >
                  {userIdentifier} - NWC Passphrase
                </label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => {
                    setPassphrase(e.target.value);
                    setPassphraseError("");
                  }}
                  placeholder="Enter a strong passphrase..."
                  style={{
                    width: "100%",
                    padding: "8px",
                    marginBottom: "8px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "var(--input-bg-color)",
                    color: "var(--text-color)",
                  }}
                  autoComplete="current-password"
                />
                
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    color: "var(--text-color)",
                    textAlign: "left",
                  }}
                >
                  Confirm {userIdentifier} - NWC Passphrase
                </label>
                <input
                  type="password"
                  value={passphraseConfirm}
                  onChange={(e) => {
                    setPassphraseConfirm(e.target.value);
                    setPassphraseError("");
                  }}
                  placeholder="Confirm your passphrase..."
                  style={{
                    width: "100%",
                    padding: "8px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "var(--input-bg-color)",
                    color: "var(--text-color)",
                  }}
                  autoComplete="current-password"
                />
              </div>
            )}

            {passphraseError && (
              <div
                style={{
                  backgroundColor: "#ffebee",
                  color: "#c62828",
                  padding: "12px",
                  marginBottom: "16px",
                  borderRadius: "4px",
                }}
              >
                {passphraseError}
              </div>
            )}

            {error && (
              <div
                style={{
                  backgroundColor: "#ffebee",
                  color: "#c62828",
                  padding: "8px",
                  marginBottom: "16px",
                  fontSize: "0.9rem",
                }}
              >
                Error: {error}
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
                onClick={handleConnect}
                disabled={
                  !canConnectWallet || !connectionString.trim() || isLoading
                }
                style={{
                  padding: "8px 16px",
                  border: "none",
                  backgroundColor:
                    !canConnectWallet || !connectionString.trim() || isLoading
                      ? "#ccc"
                      : "#ff9900",
                  color: "white",
                  cursor:
                    !canConnectWallet || !connectionString.trim() || isLoading
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {isLoading ? "Connecting..." : "Connect Wallet"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Passphrase modal removed - signature-based authentication eliminates need for additional passwords */}
    </div>
  );
};

export default WalletConnectModal;

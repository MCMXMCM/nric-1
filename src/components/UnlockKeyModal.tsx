import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { nip19 } from "nostr-tools";
import type { Metadata } from "../types/nostr/types";
import { NostrContext } from "../contexts/NostrContext";
import LoadingSpinner from "./ui/LoadingSpinner";

interface UnlockKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  actionLabel: string; // e.g., 'Post', 'Reply', 'Add Contact'
  currentPubkeyHex?: string;
  onUnlocked: (selectedPubkeyHex: string) => Promise<void> | void;
  getDisplayNameForPubkey: (pubkey: string) => string;
  metadata: Record<string, Metadata>;
}

const UnlockKeyModal: React.FC<UnlockKeyModalProps> = ({
  isOpen,
  onClose,
  actionLabel,
  currentPubkeyHex,
  onUnlocked,
  getDisplayNameForPubkey,
  metadata,
}) => {
  // Detect mobile for better modal positioning
  const isMobile = window.innerWidth <= 768;
  const { listSavedAccounts, signInWithSavedAccount, setPubkey } =
    useContext(NostrContext);

  const [unlockPassphrase, setUnlockPassphrase] = useState<string>("");
  const [unlockError, setUnlockError] = useState<string>("");
  const [savedAccounts, setSavedAccounts] = useState<
    Array<{ pubkey: string; timestamp: number }>
  >([]);
  const [selectedSavedPubkey, setSelectedSavedPubkey] = useState<string>("");
  const [isUnlocking, setIsUnlocking] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const accounts = await listSavedAccounts();
        setSavedAccounts(accounts);
        const currentHex = (currentPubkeyHex || "").toLowerCase();
        const foundCurrent = accounts.find(
          (a) => a.pubkey.toLowerCase() === currentHex
        );
        setSelectedSavedPubkey(
          foundCurrent
            ? foundCurrent.pubkey
            : accounts[0]?.pubkey || currentPubkeyHex || ""
        );
      } catch {
        setSavedAccounts([]);
        setSelectedSavedPubkey(currentPubkeyHex || "");
      }
    })();
  }, [isOpen, listSavedAccounts, currentPubkeyHex]);

  const selectedNpub = useMemo(() => {
    const pk = selectedSavedPubkey || "";
    try {
      return nip19.npubEncode(pk);
    } catch {
      return pk;
    }
  }, [selectedSavedPubkey]);

  const handleUnlock = useCallback(async () => {
    const targetPubkey = selectedSavedPubkey || currentPubkeyHex || "";
    if (!targetPubkey) return;
    if (!unlockPassphrase || unlockPassphrase.length < 1) {
      setUnlockError("Enter your passphrase");
      return;
    }
    setUnlockError("");
    setIsUnlocking(true);
    try {
      await signInWithSavedAccount(targetPubkey, unlockPassphrase);
      onClose();
      await onUnlocked(targetPubkey);
    } catch (err: any) {
      let msg = err?.message || "Failed to unlock";

      // Provide more user-friendly error messages
      if (
        msg.includes("Invalid passphrase") ||
        msg.includes("Failed to decrypt")
      ) {
        msg =
          "Incorrect passphrase. Please check your passphrase and try again.";
      } else if (
        msg.includes("corrupted") ||
        msg.includes("not in the expected format")
      ) {
        msg =
          "Your saved key appears to be corrupted. Please log in with your NSEC directly to re-save your key.";
      } else if (msg.includes("WebCrypto") || msg.includes("iOS PWA")) {
        msg =
          "Key unlocking is not available in this environment. Please try a different browser or log in with your NSEC directly.";
      } else if (msg.includes("wallet connection")) {
        msg =
          "This saved account appears to be a wallet connection, not a private key. Please log in with your NSEC directly.";
      }

      setUnlockError(msg);
    } finally {
      setIsUnlocking(false);
    }
  }, [
    selectedSavedPubkey,
    currentPubkeyHex,
    unlockPassphrase,
    signInWithSavedAccount,
    onUnlocked,
    onClose,
  ]);

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
        alignItems: isMobile ? "flex-start" : "center",
        paddingTop: isMobile ? "20px" : 0,
        zIndex: 10000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "var(--app-bg-color)",
          padding: "1rem",
          width: "100%",
          maxWidth: "480px",
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
          Unlock saved key
        </h3>
        <p
          style={{
            marginTop: "0.5rem",
            color: "var(--text-color)",
            opacity: 0.8,

            fontSize: "0.875rem",
          }}
        >
          Enter your passphrase to decrypt your saved key so you can continue
          performing logged-in actions.
        </p>

        {/* Identity header for selected account (below instructions, above passphrase) */}
        {selectedSavedPubkey && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              marginTop: "0.75rem",
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                border: "1px dotted var(--border-color)",
                backgroundColor: "var(--app-bg-color )",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {metadata[selectedSavedPubkey]?.picture ? (
                <img
                  src={metadata[selectedSavedPubkey]!.picture as string}
                  alt="avatar"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />
              ) : (
                <span
                  style={{
                    color: "var(--text-color)",

                    fontSize: "0.75rem",
                  }}
                >
                  {getDisplayNameForPubkey(selectedSavedPubkey)?.slice(0, 1) ||
                    "👤"}
                </span>
              )}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  color: "var(--text-color)",

                  fontSize: "0.875rem",
                  textAlign: "start",
                }}
              >
                {getDisplayNameForPubkey(selectedSavedPubkey)}
              </span>
              <span
                style={{
                  color: "var(--text-color)",
                  opacity: 0.8,

                  fontSize: "0.75rem",
                  wordBreak: "break-all",
                  overflowWrap: "anywhere",
                  whiteSpace: "normal",
                  textAlign: "start",
                }}
              >
                {selectedNpub}
              </span>
              {/* Hidden username input for password managers */}
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={selectedNpub}
                readOnly
                style={{
                  position: "absolute",
                  opacity: 0,
                  pointerEvents: "none",
                  height: 0,
                  width: 0,
                  padding: 0,
                  margin: 0,
                  border: "none",
                }}
              />
            </div>
          </div>
        )}

        <input
          type="password"
          value={unlockPassphrase}
          onChange={(e) => setUnlockPassphrase(e.target.value)}
          placeholder="Enter passphrase"
          autoComplete="current-password"
          spellCheck={false}
          style={{
            backgroundColor: "transparent",
            color: "var(--text-color)",
            border: "1px dotted var(--border-color)",
            padding: "0.5rem",

            fontSize: "0.875rem",
            width: "100%",
            boxSizing: "border-box",
            marginTop: "0.5rem",
          }}
        />
        {unlockError && (
          <div
            style={{
              color: "#ef4444",

              fontSize: "0.75rem",
              marginTop: "0.5rem",
            }}
          >
            {unlockError}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.5rem",
            marginTop: "0.75rem",
          }}
        >
          <button
            onClick={onClose}
            style={{
              backgroundColor: "transparent",
              color: "var(--text-color)",
              border: "1px dotted var(--border-color)",

              fontSize: "0.75rem",
              textTransform: "uppercase",
              padding: "0 0.75rem",
              height: "2rem",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleUnlock}
            style={{
              backgroundColor: "transparent",
              color: "var(--text-color)",
              border: "1px dotted var(--border-color)",

              fontSize: "0.75rem",
              textTransform: "uppercase",
              padding: "0 0.75rem",
              height: "2rem",
            }}
            disabled={isUnlocking}
          >
            {isUnlocking ? <LoadingSpinner /> : `Unlock & ${actionLabel}`}
          </button>
        </div>

        {/* Saved accounts list below actions */}
        {savedAccounts.length > 1 && (
          <div style={{ marginTop: "0.75rem" }}>
            <div
              style={{
                color: "var(--text-color)",

                fontSize: "0.75rem",
                marginBottom: "0.25rem",
              }}
            >
              Other saved accounts
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
                maxHeight: "180px",
                overflowY: "auto",
              }}
            >
              {savedAccounts
                .filter(
                  (acc) =>
                    acc.pubkey.toLowerCase() !==
                    (
                      selectedSavedPubkey ||
                      currentPubkeyHex ||
                      ""
                    ).toLowerCase()
                )
                .map((acc) => {
                  const dn = getDisplayNameForPubkey(acc.pubkey);
                  const npub = (() => {
                    try {
                      return nip19.npubEncode(acc.pubkey);
                    } catch {
                      return acc.pubkey;
                    }
                  })();
                  const picture = metadata[acc.pubkey]?.picture || "";
                  return (
                    <button
                      key={acc.pubkey}
                      onClick={() => {
                        setSelectedSavedPubkey(acc.pubkey);
                        try {
                          setPubkey(acc.pubkey);
                        } catch {}
                        setUnlockPassphrase("");
                        setUnlockError("");
                      }}
                      style={{
                        backgroundColor: "transparent",
                        color: "var(--text-color)",
                        border: "1px dotted var(--border-color)",

                        fontSize: "0.75rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "0.25rem",
                        textAlign: "left",
                      }}
                    >
                      <div
                        style={{
                          width: "24px",
                          height: "24px",
                          border: "1px dotted var(--border-color)",
                          backgroundColor: "var(--app-bg-color )",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                        }}
                      >
                        {picture ? (
                          <img
                            src={picture as string}
                            alt=""
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              display: "block",
                            }}
                            loading="lazy"
                            decoding="async"
                            fetchPriority="low"
                          />
                        ) : (
                          <span style={{ fontSize: "0.75rem" }}>👤</span>
                        )}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        <span style={{ fontSize: "0.75rem" }}>{dn}</span>
                        <span
                          style={{
                            fontSize: "0.7rem",
                            opacity: 0.8,
                            wordBreak: "break-all",
                            overflowWrap: "anywhere",
                            whiteSpace: "normal",
                          }}
                        >
                          {npub}
                        </span>
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UnlockKeyModal;

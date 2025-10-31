import React, { useState } from "react";
import { nip19 } from "nostr-tools";
import { tryLoadPersistedSecret } from "../../utils/nostr/nip07";

interface ViewNsecModalProps {
  isOpen: boolean;
  onClose: () => void;
  pubkeyHex: string;
}

export const ViewNsecModal: React.FC<ViewNsecModalProps> = ({
  isOpen,
  onClose,
  pubkeyHex,
}) => {
  // Detect mobile for better modal positioning
  const isMobile = window.innerWidth <= 768;
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [secretHex, setSecretHex] = useState<string>("");
  const [copiedHex, setCopiedHex] = useState(false);
  const [copiedNsec, setCopiedNsec] = useState(false);

  if (!isOpen) return null;

  const handleUnlock = async () => {
    try {
      setError("");
      if (!passphrase || passphrase.length < 8) {
        setError("Passphrase must be at least 8 characters");
        return;
      }
      const sk = await tryLoadPersistedSecret(pubkeyHex, passphrase, "nsec");
      if (!sk) {
        setError("Invalid passphrase or no saved secret for this account");
        return;
      }
      setSecretHex(sk);
    } catch (e: any) {
      setError(e?.message || "Failed to unlock secret");
    }
  };

  const handleCopy = async (
    text: string,
    setCopied: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const nsec = secretHex
    ? nip19.nsecEncode(
        Uint8Array.from(secretHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)))
      )
    : "";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: isMobile ? "flex-start" : "center",
        justifyContent: "center",
        paddingTop: isMobile ? "20px" : 0,
        zIndex: 9999,
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          backgroundColor: "var(--app-bg-color)",
          color: "var(--text-color)",
          width: "min(640px, 94vw)",
          border: "1px solid var(--border-color)",
          padding: "1rem",
          boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          textAlign: "left",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>
          View Secret Key
        </h3>
        {!secretHex ? (
          <>
            <p style={{ marginTop: 0 }}>
              Enter your passphrase to view the saved secret key (nsec and hex).
            </p>
            {/* Hidden username field for password manager association */}
            <input
              type="text"
              value={nip19.npubEncode(pubkeyHex)}
              autoComplete="username"
              style={{
                position: "absolute",
                left: "-9999px",
                width: "1px",
                height: "1px",
                opacity: 0,
              }}
              tabIndex={-1}
              aria-hidden="true"
            />
            <input
              type="password"
              placeholder="Enter passphrase"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoComplete="current-password"
              style={{ minHeight: "2rem", width: "100%" }}
            />
            {error && (
              <div
                style={{
                  color: "#ff0000",
                  fontSize: "0.875rem",
                  marginTop: "0.5rem",
                }}
              >
                {error}
              </div>
            )}
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                justifyContent: "flex-end",
                marginTop: "0.75rem",
              }}
            >
              <button
                onClick={onClose}
                style={{ minHeight: "2rem", padding: "0 1rem" }}
              >
                Cancel
              </button>
              <button
                onClick={handleUnlock}
                style={{ minHeight: "2rem", padding: "0 1rem" }}
              >
                Unlock
              </button>
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <div>
                <strong>Secret (hex)</strong>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <code style={{ wordBreak: "break-all" }}>{secretHex}</code>
                  <button
                    onClick={() => handleCopy(secretHex, setCopiedHex)}
                    aria-label="Copy secret hex"
                    title={copiedHex ? "Copied!" : "Copy hex"}
                    style={{
                      minHeight: "1rem",
                      backgroundColor: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      display: "flex",
                      minWidth: "16px",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {copiedHex ? (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--text-color)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--text-color)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect
                          x="9"
                          y="9"
                          width="13"
                          height="13"
                          rx="2"
                          ry="2"
                        />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div>
                <strong>Secret (nsec)</strong>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <code style={{ wordBreak: "break-all" }}>{nsec}</code>
                  <button
                    onClick={() => handleCopy(nsec, setCopiedNsec)}
                    aria-label="Copy nsec"
                    title={copiedNsec ? "Copied!" : "Copy nsec"}
                    style={{
                      minHeight: "1rem",
                      backgroundColor: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      display: "flex",
                      minWidth: "16px",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {copiedNsec ? (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--text-color)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--text-color)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect
                          x="9"
                          y="9"
                          width="13"
                          height="13"
                          rx="2"
                          ry="2"
                        />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1  2 2v1" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: "0.75rem",
              }}
            >
              <button
                onClick={onClose}
                style={{ minHeight: "2rem", padding: "0 1rem" }}
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

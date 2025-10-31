import React, { useContext, useState } from "react";
import { nip19, getPublicKey as nostrGetPublicKey } from "nostr-tools";
import { NostrContext } from "../../contexts/NostrContext";

interface GenerateKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (pubkeyHex: string) => void;
}

export const GenerateKeyModal: React.FC<GenerateKeyModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { signInWithNsec } = useContext(NostrContext);

  // Detect mobile for better modal positioning
  const isMobile = window.innerWidth <= 768;

  const [secretHex, setSecretHex] = useState<string>("");
  const [pubkeyHex, setPubkeyHex] = useState<string>("");
  const [nsec, setNsec] = useState<string>("");
  const [npub, setNpub] = useState<string>("");

  const [persist, setPersist] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [passphraseConfirm, setPassphraseConfirm] = useState("");
  const [error, setError] = useState<string>("");

  const [copiedPubHex, setCopiedPubHex] = useState(false);
  const [copiedNpub, setCopiedNpub] = useState(false);
  const [copiedSecHex, setCopiedSecHex] = useState(false);
  const [copiedNsec, setCopiedNsec] = useState(false);

  if (!isOpen) return null;

  const resetState = () => {
    setSecretHex("");
    setPubkeyHex("");
    setNsec("");
    setNpub("");
    setPersist(false);
    setPassphrase("");
    setPassphraseConfirm("");
    setError("");
    setCopiedPubHex(false);
    setCopiedNpub(false);
    setCopiedSecHex(false);
    setCopiedNsec(false);
  };

  const handleGenerate = () => {
    try {
      // Generate 32 random bytes using WebCrypto
      const cryptoObj: any =
        typeof window !== "undefined" ? window.crypto : null;
      if (!cryptoObj || typeof cryptoObj.getRandomValues !== "function") {
        throw new Error("Secure randomness not available");
      }
      const skBytes = new Uint8Array(32);
      cryptoObj.getRandomValues(skBytes);
      const skHex = Array.from(skBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const pkHex = nostrGetPublicKey(skBytes as any);
      const npubStr = nip19.npubEncode(pkHex);
      const nsecStr = nip19.nsecEncode(skBytes);

      setSecretHex(skHex);
      setPubkeyHex(pkHex);
      setNpub(npubStr);
      setNsec(nsecStr);
      setError("");
      setCopiedPubHex(false);
      setCopiedNpub(false);
      setCopiedSecHex(false);
      setCopiedNsec(false);
    } catch (e: any) {
      setError(e?.message || "Failed to generate key pair");
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

  const handleLogin = async () => {
    try {
      setError("");
      if (!secretHex) {
        setError("No key generated yet");
        return;
      }
      if (persist) {
        if (!passphrase || passphrase.length < 8) {
          setError("Passphrase must be at least 8 characters");
          return;
        }
        if (passphrase !== passphraseConfirm) {
          setError("Passphrases do not match");
          return;
        }
      }
      const pk = await signInWithNsec(secretHex, { persist, passphrase });
      onSuccess(pk);
      onClose();
      resetState();
    } catch (e: any) {
      setError(e?.message || "Failed to log in with new key");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100dvh", // Use dynamic viewport height for mobile
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: isMobile ? "flex-start" : "center",
        justifyContent: "center",
        paddingTop: isMobile ? "40px" : "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        boxSizing: "border-box",
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
          maxHeight:
            "calc(100dvh - 2rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))",
          overflowY: "auto",
          margin: "1rem",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: "0.5rem", textAlign: "left" }}>
          Generate a Nostr Key Pair
        </h3>
        <p style={{ marginTop: 0, textAlign: "left" }}>
          This will generate a new Schnorr secp256k1 private/public key pair.
          Your private key (nsec) controls your account. Keep it secret and
          stored safely. If you lose it, there is no recovery.
        </p>
        {!secretHex ? (
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              justifyContent: "flex-end",
              paddingTop: "1rem",
            }}
          >
            <button
              onClick={() => {
                onClose();
                resetState();
              }}
              style={{ minHeight: "2rem", padding: "0rem 1rem" }}
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              style={{ minHeight: "2rem", padding: "0rem 1rem" }}
            >
              Generate
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              textAlign: "left",
            }}
          >
            <div>
              <strong>Public Key</strong>
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <code
                  data-testid="hex-value"
                  style={{ wordBreak: "break-all" }}
                >
                  {pubkeyHex}
                </code>
                <button
                  onClick={() => handleCopy(pubkeyHex, setCopiedPubHex)}
                  title={copiedPubHex ? "Copied!" : "Copy hex"}
                  aria-label="Copy pubkey hex"
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
                  {copiedPubHex ? (
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
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <code style={{ wordBreak: "break-all" }}>{npub}</code>
                <button
                  onClick={() => handleCopy(npub, setCopiedNpub)}
                  title={copiedNpub ? "Copied!" : "Copy npub"}
                  aria-label="Copy npub"
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
                  {copiedNpub ? (
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
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div>
              <strong>Private Key</strong>
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <code
                  data-testid="secret-hex"
                  id="secret-hex"
                  style={{ wordBreak: "break-all" }}
                >
                  {secretHex}
                </code>
                <button
                  onClick={() => handleCopy(secretHex, setCopiedSecHex)}
                  title={copiedSecHex ? "Copied!" : "Copy hex"}
                  aria-label="Copy secret hex"
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
                  {copiedSecHex ? (
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
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <code style={{ wordBreak: "break-all" }}>{nsec}</code>
                <button
                  onClick={() => handleCopy(nsec, setCopiedNsec)}
                  title={copiedNsec ? "Copied!" : "Copy nsec"}
                  aria-label="Copy nsec"
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
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              </div>
              <p
                style={{
                  marginTop: "0.5rem",
                  fontSize: "0.875rem",
                  color: "var(--app-text-secondary)",
                }}
              >
                Store your private key securely (e.g., password manager). Do not
                share it with anyone.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: "0.5rem",
              }}
            >
              <label
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                <input
                  type="checkbox"
                  checked={persist}
                  onChange={(e) => setPersist(e.target.checked)}
                />
                Persist encrypted on this device
              </label>
              {persist && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    justifyContent: "center",
                    width: "100%",
                    textAlign: "center",
                  }}
                >
                  {/* Hidden username field for password manager association */}
                  <input
                    type="text"
                    value={npub}
                    autoComplete="username"
                    style={{
                      position: "absolute",
                      left: "-9999px",
                      width: "1px",
                      height: "1px",
                      opacity: 0,
                      pointerEvents: "none",
                    }}
                    aria-hidden="true"
                    tabIndex={-1}
                  />
                  <input
                    type="password"
                    placeholder="Enter passphrase"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    style={{ minHeight: "2rem" }}
                    autoComplete="new-password"
                  />
                  <input
                    type="password"
                    placeholder="Confirm passphrase"
                    value={passphraseConfirm}
                    onChange={(e) => setPassphraseConfirm(e.target.value)}
                    style={{ minHeight: "2rem" }}
                    autoComplete="new-password"
                  />
                </div>
              )}
            </div>

            {error && (
              <div style={{ color: "#ff0000", fontSize: "0.875rem" }}>
                {error}
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
                  onClose();
                  resetState();
                }}
                style={{ minHeight: "2rem", padding: "0rem 1rem" }}
              >
                Close
              </button>
              <button
                onClick={handleLogin}
                style={{
                  minHeight: "2rem",
                  padding: "0rem 1rem",
                }}
              >
                Login with New Key
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

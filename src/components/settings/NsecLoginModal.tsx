import React, { useState, useContext } from "react";
import { NostrContext } from "../../contexts/NostrContext";
// import { useDisplayNames } from "../../hooks/useDisplayNames"; // Removed - no longer needed
import UserInfoCard from "../UserInfoCard";
import LoadingSpinner from "../ui/LoadingSpinner";

interface NsecDerivedUserInfoProps {
  nsecOrHex: string;
  // getDisplayNameForPubkey: (pk: string) => string; // Removed - UserInfoCard now handles this internally
}

const NsecDerivedUserInfo: React.FC<NsecDerivedUserInfoProps> = ({
  nsecOrHex,
}) => {
  const [pubkeyHex, setPubkeyHex] = React.useState<string>("");

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const mod = await import("../../utils/nostr/nip07");
        const sk = mod.deriveSecretHexFromInput(nsecOrHex);
        const pk = mod.derivePubkeyHexFromSecretHex(sk);
        if (active) setPubkeyHex(pk);
      } catch {
        if (active) setPubkeyHex("");
      }
    })();
    return () => {
      active = false;
    };
  }, [nsecOrHex]);

  if (!pubkeyHex) {
    return (
      <div style={{ marginTop: "0.75rem" }}>
        <span
          style={{
            color: "var(--text-color)",

            fontSize: "0.75rem",
            opacity: 0.8,
          }}
        >
          Loading user info…
        </span>
      </div>
    );
  }

  return (
    <div style={{ marginTop: "0.75rem", overflowWrap: "anywhere" }}>
      <UserInfoCard pubkeyHex={pubkeyHex} size={36} />
    </div>
  );
};

interface NsecLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (pubkey: string) => void;
  // relayUrls: string[]; // Removed - no longer needed with unified metadata system
}

export const NsecLoginModal: React.FC<NsecLoginModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { signInWithNsec } = useContext(NostrContext);

  // Detect mobile for better modal positioning
  const isMobile = window.innerWidth <= 768;

  const [nsecInput, setNsecInput] = useState("");
  const [nsecError, setNsecError] = useState("");
  const [persistNsec, setPersistNsec] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [passphraseConfirm, setPassphraseConfirm] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const canPersistEncrypted = (() => {
    try {
      const c: any = typeof window !== "undefined" ? window.crypto : null;
      return !!(c && typeof c.getRandomValues === "function");
    } catch {
      return false;
    }
  })();

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setNsecInput(text.trim());

      // Clear clipboard for security after pasting nsec/private key
      try {
        await navigator.clipboard.writeText("");
      } catch (clearError) {
        // Clipboard clearing failed, but this is not critical
        console.warn(
          "Failed to clear clipboard after pasting nsec:",
          clearError
        );
      }
    } catch (err) {
      setNsecError("Failed to read clipboard");
    }
  };

  const handleSave = async () => {
    try {
      setNsecError("");
      if (persistNsec) {
        if (!passphrase || passphrase.length < 8) {
          setNsecError("Passphrase must be at least 8 characters");
          return;
        }
        if (passphrase !== passphraseConfirm) {
          setNsecError("Passphrases do not match");
          return;
        }
      }
      setIsSaving(true);
      const pk = await signInWithNsec(nsecInput, {
        persist: persistNsec,
        passphrase,
      });
      onSuccess(pk);
      // Close modal and reset form
      onClose();
      setNsecInput("");
      setNsecError("");
      setPersistNsec(false);
      setPassphrase("");
      setPassphraseConfirm("");
    } catch (e: any) {
      const msg = e?.message || "Invalid nsec or secret key";
      setNsecError(msg);
    } finally {
      setIsSaving(false);
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
          Login with Nsec
        </h3>
        <p
          style={{
            marginTop: "0.5rem",
            color: "var(--text-color)",
            opacity: 0.8,

            fontSize: "0.875rem",
          }}
        >
          Enter your Nostr secret key (nsec or 64-hex). By default it stays in
          memory for this session.
        </p>

        <input
          type="password"
          value={nsecInput}
          onChange={(e) => setNsecInput(e.target.value)}
          placeholder="nsec1... or 64-hex secret"
          autoComplete="off"
          spellCheck={false}
          style={{
            backgroundColor: "transparent",
            color: "var(--text-color)",
            border: "1px dotted var(--border-color)",
            padding: "0.5rem",

            fontSize: "0.875rem",
            width: "100%",
            boxSizing: "border-box",
            flexWrap: "wrap",
          }}
        />

        {/* Show user info if nsec is entered and persist is enabled */}
        {persistNsec && nsecInput.trim().length > 0 && (
          <NsecDerivedUserInfo nsecOrHex={nsecInput} />
        )}

        <div
          style={{
            marginTop: "0.75rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <input
            id="persistNsec"
            type="checkbox"
            checked={persistNsec}
            onChange={(e) => {
              setNsecError("");
              setPersistNsec(e.target.checked);
            }}
            disabled={!canPersistEncrypted}
          />
          <label
            htmlFor="persistNsec"
            style={{
              color: "var(--text-color)",
              textAlign: "start",

              fontSize: "0.875rem",
            }}
          >
            Persist encrypted on this device
          </label>
        </div>

        {!canPersistEncrypted && (
          <div
            style={{
              marginTop: "0.25rem",
              color: "var(--text-color)",
              opacity: 0.7,

              fontSize: "0.75rem",
            }}
          >
            Not available on this device/browser. Your key will stay in memory
            only.
          </div>
        )}

        {persistNsec && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              marginTop: "0.5rem",
            }}
          >
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter passphrase (min 8 chars)"
              autoComplete="new-password"
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
            <input
              type="password"
              value={passphraseConfirm}
              onChange={(e) => setPassphraseConfirm(e.target.value)}
              placeholder="Confirm passphrase"
              autoComplete="new-password"
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
          </div>
        )}

        {nsecError && (
          <div
            style={{
              color: "#ff0000",
              marginTop: "0.5rem",

              fontSize: "0.75rem",
            }}
          >
            {nsecError}
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            marginTop: "0.75rem",
            justifyContent: "space-between",
          }}
        >
          <button
            onClick={handlePasteClipboard}
            style={{
              backgroundColor: "transparent",
              color: "var(--text-color)",
              border: "1px dotted var(--border-color)",
              padding: "0.5rem 0.75rem",

              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Paste from Clipboard
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleSave}
            style={{
              backgroundColor: "transparent",
              color: "var(--text-color)",
              border: "1px dotted var(--border-color)",
              padding: "0.5rem 0.75rem",

              fontSize: "0.875rem",
              cursor: "pointer",
            }}
            disabled={isSaving}
          >
            {isSaving ? <LoadingSpinner /> : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
};

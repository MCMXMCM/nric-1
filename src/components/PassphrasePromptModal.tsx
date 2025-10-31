import React, { useState } from "react";

interface PassphrasePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (passphrase: string) => Promise<void>;
  title?: string;
  description?: string;
  isLoading?: boolean;
}

const PassphrasePromptModal: React.FC<PassphrasePromptModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  title = "Enter Passphrase",
  description = "Enter a secure passphrase to encrypt your wallet connection string:",
  isLoading = false,
}) => {
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!passphrase.trim()) {
      setError("Passphrase is required");
      return;
    }

    if (passphrase.length < 8) {
      setError("Passphrase must be at least 8 characters long");
      return;
    }

    if (passphrase !== confirmPassphrase) {
      setError("Passphrases do not match");
      return;
    }

    try {
      await onSubmit(passphrase.trim());
      setPassphrase("");
      setConfirmPassphrase("");
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to process passphrase"
      );
    }
  };

  const handleClose = () => {
    setPassphrase("");
    setConfirmPassphrase("");
    setError("");
    onClose();
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
      onClick={handleClose}
    >
      <div
        style={{
          backgroundColor: "var(--card-bg-color)",
          padding: "24px",
          borderRadius: "8px",
          maxWidth: "400px",
          width: "100%",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            marginTop: 0,
            marginBottom: "16px",
            color: "var(--text-color)",
            textAlign: "center",
          }}
        >
          {title}
        </h3>

        <p
          style={{
            color: "var(--text-color)",
            marginBottom: "20px",
            fontSize: "0.9rem",
            textAlign: "center",
            opacity: 0.8,
          }}
        >
          {description}
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                color: "var(--text-color)",
                fontSize: "0.9rem",
              }}
            >
              Passphrase:
            </label>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter a secure passphrase"
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid var(--border-color)",
                backgroundColor: "var(--input-bg-color)",
                color: "var(--text-color)",
                borderRadius: "4px",
                fontSize: "1rem",
              }}
              disabled={isLoading}
              autoFocus
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                color: "var(--text-color)",
                fontSize: "0.9rem",
              }}
            >
              Confirm Passphrase:
            </label>
            <input
              type="password"
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              placeholder="Confirm your passphrase"
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid var(--border-color)",
                backgroundColor: "var(--input-bg-color)",
                color: "var(--text-color)",
                borderRadius: "4px",
                fontSize: "1rem",
              }}
              disabled={isLoading}
            />
          </div>

          {error && (
            <div
              style={{
                backgroundColor: "#ffebee",
                color: "#c62828",
                padding: "8px",
                borderRadius: "4px",
                marginBottom: "16px",
                fontSize: "0.9rem",
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              style={{
                padding: "10px 20px",
                border: "1px solid var(--border-color)",
                backgroundColor: "transparent",
                color: "var(--text-color)",
                borderRadius: "4px",
                cursor: isLoading ? "not-allowed" : "pointer",
                opacity: isLoading ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isLoading || !passphrase.trim() || !confirmPassphrase.trim()
              }
              style={{
                padding: "10px 20px",
                border: "none",
                backgroundColor:
                  isLoading || !passphrase.trim() || !confirmPassphrase.trim()
                    ? "#ccc"
                    : "var(--accent-color)",
                color: "white",
                borderRadius: "4px",
                cursor:
                  isLoading || !passphrase.trim() || !confirmPassphrase.trim()
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  isLoading || !passphrase.trim() || !confirmPassphrase.trim()
                    ? 0.6
                    : 1,
              }}
            >
              {isLoading ? "Processing..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PassphrasePromptModal;

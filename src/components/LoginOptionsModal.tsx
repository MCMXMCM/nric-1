import React, { useContext } from "react";
import { NostrContext } from "../contexts/NostrContext";
import { useUserContactsContext } from "../contexts/UserContactsContext";
import { hasNip07 } from "../utils/nostr/nip07";
import LoadingSpinner from "./ui/LoadingSpinner";

interface LoginOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onShowSavedAccounts: () => void;
  onShowNsecLogin: () => void;
  actionName?: string; // The action that requires login (e.g., "like", "follow", "reply")
}

const LoginOptionsModal: React.FC<LoginOptionsModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onShowSavedAccounts,
  onShowNsecLogin,
}) => {
  const { signInWithNip07, listSavedAccounts } = useContext(NostrContext);
  const contactsCtx = useUserContactsContext();
  const [hasSavedAccounts, setHasSavedAccounts] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [loadingStep, setLoadingStep] = React.useState<string>("");

  // Check for saved accounts on mount
  React.useEffect(() => {
    if (isOpen) {
      listSavedAccounts()
        .then((accounts) => setHasSavedAccounts(accounts.length > 0))
        .catch(() => setHasSavedAccounts(false));
    }
  }, [isOpen, listSavedAccounts]);

  const handleNip07SignIn = async () => {
    if (!hasNip07()) return;

    console.log("🔄 LoginOptionsModal: Starting NIP-07 sign in...");
    setIsLoading(true);
    setLoadingStep("Connecting to extension...");

    try {
      console.log("🔄 LoginOptionsModal: Calling signInWithNip07...");
      setLoadingStep("Fetching metadata...");
      await signInWithNip07();
      console.log(
        "🔄 LoginOptionsModal: signInWithNip07 completed successfully"
      );

      // After login, wait for contacts to load so Following is ready
      setLoadingStep("Fetching contacts...");
      try {
        const start = Date.now();
        const timeoutMs = 12000; // 12s max wait
        // Repeatedly prompt refetch while waiting
        try {
          contactsCtx.refetch();
        } catch {}
        while (Date.now() - start < timeoutMs) {
          const hasContacts =
            Array.isArray(contactsCtx.contacts) &&
            contactsCtx.contacts.length > 0;
          if (hasContacts) break;
          setLoadingStep("Fetching contacts...");
          await new Promise((r) => setTimeout(r, 300));
          try {
            contactsCtx.refetch();
          } catch {}
        }
      } catch {}

      console.log("🔄 LoginOptionsModal: Calling onSuccess...");
      setLoadingStep("Finalizing login...");
      // Only call onSuccess - it will handle closing the modal
      onSuccess();
      console.log("🔄 LoginOptionsModal: onSuccess called");
    } catch (error) {
      console.error("NIP-07 sign in failed:", error);
    } finally {
      setIsLoading(false);
      setLoadingStep("");
    }
  };

  const handleShowSavedAccounts = () => {
    onShowSavedAccounts();
  };

  const handleShowNsecLogin = () => {
    onShowNsecLogin();
  };

  // Debug logging for modal state changes
  React.useEffect(() => {
    console.log("🔄 LoginOptionsModal isOpen changed:", isOpen);
  }, [isOpen]);

  if (!isOpen) {
    console.log("🔄 LoginOptionsModal: isOpen is false, returning null");
    return null;
  }

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
          padding: "1.5rem",
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
            fontSize: "var(--font-size-lg)",
            fontWeight: "600",
          }}
        >
          Sign in
        </h3>
        <p
          style={{
            marginTop: "0.5rem",
            marginBottom: "1.5rem",
            color: "var(--text-color)",
            opacity: 0.8,
            fontSize: "var(--font-size-sm)",
            lineHeight: "1.4",
            textAlign: "left",
          }}
        >
          <strong>NIP-07 Extension:</strong> Browser extension that securely
          manages your keys without exposing them to websites.{" "}
          <a
            href="https://chromewebstore.google.com/detail/kpgefcfmnafjgpblomihpgmejjdanjjp?utm_source=item-share-cb"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--link-color)" }}
          >
            nos2x for Chrome
          </a>{" "}
          and{" "}
          <a
            href="https://apps.apple.com/us/app/nostash/id6744309333"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--link-color)" }}
          >
            Nostash for Safari
          </a>{" "}
          are popular options.
          <br />
          <br />
          <strong>Nsec Secret Key:</strong> Enter your private key directly
          (stored locally in your browser).
        </p>

        {isLoading && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "1.5rem",
              padding: "1rem",
              backgroundColor: "var(--hover-bg)",
              border: "1px dotted var(--border-color)",
              borderRadius: "4px",
            }}
          >
            <LoadingSpinner size="small" />
            <div
              style={{
                fontSize: "var(--font-size-sm)",
                color: "var(--text-color)",
                opacity: 0.8,
              }}
            >
              {loadingStep || "Logging in..."}
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          {hasSavedAccounts && (
            <button
              onClick={handleShowSavedAccounts}
              disabled={isLoading}
              style={{
                backgroundColor: "transparent",
                border: "1px dotted var(--border-color)",
                color: "var(--text-color)",
                padding: "0.75rem",
                cursor: "pointer",
                fontSize: "var(--font-size-sm)",
                textAlign: "left",
                opacity: isLoading ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              Login with Saved Account
            </button>
          )}

          <button
            onClick={handleNip07SignIn}
            disabled={!hasNip07() || isLoading}
            style={{
              backgroundColor: "transparent",
              border: "1px dotted var(--border-color)",
              color: "var(--text-color)",
              padding: "0.75rem",
              cursor: hasNip07() && !isLoading ? "pointer" : "not-allowed",
              fontSize: "var(--font-size-sm)",
              textAlign: "left",
              opacity: hasNip07() && !isLoading ? 1 : 0.5,
            }}
            onMouseEnter={(e) => {
              if (hasNip07() && !isLoading) {
                e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            NIP-07 Extension
            {!hasNip07() && (
              <span style={{ fontSize: "var(--font-size-base)", opacity: 0.7 }}>
                {" "}
                (Not available)
              </span>
            )}
          </button>

          <button
            onClick={handleShowNsecLogin}
            disabled={isLoading}
            style={{
              backgroundColor: "transparent",
              border: "1px dotted var(--border-color)",
              color: "var(--text-color)",
              padding: "0.75rem",
              cursor: "pointer",
              fontSize: "var(--font-size-sm)",
              textAlign: "left",
              opacity: isLoading ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            Nsec Secret Key
          </button>
        </div>

        <div
          style={{
            marginTop: "1.5rem",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              backgroundColor: "transparent",
              border: "1px dotted var(--border-color)",
              color: "var(--text-color)",
              padding: "0.5rem 1rem",
              cursor: "pointer",
              fontSize: "var(--font-size-sm)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--hover-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginOptionsModal;

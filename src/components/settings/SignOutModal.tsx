import React, { useContext } from "react";
import { NostrContext } from "../../contexts/NostrContext";

interface SignOutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignOut: () => void;
}

export const SignOutModal: React.FC<SignOutModalProps> = ({
  isOpen,
  onClose,
  onSignOut,
}) => {
  const { signOut, loginMethod, nsecPersistedThisSession } =
    useContext(NostrContext);

  if (!isOpen) return null;

  const handleSignOut = async (
    destroyInMemory: boolean = true,
    removePersisted: boolean = false
  ) => {
    try {
      await signOut({ destroyInMemory, removePersisted });
    } catch {}
    onSignOut();
    onClose();
  };

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
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            margin: 0,
            color: "var(--text-color)",
            textAlign: "left",
            fontSize: "1rem",
          }}
        >
          Sign out?
        </h3>

        {/* Conditional sign-out flows by login method */}
        {loginMethod === "nsec" && nsecPersistedThisSession ? (
          <>
            <p
              style={{
                marginTop: "0.5rem",
                color: "var(--text-color)",
                opacity: 0.85,
                textAlign: "left",
                fontSize: "0.875rem",
              }}
            >
              Choose how to sign out. Your encrypted key is saved on this
              device.
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                marginTop: "0.75rem",
              }}
            >
              <button
                onClick={() => handleSignOut(true, false)}
                style={{
                  backgroundColor: "transparent",
                  color: "var(--text-color)",
                  border: "1px dotted var(--border-color)",
                  padding: "0.5rem 0.75rem",

                  fontSize: "0.875rem",
                  cursor: "pointer",
                  textAlign: "center",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                Sign out
              </button>
              <button
                onClick={() => handleSignOut(true, true)}
                style={{
                  backgroundColor: "transparent",
                  color: "var(--btn-accent)",
                  border: "1px dotted var(--btn-accent)",
                  padding: "0.5rem 0.75rem",

                  fontSize: "0.875rem",
                  cursor: "pointer",
                  textAlign: "center",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "rgba(239, 68, 68, 0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                Sign out (Delete Saved Account/Key)
              </button>
              <div
                style={{
                  marginTop: "0.5rem",
                  color: "var(--text-color)",
                  opacity: 0.75,
                  textAlign: "left",
                  fontSize: "0.75rem",
                }}
              >
                <strong>Sign out:</strong> Need passphrase to sign back in.
                <br />
                <strong>Delete Saved:</strong> Need full nsec to sign back in.
              </div>
            </div>
          </>
        ) : (
          // Simple sign out for nip07 or non-persisted nsec
          <>
            <p
              style={{
                marginTop: "0.5rem",
                color: "var(--text-color)",
                opacity: 0.85,

                fontSize: "0.875rem",
              }}
            >
              Are you sure you want to sign out?
            </p>
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                marginTop: "0.75rem",
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
                Cancel
              </button>
              <button
                onClick={() => handleSignOut(true, false)}
                style={{
                  backgroundColor: "transparent",
                  color: "var(--btn-accent)",
                  border: "1px dotted var(--btn-accent)",
                  padding: "0.5rem 0.75rem",

                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

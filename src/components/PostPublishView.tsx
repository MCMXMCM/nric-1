import React, { useMemo, useState, useContext } from "react";
import { TreeList, TreeListItem } from "./settings/TreeListItem";
import LoadingTextPlaceholder from "./ui/LoadingTextPlaceholder";
import { usePowState } from "../stores/powStore";

import { NostrContext } from "../contexts/NostrContext";
import { useLoginState } from "../hooks/useLoginState";
import { useAuthenticationCheck } from "../utils/authenticationUtils";
import { hasNip07 } from "../utils/nostr/nip07";
import { nip19 } from "nostr-tools";
import UserInfoCard from "./UserInfoCard";
import { relayFailureLearning } from "../utils/nostr/relayFailureLearning";

export type PublishState = "idle" | "publishing" | "success" | "error";

export interface RelayPublishStatus {
  url: string;
  status: "pending" | "success" | "failed";
  error?: string;
}

export interface PostPublishViewProps {
  publishState: PublishState;
  publishMessage: string;
  isSigning: boolean;
  relayStatuses: RelayPublishStatus[];
  broadcastingComplete: boolean;
  isMobile: boolean;
  onViewNote: () => void;
  onViewThread?: () => void; // Optional for reply flow
  onTryAgain?: () => void; // Try again with learned requirements
  error?: string;
  powUpdateKey?: number; // Force re-render key for mining updates
  // Authentication error handling
  onRetryWithAuth?: () => void; // Retry the action after authentication
  showAuthOptions?: boolean; // Whether to show auth options in error state
  currentPubkeyHex?: string; // Current user's pubkey for unlock modal
  getDisplayNameForPubkey?: (pubkey: string) => string; // Display name function
}

const PostPublishView: React.FC<PostPublishViewProps> = ({
  publishState,
  publishMessage,
  isSigning,
  relayStatuses,
  broadcastingComplete,
  isMobile,
  onViewNote,
  onViewThread,
  onTryAgain,
  error,
  powUpdateKey: _powUpdateKey,
  onRetryWithAuth,
  showAuthOptions = false,
  currentPubkeyHex,
  getDisplayNameForPubkey = () => "Unknown",
}) => {
  // Get POW state from store
  const { activeSession } = usePowState();

  // Authentication state for error handling
  const {
    listSavedAccounts,
    signInWithNip07,
    signInWithSavedAccount,
    signInWithNsec,
    // getCachedMetadataForPubkey, // Removed - no longer needed with unified metadata system
  } = useContext(NostrContext);
  const { isAuthenticatedForSigning, needsUnlock } = useAuthenticationCheck();
  const loginState = useLoginState();
  const [showAuthUI, setShowAuthUI] = useState<
    "none" | "login" | "unlock" | "saved_accounts" | "nsec_login"
  >("none");

  const [authError, setAuthError] = useState<string>("");
  const [authLoading, setAuthLoading] = useState(false);
  const [hasSavedAccounts, setHasSavedAccounts] = useState(false);

  // Saved accounts inline UI state
  const [savedAccountsList, setSavedAccountsList] = useState<
    Array<{ pubkey: string; timestamp: number }>
  >([]);
  const [selectedSavedAccount, setSelectedSavedAccount] = useState<string>("");
  const [savedPassphrase, setSavedPassphrase] = useState("");
  const [savedPassphraseError, setSavedPassphraseError] = useState("");

  // Nsec inline UI state
  const [nsecInput, setNsecInput] = useState("");
  const [nsecError, setNsecError] = useState("");
  const [persistNsec, setPersistNsec] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [passphraseConfirm, setPassphraseConfirm] = useState("");

  // Unlock key state
  const [unlockPassphrase, setUnlockPassphrase] = useState<string>("");
  const [unlockError, setUnlockError] = useState<string>("");
  const [selectedSavedPubkey, setSelectedSavedPubkey] = useState<string>("");

  // Memoize mining state to ensure proper reactivity
  const miningState = useMemo(() => {
    const isMining = activeSession?.isMining || false;
    const wasMining = activeSession?.isComplete || false;
    const progress = activeSession?.progress || 0;
    const nonce = activeSession?.nonce || 0;
    const currentBits = activeSession?.currentBits || 0;
    const targetBits = activeSession?.targetBits || 0;
    const hashesPerSecond = activeSession?.hashesPerSecond || 0;
    const estimatedTimeRemaining = activeSession?.estimatedTimeRemaining || 0;

    return {
      isMining,
      wasMining,
      progress,
      nonce,
      currentBits,
      targetBits,
      hashesPerSecond,
      estimatedTimeRemaining,
    };
  }, [
    activeSession?.isMining,
    activeSession?.isComplete,
    activeSession?.progress,
    activeSession?.nonce,
    activeSession?.currentBits,
    activeSession?.targetBits,
    activeSession?.hashesPerSecond,
    activeSession?.estimatedTimeRemaining,
    activeSession?.sessionId,
    // Add direct activeSession reference to catch any other changes
    activeSession,
  ]);

  // Authentication handlers
  const handleAuthAction = async () => {
    try {
      // Load saved accounts for unlock UI and login options
      const accounts = await listSavedAccounts();
      setHasSavedAccounts(accounts.length > 0);

      // Check if user is authenticated
      if (!isAuthenticatedForSigning()) {
        setShowAuthUI("login");
        return;
      }

      // Check if user needs to unlock their key
      if (await needsUnlock()) {
        // Set up unlock UI
        const currentHex = (currentPubkeyHex || "").toLowerCase();
        const foundCurrent = accounts.find(
          (a) => a.pubkey.toLowerCase() === currentHex
        );
        setSelectedSavedPubkey(
          foundCurrent
            ? foundCurrent.pubkey
            : accounts[0]?.pubkey || currentPubkeyHex || ""
        );
        setShowAuthUI("unlock");
        return;
      }

      // User is authenticated, retry the action
      if (onRetryWithAuth) await onRetryWithAuth();
    } catch (error) {
      console.error("Authentication check failed:", error);
      setShowAuthUI("login");
    }
  };

  // Authentication action handlers
  const handleNip07SignIn = async () => {
    if (!hasNip07()) return;

    setAuthLoading(true);
    setAuthError("");
    try {
      // This properly handles: read public key, save metadata and login status
      await signInWithNip07();
      setShowAuthUI("none");
      // Then retry the action (which will prompt to sign the note)
      if (onRetryWithAuth) await onRetryWithAuth();
    } catch (error) {
      console.error("NIP-07 sign in failed:", error);
      setAuthError("Failed to sign in with extension");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleUnlockKey = async () => {
    setAuthLoading(true);
    setUnlockError("");
    try {
      await signInWithSavedAccount(selectedSavedPubkey, unlockPassphrase);
      setShowAuthUI("none");
      setUnlockPassphrase("");
      if (onRetryWithAuth) await onRetryWithAuth();
    } catch (error) {
      console.error("Unlock failed:", error);
      setUnlockError("Invalid passphrase or failed to unlock");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleShowSavedAccounts = async () => {
    try {
      const accounts = await listSavedAccounts();
      setSavedAccountsList(accounts);
      setShowAuthUI("saved_accounts");
      setAuthError("");
    } catch (error) {
      console.error("Failed to load saved accounts:", error);
      setAuthError("Failed to load saved accounts");
    }
  };

  const handleShowNsecLogin = () => {
    setShowAuthUI("nsec_login");
    setAuthError("");
    setNsecError("");
  };

  // Load saved accounts when needed
  React.useEffect(() => {
    if (loginState.showSavedAccountsModal) {
      handleLoadSavedAccounts();
    }
  }, [loginState.showSavedAccountsModal]);

  const handleLoadSavedAccounts = async () => {
    try {
      const accounts = await listSavedAccounts();
      setHasSavedAccounts(accounts.length > 0);
    } catch (error) {
      console.error("Failed to load saved accounts:", error);
      setHasSavedAccounts(false);
    }
  };

  // Saved account login handler
  const handleSavedAccountLogin = async () => {
    try {
      setSavedPassphraseError("");
      setAuthLoading(true);

      if (!savedPassphrase || savedPassphrase.length < 1) {
        setSavedPassphraseError("Enter your passphrase");
        return;
      }

      await signInWithSavedAccount(selectedSavedAccount, savedPassphrase);
      setShowAuthUI("none");
      setSavedPassphrase("");
      setSelectedSavedAccount("");

      if (onRetryWithAuth) await onRetryWithAuth();
    } catch (error: any) {
      console.error("Saved account login failed:", error);
      setSavedPassphraseError(
        error?.message || "Failed to unlock saved account"
      );
    } finally {
      setAuthLoading(false);
    }
  };

  // Nsec login handler
  const handleNsecLogin = async () => {
    try {
      setNsecError("");
      setAuthLoading(true);

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

      await signInWithNsec(nsecInput, {
        persist: persistNsec,
        passphrase,
      });

      setShowAuthUI("none");
      setNsecInput("");
      setNsecError("");
      setPersistNsec(false);
      setPassphrase("");
      setPassphraseConfirm("");

      if (onRetryWithAuth) await onRetryWithAuth();
    } catch (error: any) {
      console.error("Nsec login failed:", error);
      const msg = error?.message || "Invalid nsec or secret key";
      setNsecError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  // Create display name function for saved accounts - currently unused but kept for future use
  // const getDisplayNameForSavedAccount = (pubkey: string): string => {
  //   const cached = getCachedMetadataForPubkey(pubkey);
  //   if (cached) {
  //     const displayName = cached.display_name || cached.name;
  //     if (displayName && displayName.trim()) {
  //       return displayName.trim();
  //     }
  //   }
  //   return getDisplayNameForPubkey
  //     ? getDisplayNameForPubkey(pubkey)
  //     : "Unknown";
  // };

  if (publishState === "idle") {
    return null;
  }

  return (
    <div
      style={{
        width: "100%",
        minHeight: isMobile ? "50dvh" : "70dvh",
        marginTop: isMobile ? "1rem" : "6rem",
        border: "1px dotted var(--border-color)",
        padding: "0.75rem",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          color: publishState === "error" ? "#ef4444" : "var(--text-color)",
          fontSize: "0.875rem",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: "0.5rem",
          textAlign: "start",
        }}
      >
        {miningState.isMining || miningState.wasMining ? (
          <div>
            {miningState.isMining
              ? `Mining PoW (${miningState.targetBits} bits)`
              : `PoW Mining Complete: ${miningState.targetBits} bits`}
            <br />
            <span style={{ fontSize: "0.8em", opacity: 0.7 }}>
              {miningState.isMining
                ? `Attempts: ${miningState.nonce.toLocaleString()} (~${miningState.hashesPerSecond.toFixed(
                    0
                  )} H/s)`
                : `Found at nonce ${miningState.nonce.toLocaleString()}`}
            </span>
          </div>
        ) : isSigning ? (
          <>Signing with extension...</>
        ) : (
          publishMessage
        )}
      </div>

      {/* Broadcasting status list */}
      <TreeList>
        <div
          style={{
            color: "var(--text-color)",
            fontSize: "0.75rem",
            marginBottom: "0.5rem",
            textAlign: "start",
          }}
        >
          To Relays:
        </div>
        {relayStatuses.map((relayStatus, index) => (
          <TreeListItem
            style={{
              marginLeft: "2rem",
              paddingLeft: "1.5rem",
            }}
            key={relayStatus.url}
            isLast={index === relayStatuses.length - 1}
            hasSubItems={false}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.25rem 0",
                fontSize: "0.75rem",
                color: "var(--text-color)",
              }}
            >
              <span style={{ color: "var(--text-color)" }}>
                {relayStatus.url}
              </span>
              <span
                style={{
                  color: "var(--text-color)",
                  marginLeft: "0.5rem",
                }}
              >
                {relayStatus.status === "pending" && (
                  <LoadingTextPlaceholder
                    speed="normal"
                    type="custom"
                    customLength={2}
                  />
                )}
                {relayStatus.status === "success" && (
                  <span style={{ color: "var(--text-success)" }}>[ OK ]</span>
                )}
                {relayStatus.status === "failed" && (
                  <span
                    style={{
                      color: "var(--text-failure)",
                      letterSpacing: "0.12em",
                    }}
                  >
                    [ X ]
                  </span>
                )}
              </span>
            </div>
            {relayStatus.status === "failed" && relayStatus.error && (
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "#ef4444",
                  fontStyle: "italic",
                  textAlign: "start",
                }}
              >
                {relayStatus.error}
                {/* Record the failure for learning */}
                {(() => {
                  // Record failure for learning (this will be called on render)
                  relayFailureLearning.recordFailure(
                    relayStatus.url,
                    relayStatus.error || "Unknown error",
                    1 // Assuming kind 1 for now, could be passed as prop
                  );
                  return null;
                })()}
              </div>
            )}
          </TreeListItem>
        ))}
      </TreeList>

      {relayStatuses.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "end",
            alignItems: "center",
            width: "100%",
            gap: "0.5rem",
          }}
        >
          {relayStatuses.filter((r) => r.status === "success").length > 0 && (
            <div
              style={{
                color: "var(--text-color)",
                marginBottom: "0.25rem",
                marginTop: "0.5rem",
                padding: "0.5rem",
                width: "100%",
                backgroundColor: "var(--app-bg-color)",
                border: "2px dotted var(--border-color)",
                fontSize: "0.75rem",
                textAlign: "center",
              }}
            >
              ✓ published to{" "}
              {relayStatuses.filter((r) => r.status === "success").length}{" "}
              relay(s)
              {(() => {
                // Persist successes to improve future decisions
                try {
                  relayStatuses
                    .filter((r) => r.status === "success")
                    .forEach((r) => relayFailureLearning.recordSuccess(r.url));
                } catch {}
                return null;
              })()}
            </div>
          )}
          {relayStatuses.filter((r) => r.status === "failed").length > 0 && (
            <div
              style={{
                color: "var(--text-color)",
                marginBottom: "0.25rem",
                marginTop: "0.5rem",
                padding: "0.5rem",
                width: "100%",
                backgroundColor: "var(--app-bg-color)",
                border: "2px dotted var(--border-color)",
                fontSize: "0.75rem",
                textAlign: "center",
              }}
            >
              ✗ Failed with{" "}
              {relayStatuses.filter((r) => r.status === "failed").length}{" "}
              relay(s)
            </div>
          )}
        </div>
      )}

      {broadcastingComplete && (
        <div style={{ marginTop: "1rem", textAlign: "center" }}>
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={onViewNote}
              style={{
                color: "var(--text-color)",
                padding: "0.5rem 1rem",
                border: "1px solid var(--border-color)",
                fontSize: "0.875rem",
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              View Note
            </button>
            {onViewThread && (
              <button
                onClick={onViewThread}
                style={{
                  color: "var(--text-color)",
                  padding: "0.5rem 1rem",
                  border: "1px solid var(--border-color)",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                View Thread
              </button>
            )}
            {onTryAgain && relayStatuses.some((r) => r.status === "failed") && (
              <button
                onClick={onTryAgain}
                style={{
                  color: "var(--text-color)",
                  padding: "0.5rem 1rem",
                  border: "1px solid var(--border-color)",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  backgroundColor: "var(--accent-color)",
                }}
              >
                Try Again
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: "0.5rem" }}>
          <div
            style={{
              color: "#ef4444",
              fontSize: "0.75rem",
              marginBottom:
                showAuthOptions && error.includes("No signing method available")
                  ? "0.75rem"
                  : "0",
            }}
          >
            {error}
          </div>

          {/* Show authentication options for signing errors */}
          {showAuthOptions &&
            error.includes("No signing method available") &&
            showAuthUI === "none" && (
              <div style={{ marginTop: "0.75rem" }}>
                <div
                  style={{
                    color: "var(--text-color)",
                    fontSize: "0.75rem",
                    marginBottom: "0.5rem",
                    textAlign: "start",
                  }}
                >
                  Choose an authentication method to continue:
                </div>

                <button
                  onClick={handleAuthAction}
                  style={{
                    backgroundColor: "transparent",
                    color: "var(--text-color)",
                    border: "1px dotted var(--border-color)",
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    padding: "0.5rem 0.75rem",
                    cursor: "pointer",
                    width: "100%",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "var(--hover-bg, rgba(255,255,255,0.1))";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  Sign In & Retry
                </button>
              </div>
            )}

          {/* Inline Login Options UI */}
          {showAuthUI === "login" && (
            <div
              style={{
                marginTop: "0.75rem",
                border: "1px dotted var(--border-color)",
                padding: "1rem",
              }}
            >
              <h4
                style={{
                  margin: "0 0 0.5rem 0",
                  color: "var(--text-color)",
                  fontSize: "0.875rem",
                }}
              >
                Sign in to Continue
              </h4>
              <p
                style={{
                  margin: "0 0 1rem 0",
                  color: "var(--text-color)",
                  opacity: 0.8,
                  fontSize: "0.75rem",
                }}
              >
                You need to sign in to post. Choose a login method:
              </p>

              {authError && (
                <div
                  style={{
                    color: "#ef4444",
                    fontSize: "0.75rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  {authError}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <button
                  onClick={handleNip07SignIn}
                  disabled={authLoading || !hasNip07()}
                  style={{
                    backgroundColor: "transparent",
                    border: "1px dotted var(--border-color)",
                    color: "var(--text-color)",
                    padding: "0.5rem",
                    fontSize: "0.75rem",
                    cursor:
                      authLoading || !hasNip07() ? "not-allowed" : "pointer",
                    opacity: authLoading || !hasNip07() ? 0.5 : 1,
                  }}
                >
                  {authLoading ? "Signing in..." : "NIP-07 Extension"}
                </button>

                {hasSavedAccounts && (
                  <button
                    onClick={handleShowSavedAccounts}
                    disabled={authLoading}
                    style={{
                      backgroundColor: "transparent",
                      border: "1px dotted var(--border-color)",
                      color: "var(--text-color)",
                      padding: "0.5rem",
                      fontSize: "0.75rem",
                      cursor: authLoading ? "not-allowed" : "pointer",
                      opacity: authLoading ? 0.6 : 1,
                    }}
                  >
                    Saved Account
                  </button>
                )}

                <button
                  onClick={handleShowNsecLogin}
                  disabled={authLoading}
                  style={{
                    backgroundColor: "transparent",
                    border: "1px dotted var(--border-color)",
                    color: "var(--text-color)",
                    padding: "0.5rem",
                    fontSize: "0.75rem",
                    cursor: authLoading ? "not-allowed" : "pointer",
                    opacity: authLoading ? 0.6 : 1,
                  }}
                >
                  Nsec Secret Key
                </button>
              </div>

              <button
                onClick={() => setShowAuthUI("none")}
                style={{
                  backgroundColor: "transparent",
                  border: "1px dotted var(--border-color)",
                  color: "var(--text-color)",
                  padding: "0.25rem 0.5rem",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  marginTop: "0.5rem",
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* Inline Saved Accounts UI */}
          {showAuthUI === "saved_accounts" && (
            <div
              style={{
                marginTop: "0.75rem",
                border: "1px dotted var(--border-color)",
                padding: "1rem",
              }}
            >
              <h4
                style={{
                  margin: "0 0 0.5rem 0",
                  color: "var(--text-color)",
                  fontSize: "0.875rem",
                }}
              >
                Saved Accounts
              </h4>

              {savedAccountsList.length === 0 ? (
                <div
                  style={{
                    color: "var(--text-color)",
                    fontSize: "0.875rem",
                    opacity: 0.75,
                    margin: "1rem 0",
                  }}
                >
                  No saved accounts found on this device.
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    marginTop: "0.75rem",
                    maxHeight: "40vh",
                    overflowY: "auto",
                  }}
                >
                  {savedAccountsList.map((acc) => {
                    const isSelected = selectedSavedAccount === acc.pubkey;

                    return (
                      <div
                        key={acc.pubkey}
                        style={{
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
                            metadata={{}}
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
                              onChange={(e) =>
                                setSavedPassphrase(e.target.value)
                              }
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
                                onClick={() => setShowAuthUI("login")}
                                style={{
                                  backgroundColor: "transparent",
                                  color: "var(--text-color)",
                                  border: "1px dotted var(--border-color)",
                                  padding: "0.5rem 0.75rem",
                                  fontSize: "0.875rem",
                                  cursor: "pointer",
                                }}
                              >
                                Back
                              </button>
                              <button
                                onClick={handleSavedAccountLogin}
                                disabled={authLoading}
                                style={{
                                  backgroundColor: "transparent",
                                  color: "var(--text-color)",
                                  border: "1px dotted var(--border-color)",
                                  padding: "0.5rem 0.75rem",
                                  fontSize: "0.875rem",
                                  cursor: authLoading
                                    ? "not-allowed"
                                    : "pointer",
                                  opacity: authLoading ? 0.6 : 1,
                                }}
                              >
                                {authLoading ? "Signing in..." : "Login"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                onClick={() => setShowAuthUI("login")}
                style={{
                  backgroundColor: "transparent",
                  color: "var(--text-color)",
                  border: "1px dotted var(--border-color)",
                  fontSize: "0.75rem",
                  padding: "0.5rem 0.75rem",
                  cursor: "pointer",
                  marginTop: "0.75rem",
                  width: "100%",
                }}
              >
                Back to Login Options
              </button>
            </div>
          )}

          {/* Inline Nsec Login UI */}
          {showAuthUI === "nsec_login" && (
            <div
              style={{
                marginTop: "0.75rem",
                border: "1px dotted var(--border-color)",
                padding: "1rem",
              }}
            >
              <h4
                style={{
                  margin: "0 0 0.5rem 0",
                  color: "var(--text-color)",
                  fontSize: "0.875rem",
                }}
              >
                Nsec Secret Key
              </h4>
              <p
                style={{
                  margin: "0 0 1rem 0",
                  color: "var(--text-color)",
                  opacity: 0.8,
                  fontSize: "0.75rem",
                }}
              >
                Enter your nsec secret key to sign in:
              </p>

              {nsecError && (
                <div
                  style={{
                    color: "#ff0000",
                    fontSize: "0.75rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  {nsecError}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                <textarea
                  value={nsecInput}
                  onChange={(e) => setNsecInput(e.target.value)}
                  placeholder="nsec1... or hex secret key"
                  style={{
                    backgroundColor: "transparent",
                    color: "var(--text-color)",
                    border: "1px dotted var(--border-color)",
                    padding: "0.5rem",
                    fontSize: "0.875rem",
                    width: "100%",
                    minHeight: "80px",
                    resize: "vertical",
                    boxSizing: "border-box",
                    fontFamily: "monospace",
                  }}
                />

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      color: "var(--text-color)",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={persistNsec}
                      onChange={(e) => setPersistNsec(e.target.checked)}
                    />
                    Save key on this device (encrypted)
                  </label>

                  {persistNsec && (
                    <>
                      <input
                        type="password"
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        placeholder="Create passphrase (8+ characters)"
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
                    </>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    onClick={() => setShowAuthUI("login")}
                    style={{
                      backgroundColor: "transparent",
                      color: "var(--text-color)",
                      border: "1px dotted var(--border-color)",
                      padding: "0.5rem 0.75rem",
                      fontSize: "0.875rem",
                      cursor: "pointer",
                    }}
                  >
                    Back
                  </button>
                  <button
                    onClick={handleNsecLogin}
                    disabled={authLoading || !nsecInput.trim()}
                    style={{
                      backgroundColor: "transparent",
                      color: "var(--text-color)",
                      border: "1px dotted var(--border-color)",
                      padding: "0.5rem 0.75rem",
                      fontSize: "0.875rem",
                      cursor:
                        authLoading || !nsecInput.trim()
                          ? "not-allowed"
                          : "pointer",
                      opacity: authLoading || !nsecInput.trim() ? 0.6 : 1,
                    }}
                  >
                    {authLoading ? "Signing in..." : "Sign In"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Inline Unlock Key UI */}
          {showAuthUI === "unlock" && (
            <div
              style={{
                marginTop: "0.75rem",
                border: "1px dotted var(--border-color)",
                padding: "1rem",
              }}
            >
              <h4
                style={{
                  margin: "0 0 0.5rem 0",
                  color: "var(--text-color)",
                  fontSize: "0.875rem",
                  textAlign: "left",
                }}
              >
                Unlock saved key
              </h4>
              <p
                style={{
                  margin: "0 0 1rem 0",
                  color: "var(--text-color)",
                  opacity: 0.8,
                  fontSize: "0.75rem",
                  textAlign: "left",
                }}
              >
                Enter your passphrase to decrypt your saved key so you can
                continue performing logged-in actions.
              </p>

              {selectedSavedPubkey && (
                <div
                  style={{
                    marginBottom: "1rem",
                    padding: "0.5rem",
                    border: "1px dotted var(--border-color)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-color)",
                      opacity: 0.8,
                      textAlign: "left",
                    }}
                  >
                    Account:
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-color)",
                      textAlign: "left",
                    }}
                  >
                    {getDisplayNameForPubkey(selectedSavedPubkey) ||
                      (selectedSavedPubkey
                        ? (() => {
                            try {
                              return nip19.npubEncode(selectedSavedPubkey);
                            } catch {
                              return selectedSavedPubkey;
                            }
                          })()
                        : "Unknown")}
                  </div>
                </div>
              )}

              {unlockError && (
                <div
                  style={{
                    color: "#ef4444",
                    fontSize: "0.75rem",
                    marginBottom: "0.5rem",
                    textAlign: "left",
                  }}
                >
                  {unlockError}
                </div>
              )}

              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.25rem",
                    fontSize: "0.75rem",
                    color: "var(--text-color)",
                    textAlign: "left",
                  }}
                >
                  Passphrase:
                </label>
                <input
                  type="password"
                  value={unlockPassphrase}
                  onChange={(e) => setUnlockPassphrase(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    fontSize: "0.75rem",
                    border: "1px dotted var(--border-color)",
                    backgroundColor: "var(--app-bg-color)",
                    color: "var(--text-color)",
                    textAlign: "left",
                  }}
                  placeholder="Enter your passphrase"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && unlockPassphrase.trim()) {
                      handleUnlockKey();
                    }
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  onClick={() => {
                    setShowAuthUI("none");
                    setUnlockPassphrase("");
                    setUnlockError("");
                  }}
                  style={{
                    backgroundColor: "transparent",
                    border: "1px dotted var(--border-color)",
                    color: "var(--text-color)",
                    padding: "0.5rem",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleUnlockKey}
                  disabled={authLoading || !unlockPassphrase.trim()}
                  style={{
                    backgroundColor: "transparent",
                    border: "1px dotted var(--border-color)",
                    color: "var(--text-color)",
                    padding: "0.5rem",
                    fontSize: "0.75rem",
                    cursor:
                      authLoading || !unlockPassphrase.trim()
                        ? "not-allowed"
                        : "pointer",
                    opacity: authLoading || !unlockPassphrase.trim() ? 0.6 : 1,
                    flex: 1,
                  }}
                >
                  {authLoading ? "Unlocking..." : "Unlock & Retry"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PostPublishView;

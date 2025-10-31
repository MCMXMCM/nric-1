import React, { useContext } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Metadata } from "../../types/nostr/types";
import { NostrContext } from "../../contexts/NostrContext";
import { hasNip07, hasInMemorySecretKey } from "../../utils/nostr/nip07";
import { validatePubkey } from "../../utils/validation";
import { useDisplayNames } from "../../hooks/useDisplayNames";

import { SectionHeader } from "./SectionHeader";
import { TreeList, TreeListItem } from "./TreeListItem";
import { SettingsButton } from "./SettingsButton";
import { getDisplayInfo, createInputStyle } from "./settingsUtils";

interface UserLoginSectionProps {
  storedPubkey: string;
  setStoredPubkey: (value: string) => void;
  pubkeyError: string;
  setPubkeyError: (value: string) => void;
  pastedPubkey: string;
  setPastedPubkey: (value: string) => void;

  contactLoadError: string | null;
  metadata: Record<string, Metadata>;

  isMobile: boolean;
  onSignOut: () => void;

  onShowUnlockKey: () => void;
  onShowSavedAccounts: () => void;
  onShowNsecLogin: () => void;
  onShowGenerateKey?: () => void;
  onShowViewNsec?: () => void;
  canViewPersistedNsec?: boolean;
  hasSavedAccounts: boolean;
}

export const UserLoginSection: React.FC<UserLoginSectionProps> = ({
  storedPubkey,
  setStoredPubkey,
  pubkeyError,
  setPubkeyError,
  pastedPubkey,
  setPastedPubkey,

  contactLoadError,
  metadata,

  isMobile,
  onSignOut,
  onShowUnlockKey,
  onShowSavedAccounts,
  onShowNsecLogin,
  onShowGenerateKey,
  onShowViewNsec,
  canViewPersistedNsec,
  hasSavedAccounts,
}) => {
  const navigate = useNavigate();
  // location removed - unused variable
  const { signInWithNip07, loginMethod } = useContext(NostrContext);

  // Get relay URLs from context or use default relays
  const relayUrls = React.useMemo(() => {
    // For now, use default relays - in a real implementation, you'd get these from context
    return [
      "wss://relay.damus.io",
      "wss://nos.lol",
      "wss://relay.snort.social",
    ];
  }, []);

  // Use the display names hook for better metadata handling
  const { getDisplayNameForPubkey } = useDisplayNames(relayUrls);

  const isNsecSession = loginMethod === "nsec";
  const isUnlocked = hasInMemorySecretKey();

  const navigateToProfile = (pubkey: string) => {
    try {
      const { npub } = getDisplayInfo(pubkey, metadata);
      if (npub) {
        // backToPath removed - unused variable
        navigate({
          to: `/npub/${npub}`,
          state: true,
        });
      }
    } catch (error) {
      console.error("Failed to navigate to profile:", error);
    }
  };

  const handlePastePubkey = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setPastedPubkey(text.trim());
      setPubkeyError("");

      // Clear clipboard for security after pasting pubkey/npub
      try {
        await navigator.clipboard.writeText("");
      } catch (clearError) {
        // Clipboard clearing failed, but this is not critical
        console.warn(
          "Failed to clear clipboard after pasting pubkey:",
          clearError
        );
      }
    } catch (error) {
      setPubkeyError("Failed to read clipboard");
    }
  };

  const handleSavePubkey = () => {
    if (pastedPubkey) {
      if (!validatePubkey(pastedPubkey)) {
        setPubkeyError("Invalid pubkey or npub");
        return;
      }
      setPubkeyError("");
      setStoredPubkey(pastedPubkey); // This calls NostrContext.setPubkey which handles localStorage
      setPastedPubkey("");
      // Contact fetching is now handled by useUserContacts hook
    }
  };

  const handleNip07SignIn = async () => {
    if (!hasNip07()) return;
    try {
      const pk = await signInWithNip07();
      setStoredPubkey(pk);
      // Contact fetching is now handled by useUserContacts hook
    } catch (e: any) {
      const msg = e?.message || "Failed to sign in with extension";
      setPubkeyError(msg);
    }
  };

  const inputStyle = createInputStyle(isMobile);

  if (storedPubkey) {
    // Get display name using the hook (checks TanStack Query cache first)
    const displayName = getDisplayNameForPubkey(storedPubkey);

    // Get metadata from the passed metadata object (which now includes current user metadata)
    const userMetadata = metadata[storedPubkey];

    // Get display info with fallbacks
    const { hex, npub, truncated, initialChar } = getDisplayInfo(
      storedPubkey,
      metadata
    );

    // Use metadata picture if available, otherwise fallback
    const picture = userMetadata?.picture || "";

    // Use display name from hook if available, otherwise fallback to metadata or npub
    const displayTitle =
      displayName || userMetadata?.display_name || userMetadata?.name || npub;

    return (
      <>
        <SectionHeader title="User Login & Keys" />
        <TreeList style={{ width: "calc(100% - 2rem)" }}>
          <TreeListItem isLast style={{ width: "100%", paddingTop: "1rem" }}>
            <div
              style={{
                display: "flex",
                flexDirection: isMobile ? "column" : "row",
                alignItems: isMobile ? "stretch" : "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                width: isMobile ? "100%" : "93%",
                maxWidth: "100%",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px 1fr",
                  gridTemplateRows: "auto auto",
                  columnGap: "0.5rem",
                  alignItems: "center",
                  textAlign: "left",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    gridColumn: "1 / 2",
                    gridRow: "1 / span 2",
                    width: "40px",
                    height: "40px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      border: "1px dotted var(--border-color)",
                      background: "var(--app-bg-color)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                    }}
                  >
                    {picture ? (
                      <img
                        src={picture}
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
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          color: "var(--text-color)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",

                          fontSize: "0.875rem",
                        }}
                      >
                        {initialChar}
                      </div>
                    )}
                  </div>
                </div>
                <a
                  href={hex ? `/npub/${npub}` : "#"}
                  onClick={(e) => {
                    e.preventDefault();
                    if (hex) {
                      navigateToProfile(hex);
                    }
                  }}
                  style={{
                    gridColumn: "2 / 3",
                    gridRow: "1 / 2",
                    color: "var(--text-color)",

                    fontSize: "0.875rem",
                    fontWeight: 700,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    textDecoration: "none",
                    cursor: hex ? "pointer" : "default",
                  }}
                  onMouseEnter={(e) => {
                    if (hex) e.currentTarget.style.textDecoration = "underline";
                  }}
                  onMouseLeave={(e) => {
                    if (hex) e.currentTarget.style.textDecoration = "none";
                  }}
                >
                  {displayTitle}
                </a>
                <div
                  style={{
                    gridColumn: "2 / 3",
                    gridRow: "2 / 3",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                  }}
                >
                  <a
                    href={hex ? `/npub/${npub}` : "#"}
                    onClick={(e) => {
                      e.preventDefault();
                      if (hex) {
                        navigateToProfile(hex);
                      }
                    }}
                    style={{
                      color: "var(--app-text-secondary)",

                      fontSize: "0.75rem",
                      textDecoration: "none",
                      cursor: hex ? "pointer" : "default",
                    }}
                    onMouseEnter={(e) => {
                      if (hex)
                        e.currentTarget.style.textDecoration = "underline";
                    }}
                    onMouseLeave={(e) => {
                      if (hex) e.currentTarget.style.textDecoration = "none";
                    }}
                    title={hex ? "Click to view profile" : ""}
                  >
                    {truncated}
                  </a>
                  {npub && (
                    <button
                      onClick={() => {
                        try {
                          navigator.clipboard.writeText(npub);
                        } catch {}
                      }}
                      style={{
                        minHeight: "1rem",
                        backgroundColor: "transparent",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title="Copy npub"
                    >
                      <svg
                        width="12"
                        height="12"
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
                    </button>
                  )}
                </div>
              </div>
            </div>
          </TreeListItem>

          <TreeList
            style={{ width: "calc(100% - 2rem)", paddingLeft: "2.8rem" }}
          >
            <TreeListItem>
              {isNsecSession ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    width: "100%",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: isUnlocked ? "#22c55e" : "#f59e0b",
                    }}
                  >
                    {isUnlocked ? "Key: Unlocked" : "Key: Locked"}
                  </span>
                  {!isUnlocked && hex && (
                    <button
                      onClick={onShowUnlockKey}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--link-color, #2563eb)",
                        textDecoration: "underline",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        minHeight: "2rem",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                        padding: 0,
                      }}
                      type="button"
                      tabIndex={0}
                      aria-label="Unlock key"
                    >
                      Unlock key
                    </button>
                  )}
                </div>
              ) : loginMethod === "nip07" ? (
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-color)",
                    textAlign: "left",
                  }}
                >
                  Using Extension Key
                </div>
              ) : (
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-color)",
                    textAlign: "left",
                  }}
                >
                  Using Public Key Only
                </div>
              )}
            </TreeListItem>

            {isNsecSession && canViewPersistedNsec && (
              <TreeListItem style={{ display: "flex" }}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    gap: "0.5rem",
                    width: isMobile ? "100%" : "50%",
                  }}
                >
                  <SettingsButton
                    onClick={() => onShowViewNsec && onShowViewNsec()}
                    textAlign="start"
                    style={{ width: "fit-content" }}
                  >
                    View nsec
                  </SettingsButton>
                </div>
              </TreeListItem>
            )}

            <TreeListItem isLast style={{ display: "flex" }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  gap: "0.5rem",
                  width: isMobile ? "100%" : "50%",
                }}
              >
                <SettingsButton
                  onClick={onSignOut}
                  variant="danger"
                  width="fit-content"
                  style={{
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  Sign Out
                </SettingsButton>
              </div>
            </TreeListItem>
          </TreeList>
        </TreeList>
      </>
    );
  }

  // Not signed in - show login options
  return (
    <>
      <SectionHeader title="User Login & Keys" />
      <TreeList>
        {/* Generate New Key */}
        <TreeListItem>
          <SettingsButton
            onClick={() => onShowGenerateKey && onShowGenerateKey()}
            textAlign="start"
            style={{ width: "100%" }}
          >
            Generate New User Key
          </SettingsButton>
        </TreeListItem>

        {/* Sign In parent item */}
        <TreeListItem lineTop="11%">
          <div
            style={{
              color: "var(--text-color)",

              fontSize: "0.875rem",
              textAlign: "start",
              fontWeight: "normal",
            }}
          >
            Login with:
          </div>

          {/* Nested list for sign in options */}
          <TreeList style={{ margin: "0.25rem 0 0 2rem" }}>
            {hasSavedAccounts && (
              <TreeListItem>
                <SettingsButton
                  onClick={onShowSavedAccounts}
                  textAlign="start"
                  style={{ width: "100%" }}
                >
                  Login with Saved Account
                </SettingsButton>
              </TreeListItem>
            )}

            {/* Sign in with Nostr Extension */}
            <TreeListItem style={{ display: "flex" }}>
              <SettingsButton
                onClick={handleNip07SignIn}
                disabled={!hasNip07()}
                textAlign="start"
                style={{
                  opacity: hasNip07() ? 1 : 0.5,
                }}
              >
                NIP-07 Extension
              </SettingsButton>
            </TreeListItem>

            {/* Sign in with Nsec */}
            <TreeListItem isLast style={{ display: "flex" }}>
              <SettingsButton
                onClick={onShowNsecLogin}
                textAlign="start"
                style={{}}
              >
                Nsec Secret Key
              </SettingsButton>
            </TreeListItem>
          </TreeList>
        </TreeListItem>

        {/* Manual pubkey input */}
        <TreeListItem isLast>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              width: isMobile ? "100%" : "93%",
              paddingTop: "1.75rem",
            }}
          >
            <input
              type="text"
              value={pastedPubkey}
              onChange={(e) => setPastedPubkey(e.target.value)}
              placeholder="Enter npub or pubkey"
              style={{
                ...inputStyle,
                border: "none",
                borderBottom: "1px dotted var(--border-color)",
              }}
              onFocus={(e) => {
                if (isMobile) {
                  e.target.style.fontSize = "16px";
                }
              }}
              onBlur={(e) => {
                if (isMobile) {
                  e.target.style.fontSize = "0.875rem";
                }
              }}
            />
            {pubkeyError && (
              <span
                style={{
                  color: "#ff0000",

                  fontSize: "0.75rem",
                }}
              >
                {pubkeyError}
              </span>
            )}
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
              }}
            >
              <SettingsButton
                onClick={handlePastePubkey}
                style={{
                  flex: 1,
                  whiteSpace: "nowrap",
                  textAlign: "center",
                }}
              >
                Paste Clipboard
              </SettingsButton>
              <SettingsButton
                onClick={handleSavePubkey}
                style={{
                  flex: 1,
                  whiteSpace: "nowrap",
                  textAlign: "center",
                }}
              >
                Save
              </SettingsButton>
            </div>
            {contactLoadError && (
              <span
                style={{
                  color: "#ff0000",

                  fontSize: "0.75rem",
                }}
              >
                {contactLoadError}
              </span>
            )}
          </div>
        </TreeListItem>
      </TreeList>
    </>
  );
};

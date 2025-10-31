import React, {
  useContext,
  useMemo,
  useEffect,
  useState,
  useCallback,
} from "react";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { nip19 } from "nostr-tools";
import type { Metadata } from "../types/nostr/types";

import { NostrContext } from "../contexts/NostrContext";
import { useRelayManager } from "../hooks/useRelayManager";
import { useCurrentUserMetadata } from "../hooks/useMetadataQuery";
import { DEFAULT_RELAY_URLS } from "../utils/nostr/constants";

import RelayStatusLights from "./RelayStatusLights";
import {
  parseModalState,
  updateUrlWithModalState,
  type ModalState,
} from "../utils/modalUrlState";
import SettingsDropdown from "./SettingsDropdown";
import { setShowSettings } from "./lib/uiStore";
import { useUIStore } from "./lib/useUIStore";
import {
  clearPersistedRQCache,
  getCacheBreakdown,
} from "../utils/persistQueryClient";
import { useQueryClient } from "@tanstack/react-query";
import { useNotificationCountNostrify } from "../hooks/useNotificationCountNostrify";
import {
  calculateAmberBrightness,
  getCompleteBoxShadow,
} from "../utils/notificationBrightness";
import { useModalContext } from "../contexts/ModalContext";
import LoginOptionsModal from "./LoginOptionsModal";
import { SavedAccountsModal } from "./settings/SavedAccountsModal";
import { NsecLoginModal } from "./settings/NsecLoginModal";
import UnlockKeyModal from "./UnlockKeyModal";
import { useFollowingMetadataPreload } from "../hooks/useFollowingMetadataPreload";
import { useDisplayNames } from "../hooks/useDisplayNames";

const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Mobile detection
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const {
    nostrClient,
    pubkey: ctxPubkey,
    nip07Available,
    signInWithNip07,
    setPubkey,
    signOut,
    getCachedMetadataForPubkey,
    listSavedAccounts,
  } = useContext(NostrContext) as any;

  // Pubkey input state
  const [pastedPubkey, setPastedPubkey] = useState("");
  const [pubkeyError, setPubkeyError] = useState("");

  // Function to refresh cache stats
  const refreshCacheStats = useCallback(async () => {
    try {
      await getCacheBreakdown();

      // setCacheStats({ // This line was removed as per the edit hint
      //   metadataCount: cacheBreakdown.breakdown.metadataQueries,
      //   contactsCount: cacheBreakdown.breakdown.contactsQueries,
      //   asciiCacheCount: 0, // ASCII cache removed - renderer now renders dynamically
      // });
    } catch (error) {
      console.error("Error refreshing cache stats:", error);
    }
  }, []);

  // Use global metadata store
  // Metadata is now handled via TanStack Query - no global store needed

  const {
    relayStatuses,
    relayUrls,
    addRelay,
    removeRelay,
    cycleRelayPermission,
    getRelayPermission,
    restoreDefaultRelays,
    applySessionDefaultsIfPresent,
  } = useRelayManager({
    nostrClient,
    initialRelays: DEFAULT_RELAY_URLS,
    pubkeyHex: ctxPubkey,
  });

  // Get notification count for amber button brightness
  const { unreadCount } = useNotificationCountNostrify({
    relayUrls: ctxPubkey ? relayUrls : [],
  });

  // Preload metadata for all following contacts to show in mention suggestions
  const { addDisplayNamesFromMetadata } = useDisplayNames(relayUrls);
  useFollowingMetadataPreload({
    pubkeyHex: ctxPubkey,
    relayUrls,
    enabled: !!ctxPubkey,
    addDisplayNamesFromMetadata,
  });

  // Calculate amber button brightness based on notification count
  const amberBrightness = useMemo(
    () => calculateAmberBrightness(unreadCount),
    [unreadCount]
  );

  // Modal state management (global for all components)
  const modalContext = useModalContext();

  // Saved accounts state for login modals
  const [savedAccounts, setSavedAccounts] = useState<
    Array<{ pubkey: string; timestamp: number }>
  >([]);

  // Load saved accounts when modal is opened
  useEffect(() => {
    if (modalContext.showSavedAccountsModal && savedAccounts.length === 0) {
      listSavedAccounts()
        .then((accounts: Array<{ pubkey: string; timestamp: number }>) =>
          setSavedAccounts(accounts)
        )
        .catch((error: unknown) => {
          console.error("Failed to load saved accounts:", error);
          setSavedAccounts([]);
        });
    }
  }, [
    modalContext.showSavedAccountsModal,
    savedAccounts.length,
    listSavedAccounts,
  ]);

  // Automatically fetch current user metadata when available
  const { data: currentUserMetadataResult } = useCurrentUserMetadata(
    ctxPubkey,
    relayUrls
  );

  const getUserDisplayInfo = () => {
    // Now ctxPubkey should always be hex format from NostrContext
    const hexPubkey = ctxPubkey || localStorage.getItem("nostrPubkey") || "";

    if (!hexPubkey) return null;

    // Get metadata from TanStack Query result
    const metadata = currentUserMetadataResult?.metadata;

    // Since metadata is now handled via TanStack Query, use fallback display values
    const displayChar = (() => {
      const source = metadata?.display_name || hexPubkey || "U";
      return (source || "?").charAt(0).toUpperCase();
    })();
    const picture = metadata?.picture || ""; // Use actual picture from metadata if available

    // Always convert to npub for display
    let npub: string = hexPubkey;
    try {
      if (/^[0-9a-fA-F]{64}$/.test(hexPubkey)) {
        npub = nip19.npubEncode(hexPubkey);
      }
    } catch {}

    return { displayChar, picture, npub, pk: hexPubkey };
  };

  const userInfo = getUserDisplayInfo();

  // Ensure npub-only session relay defaults are applied when pubkey changes
  useEffect(() => {
    applySessionDefaultsIfPresent && applySessionDefaultsIfPresent();
  }, [ctxPubkey, applySessionDefaultsIfPresent]);

  // Create metadata object that includes current user metadata and cached metadata for saved accounts
  const metadataWithCache = React.useMemo(() => {
    const metadata: Record<string, Metadata> = {};

    // Add current user metadata if available
    if (currentUserMetadataResult?.metadata && ctxPubkey) {
      metadata[ctxPubkey] = currentUserMetadataResult.metadata;
    }

    // Add cached metadata for saved accounts
    try {
      const savedAccounts = JSON.parse(
        localStorage.getItem("nostrSavedAccounts") || "[]"
      );
      savedAccounts.forEach((account: { pubkey: string }) => {
        const cached = getCachedMetadataForPubkey(account.pubkey);
        if (cached) {
          metadata[account.pubkey] = cached;
        }
      });
    } catch (error) {
      console.warn("Failed to parse saved accounts for metadata:", error);
    }

    return metadata;
  }, [
    currentUserMetadataResult?.metadata,
    ctxPubkey,
    getCachedMetadataForPubkey,
  ]);

  // Subscribe to UI store for current settings values
  const showSettings = useUIStore((s) => s.showSettings);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const state = parseModalState(params);
    const open = !!state.settings;
    setShowSettings(open);

    // Refresh cache stats when settings dropdown is opened
    if (open) {
      refreshCacheStats();
    }
  }, [location.search, refreshCacheStats]);
  const openSettings = () => {
    const params = new URLSearchParams(location.search);
    const currentState = parseModalState(params);
    const newState: ModalState = { ...currentState, settings: true };
    // Preserve current pathname and append settings like other modals
    updateUrlWithModalState(newState, navigate as any, location, false);
  };

  const handleResetPreferences = async () => {
    try {
      // Import UI store functions to update state
      const {
        setIsDarkMode,
        setUseAscii,
        setUseColor,
        setShowReplies,
        setShowReposts,
        setNsfwBlock,
        setCustomHashtags,
      } = await import("../components/lib/uiStore");

      // Clear all preference-related localStorage keys and update UI store
      const preferenceKeys = [
        "darkMode",
        "useAscii",
        "useColor",
        "showReplies",
        "showReposts",
        "nsfwBlock",
        "customHashtags",
        "currentIndex",
        "showProfileMeta",
      ];

      preferenceKeys.forEach((key) => {
        try {
          localStorage.removeItem(key);
        } catch (error) {
          console.warn(`⚠️ Could not clear preference: ${key}`, error);
        }
      });

      // Update UI store to reflect default values
      setIsDarkMode(true); // Default dark mode
      // ASCII mode: off on mobile, on on desktop
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      setUseAscii(!isMobile); // Default ASCII art: disabled on mobile, enabled on desktop
      setUseColor(true); // Default color enabled
      setShowReplies(true); // Default show replies
      setShowReposts(true); // Default show reposts
      setNsfwBlock(true); // Default NSFW blocking enabled
      setCustomHashtags(["Bitcoin", "Nostr", "News"]); // Default hashtags

      // Reset relay settings to defaults
      try {
        // Use the relay manager's restore function to update both localStorage and UI state
        restoreDefaultRelays();
      } catch (error) {
        console.warn("⚠️ Could not reset relay settings:", error);
      }
    } catch (error) {
      console.error("❌ Error resetting preferences:", error);
    }
  };

  const handleClearKeys = async () => {
    try {
      // Clear keys from localStorage
      const keyStorageKeys = [
        "nostrPubkey",
        "nostr_user_display_names",
        "nostr_stored_relays",
      ];

      keyStorageKeys.forEach((key) => {
        try {
          localStorage.removeItem(key);
        } catch (error) {
          console.warn(`⚠️ Could not clear localStorage key: ${key}`, error);
        }
      });

      // Sign out the user (this will clear in-memory keys and trigger logout)
      await signOut({ destroyInMemory: true, removePersisted: false });

      // Broadcast sign-out event to update UI components
      try {
        window.dispatchEvent(new CustomEvent("nostrSignOut"));
      } catch (error) {
        console.warn("⚠️ Could not dispatch sign-out event:", error);
      }
    } catch (error) {
      console.error("❌ Error clearing keys:", error);
    }
  };

  const handleClearAllCaches = async () => {
    try {
      // Clear entire TanStack Query cache
      await clearPersistedRQCache({ queryClient });

      // Clear legacy IndexedDB collections
      try {
        const request = indexedDB.open("nostr-feed", 5);
        request.onsuccess = () => {
          const db = request.result;
          const stores = ["keystore"]; // zap_totals removed - now handled by TanStack Query

          stores.forEach((storeName) => {
            if (db.objectStoreNames.contains(storeName)) {
              const transaction = db.transaction(storeName, "readwrite");
              const store = transaction.objectStore(storeName);
              store.clear();
            }
          });
          db.close();
        };
      } catch (error) {
        console.warn("⚠️ Could not clear legacy IndexedDB collections:", error);
      }

      // Clear outbox data when clearing all caches
      try {
        const { createClearOutboxData } = await import("./feed/cacheUtils");
        await createClearOutboxData();
      } catch (error) {
        console.warn("⚠️ Could not clear outbox data:", error);
      }

      // Reset preferences to defaults (call the existing function)
      await handleResetPreferences();

      // Clear additional localStorage keys
      const additionalKeysToClear = [
        "nostrPubkey",
        "asciiCache",
        "nostr_user_display_names",
      ];

      additionalKeysToClear.forEach((key) => {
        try {
          localStorage.removeItem(key);
        } catch (error) {
          console.warn(`⚠️ Could not clear localStorage key: ${key}`, error);
        }
      });

      // Clear stored wallet connections
      try {
        const { removeStoredWalletConnection } = await import(
          "../utils/walletStorage"
        );
        const currentPubkey =
          ctxPubkey || localStorage.getItem("nostrPubkey") || "";
        await removeStoredWalletConnection(undefined, {
          pubkey: currentPubkey,
        });

        // Also disconnect any currently connected wallet in the UI state
        // Note: We can't directly access the wallet context here, but we can dispatch an event
        // that the NdkWalletProvider will listen to
        try {
          window.dispatchEvent(new CustomEvent("nostrSignOut"));
        } catch (disconnectError) {
          console.warn(
            "⚠️ Could not disconnect wallet from UI state:",
            disconnectError
          );
        }

        // Notify other components that wallet connections were cleared
        try {
          window.dispatchEvent(new CustomEvent("walletConnectionCleared"));
        } catch (eventError) {
          console.warn(
            "⚠️ Could not dispatch wallet cleared event:",
            eventError
          );
        }
      } catch (error) {
        console.warn("⚠️ Could not clear wallet connections:", error);
      }

      // Sign out the user (this will clear in-memory keys and trigger logout)
      await signOut({ destroyInMemory: true, removePersisted: false });
    } catch (error) {
      console.error("❌ Error clearing all caches:", error);
    }
  };

  const showLights = useMemo(
    () => Array.isArray(relayStatuses),
    [relayStatuses]
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top Navigation Bar */}
      <div
        style={{
          height: 56,
          minHeight: 56,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          backgroundColor: "var(--app-bg-color )",
          position: "sticky",
          top: 0,
          zIndex: 100,
          width: "100%",
          maxWidth: isMobile ? "100%" : "1000px",
          margin: isMobile ? "0" : "0 auto",
          boxSizing: "border-box",
        }}
      >
        {/* Left section */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.2rem",
            justifyContent: "flex-start",
          }}
        >
          <button
            onClick={() => navigate({ to: "/" })}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              height: "50px",
              margin: 0,
              marginRight: "0.5rem",
            }}
            title="Go to Home"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 1400 1024"
              style={{
                width: "130px",
                height: "auto",
                display: "block",
                verticalAlign: "middle",
              }}
            >
              <defs>
                <mask
                  id="stripeMask"
                  maskUnits="userSpaceOnUse"
                  x="0"
                  y="0"
                  width="1400"
                  height="1024"
                >
                  <rect x="0" y="0" width="1400" height="1024" fill="black" />
                  <g fill="white">
                    <rect x="0" y="120" width="1400" height="18" />
                    <rect x="0" y="148" width="1400" height="18" />
                    <rect x="0" y="176" width="1400" height="18" />
                    <rect x="0" y="204" width="1400" height="18" />
                    <rect x="0" y="232" width="1400" height="18" />
                    <rect x="0" y="260" width="1400" height="18" />
                    <rect x="0" y="288" width="1400" height="18" />
                    <rect x="0" y="316" width="1400" height="18" />
                    <rect x="0" y="344" width="1400" height="18" />
                    <rect x="0" y="372" width="1400" height="18" />
                    <rect x="0" y="400" width="1400" height="18" />
                    <rect x="0" y="428" width="1400" height="18" />
                    <rect x="0" y="456" width="1400" height="18" />
                    <rect x="0" y="484" width="1400" height="18" />
                    <rect x="0" y="512" width="1400" height="18" />
                    <rect x="0" y="540" width="1400" height="18" />
                    <rect x="0" y="568" width="1400" height="18" />
                    <rect x="0" y="596" width="1400" height="18" />
                    <rect x="0" y="624" width="1400" height="18" />
                    <rect x="0" y="652" width="1400" height="18" />
                    <rect x="0" y="680" width="1400" height="18" />
                    <rect x="0" y="708" width="1400" height="18" />
                    <rect x="0" y="736" width="1400" height="18" />
                    <rect x="0" y="764" width="1400" height="18" />
                    <rect x="0" y="792" width="1400" height="18" />
                    <rect x="0" y="820" width="1400" height="18" />
                    <rect x="0" y="848" width="1400" height="18" />
                  </g>
                </mask>
              </defs>
              <g mask="url(#stripeMask)">
                <text
                  x="50%"
                  y="62%"
                  textAnchor="middle"
                  fontFamily="Arial, Helvetica, sans-serif"
                  fontWeight="900"
                  fontSize="360"
                  letterSpacing="0"
                  fill="var(--logo-fill-color, #E8D6BA)"
                >
                  NRIC-1
                </text>
              </g>
            </svg>
          </button>

          {!isMobile && showLights && (
            <RelayStatusLights relayStatuses={relayStatuses} />
          )}
        </div>

        {/* Center section - perfectly centered */}
        {isMobile && showLights && (
          <RelayStatusLights relayStatuses={relayStatuses} />
        )}
        {!isMobile && (
          <button
            onClick={() => navigate({ to: "/about" })}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-color)",
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontSize: "var(--font-size-lg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              whiteSpace: "nowrap",
            }}
            title="About NRIC-1"
          >
            {"Note Relay Interlink Client"}
          </button>
        )}

        {/* Right section */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "0.5rem",
          }}
        >
          {/* Notifications button with badge - only show when logged in */}
          {ctxPubkey ? (
            <button
              onClick={() => navigate({ to: "/notifications" })}
              title="Notifications"
              style={{
                backgroundColor: "transparent",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "2px",
                margin: 0,
                position: "relative",
                width: 22,
                height: 22,
              }}
            >
              <div
                style={{
                  width: "24px",
                  height: "24px",
                  backgroundColor: amberBrightness.baseColor,
                  border: `1px solid #92400e`,
                  boxShadow: getCompleteBoxShadow(amberBrightness, false),
                  transition: "all 0.2s ease",
                  position: "relative",
                  opacity: amberBrightness.opacity,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = getCompleteBoxShadow(
                    amberBrightness,
                    true
                  );
                  e.currentTarget.style.backgroundColor =
                    amberBrightness.glowColor;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = getCompleteBoxShadow(
                    amberBrightness,
                    false
                  );
                  e.currentTarget.style.backgroundColor =
                    amberBrightness.baseColor;
                }}
              />
            </button>
          ) : (
            <div
              style={{
                width: "28px",
                height: "28px",
              }}
            ></div>
          )}
          {userInfo ? (
            <button
              onClick={async () => {
                let target = userInfo.npub;
                if (!userInfo.pk && nip07Available) {
                  try {
                    const signedPk = await signInWithNip07();
                    target = /^[0-9a-fA-F]{64}$/.test(signedPk)
                      ? nip19.npubEncode(signedPk)
                      : signedPk;
                  } catch {}
                }
                if (!target) return;
                navigate({
                  to: `/npub/${encodeURIComponent(target)}`,
                });
              }}
              style={{
                minHeight: "22px",
                minWidth: "22px",
                backgroundColor: "var(--app-bg-color )",
                color: "var(--text-color)",
                width: "25px",
                height: "25px",
                marginRight: "0.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                borderRadius: 0,
              }}
              title="View my profile"
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {userInfo.picture ? (
                  <img
                    src={userInfo.picture}
                    alt="me"
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
                      fontSize: "var(--font-size-base)",
                    }}
                  >
                    {userInfo.displayChar}
                  </span>
                )}
              </div>
            </button>
          ) : (
            <button
              onClick={() => modalContext.setShowLoginOptionsModal(true)}
              style={{
                backgroundColor: "transparent",
                color: "var(--text-color)",
                width: "28px",
                minHeight: "28px",
                minWidth: "28px",
                height: "28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
              title="Not logged in - Click to sign in"
            >
              {/* Logged out SVG icon */}
              <svg
                width="24"
                height="24"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ display: "block" }}
                aria-label="Logged out"
              >
                <circle cx="10" cy="7" r="4" />
                <path d="M2 18c0-2.5 3.5-4 8-4s8 1.5 8 4" />
                <line
                  x1="4"
                  y1="4"
                  x2="16"
                  y2="16"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            </button>
          )}
          <button
            onClick={openSettings}
            title="Settings"
            style={{
              backgroundColor: "transparent",
              color: "var(--text-color)",
              border: "none",
              cursor: "pointer",
              fontSize: "var(--font-size-xl)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              margin: 0,
              width: 38,
              minWidth: "38px",
              minHeight: "38px",
              height: 38,
              flexShrink: 0,
            }}
          >
            <svg
              width="27"
              height="27"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                border: "1px solid currentColor",
                borderRadius: 0,
              }}
            >
              {/* Hamburger menu lines */}
              <line
                x1="3"
                y1="6"
                x2="21"
                y2="6"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <line
                x1="3"
                y1="12"
                x2="21"
                y2="12"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <line
                x1="3"
                y1="18"
                x2="21"
                y2="18"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </button>

          {showSettings && (
            <SettingsDropdown
              hideTriggerButton={true}
              cacheStats={{ totalNotes: 0, totalSize: 0, filterStats: {} }}
              onClearKeys={handleClearKeys}
              onClearAllCaches={handleClearAllCaches}
              setAsciiCache={() => {}}
              asciiCache={{}}
              storedPubkey={userInfo?.pk || ""}
              setStoredPubkey={setPubkey}
              handleRemoveStoredPubkey={() => {}}
              pubkeyError={pubkeyError}
              setPubkeyError={setPubkeyError}
              pastedPubkey={pastedPubkey}
              setPastedPubkey={setPastedPubkey}
              contactLoadError={null}
              metadata={metadataWithCache}
              contacts={[]}
              relayUrls={relayUrls}
              relayStatuses={relayStatuses}
              addRelay={addRelay}
              removeRelay={removeRelay}
              restoreDefaultRelays={restoreDefaultRelays}
              cycleRelayPermission={cycleRelayPermission}
              getRelayPermission={getRelayPermission}
              resetPreferences={handleResetPreferences}
              isClearingCache={false}
              asciiCacheCountOverride={0}
            />
          )}
        </div>
      </div>

      {/* Global Modals - Login, Unlock, etc. */}
      <LoginOptionsModal
        isOpen={modalContext.showLoginOptionsModal}
        onClose={modalContext.handleLoginCancel}
        onSuccess={modalContext.handleLoginSuccess}
        onShowSavedAccounts={modalContext.handleShowSavedAccounts}
        onShowNsecLogin={modalContext.handleShowNsecLogin}
        actionName={modalContext.pendingAction?.actionName || "access the app"}
      />

      <SavedAccountsModal
        isOpen={modalContext.showSavedAccountsModal}
        onClose={() => modalContext.setShowSavedAccountsModal(false)}
        onSuccess={modalContext.handleLoginSuccess}
        savedAccounts={savedAccounts}
        metadata={metadataWithCache}
      />

      <NsecLoginModal
        isOpen={modalContext.showNsecLoginModal}
        onClose={() => modalContext.setShowNsecLoginModal(false)}
        onSuccess={modalContext.handleLoginSuccess}
      />

      {/* Global Unlock Key Modal */}
      {modalContext.unlockModal.isOpen && ctxPubkey && (
        <UnlockKeyModal
          isOpen={modalContext.unlockModal.isOpen}
          onClose={modalContext.hideUnlockModal}
          actionLabel={modalContext.unlockModal.actionLabel}
          currentPubkeyHex={ctxPubkey}
          onUnlocked={async () => {
            modalContext.hideUnlockModal();
            await modalContext.unlockModal.onUnlocked();
          }}
          getDisplayNameForPubkey={(pubkey: string) => {
            const meta = getCachedMetadataForPubkey(pubkey);
            return meta?.name || meta?.display_name || pubkey.slice(0, 8);
          }}
          metadata={metadataWithCache}
        />
      )}

      {/* Routed Content */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <Outlet />
      </div>
    </div>
  );
};

export default MainLayout;

import React, {
  useState,
  useEffect,
  useRef,
  useContext,
  type ReactElement,
  useCallback,
  useMemo,
} from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import type { Metadata, Contact } from "../types/nostr/types";
import { ClearCacheModal } from "./ClearCacheModal";

import { NostrContext } from "../contexts/NostrContext";
import { useUIStore } from "./lib/useUIStore";
import { setShowSettings } from "./lib/uiStore";
import {
  listPersistedAccounts,
  removePersistedSecret,
} from "../utils/nostr/nip07";
import UnlockKeyModal from "./UnlockKeyModal";
import { AboutSection } from "./settings/AboutSection";
import { ModesSection } from "./settings/ModesSection";
import { FiltersSection } from "./settings/FiltersSection";
import { UserLoginSection } from "./settings/UserLoginSection";
import { CacheSection } from "./settings/CacheSection";
import { EnhancedRelayManagementSection } from "./settings/EnhancedRelayManagementSection";
import { ProofOfWorkSection } from "./settings/ProofOfWorkSection";
import { WalletSection } from "./settings/WalletSection";
import { BlossomSettingsSection } from "./settings/BlossomSettingsSection";
import { NsecLoginModal } from "./settings/NsecLoginModal";
import { SignOutModal } from "./settings/SignOutModal";
import { SavedAccountsModal } from "./settings/SavedAccountsModal";
import { convertPubkeyToHex } from "./settings/settingsUtils";
import { getCacheBreakdown } from "../utils/persistQueryClient";
import { GenerateKeyModal } from "./settings/GenerateKeyModal";
import { ViewNsecModal } from "./settings/ViewNsecModal";
import {
  parseModalState,
  updateUrlWithModalState,
  type ModalState,
} from "../utils/modalUrlState";
import { BookmarksSection } from "./settings/BookmarksSection";

interface SettingsDropdownProps {
  cacheStats: {
    totalNotes: number;
    totalSize: number;
    filterStats: {
      [key: string]: {
        count: number;
        size: number;
      };
    };
  };
  onClearKeys?: () => void;
  onClearAllCaches?: () => void;
  setAsciiCache: (value: any) => void;
  asciiCache: any;
  storedPubkey: string;
  setStoredPubkey: (value: string) => void;

  handleRemoveStoredPubkey: () => void;
  pubkeyError: string;
  setPubkeyError: (value: string) => void;
  pastedPubkey: string;
  setPastedPubkey: (value: string) => void;

  contactLoadError: string | null;
  metadata: Record<string, Metadata>;
  contacts: Contact[];
  isClearingCache: boolean;
  relayUrls: string[];
  relayStatuses: {
    url: string;
    connected: boolean;
    read: boolean;
    write: boolean;
  }[];
  addRelay: (url: string, permission?: any) => void;
  removeRelay: (url: string) => void;
  restoreDefaultRelays?: () => void;
  cycleRelayPermission: (url: string) => void;
  getRelayPermission: (url: string) => any;
  resetPreferences?: () => void;
  hideTriggerButton?: boolean;
  // Optional cache count overrides (when not using global metadata/contacts state)
  metadataCountOverride?: number;
  contactsCountOverride?: number;
  asciiCacheCountOverride?: number;
}

const SettingsDropdown = ({
  // cacheStats is deprecated; persistedSummary replaces it
  onClearKeys,
  onClearAllCaches,
  setAsciiCache,
  asciiCache,
  storedPubkey,
  setStoredPubkey,

  handleRemoveStoredPubkey,
  pubkeyError,
  setPubkeyError,
  pastedPubkey,
  setPastedPubkey,

  contactLoadError,
  metadata,
  isClearingCache,
  relayUrls,
  relayStatuses,
  addRelay,
  removeRelay,
  restoreDefaultRelays,
  cycleRelayPermission,
  getRelayPermission,
  resetPreferences,
  hideTriggerButton,
  asciiCacheCountOverride,
}: SettingsDropdownProps): ReactElement => {
  const navigate = useNavigate();
  const location = useLocation();
  const settingsRef = useRef<HTMLDivElement>(null);

  // Cache breakdown for detailed stats
  const [cacheBreakdown, setCacheBreakdown] = useState<{
    totalQueries: number;
    totalMutations: number;
    totalSizeBytes: number;
    lastUpdatedAt: number;
    breakdown: {
      feedQueries: number;
      metadataQueries: number;
      contactsQueries: number;
      threadQueries: number;
      otherQueries: number;
    };
    sizeBreakdown: {
      feedQueriesSize: number;
      metadataQueriesSize: number;
      contactsQueriesSize: number;
      threadQueriesSize: number;
      otherQueriesSize: number;
    };
  }>({
    totalQueries: 0,
    totalMutations: 0,
    totalSizeBytes: 0,
    lastUpdatedAt: 0,
    breakdown: {
      feedQueries: 0,
      metadataQueries: 0,
      contactsQueries: 0,
      threadQueries: 0,
      otherQueries: 0,
    },
    sizeBreakdown: {
      feedQueriesSize: 0,
      metadataQueriesSize: 0,
      contactsQueriesSize: 0,
      threadQueriesSize: 0,
      otherQueriesSize: 0,
    },
  });

  const refreshPersistedSummary = useCallback(async () => {
    try {
      const breakdown = await getCacheBreakdown();
      setCacheBreakdown(breakdown);
    } catch {}
  }, []);

  useEffect(() => {
    refreshPersistedSummary();
  }, [refreshPersistedSummary]);

  // Reset cache stats when user logs out
  useEffect(() => {
    const handleSignOut = () => {
      // Reset cache breakdown to empty state
      setCacheBreakdown({
        totalQueries: 0,
        totalMutations: 0,
        totalSizeBytes: 0,
        lastUpdatedAt: 0,
        breakdown: {
          feedQueries: 0,
          metadataQueries: 0,
          contactsQueries: 0,
          threadQueries: 0,
          otherQueries: 0,
        },
        sizeBreakdown: {
          feedQueriesSize: 0,
          metadataQueriesSize: 0,
          contactsQueriesSize: 0,
          threadQueriesSize: 0,
          otherQueriesSize: 0,
        },
      });
    };

    window.addEventListener("nostrSignOut", handleSignOut);
    return () => window.removeEventListener("nostrSignOut", handleSignOut);
  }, []);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  const { listSavedAccounts, loginMethod, nsecPersistedThisSession } =
    useContext(NostrContext);

  // Read UI state from store
  const showOptions = useUIStore((s) => s.showSettings);

  const [showClearKeysConfirm, setShowClearKeysConfirm] = useState(false);
  const [showClearAllCachesConfirm, setShowClearAllCachesConfirm] =
    useState(false);
  const [showResetPreferencesConfirm, setShowResetPreferencesConfirm] =
    useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showRemoveRelayConfirm, setShowRemoveRelayConfirm] = useState(false);
  const [showClearSavedKeysConfirm, setShowClearSavedKeysConfirm] =
    useState(false);
  const [showClearStoredWalletConfirm, setShowClearStoredWalletConfirm] =
    useState(false);
  const [showNsecLogin, setShowNsecLogin] = useState(false);
  const [showSavedAccountsModal, setShowSavedAccountsModal] = useState(false);
  const [showUnlockKeyModal, setShowUnlockKeyModal] = useState(false);
  const [showGenerateKeyModal, setShowGenerateKeyModal] = useState(false);
  const [showViewNsecModal, setShowViewNsecModal] = useState(false);

  // Relay management states
  const [relayToRemove, setRelayToRemove] = useState<string>("");

  // Account management states
  const [hasSavedAccounts, setHasSavedAccounts] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<
    Array<{ pubkey: string; timestamp: number }>
  >([]);

  const currentHexPubkey = React.useMemo(() => {
    const { hex } = convertPubkeyToHex(storedPubkey);
    return hex;
  }, [storedPubkey]);

  const canViewPersistedNsec = React.useMemo(() => {
    return loginMethod === "nsec" && nsecPersistedThisSession === true;
  }, [loginMethod, nsecPersistedThisSession]);

  // Parse modal state from URL
  const modalState = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return parseModalState(params);
  }, [location.search]);

  // Sync URL modal state with local state
  useEffect(() => {
    if (modalState.settings && !showOptions) {
      setShowSettings(true);
    } else if (!modalState.settings && showOptions) {
      setShowSettings(false);
    }
  }, [modalState.settings, showOptions]);

  useEffect(() => {
    if (modalState.clearAllCaches && !showClearAllCachesConfirm) {
      setShowClearAllCachesConfirm(true);
    } else if (!modalState.clearAllCaches && showClearAllCachesConfirm) {
      setShowClearAllCachesConfirm(false);
    }
  }, [modalState.clearAllCaches, showClearAllCachesConfirm]);

  useEffect(() => {
    if (modalState.clearSavedKeys && !showClearSavedKeysConfirm) {
      setShowClearSavedKeysConfirm(true);
    } else if (!modalState.clearSavedKeys && showClearSavedKeysConfirm) {
      setShowClearSavedKeysConfirm(false);
    }
  }, [modalState.clearSavedKeys, showClearSavedKeysConfirm]);

  useEffect(() => {
    if (modalState.resetPreferences && !showResetPreferencesConfirm) {
      setShowResetPreferencesConfirm(true);
    } else if (!modalState.resetPreferences && showResetPreferencesConfirm) {
      setShowResetPreferencesConfirm(false);
    }
  }, [modalState.resetPreferences, showResetPreferencesConfirm]);

  useEffect(() => {
    if (modalState.clearStoredWallet && !showClearStoredWalletConfirm) {
      setShowClearStoredWalletConfirm(true);
    } else if (!modalState.clearStoredWallet && showClearStoredWalletConfirm) {
      setShowClearStoredWalletConfirm(false);
    }
  }, [modalState.clearStoredWallet, showClearStoredWalletConfirm]);

  useEffect(() => {
    if (modalState.clearKeys && !showClearKeysConfirm) {
      setShowClearKeysConfirm(true);
    } else if (!modalState.clearKeys && showClearKeysConfirm) {
      setShowClearKeysConfirm(false);
    }
  }, [modalState.clearKeys, showClearKeysConfirm]);

  useEffect(() => {
    if (modalState.signOut && !showSignOutConfirm) {
      setShowSignOutConfirm(true);
    } else if (!modalState.signOut && showSignOutConfirm) {
      setShowSignOutConfirm(false);
    }
  }, [modalState.signOut, showSignOutConfirm]);

  useEffect(() => {
    if (modalState.removeRelay && !showRemoveRelayConfirm) {
      setRelayToRemove(modalState.removeRelay);
      setShowRemoveRelayConfirm(true);
    } else if (!modalState.removeRelay && showRemoveRelayConfirm) {
      setShowRemoveRelayConfirm(false);
      setRelayToRemove("");
    }
  }, [modalState.removeRelay, showRemoveRelayConfirm]);

  // Sync URL modal states with local state
  useEffect(() => {
    if (modalState.nsecLogin && !showNsecLogin) {
      setShowNsecLogin(true);
    } else if (!modalState.nsecLogin && showNsecLogin) {
      setShowNsecLogin(false);
    }
  }, [modalState.nsecLogin, showNsecLogin]);

  useEffect(() => {
    if (modalState.savedAccounts && !showSavedAccountsModal) {
      setShowSavedAccountsModal(true);
    } else if (!modalState.savedAccounts && showSavedAccountsModal) {
      setShowSavedAccountsModal(false);
    }
  }, [modalState.savedAccounts, showSavedAccountsModal]);

  useEffect(() => {
    if (modalState.unlockKey && !showUnlockKeyModal) {
      setShowUnlockKeyModal(true);
    } else if (!modalState.unlockKey && showUnlockKeyModal) {
      setShowUnlockKeyModal(false);
    }
  }, [modalState.unlockKey, showUnlockKeyModal]);

  // Update URL state when settings modal state changes
  const updateSettingsModalState = useCallback(
    (open: boolean) => {
      setShowSettings(open);
      const newModalState: ModalState = { ...modalState };
      if (open) {
        newModalState.settings = true;
      } else {
        delete newModalState.settings;
      }
      updateUrlWithModalState(newModalState, navigate, location);
    },
    [modalState, navigate, location]
  );

  // Helper functions to update individual modal states in URL
  const updateModalState = useCallback(
    (key: keyof ModalState, value: any) => {
      const newModalState: ModalState = { ...modalState };
      if (value) {
        newModalState[key] = value;
      } else {
        delete newModalState[key];
      }
      updateUrlWithModalState(newModalState, navigate, location);
    },
    [modalState, navigate, location]
  );

  const updateConfirmationState = useCallback(
    (key: keyof ModalState, show: boolean) => {
      updateModalState(key, show ? true : undefined);
    },
    [updateModalState]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(event.target as Node)
      ) {
        updateSettingsModalState(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside, {
      passive: true,
    });
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [updateSettingsModalState]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Load saved accounts presence when settings open
  useEffect(() => {
    (async () => {
      try {
        const list = await listSavedAccounts();
        setSavedAccounts(list || []);
        setHasSavedAccounts((list || []).length > 0);
      } catch {
        setHasSavedAccounts(false);
      }
    })();
  }, [showOptions, listSavedAccounts]);

  // Listen for saved accounts changes (e.g., when account is deleted during sign out)
  useEffect(() => {
    const handleSavedAccountsChanged = async () => {
      try {
        const list = await listSavedAccounts();
        setSavedAccounts(list || []);
        setHasSavedAccounts((list || []).length > 0);
      } catch {
        setHasSavedAccounts(false);
      }
    };

    window.addEventListener(
      "nostrSavedAccountsChanged",
      handleSavedAccountsChanged
    );
    return () => {
      window.removeEventListener(
        "nostrSavedAccountsChanged",
        handleSavedAccountsChanged
      );
    };
  }, [listSavedAccounts]);

  const handleClearSavedKeys = async () => {
    try {
      const accounts = await listPersistedAccounts();
      for (const acc of accounts || []) {
        try {
          await removePersistedSecret(acc.pubkey);
        } catch {}
      }
      // Broadcast that saved accounts have changed
      try {
        window.dispatchEvent(new CustomEvent("nostrSavedAccountsChanged"));
      } catch {}
    } catch {}
    try {
      localStorage.removeItem("nostrPubkey");
    } catch {}
    try {
      sessionStorage.removeItem("nostrLoginMethod");
    } catch {}
    try {
      sessionStorage.removeItem("nostrNsecPersisted");
    } catch {}
    updateConfirmationState("clearSavedKeys", false);
  };

  const handleClearStoredWallet = async () => {
    try {
      // Import the wallet storage function dynamically to avoid circular imports
      const { removeStoredWalletConnection } = await import(
        "../utils/walletStorage"
      );

      // Get the current user's pubkey for proper cleanup of encrypted wallets
      const currentPubkey =
        storedPubkey || localStorage.getItem("nostrPubkey") || "";
      const pubkeyHex = convertPubkeyToHex(currentPubkey).hex;

      await removeStoredWalletConnection(undefined, { pubkey: pubkeyHex });

      // Disconnect wallet from UI state
      try {
        window.dispatchEvent(new CustomEvent("nostrSignOut"));
      } catch (disconnectError) {
        console.warn(
          "Could not disconnect wallet from UI state:",
          disconnectError
        );
      }

      // Notify other components that wallet connections were cleared
      try {
        window.dispatchEvent(new CustomEvent("walletConnectionCleared"));
      } catch (eventError) {
        console.warn("Could not dispatch wallet cleared event:", eventError);
      }
    } catch (error) {
      console.error("Failed to clear stored wallet:", error);
    }
    updateConfirmationState("clearStoredWallet", false);
  };

  const handleNsecLoginSuccess = (pubkey: string) => {
    setStoredPubkey(pubkey);
    // Contact fetching is now handled by useUserContacts hook
    updateConfirmationState("nsecLogin", false);
  };

  const handleSavedAccountSuccess = (pubkey: string) => {
    setStoredPubkey(pubkey);
    // Contact fetching is now handled by useUserContacts hook
    updateConfirmationState("savedAccounts", false);
  };

  const handleSignOut = () => {
    handleRemoveStoredPubkey();
    updateConfirmationState("signOut", false);
  };

  if (!showOptions) {
    if (hideTriggerButton) {
      return <div style={{ position: "relative" }} ref={settingsRef} />;
    }
    return (
      <div style={{ position: "relative" }} ref={settingsRef}>
        <button
          onClick={() => updateSettingsModalState(!showOptions)}
          style={{
            backgroundColor: "transparent",
            color: "var(--text-color)",
            border: "none",
            cursor: "pointer",
            fontSize: "1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "color 0.3s ease",

            position: "relative",
            padding: "0",
            margin: "0",
          }}
          title="Settings"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }} ref={settingsRef}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        {/* Backdrop */}
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 9999,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
          onClick={() => updateSettingsModalState(false)}
        />

        {/* Modal Container */}
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,

            width: "100vw",
            height: "100vh",
            display: "flex",
            justifyContent: "center",
            alignItems: isMobile ? "flex-start" : "center",
            zIndex: 9999,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: "100vw",
              maxWidth: isMobile ? "none" : "1000px",
              height: isMobile ? "100vh" : "100dvh",
              backgroundColor: "var(--app-bg-color )",
              display: "flex",
              flexDirection: "column",
              pointerEvents: "auto",
              ...(isMobile && {
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
              }),
            }}
          >
            {/* Header */}
            <div
              style={{
                height: 56,
                minHeight: 56,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0rem",
                backgroundColor: "var(--app-bg-color )",
                borderBottom: "1px dotted var(--border-color)",
                position: "sticky",
                top: 0,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  transform: "translateX(-50%)",
                  pointerEvents: "none",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    padding: 0,
                    color: "var(--text-color)",

                    fontSize: "1rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    backgroundColor: "var(--app-bg-color)",
                    zIndex: 1599,
                  }}
                >
                  Settings
                </h3>
              </div>
              <div style={{ width: "2rem" }}></div>
              <button
                onClick={() => updateSettingsModalState(false)}
                style={{
                  backgroundColor: "transparent",
                  color: "var(--text-color)",
                  padding: "0.25rem 0.5rem",
                  cursor: "pointer",
                  fontSize: "1.25rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  height: "2rem",
                  justifyContent: "center",
                  minHeight: "unset",
                }}
                title="Close settings"
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div
              style={{
                flex: 1,
                width: "100%",
                maxWidth: isMobile ? "100%" : "800px",
                margin: "0 auto",
                paddingTop: isMobile ? "1rem" : "1rem",
                paddingBottom: isMobile ? "6rem" : 0,
                overflowY: "auto",
                paddingRight: isMobile ? "0.5rem" : "1rem",
                WebkitOverflowScrolling: "touch",
                minHeight: 0,
              }}
            >
              <div
                style={{
                  backgroundColor: "var(--app-bg-color)",
                  padding: isMobile ? "0 0.5rem" : "1rem",
                  paddingBottom: isMobile
                    ? "calc(3rem + var(--safe-area-inset-bottom))"
                    : "1rem",
                  boxSizing: "border-box",
                  width: "100%",
                }}
              >
                {/* About Section */}
                <AboutSection isMobile={isMobile} />

                {/* Modes and Filters Container */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: isMobile ? "column" : "row",
                    gap: isMobile ? "0" : "2rem",
                    width: "100%",
                  }}
                >
                  <ModesSection setAsciiCache={setAsciiCache} />

                  <FiltersSection isMobile={isMobile} />
                </div>
                <div id="user-login-section">
                  <UserLoginSection
                    storedPubkey={storedPubkey}
                    setStoredPubkey={setStoredPubkey}
                    pubkeyError={pubkeyError}
                    setPubkeyError={setPubkeyError}
                    pastedPubkey={pastedPubkey}
                    setPastedPubkey={setPastedPubkey}
                    contactLoadError={contactLoadError}
                    metadata={metadata}
                    isMobile={isMobile}
                    onSignOut={() => updateConfirmationState("signOut", true)}
                    onShowUnlockKey={() =>
                      updateConfirmationState("unlockKey", true)
                    }
                    onShowSavedAccounts={() => {
                      updateConfirmationState("savedAccounts", true);
                    }}
                    onShowNsecLogin={() =>
                      updateConfirmationState("nsecLogin", true)
                    }
                    onShowGenerateKey={() => setShowGenerateKeyModal(true)}
                    onShowViewNsec={() => setShowViewNsecModal(true)}
                    canViewPersistedNsec={canViewPersistedNsec}
                    hasSavedAccounts={hasSavedAccounts}
                  />
                </div>
                <div id="wallet-section">
                  <WalletSection isMobile={isMobile} />
                </div>

                <div id="blossom-settings">
                  <BlossomSettingsSection isMobile={isMobile} />
                </div>

                <BookmarksSection isMobile={isMobile} />

                <CacheSection
                  cacheStats={{
                    totalNotes: cacheBreakdown.breakdown.feedQueries,
                    totalSize: cacheBreakdown.sizeBreakdown.feedQueriesSize,
                    filterStats: {},
                  }}
                  metadataCount={cacheBreakdown.breakdown.metadataQueries}
                  contactsCount={cacheBreakdown.breakdown.contactsQueries}
                  asciiCacheCount={
                    asciiCacheCountOverride !== undefined
                      ? asciiCacheCountOverride
                      : Object.keys(asciiCache || {}).length
                  }
                  onClearAllCaches={
                    onClearAllCaches
                      ? () => updateConfirmationState("clearAllCaches", true)
                      : undefined
                  }
                  onClearSavedKeys={() =>
                    updateConfirmationState("clearSavedKeys", true)
                  }
                  onClearStoredWallet={() =>
                    updateConfirmationState("clearStoredWallet", true)
                  }
                  onResetPreferences={
                    resetPreferences
                      ? () => updateConfirmationState("resetPreferences", true)
                      : undefined
                  }
                />

                <div id="relay-management">
                  <EnhancedRelayManagementSection
                    relayUrls={relayUrls}
                    relayStatuses={relayStatuses}
                    addRelay={addRelay}
                    restoreDefaultRelays={restoreDefaultRelays}
                    onRemoveRelay={(url) => {
                      updateModalState("removeRelay", url);
                    }}
                    isMobile={isMobile}
                    cycleRelayPermission={cycleRelayPermission}
                    getRelayPermission={getRelayPermission}
                  />
                </div>

                <ProofOfWorkSection isMobile={isMobile} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Clear Keys Confirmation Modal */}
      {showClearKeysConfirm && (
        <ClearCacheModal
          isClearingCache={isClearingCache}
          onClearCache={async () => {
            // Use the clear keys function (this will also log out the user)
            if (onClearKeys) {
              await onClearKeys();
            }
            // Refresh cache stats to show updated values
            await refreshPersistedSummary();
            updateConfirmationState("clearKeys", false);
          }}
          onClose={async () => {
            updateConfirmationState("clearKeys", false);
          }}
          title="Clear Keys & Logout"
          message="This will clear all stored keys and log you out. You will need to sign in again."
          confirmLabel="Clear Keys & Logout"
        />
      )}

      {/* Clear All Caches Confirmation Modal */}
      {showClearAllCachesConfirm && (
        <ClearCacheModal
          isClearingCache={isClearingCache}
          onClearCache={async () => {
            try {
              // Use the clear all caches function (this will also log out the user)
              if (onClearAllCaches) {
                await onClearAllCaches();
              }

              // Close the confirmation modal first
              updateConfirmationState("clearAllCaches", false);

              // Close the settings dropdown since user will be logged out
              updateSettingsModalState(false);

              // Give a moment for logout to complete, then refresh stats
              setTimeout(async () => {
                try {
                  await refreshPersistedSummary();
                } catch (error) {
                  console.warn(
                    "Could not refresh cache stats after logout:",
                    error
                  );
                }
              }, 100);
            } catch (error) {
              console.error("Error clearing all caches:", error);
              updateConfirmationState("clearAllCaches", false);
            }
          }}
          onClose={async () => {
            updateConfirmationState("clearAllCaches", false);
          }}
          title="Clear Everything & Logout"
          message="This will remove ALL stored data including notes, contacts, metadata, preferences, settings, and keys. You will be logged out. This action cannot be undone."
          confirmLabel="Clear Everything & Logout"
        />
      )}

      {/* Clear Saved Keys Confirmation Modal */}
      {showClearSavedKeysConfirm && (
        <ClearCacheModal
          isClearingCache={false}
          onClearCache={async () => {
            try {
              await handleClearSavedKeys();
              updateConfirmationState("clearSavedKeys", false);

              // Refresh cache stats to show updated values
              setTimeout(async () => {
                try {
                  await refreshPersistedSummary();
                } catch (error) {
                  console.warn(
                    "Could not refresh cache stats after clearing keys:",
                    error
                  );
                }
              }, 100);
            } catch (error) {
              console.error("Error clearing saved keys:", error);
              updateConfirmationState("clearSavedKeys", false);
            }
          }}
          onClose={async () => {
            updateConfirmationState("clearSavedKeys", false);
            return Promise.resolve();
          }}
          title="Clear Saved Keys"
          message="This will delete all saved encrypted secrets and local login data (npubs/nsecs) stored on this device."
          confirmLabel="Clear Saved Keys"
        />
      )}

      {/* Clear Stored Wallet Confirmation Modal */}
      {showClearStoredWalletConfirm && (
        <ClearCacheModal
          isClearingCache={false}
          onClearCache={async () => {
            try {
              await handleClearStoredWallet();
              updateConfirmationState("clearStoredWallet", false);

              // Refresh cache stats to show updated values
              setTimeout(async () => {
                try {
                  await refreshPersistedSummary();
                } catch (error) {
                  console.warn(
                    "Could not refresh cache stats after clearing wallet:",
                    error
                  );
                }
              }, 100);
            } catch (error) {
              console.error("Error clearing stored wallet:", error);
              updateConfirmationState("clearStoredWallet", false);
            }
          }}
          onClose={async () => {
            updateConfirmationState("clearStoredWallet", false);
            return Promise.resolve();
          }}
          title="Clear Stored Wallet"
          message="This will delete your saved NWC wallet connection. You will need to reconnect your wallet manually."
          confirmLabel="Clear Stored Wallet"
        />
      )}

      {/* Reset Preferences Confirmation Modal */}
      {showResetPreferencesConfirm && (
        <ClearCacheModal
          isClearingCache={false}
          onClearCache={async () => {
            try {
              if (resetPreferences) {
                await resetPreferences();
              }
              updateConfirmationState("resetPreferences", false);

              // Refresh cache stats to show updated values
              setTimeout(async () => {
                try {
                  await refreshPersistedSummary();
                } catch (error) {
                  console.warn(
                    "Could not refresh cache stats after resetting preferences:",
                    error
                  );
                }
              }, 100);
            } catch (error) {
              console.error("Error resetting preferences:", error);
              updateConfirmationState("resetPreferences", false);
            }
          }}
          onClose={async () => {
            updateConfirmationState("resetPreferences", false);
            return Promise.resolve();
          }}
          title="Reset Preferences"
          message="This will reset all user preferences to their default values. Your data will remain but settings will be reset."
          confirmLabel="Reset Preferences"
        />
      )}

      {/* Remove Relay Confirmation Modal */}
      {showRemoveRelayConfirm && (
        <ClearCacheModal
          isClearingCache={false}
          onClearCache={async () => {
            removeRelay(relayToRemove);
            updateModalState("removeRelay", undefined);
          }}
          onClose={async () => {
            updateModalState("removeRelay", undefined);
            return Promise.resolve();
          }}
          title="Remove Relay"
          message={`This will remove the relay "${relayToRemove.replace(
            "wss://",
            ""
          )}" from your configuration.`}
          confirmLabel="Remove Relay"
        />
      )}

      {/* Nsec Login Modal */}
      <NsecLoginModal
        isOpen={showNsecLogin}
        onClose={() => updateConfirmationState("nsecLogin", false)}
        onSuccess={handleNsecLoginSuccess}
      />

      {/* Generate Key Modal */}
      <GenerateKeyModal
        isOpen={showGenerateKeyModal}
        onClose={() => setShowGenerateKeyModal(false)}
        onSuccess={(pk) => {
          setStoredPubkey(pk);
          setShowGenerateKeyModal(false);
        }}
      />

      {/* View nsec Modal */}
      <ViewNsecModal
        isOpen={showViewNsecModal}
        onClose={() => setShowViewNsecModal(false)}
        pubkeyHex={currentHexPubkey}
      />

      {/* Sign Out Modal */}
      <SignOutModal
        isOpen={showSignOutConfirm}
        onClose={() => updateConfirmationState("signOut", false)}
        onSignOut={handleSignOut}
      />

      {/* Saved Accounts Modal */}
      <SavedAccountsModal
        isOpen={showSavedAccountsModal}
        onClose={() => updateConfirmationState("savedAccounts", false)}
        onSuccess={handleSavedAccountSuccess}
        savedAccounts={savedAccounts}
        metadata={metadata}
      />

      {/* Unlock Key Modal */}
      {showUnlockKeyModal && (
        <UnlockKeyModal
          isOpen={showUnlockKeyModal}
          onClose={() => updateConfirmationState("unlockKey", false)}
          actionLabel="Continue"
          currentPubkeyHex={currentHexPubkey}
          onUnlocked={() => {
            updateConfirmationState("unlockKey", false);
            return Promise.resolve();
          }}
          getDisplayNameForPubkey={() => ""}
          metadata={metadata}
        />
      )}
    </div>
  );
};

export default SettingsDropdown;

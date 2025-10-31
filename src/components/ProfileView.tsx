import React, {
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { NostrContext } from "../contexts/NostrContext";
import { useRelayManager } from "../hooks/useRelayManager";
import { useNostrFeedState } from "../hooks/useNostrFeedState";
import { useDisplayNames } from "../hooks/useDisplayNames";
import {
  decodeRouteParam,
  isSelfProfile,
  formatTruncated,
} from "../utils/profileUtils";
import { DEFAULT_RELAY_URLS } from "../utils/nostr/constants";
import { useProfileModals } from "../hooks/useProfileModals";
import { useUserContactsContext } from "../contexts/UserContactsContext";
import ProfileHeader from "./profile/ProfileHeader";
import ProfileSummary from "./profile/ProfileSummary";
import FollowSection from "./profile/FollowSection";
import ProfileFields from "./profile/ProfileFields";

import ProfileModals from "./profile/ProfileModals";
import { RelayDiscoveryModal } from "./profile/RelayDiscoveryModal";
import { SavedAccountsModal } from "./settings/SavedAccountsModal";
import { NsecLoginModal } from "./settings/NsecLoginModal";
import LoginOptionsModal from "./LoginOptionsModal";
import {
  Outlet,
  useNavigate,
  useLocation,
  useParams,
} from "@tanstack/react-router";
import {
  ProfileContainer,
  ProfileContentArea,
  ProfileSectionContainer,
} from "./profile/ProfileLayout";
import { useQueryClient } from "@tanstack/react-query";
import { useLoginState } from "../hooks/useLoginState";
import { useScrollRestoration } from "../hooks/useScrollRestoration";
import { useNostrifyProfileMetadata } from "../hooks/useNostrifyProfile";
import { useUIStore } from "./lib/useUIStore";

const ProfileView: React.FC = () => {
  const {
    nostrClient,
    pubkey: userPubkey,
    loginMethod,
    nsecPersistedThisSession,
    listSavedAccounts,
  } = useContext(NostrContext);
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const saveFunctionRef = useRef<(() => Promise<void>) | null>(null);
  const state = useNostrFeedState();
  const { relayUrls, writeRelays, readRelays, relayPermissions, addRelay } =
    useRelayManager({
      nostrClient,
      initialRelays: DEFAULT_RELAY_URLS,
      pubkeyHex: userPubkey,
    });

  // Authentication state management
  const loginState = useLoginState();
  const [savedAccounts, setSavedAccounts] = useState<
    Array<{ pubkey: string; timestamp: number }>
  >([]);

  // Debug: Log writeRelays to see if filtering is working
  useEffect(() => {}, [writeRelays, relayUrls]);

  // Use display names system like the main feed
  const { getDisplayNameForPubkey, addDisplayNamesFromMetadata } =
    useDisplayNames(readRelays);

  // Parse route parameter to get profile identity
  const { npub: routeParam } = useParams({ strict: false }) as { npub: string };
  const [pubkeyHex, setPubkeyHex] = useState<string | null>(null);
  const [npubBech32, setNpubBech32] = useState<string | null>(null);
  const [isResolvingIdentity, setIsResolvingIdentity] =
    useState<boolean>(false);

  // Route parameter parsing effect
  useEffect(() => {
    console.log("🔍 ProfileView route param effect:", { routeParam });

    // Immediately clear state when route param changes to prevent stale data
    setPubkeyHex(null);
    setNpubBech32(null);
    setIsResolvingIdentity(true);

    if (!routeParam) {
      console.log("❌ No route param, clearing state");
      setIsResolvingIdentity(false);
      return;
    }

    const { hex, npub, error } = decodeRouteParam(routeParam);
    console.log("🔍 Decoded route param:", { routeParam, hex, npub, error });

    if (error || !hex || !npub) {
      console.error("Failed to decode route param:", routeParam, error);
      setPubkeyHex(null);
      setNpubBech32(null);
      setIsResolvingIdentity(false);
      return;
    }

    console.log("✅ Setting profile identity:", { hex, npub });
    setPubkeyHex(hex);
    setNpubBech32(npub);
    // Keep isResolvingIdentity true until metadata loading completes
    // This ensures we don't show incomplete profile data
  }, [routeParam]);

  // Computed values
  const isSelf = useMemo(() => {
    return isSelfProfile(pubkeyHex, userPubkey);
  }, [pubkeyHex, userPubkey]);

  // Read UI toggles from global UI store for consistent behavior across routes
  const { useAscii: uiUseAscii, useColor: uiUseColor } = useUIStore((s) => ({
    useAscii: s.useAscii,
    useColor: s.useColor,
  }));

  // Fetch metadata using nostrify system
  const { metadata, isLoading: isLoadingMeta } = useNostrifyProfileMetadata({
    pubkeyHex: pubkeyHex || "",
    relayUrls: readRelays,
    enabled: Boolean(pubkeyHex && readRelays.length > 0),
    realtimeEnabled: false, // Real-time updates can be enabled later if needed
  });

  // Debug metadata loading
  useEffect(() => {
    console.log("🔍 ProfileView metadata state:", {
      pubkeyHex: pubkeyHex?.slice(0, 8),
      metadata,
      isLoadingMeta,
      readRelaysLength: readRelays.length,
      enabled: Boolean(pubkeyHex && readRelays.length > 0),
      showProfileMeta: state.showProfileMeta,
    });
  }, [
    pubkeyHex,
    metadata,
    isLoadingMeta,
    readRelays.length,
    state.showProfileMeta,
  ]);

  // Clear resolving identity when metadata loading completes
  useEffect(() => {
    if (pubkeyHex && !isLoadingMeta) {
      console.log(
        "✅ Metadata loading completed, clearing identity resolution state"
      );
      setIsResolvingIdentity(false);
    }
  }, [pubkeyHex, isLoadingMeta]);

  // Display title computation
  const displayTitle = useMemo(() => {
    if (!pubkeyHex) return "Profile";

    const displayName = getDisplayNameForPubkey(pubkeyHex);
    if (displayName) return displayName;

    if (metadata) {
      const metaDisplayName =
        metadata.display_name || (metadata as any).displayName || metadata.name;
      if (metaDisplayName) return metaDisplayName.trim();
    }

    return npubBech32 ? formatTruncated(npubBech32) : "Profile";
  }, [pubkeyHex, metadata, getDisplayNameForPubkey, npubBech32]);

  // Update display names when metadata changes
  useEffect(() => {
    if (metadata && pubkeyHex) {
      addDisplayNamesFromMetadata({ [pubkeyHex]: metadata });
    }
  }, [metadata, pubkeyHex, addDisplayNamesFromMetadata]);

  // Metadata for the currently signed-in user (used by UnlockKeyModal to show correct avatar)
  const currentUserMetadataForModal = userPubkey
    ? state.metadata[userPubkey] || null
    : null;

  // Remove full-screen transition overlay; sections handle their own loading

  // Handle successful profile update
  const handleProfileUpdateSuccess = useCallback(
    async (publishedMetadata?: any) => {
      if (userPubkey && pubkeyHex && publishedMetadata) {
        const targetPubkeyHex = pubkeyHex;

        // Optimistically update the UI with the data we just published
        const optimisticMetadata = {
          name: publishedMetadata.name || "",
          display_name:
            publishedMetadata.display_name ||
            publishedMetadata.displayName ||
            "",
          picture: publishedMetadata.picture || "",
          about: publishedMetadata.about || "",
          nip05: publishedMetadata.nip05 || "",
          website: publishedMetadata.website || "",
          banner: publishedMetadata.banner || "",
          lud16: publishedMetadata.lud16 || "",
        };

        // Update global metadata state immediately
        state.setMetadata((prev) => ({
          ...prev,
          [targetPubkeyHex]: optimisticMetadata,
        }));

        // Update display names cache immediately
        addDisplayNamesFromMetadata({
          [targetPubkeyHex]: optimisticMetadata,
        });

        // Invalidate profile metadata queries to refetch latest - use unified cache key
        try {
          await queryClient.invalidateQueries({
            queryKey: ["metadata", targetPubkeyHex],
          });
        } catch {}

        // Clear the cached metadata for this user
        // Metadata is now handled by TanStack Query persistence - invalidation handled automatically

        // Background refresh with smart update logic
        // Only overwrite optimistic data if relay data is actually newer
        setTimeout(async () => {
          try {
            const { fetchUserMetadata } = await import(
              "../utils/profileMetadataUtils"
            );
            const result = await fetchUserMetadata({
              pubkeyHex: targetPubkeyHex,
              relayUrls: readRelays,
            });

            if (result.metadata && !result.error) {
              // Check if relay data contains our published changes
              const relayAbout = result.metadata.about || "";
              const optimisticAbout = optimisticMetadata.about || "";

              // Only update if relay data exactly matches what we published
              if (relayAbout === optimisticAbout) {
                // Update with relay data to confirm persistence
                state.setMetadata((prev) => ({
                  ...prev,
                  [targetPubkeyHex]: result.metadata!,
                }));

                addDisplayNamesFromMetadata({
                  [targetPubkeyHex]: result.metadata!,
                });

                // Ensure any views depending on query data refresh - use unified cache key
                try {
                  await queryClient.invalidateQueries({
                    queryKey: ["metadata", targetPubkeyHex],
                  });
                } catch {}
              }
              // If relay data differs, keep optimistic data (it's more up-to-date)
            }
          } catch (error) {
            // If background refresh fails, keep optimistic data
          }
        }, 3000); // Wait 3 seconds for relay propagation
      }
    },
    [userPubkey, pubkeyHex, state, readRelays, addDisplayNamesFromMetadata]
  );

  // Modal management
  const {
    showContactsModal,
    showUnlockModal,
    unlockActionLabel,
    showEditModal,
    updateContactsModalState,
    updateEditModalState,
    openUnlockModal,
    closeUnlockModal,
    executePendingAction,
  } = useProfileModals();

  // Relay discovery modal state
  const [showRelayModal, setShowRelayModal] = useState(false);

  // State to trigger mute modal after unlock
  const [triggerMuteModalAfterUnlock, setTriggerMuteModalAfterUnlock] =
    useState(false);

  // Follow functionality
  const {
    isFollowing: isFollowingUser,
    followUser,
    unfollowUser,
    isFollowBusy,
    isUnfollowBusy,
  } = useUserContactsContext();

  // Check if the current user is following this profile
  // This needs to be reactive to contacts changes for optimistic updates
  const isFollowing = pubkeyHex ? isFollowingUser(pubkeyHex) : false;

  // Check if user is properly authenticated for following
  const isAuthenticatedForFollowing = useCallback(() => {
    // User must have a pubkey and be logged in with a method that can sign
    if (!userPubkey) return false;

    // If logged in with NIP-07, they can follow
    if (loginMethod === "nip07") return true;

    // If logged in with nsec, they can follow
    if (loginMethod === "nsec") return true;

    // If they have a pubkey but no login method, they can't follow
    return false;
  }, [userPubkey, loginMethod]);

  // Check if user needs to unlock their key
  const needsUnlock = useCallback(async () => {
    if (!userPubkey || loginMethod !== "nsec") return false;

    try {
      const accounts = await listSavedAccounts();
      const hasSaved = accounts.some(
        (a) => a.pubkey.toLowerCase() === userPubkey.toLowerCase()
      );

      // Import the function to check if key is in memory
      const { getInMemorySecretKeyHex } = await import("../utils/nostr/nip07");
      const hasKeyInMemory = Boolean(getInMemorySecretKeyHex());

      const needsUnlockResult = hasSaved && !hasKeyInMemory;
      return needsUnlockResult;
    } catch (error) {
      console.error("Error in needsUnlock:", error);
      return false;
    }
  }, [userPubkey, loginMethod, listSavedAccounts, nsecPersistedThisSession]);

  // Handler for follow button click with authentication checks
  const handleFollowClick = async () => {
    if (!pubkeyHex) return;

    // Check if user is authenticated
    if (!isAuthenticatedForFollowing()) {
      loginState.requireLogin(async () => {
        const result = await followUser(pubkeyHex);
        if (!result.success) {
          console.error("Follow failed:", result.error);
        }
      }, "follow");
      return;
    }

    // Check if user needs to unlock their key
    const needsUnlockResult = await needsUnlock();

    if (needsUnlockResult) {
      openUnlockModal("Follow", "follow");
      return;
    }
    // Proceed with follow
    const result = await followUser(pubkeyHex);
    if (!result.success) {
      console.error("Follow failed:", result.error);
    }
  };

  // Handler for unfollow button click
  const handleUnfollowClick = async () => {
    if (!pubkeyHex) return;

    // Check if user is authenticated
    if (!isAuthenticatedForFollowing()) {
      loginState.requireLogin(async () => {
        const result = await unfollowUser(pubkeyHex);
        if (!result.success) {
          console.error("Unfollow failed:", result.error);
        }
      }, "unfollow");
      return;
    }

    // Check if user needs to unlock their key
    if (await needsUnlock()) {
      openUnlockModal("Unfollow", "follow");
      return;
    }

    // Proceed with unfollow
    const result = await unfollowUser(pubkeyHex);
    if (!result.success) {
      console.error("Unfollow failed:", result.error);
    }
  };

  // Handler for pending actions after unlock
  const executePendingActionAfterUnlock = useCallback(
    async (_selectedPubkeyHex: string) => {
      const action = executePendingAction();

      if (action === "follow" && pubkeyHex) {
        await followUser(pubkeyHex);
      } else if (action === "mute") {
        // For mute actions, trigger the mute confirmation modal
        setTriggerMuteModalAfterUnlock(true);
      }
    },
    [executePendingAction, followUser, pubkeyHex]
  );

  // Load saved accounts when needed
  const loadSavedAccounts = useCallback(async () => {
    try {
      const accounts = await listSavedAccounts();
      setSavedAccounts(accounts);
    } catch (error) {
      console.error("Failed to load saved accounts:", error);
      setSavedAccounts([]);
    }
  }, [listSavedAccounts]);

  // Load saved accounts when the saved accounts modal is shown
  useEffect(() => {
    if (loginState.showSavedAccountsModal) {
      loadSavedAccounts();
    }
  }, [loginState.showSavedAccountsModal, loadSavedAccounts]);

  // Handler for adding a relay from discovery
  const handleAddRelayFromDiscovery = (relayUrl: string) => {
    // Add as read-only relay
    if (relayUrls.includes(relayUrl)) {
      return;
    }

    try {
      // Add as read-only relay
      addRelay(relayUrl, "read");
    } catch (error) {
      console.error("Failed to add relay:", error);
    }
  };

  // No full screen loading page

  const navigate = useNavigate();
  const location = useLocation();
  const contentAreaRef = useRef<HTMLDivElement>(null);

  // Handler for hashtag clicks - navigate to main feed with hashtag filter
  // handleHashtagClick removed - unused function

  // Determine current route based on pathname
  const getCurrentRoute = () => {
    const pathname = location.pathname;
    if (pathname.endsWith("/notes")) return "notes";
    if (pathname.endsWith("/followers")) return "followers";
    if (pathname.endsWith("/following")) return "following";
    if (pathname.endsWith("/relays")) return "relays";
    if (pathname.endsWith("/mute-list")) return "mute-list";
    // If we're at the base profile path (ends with npub), it's the index route which shows notes
    if (pathname.match(/\/npub\/[^/]+$/)) return "notes";
    return "notes"; // Default to notes if no specific route
  };

  const currentRoute = getCurrentRoute();

  // Attach scroll restoration to the actual scrolling content area
  useScrollRestoration(
    contentAreaRef,
    pubkeyHex
      ? `profile-content:${pubkeyHex}:${currentRoute}`
      : `profile-content:unknown:${currentRoute}`
  );

  return (
    <ProfileContainer isMobile={state.isMobile}>
      <ProfileHeader
        displayTitle={displayTitle}
        npubBech32={npubBech32}
        isMobile={state.isMobile}
        showEdit={isSelf}
        onEditClick={() => updateEditModalState(!showEditModal)}
        isEditModalOpen={showEditModal}
        onBackClick={
          showEditModal ? () => updateEditModalState(false) : undefined
        }
        onSaveClick={
          showEditModal
            ? () => {
                if (saveFunctionRef.current) {
                  saveFunctionRef.current();
                }
              }
            : undefined
        }
        isSaving={isSaving}
        isFollowing={isFollowing}
        isFollowBusy={isFollowBusy || isUnfollowBusy}
        onToggleFollow={() =>
          isFollowing ? handleUnfollowClick() : handleFollowClick()
        }
      />

      {!showEditModal ? (
        <ProfileContentArea isMobile={state.isMobile} ref={contentAreaRef}>
          {/* Left/top: Profile summary */}
          <ProfileSectionContainer isMobile={state.isMobile}>
            <ProfileSummary
              pubkeyHex={pubkeyHex}
              npubBech32={npubBech32}
              metadata={metadata}
              displayTitle={displayTitle}
              useAscii={uiUseAscii}
              useColor={uiUseColor}
              getDisplayNameForPubkey={getDisplayNameForPubkey}
              relayUrls={writeRelays.length > 0 ? writeRelays : relayUrls}
              relayPermissions={relayPermissions}
              onShowUnlockKey={openUnlockModal}
              isSelf={isSelf}
              onShowMuteList={() =>
                navigate({
                  to: "/npub/$npub/mute-list",
                  params: { npub: npubBech32 || "" },
                })
              }
              currentRoute={currentRoute}
              triggerMuteModalAfterUnlock={triggerMuteModalAfterUnlock}
              onClearTriggerMuteModal={() =>
                setTriggerMuteModalAfterUnlock(false)
              }
            />

            <FollowSection
              followError={null}
              onShowNotes={() =>
                navigate({
                  to: "/npub/$npub/notes",
                  params: { npub: npubBech32 || "" },
                })
              }
              onShowFollowers={() =>
                navigate({
                  to: "/npub/$npub/followers",
                  params: { npub: npubBech32 || "" },
                })
              }
              onShowFollowing={() =>
                navigate({
                  to: "/npub/$npub/following",
                  params: { npub: npubBech32 || "" },
                })
              }
              onShowRelays={() =>
                navigate({
                  to: "/npub/$npub/relays",
                  params: { npub: npubBech32 || "" },
                })
              }
              showMeta={state.showProfileMeta}
              onToggleMeta={() =>
                state.setShowProfileMeta(!state.showProfileMeta)
              }
              currentRoute={currentRoute}
            />

            {state.showProfileMeta && (
              <div
                style={{
                  ...(state.isMobile && {
                    position: "fixed",
                    top: "calc(50px + var(--safe-area-inset-top) + 9.5rem)",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    overflowY: "auto",
                    backgroundColor: "var(--app-bg-color)",
                    borderTop: "1px dotted var(--border-color)",
                    zIndex: 100,
                    padding: "1rem",
                  }),
                }}
              >
                {isResolvingIdentity ? (
                  <div
                    style={{
                      padding: "1rem",
                      textAlign: "center",
                      color: "var(--text-color)",
                      opacity: 0.7,
                    }}
                  >
                    Loading profile...
                  </div>
                ) : pubkeyHex ? (
                  <ProfileFields
                    key={pubkeyHex} // Force remount when pubkeyHex changes
                    metadata={metadata}
                    isLoadingMeta={isLoadingMeta}
                    pubkeyHex={pubkeyHex}
                  />
                ) : null}
              </div>
            )}
          </ProfileSectionContainer>

          {/* Right/bottom: Nested route outlet (notes/followers/following/relays) */}
          <div
            style={{
              position: "relative",
              flex: 1,
              minHeight: 0,
              height: "100%",
              overflow: "hidden",
            }}
          >
            <Outlet key={pubkeyHex} />
          </div>
        </ProfileContentArea>
      ) : (
        <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
          <ProfileModals
            showContactsModal={null}
            pubkeyHex={pubkeyHex}
            relayUrls={writeRelays.length > 0 ? writeRelays : relayUrls}
            relayPermissions={relayPermissions}
            onCloseContactsModal={() => {}}
            showUnlockModal={false}
            userPubkey={userPubkey}
            // Use the viewed profile's metadata to prefill the edit modal
            metadata={metadata}
            onCloseUnlockModal={() => {}}
            onUnlocked={(_selectedPubkeyHex: string) => Promise.resolve()}
            getDisplayNameForPubkey={getDisplayNameForPubkey}
            showEditModal={showEditModal}
            onCloseEditModal={() => updateEditModalState(false)}
            onSaveRequest={(saveFn) => {
              saveFunctionRef.current = saveFn;
            }}
            onSavingStateChange={setIsSaving}
            onProfileUpdateSuccess={handleProfileUpdateSuccess}
            isLoadingMeta={isLoadingMeta}
          />
        </div>
      )}

      {/* Render other modals when edit modal is not open */}
      {!showEditModal && (
        <ProfileModals
          showContactsModal={showContactsModal}
          pubkeyHex={pubkeyHex}
          relayUrls={writeRelays.length > 0 ? writeRelays : relayUrls}
          relayPermissions={relayPermissions}
          onCloseContactsModal={() => updateContactsModalState(null)}
          showUnlockModal={showUnlockModal}
          userPubkey={userPubkey}
          metadata={currentUserMetadataForModal}
          onCloseUnlockModal={closeUnlockModal}
          onUnlocked={executePendingActionAfterUnlock}
          getDisplayNameForPubkey={getDisplayNameForPubkey}
          unlockActionLabel={unlockActionLabel}
          showEditModal={false}
          onCloseEditModal={() => {}}
          onSaveRequest={(saveFn) => {
            saveFunctionRef.current = saveFn;
          }}
          onSavingStateChange={setIsSaving}
          onProfileUpdateSuccess={handleProfileUpdateSuccess}
          isLoadingMeta={isLoadingMeta}
        />
      )}

      {/* Relay Discovery Modal */}
      <RelayDiscoveryModal
        isOpen={showRelayModal}
        onClose={() => setShowRelayModal(false)}
        userPubkey={pubkeyHex || ""}
        displayName={displayTitle}
        relayUrls={readRelays}
        onAddRelay={handleAddRelayFromDiscovery}
        userCurrentRelays={relayUrls}
        isMobile={state.isMobile}
      />

      {/* Authentication Modals */}

      {/* Login Options Modal */}
      <LoginOptionsModal
        isOpen={loginState.showLoginOptionsModal}
        onClose={loginState.handleLoginCancel}
        onSuccess={loginState.handleLoginSuccess}
        onShowSavedAccounts={loginState.handleShowSavedAccounts}
        onShowNsecLogin={loginState.handleShowNsecLogin}
        actionName={
          loginState.pendingAction?.actionName || "access this feature"
        }
      />

      {/* Saved Accounts Modal */}
      {loginState.showSavedAccountsModal && (
        <SavedAccountsModal
          isOpen={loginState.showSavedAccountsModal}
          onClose={loginState.handleLoginCancel}
          onSuccess={loginState.handleLoginSuccess}
          savedAccounts={savedAccounts}
          metadata={state.metadata}
        />
      )}

      {/* Nsec Login Modal */}
      {loginState.showNsecLoginModal && (
        <NsecLoginModal
          isOpen={loginState.showNsecLoginModal}
          onClose={loginState.handleLoginCancel}
          onSuccess={loginState.handleLoginSuccess}
        />
      )}
    </ProfileContainer>
  );
};

export default ProfileView;

import React, {
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
} from "react";
import type { Metadata } from "../../types/nostr/types";
import { SimplePool } from "nostr-tools";
import {
  nip07SignEvent,
  hasInMemorySecretKey,
  hasNip07,
} from "../../utils/nostr/nip07";
import { filterRelaysByEventKind } from "../../utils/nostr/publish";
import type { RelayPermission } from "../../types/nostr/types";
import { createInputStyle } from "../settings/settingsUtils";
import { TreeList, TreeListItem } from "../settings/TreeListItem";
import UnlockKeyModal from "../UnlockKeyModal";
import { useHaptic } from "use-haptic";
import {
  prepareMetadataForModal,
  getCurrentPubkeyHex,
} from "../../utils/nostr/pubkeyUtils";
import LoadingSpinner from "../ui/LoadingSpinner";
import LoadingTextPlaceholder from "../ui/LoadingTextPlaceholder";

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  relayUrls: string[];
  relayPermissions?: Map<string, RelayPermission>;
  currentMetadata: Partial<Metadata> & { banner?: string; lud16?: string };
  mountWithinContainer?: boolean;
  onSaveRequest?: (saveFunction: () => Promise<void>) => void;
  onSavingStateChange?: (isSaving: boolean) => void;
  onProfileUpdateSuccess?: (publishedContent?: any) => Promise<void>;
  userPubkey?: string;
  getDisplayNameForPubkey: (pubkey: string) => string;
  isLoadingMeta?: boolean;
}

interface RelayStatus {
  url: string;
  status: "pending" | "success" | "failed";
  error?: string;
}

const ProfileEditModal: React.FC<ProfileEditModalProps> = ({
  isOpen,
  onClose,
  relayUrls,
  relayPermissions,
  currentMetadata,
  mountWithinContainer = false,
  onSaveRequest,
  onSavingStateChange,
  onProfileUpdateSuccess,
  userPubkey,
  getDisplayNameForPubkey,
  isLoadingMeta = false,
}) => {
  type DirtyFields = {
    name?: boolean;
    about?: boolean;
    picture?: boolean;
    banner?: boolean;
    nip05?: boolean;
    lud16?: boolean;
  };
  const [name, setName] = useState<string>("");
  const [about, setAbout] = useState<string>("");
  const [picture, setPicture] = useState<string>("");
  const [banner, setBanner] = useState<string>("");
  const [nip05, setNip05] = useState<string>("");
  const [lud16, setLud16] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastingComplete, setBroadcastingComplete] = useState(false);
  const [relayStatuses, setRelayStatuses] = useState<RelayStatus[]>([]);
  const [isFormReady, setIsFormReady] = useState(false);
  const isMobile = useMemo(() => window.innerWidth < 640, []);

  // Track whether we have initialized form values for this open cycle
  const hasInitializedRef = useRef<boolean>(false);
  // Track which fields the user has edited to prevent overwriting with incoming metadata
  const dirtyFieldsRef = useRef<DirtyFields>({});
  const markFieldDirty = useCallback((field: keyof DirtyFields) => {
    dirtyFieldsRef.current[field] = true;
  }, []);
  // Track previous open state to detect transitions
  const prevIsOpenRef = useRef<boolean>(isOpen);

  const inputStyle = createInputStyle(isMobile);

  // Haptic feedback hook
  const { triggerHaptic } = useHaptic();

  const canSign = hasNip07() || hasInMemorySecretKey();

  const handleSave = useCallback(async () => {
    // 🎯 TRIGGER HAPTIC IMMEDIATELY (in user gesture context)

    try {
      triggerHaptic();
    } catch (error) {
      console.error("❌ Haptic feedback failed for metadata update:", error);
    }

    if (!canSign) {
      setShowUnlockModal(true);
      return;
    }
    try {
      onSavingStateChange?.(true);
      setError("");
      setIsBroadcasting(true);

      // Initialize relay statuses
      const initialStatuses: RelayStatus[] = relayUrls.map((url) => ({
        url,
        status: "pending",
      }));
      setRelayStatuses(initialStatuses);

      const content: any = {
        // Prefer display_name for compatibility with more clients while keeping name
        name: name || undefined,
        display_name: name || undefined,
        about: about || undefined,
        picture: picture || undefined,
        banner: banner || undefined,
        nip05: nip05 || undefined,
        lud16: lud16 || undefined,
      };
      // Remove undefined keys
      Object.keys(content).forEach(
        (k) => content[k] === undefined && delete content[k]
      );
      const signed = await nip07SignEvent({
        kind: 0,
        content: JSON.stringify(content),
        tags: [["client", "NRIC-1"]],
      });

      const pool = new SimplePool();

      // Filter relay URLs based on event kind and permissions
      const filteredRelayUrls = relayPermissions
        ? filterRelaysByEventKind(relayUrls, relayPermissions, 0)
        : relayUrls;

      // Debug: Log which relays we're publishing to

      // Additional debug info for relay filtering

      try {
        // Publish to all relays quickly in parallel
        const publishPromises = filteredRelayUrls.map(
          async (relayUrl, index) => {
            try {
              await pool.publish([relayUrl], signed as any);
              return { relayUrl, success: true, index };
            } catch (error) {
              return { relayUrl, success: false, error, index };
            }
          }
        );

        // Wait for all publishing to complete
        const results = await Promise.allSettled(publishPromises);

        // Update statuses with delays for human-readable display
        results.forEach((result, i) => {
          if (result.status === "fulfilled") {
            const { success, error, index } = result.value;
            setTimeout(() => {
              setRelayStatuses((prev) =>
                prev.map((status, idx) =>
                  idx === index
                    ? {
                        ...status,
                        status: success ? "success" : "failed",
                        error:
                          error instanceof Error
                            ? error.message
                            : "Unknown error",
                      }
                    : status
                )
              );
            }, (i + 1) * 600); // 800ms delay between each visual update
          }
        });

        // Wait for all visual updates to complete
        await new Promise((resolve) =>
          setTimeout(resolve, (filteredRelayUrls.length + 1) * 800)
        );

        // Count actual successes and failures from the results
        const successful = results.filter(
          (r) => r.status === "fulfilled" && r.value.success
        ).length;
        const failed = results.filter(
          (r) => r.status === "fulfilled" && !r.value.success
        ).length;

        if (successful === 0) {
          throw new Error(`All ${failed} relay publishes failed`);
        }

        // Success if at least some relays worked
      } catch (error) {
        console.error("Publishing failed:", error);
        throw new Error(`Failed to publish to relays: ${error}`);
      } finally {
        pool.close(relayUrls);
      }

      // Call success callback with the published content for optimistic updates
      if (onProfileUpdateSuccess) {
        await onProfileUpdateSuccess(content);
      }

      // Mark broadcasting as complete but keep the view active
      setBroadcastingComplete(true);
    } catch (e: any) {
      setError(e?.message || "Failed to publish metadata");
    } finally {
      onSavingStateChange?.(false);
      setIsBroadcasting(false);
    }
  }, [
    canSign,
    name,
    about,
    picture,
    banner,
    nip05,
    lud16,
    relayUrls,
    onClose,
    onSavingStateChange,
    onProfileUpdateSuccess,
    triggerHaptic,
  ]);

  const handleUnlocked = useCallback(async () => {
    setShowUnlockModal(false);
    // After unlocking, try to save again
    if (saveFunctionRef.current) {
      saveFunctionRef.current();
    }
  }, []);

  const saveFunctionRef = useRef<(() => Promise<void>) | null>(null);

  // Expose save function to parent
  useEffect(() => {
    saveFunctionRef.current = handleSave;
    if (onSaveRequest) {
      onSaveRequest(handleSave);
    }
  }, [handleSave, onSaveRequest]);

  // Sync form fields with currentMetadata when it changes, but do not overwrite user-edited fields
  useEffect(() => {
    if (!currentMetadata || isLoadingMeta) {
      setIsFormReady(false);
      return;
    }

    setIsFormReady(true);

    // On first ready state per open, initialize all fields from metadata
    if (!hasInitializedRef.current) {
      setName(
        (currentMetadata as any).display_name || currentMetadata.name || ""
      );
      setAbout(currentMetadata.about || "");
      setPicture(currentMetadata.picture || "");
      setBanner((currentMetadata as any).banner || "");
      setNip05(currentMetadata.nip05 || "");
      setLud16((currentMetadata as any).lud16 || "");
      hasInitializedRef.current = true;
      return;
    }

    // After initialization, update only fields that the user hasn't edited yet
    if (!dirtyFieldsRef.current.name)
      setName(
        (currentMetadata as any).display_name || currentMetadata.name || ""
      );
    if (!dirtyFieldsRef.current.about) setAbout(currentMetadata.about || "");
    if (!dirtyFieldsRef.current.picture)
      setPicture(currentMetadata.picture || "");
    if (!dirtyFieldsRef.current.banner)
      setBanner((currentMetadata as any).banner || "");
    if (!dirtyFieldsRef.current.nip05) setNip05(currentMetadata.nip05 || "");
    if (!dirtyFieldsRef.current.lud16)
      setLud16((currentMetadata as any).lud16 || "");
  }, [currentMetadata, isLoadingMeta]);

  // Reset broadcasting and initialization state only when transitioning from closed -> open
  useEffect(() => {
    const wasOpen = prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;
    if (isOpen && !wasOpen) {
      if (!isBroadcasting && !broadcastingComplete) {
        setError("");
        setRelayStatuses([]);
      }
      hasInitializedRef.current = false;
      dirtyFieldsRef.current = {};
    }
  }, [isOpen, isBroadcasting, broadcastingComplete]);

  // Clean up broadcasting state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsBroadcasting(false);
      setBroadcastingComplete(false);
      setRelayStatuses([]);
      setError("");
      setIsFormReady(false);
      hasInitializedRef.current = false;
      dirtyFieldsRef.current = {};
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const containerStyle: React.CSSProperties = mountWithinContainer
    ? {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "var(--app-bg-color )",
        display: "flex",
        flexDirection: "column",
        zIndex: 5,
        maxHeight: isMobile ? "100%" : "calc(100% - 60px)",
        overflow: "hidden",
      }
    : {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        height: isMobile ? "100dvh" : "100vh",
        minHeight: isMobile ? "100dvh" : "100vh",
        backgroundColor: isMobile
          ? "var(--app-bg-color )"
          : "rgba(0, 0, 0, 0.5)",
        display: "flex",
        flexDirection: "column",
        zIndex: 2000,
      };

  const closeIfBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget && !mountWithinContainer) {
        onClose();
      }
    },
    [onClose, mountWithinContainer]
  );

  const handleClose = useCallback(() => {
    // Ensure we're in a stable state before closing
    if (broadcastingComplete) {
      // If broadcasting is complete, close immediately
      onClose();
    } else {
      // If still broadcasting, wait a moment for state to stabilize
      setTimeout(() => {
        onClose();
      }, 100);
    }
  }, [onClose, broadcastingComplete]);

  return (
    <>
      <div style={containerStyle} onClick={closeIfBackdrop}>
        <div
          style={{
            flex: 1,
            backgroundColor: "var(--app-bg-color)",
            display: "flex",
            flexDirection: "column",
            width: "100%",
            maxWidth: "1000px",
            margin: "0 auto",
            minHeight: 0,
            overflow: "hidden",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: isMobile
                ? "var(--safe-area-inset-top) 1rem 0.5rem 1rem"
                : "0.5rem 1rem",
            }}
          >
            <div>
              <span
                style={{
                  color: "var(--text-color)",

                  fontSize: "0.875rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                {isBroadcasting || broadcastingComplete
                  ? "Broadcasting Profile"
                  : "Edit Profile"}
              </span>
            </div>
          </div>

          {/* Content */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: isMobile
                ? "0.5rem 1rem 1rem 1rem"
                : "1rem 1rem 1rem 1rem",
            }}
          >
            {isLoadingMeta || !isFormReady ? (
              /* Loading State */
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                  height: "100%",
                  gap: "1rem",
                }}
              >
                <LoadingSpinner size="large" />
                <div
                  style={{
                    color: "var(--text-color)",

                    fontSize: "0.875rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  Loading...
                </div>
              </div>
            ) : !isBroadcasting && !broadcastingComplete ? (
              /* Edit Profile Form */
              <TreeList>
                <TreeListItem>
                  <div
                    style={{
                      color: "var(--text-color)",

                      fontSize: "0.75rem",
                      marginBottom: "0.25rem",
                      textAlign: "start",
                    }}
                  >
                    Profile Picture URL
                  </div>
                  <input
                    type="url"
                    value={picture}
                    onChange={(e) => {
                      setPicture(e.target.value);
                      markFieldDirty("picture");
                    }}
                    placeholder="https://..."
                    style={inputStyle as any}
                  />
                </TreeListItem>

                <TreeListItem>
                  <div
                    style={{
                      color: "var(--text-color)",

                      fontSize: "0.75rem",
                      marginBottom: "0.25rem",
                      textAlign: "start",
                    }}
                  >
                    Name
                  </div>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      markFieldDirty("name");
                    }}
                    placeholder="Your name"
                    style={inputStyle as any}
                  />
                </TreeListItem>

                <TreeListItem>
                  <div
                    style={{
                      color: "var(--text-color)",

                      fontSize: "0.75rem",
                      marginBottom: "0.25rem",
                      textAlign: "start",
                    }}
                  >
                    Bio
                  </div>
                  <textarea
                    value={about}
                    onChange={(e) => {
                      setAbout(e.target.value);
                      markFieldDirty("about");
                    }}
                    placeholder="Tell the world about you"
                    style={{
                      ...(inputStyle as any),
                      minHeight: "96px",
                      resize: "vertical",
                    }}
                  />
                </TreeListItem>

                <TreeListItem>
                  <div
                    style={{
                      color: "var(--text-color)",

                      fontSize: "0.75rem",
                      marginBottom: "0.25rem",
                      textAlign: "start",
                    }}
                  >
                    Nostr Address (nip-05)
                  </div>
                  <input
                    type="text"
                    value={nip05}
                    onChange={(e) => {
                      setNip05(e.target.value);
                      markFieldDirty("nip05");
                    }}
                    placeholder="you@example.com"
                    style={inputStyle as any}
                  />
                </TreeListItem>

                <TreeListItem>
                  <div
                    style={{
                      color: "var(--text-color)",

                      fontSize: "0.75rem",
                      marginBottom: "0.25rem",
                      textAlign: "start",
                    }}
                  >
                    Lightning Address
                  </div>
                  <input
                    type="text"
                    value={lud16}
                    onChange={(e) => {
                      setLud16(e.target.value);
                      markFieldDirty("lud16");
                    }}
                    placeholder="you@wallet.com"
                    style={inputStyle as any}
                  />
                </TreeListItem>

                <TreeListItem isLast={true}>
                  <div
                    style={{
                      color: "var(--text-color)",

                      fontSize: "0.75rem",
                      marginBottom: "0.25rem",
                      textAlign: "start",
                    }}
                  >
                    Profile Banner URL
                  </div>
                  <input
                    type="url"
                    value={banner}
                    onChange={(e) => {
                      setBanner(e.target.value);
                      markFieldDirty("banner");
                    }}
                    placeholder="https://..."
                    style={inputStyle as any}
                  />
                </TreeListItem>
              </TreeList>
            ) : (
              /* Broadcasting Status */

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
                      <span
                        style={{
                          color: "var(--text-color)",
                        }}
                      >
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
                          <span style={{ color: "var(--text-success)" }}>
                            [ OK ]
                          </span>
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
                          padding: "0.25rem 0 0.25rem 1rem",

                          fontSize: "0.75rem",
                          color: "#ef4444",
                          fontStyle: "italic",
                        }}
                      >
                        {relayStatus.error}
                      </div>
                    )}
                  </TreeListItem>
                ))}
                {relayStatuses.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "end",
                      alignItems: "center",
                    }}
                  >
                    {relayStatuses.filter((r) => r.status === "success")
                      .length > 0 && (
                      <div
                        style={{
                          color: "var(--text-color)",
                          marginBottom: "0.25rem",
                          marginTop: "0.5rem",
                          padding: "0.5rem",
                          width: isMobile ? "92%" : "96.5%",
                          backgroundColor: "var(--app-bg-color)",
                          border: "2px dotted var(--border-color)",

                          fontSize: "0.75rem",
                          textAlign: "center",
                        }}
                      >
                        ✓ Successfully published to{" "}
                        {
                          relayStatuses.filter((r) => r.status === "success")
                            .length
                        }{" "}
                        relay(s)
                      </div>
                    )}
                    {relayStatuses.filter((r) => r.status === "failed").length >
                      0 && (
                      <div>
                        ✗ Failed to publish to{" "}
                        {
                          relayStatuses.filter((r) => r.status === "failed")
                            .length
                        }{" "}
                        relay(s)
                      </div>
                    )}
                  </div>
                )}
              </TreeList>
            )}

            {/* View Profile Button - shown after broadcasting completes */}
            {broadcastingComplete && (
              <div style={{ marginTop: "1rem", textAlign: "center" }}>
                <button
                  onClick={handleClose}
                  style={{
                    // backgroundColor: "var(--accent-color)",
                    color: "var(--text-color)",
                    padding: "0.75rem 1.5rem",
                    // borderRadius: "0.25rem",
                    border: "1px solid var(--border-color)",

                    fontSize: "0.875rem",
                    cursor: "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  Acknowledged
                </button>
              </div>
            )}

            {error && (
              <div
                style={{
                  color: "#ef4444",

                  fontSize: "0.75rem",
                  marginTop: "1rem",
                }}
              >
                {error}
              </div>
            )}
          </div>
        </div>
      </div>

      {showUnlockModal && (
        <UnlockKeyModal
          isOpen={showUnlockModal}
          onClose={() => setShowUnlockModal(false)}
          actionLabel="Update Profile"
          currentPubkeyHex={getCurrentPubkeyHex(userPubkey)}
          onUnlocked={handleUnlocked}
          getDisplayNameForPubkey={getDisplayNameForPubkey}
          metadata={prepareMetadataForModal(userPubkey, currentMetadata)}
        />
      )}
    </>
  );
};

export default ProfileEditModal;

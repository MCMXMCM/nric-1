import React, { useState, useEffect } from "react";
import {
  fetchUserRelays,
  deduplicateRelays,
  type UserRelay,
} from "../../utils/relayDiscoveryUtils";
import LoadingSpinner from "../ui/LoadingSpinner";

interface RelayDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  userPubkey: string;
  displayName: string;
  relayUrls: string[];
  onAddRelay: (url: string) => void;
  userCurrentRelays: string[];
  isMobile?: boolean;
  mountWithinContainer?: boolean;
}

export const RelayDiscoveryModal: React.FC<RelayDiscoveryModalProps> = ({
  isOpen,
  onClose,
  userPubkey,
  displayName,
  relayUrls,
  onAddRelay,
  userCurrentRelays,
  isMobile = false,
  mountWithinContainer = false,
}) => {
  const [userRelays, setUserRelays] = useState<UserRelay[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingRelays, setAddingRelays] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen || !userPubkey) return;

    const fetchRelays = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchUserRelays({
          pubkeyHex: userPubkey,
          relayUrls,
        });

        if (result.error) {
          setError(result.error);
        } else {
          const dedupedRelays = deduplicateRelays(result.relays);
          setUserRelays(dedupedRelays);
        }
      } catch (e) {
        setError("Failed to fetch relay information");
      } finally {
        setIsLoading(false);
      }
    };

    fetchRelays();
  }, [isOpen, userPubkey, relayUrls]);

  const handleAddRelay = async (relayUrl: string) => {
    setAddingRelays((prev) => new Set(prev).add(relayUrl));

    try {
      // Add as read-only relay
      onAddRelay(relayUrl);

      // Small delay for visual feedback
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (e) {
      console.error("Failed to add relay:", e);
    } finally {
      setAddingRelays((prev) => {
        const next = new Set(prev);
        next.delete(relayUrl);
        return next;
      });
    }
  };

  if (!isOpen) return null;

  const modalStyle: React.CSSProperties = mountWithinContainer
    ? {
        position: "relative",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        height: "100%",
        minHeight: 0,
        backgroundColor: "transparent",
        display: "flex",
        flexDirection: "column",
        zIndex: 1,
        paddingTop: 0,
        paddingBottom: 0,
      }
    : {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        height: "100dvh",
        minHeight: "100dvh",
        backgroundColor: isMobile
          ? "var(--app-bg-color )"
          : "rgba(0, 0, 0, 0.5)",
        display: "flex",
        flexDirection: "column",
        zIndex: 2000,
        paddingTop: isMobile
          ? "calc(50px + var(--safe-area-inset-top))"
          : "60px",
        paddingBottom: isMobile ? "var(--safe-area-inset-bottom)" : "24px",
      };

  const contentStyle: React.CSSProperties = mountWithinContainer
    ? {
        flex: 1,
        backgroundColor: "var(--app-bg-color)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        width: "100%",
        maxWidth: "100%",
        margin: 0,
      }
    : {
        flex: 1,
        backgroundColor: "var(--app-bg-color)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        width: "100%",
        maxWidth: "1000px",
        margin: "0 auto",
      };

  const headerStyle: React.CSSProperties = {
    width: "100%",
    // height: isMobile ? "calc(60px + var(--safe-area-inset-top))" : "60px",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    // padding: isMobile ? "0 1rem var(--safe-area-inset-top) 1rem" : "0 1rem",
    backgroundColor: "var(--app-bg-color )",
    paddingBottom: "0.5rem",
    borderBottom: "1px dotted var(--border-color)",
    flexShrink: 0,
    position: "relative",
  };

  const relayListStyle: React.CSSProperties = {
    position: "relative",
    margin: "0 0.5rem 0 0.5rem",
    paddingBottom: "8rem",
    listStyleType: "none",
  } as any;

  const relayItemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "start",
    justifyContent: "space-between",
    // padding: "0.75rem",
    backgroundColor: "var(--secondary-bg)",
    fontSize: "0.875rem",
    textAlign: "left",
  };

  const relayInfoStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    overflowWrap: "anywhere",
    // gap: "0.25rem",
    flex: 1,
  };

  const relayUrlStyle: React.CSSProperties = {
    color: "var(--text-color)",
    fontWeight: "bold",
  };

  const relayPermissionStyle: React.CSSProperties = {
    color: "var(--muted-text-color)",
    fontSize: "0.75rem",
  };

  const buttonStyle: React.CSSProperties = {
    padding: "0.5rem 1rem",
    backgroundColor: "transparent",
    border: "1px solid var(--border-color)",
    borderRadius: 0,
    color: "var(--text-color)",
    cursor: "pointer",
    width: "70px",
    minHeight: "2rem",

    fontSize: "0.75rem",
    transition: "background-color 0.2s",
  };

  const addedButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: "#14532d",
    color: "#fff",
    cursor: "default",
  };

  const getPermissionText = (relay: UserRelay): string => {
    if (relay.read && relay.write) return "Read & Write";
    if (relay.read) return "Read Only";
    if (relay.write) return "Write Only";
    return "Unknown";
  };

  const isRelayAlreadyAdded = (relayUrl: string): boolean => {
    return userCurrentRelays.some(
      (existingUrl) => existingUrl.toLowerCase() === relayUrl.toLowerCase()
    );
  };

  return (
    <div
      style={modalStyle}
      onClick={mountWithinContainer ? undefined : onClose}
    >
      <div
        style={contentStyle}
        onClick={(e) =>
          mountWithinContainer ? undefined : e.stopPropagation()
        }
      >
        <div style={headerStyle}>
          <div style={{}}>
            <h3
              style={{
                margin: 0,
                padding: 0,
                color: "var(--text-color)",

                fontSize: "0.75rem",
                textTransform: "uppercase",
                width: "100%",
                textAlign: "left",
                overflowWrap: "anywhere",
                letterSpacing: "0.1em",
              }}
            >
              {displayName}'s Relays ({userRelays.length})
            </h3>
          </div>
        </div>

        {/* Scrollable content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1.5rem 0",
          }}
        >
          {isLoading && (
            <div
              style={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.5rem",
                height: isMobile ? "100%" : "602px",
                justifyContent: "center",
              }}
            >
              <LoadingSpinner size="small" />
              <span
                style={{
                  color: "var(--text-color)",
                  fontSize: "0.875rem",
                }}
              >
                Loading relays...
              </span>
            </div>
          )}

          {error && (
            <div
              style={{
                color: "var(--error-text-color)",
                textAlign: "center",
                padding: "1rem",
                border: "1px solid var(--error-border-color)",
                backgroundColor: "var(--error-bg)",
                marginBottom: "1rem",
              }}
            >
              {error}
            </div>
          )}

          {!isLoading && !error && userRelays.length === 0 && (
            <div
              style={{
                color: "var(--muted-text-color)",
                textAlign: "center",
                padding: "2rem",
              }}
            >
              No relay information found for this user.
            </div>
          )}

          {!isLoading && userRelays.length > 0 && (
            <>
              <ul style={relayListStyle as any}>
                {userRelays.map((relay, index) => {
                  const isAdded = isRelayAlreadyAdded(relay.url);
                  const isAdding = addingRelays.has(relay.url);

                  return (
                    <li
                      key={index}
                      style={{
                        position: "relative",
                        paddingLeft: "1.5rem",
                        paddingTop: "0.5rem",
                        paddingBottom: "0.5rem",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          bottom:
                            index === userRelays.length - 1
                              ? "calc(100% - 1.3rem)"
                              : 0,
                          width: 1,
                          backgroundColor: "var(--border-color)",
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          top: "1.25rem",
                          width: "1rem",
                          height: 1,
                          backgroundColor: "var(--border-color)",
                        }}
                      />
                      <div style={relayItemStyle}>
                        <div style={relayInfoStyle}>
                          <div style={relayUrlStyle}>{relay.url}</div>
                          <div style={relayPermissionStyle}>
                            {getPermissionText(relay)}
                          </div>
                        </div>

                        {isAdded ? (
                          <div style={addedButtonStyle}> Added</div>
                        ) : (
                          <button
                            style={buttonStyle}
                            onClick={() => handleAddRelay(relay.url)}
                            disabled={isAdding}
                            onMouseEnter={(e) => {
                              if (!isAdding) {
                                e.currentTarget.style.backgroundColor =
                                  "var(--hover-bg)";
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor =
                                "transparent";
                            }}
                          >
                            {isAdding ? "Adding..." : "Add"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

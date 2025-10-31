import React, { useState, useRef, useEffect } from "react";

interface RelaySelectorProps {
  relayUrls: string[];
  selectedRelay: string;
  onRelaySelectionChange: (selectedRelay: string) => void;
  isDarkMode: boolean;
  isMobile: boolean;
  disabled?: boolean;
  // Add props for following option
  userPubkey?: string | null;
  hasContacts?: boolean;
  contactsLoading?: boolean;
}

// Special value to indicate "following" mode
export const FOLLOWING_RELAY_OPTION = "__following__";

export const RelaySelector: React.FC<RelaySelectorProps> = ({
  relayUrls,
  selectedRelay,
  onRelaySelectionChange,
  isDarkMode,
  isMobile,
  disabled = false,
  userPubkey,
  hasContacts = false,
  contactsLoading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isOpen]);

  const handleToggle = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  const handleRelaySelect = (relayUrl: string) => {
    onRelaySelectionChange(relayUrl);
    setIsOpen(false); // Close dropdown after selection
  };

  // Format relay URL for display (remove protocol and trailing slash)
  const formatRelayUrl = (url: string) => {
    return url.replace(/^wss?:\/\//, "").replace(/\/$/, "");
  };

  // Get display text for the selected relay
  const getSelectedRelayDisplay = () => {
    if (!selectedRelay) return "Select relay";
    if (selectedRelay === FOLLOWING_RELAY_OPTION) return "Following";
    return formatRelayUrl(selectedRelay);
  };

  // Show Following when user is logged in and we know they have contacts
  const showFollowingOption = Boolean(userPubkey && hasContacts);

  // Disable only while contacts are still loading AND we don't yet have contacts
  const followingOptionDisabled = Boolean(contactsLoading && !hasContacts);

  return (
    <div
      ref={dropdownRef}
      style={{
        position: "relative",
        display: "inline-block",
      }}
    >
      {/* Dropdown Button */}
      <button
        onClick={handleToggle}
        disabled={disabled}
        style={{
          backgroundColor: "transparent",
          border: "1px solid var(--border-color)",
          borderRadius: "0",
          fontSize: isMobile ? "0.875rem" : "0.75rem",
          fontWeight: "normal",
          textTransform: "none",
          transition: "all 0.3s ease",
          whiteSpace: "nowrap",
          height: "2rem",
          minHeight: "2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: isMobile ? "0 0.75rem" : "0 0.75rem",
          cursor: disabled ? "not-allowed" : "pointer",
          color: disabled ? "var(--text-muted)" : "var(--text-color)",
          opacity: disabled ? 0.5 : 1,
          minWidth: isMobile ? "120px" : "120px",
          maxWidth: isMobile ? "200px" : "250px",
        }}
        title={`Select relay - currently: ${getSelectedRelayDisplay()}`}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginRight: "0.5rem",
          }}
        >
          {getSelectedRelayDisplay()}
        </span>
        <span
          style={{
            fontSize: "0.7rem",
            flexShrink: 0,
          }}
        >
          {isOpen ? "▲" : "▼"}
        </span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            ...(isMobile
              ? {
                  bottom: "calc(100% + 4px)",
                  left: "50%",
                  transform: "translateX(-50%)",
                }
              : {
                  top: "calc(100% + 4px)",
                  left: "0",
                  transform: "none",
                }),
            backgroundColor: "var(--app-bg-color)",
            border: "1px solid var(--border-color)",
            padding: "0.25rem",
            zIndex: 10000,
            minWidth: isMobile ? "200px" : "250px",
            maxWidth: isMobile ? "90vw" : "400px",
            maxHeight: "400px",
            overflowY: "auto",
          }}
        >
          {/* Relay List */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.125rem",
            }}
          >
            {/* Following option - shown first when user is logged in and has contacts */}
            {showFollowingOption && (
              <>
                <button
                  key={FOLLOWING_RELAY_OPTION}
                  onClick={() => handleRelaySelect(FOLLOWING_RELAY_OPTION)}
                  disabled={followingOptionDisabled}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem 0.75rem",
                    // borderRadius: "2px",
                    cursor: followingOptionDisabled ? "not-allowed" : "pointer",
                    // backgroundColor:
                    //   selectedRelay === FOLLOWING_RELAY_OPTION
                    //     ? isDarkMode
                    //       ? "rgba(255, 255, 255, 0.1)"
                    //       : "rgba(0, 0, 0, 0.05)"
                    //     : "transparent",
                    border: "none",
                    transition: "all 0.2s ease",
                    width: "100%",
                    textAlign: "left",
                    color: followingOptionDisabled
                      ? "var(--text-muted)"
                      : "var(--text-color)",
                    opacity: followingOptionDisabled ? 0.5 : 1,
                    fontSize: "0.75rem",
                    fontWeight:
                      selectedRelay === FOLLOWING_RELAY_OPTION
                        ? "600"
                        : "normal",
                  }}
                  onMouseEnter={(e) => {
                    if (
                      selectedRelay !== FOLLOWING_RELAY_OPTION &&
                      !followingOptionDisabled
                    ) {
                      e.currentTarget.style.backgroundColor = isDarkMode
                        ? "rgba(255, 255, 255, 0.05)"
                        : "rgba(0, 0, 0, 0.03)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (
                      selectedRelay !== FOLLOWING_RELAY_OPTION &&
                      !followingOptionDisabled
                    ) {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }
                  }}
                  title={
                    followingOptionDisabled
                      ? "Loading your contacts... Come back in a moment"
                      : "Show notes from users you follow"
                  }
                >
                  {selectedRelay === FOLLOWING_RELAY_OPTION && (
                    <span
                      style={{
                        fontSize: "0.7rem",
                        marginRight: "0.25rem",
                      }}
                    >
                      ✓
                    </span>
                  )}
                  <span
                    style={{
                      flex: 1,
                    }}
                  >
                    Following
                  </span>
                </button>
                {/* Divider between following and relay list */}
                <div
                  style={{
                    height: "1px",
                    backgroundColor: "var(--border-color)",
                    margin: "0.25rem 0",
                  }}
                />
              </>
            )}

            {relayUrls.length === 0 && !showFollowingOption ? (
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  textAlign: "center",
                  padding: "1rem",
                }}
              >
                No relays configured
              </div>
            ) : (
              relayUrls.map((relayUrl) => {
                const isSelected = selectedRelay === relayUrl;

                return (
                  <button
                    key={relayUrl}
                    onClick={() => handleRelaySelect(relayUrl)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "2px",
                      cursor: "pointer",
                      backgroundColor: isSelected
                        ? "var(--accent-color)"
                        : "transparent",
                      border: "none",
                      transition: "all 0.2s ease",
                      width: "100%",
                      textAlign: "left",
                      color: isSelected
                        ? "var(--app-bg-color)"
                        : "var(--text-color)",
                      fontSize: "0.75rem",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = isDarkMode
                          ? "rgba(255, 255, 255, 0.05)"
                          : "rgba(0, 0, 0, 0.03)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    {isSelected && (
                      <span
                        style={{
                          fontSize: "0.7rem",
                          marginRight: "0.25rem",
                        }}
                      >
                        ✓
                      </span>
                    )}
                    <span
                      style={{
                        wordBreak: "break-all",
                        flex: 1,
                      }}
                      title={relayUrl}
                    >
                      {formatRelayUrl(relayUrl)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

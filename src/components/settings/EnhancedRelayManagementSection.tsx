import React, { useState } from "react";
import { SectionHeader } from "./SectionHeader";
import { TreeList, TreeListItem } from "./TreeListItem";
import { SettingsButton } from "./SettingsButton";
import { OutboxRelaysModal } from "./OutboxRelaysModal";
import { useRelayManager } from "../../hooks/useRelayManager";
import { useMultipleRelayInfo } from "../../hooks/useRelayInfo";
import { NostrContext } from "../../contexts/NostrContext";
import { DEFAULT_RELAY_URLS } from "../../utils/nostr/constants";
import type { RelayPermission } from "../../types/nostr/types";
import { useUIStore } from "../lib/useUIStore";
import { setOutboxMode } from "../lib/uiStore";
import { ToggleButton } from "../ToggleButton";

interface EnhancedRelayManagementSectionProps {
  relayUrls: string[];
  relayStatuses: {
    url: string;
    connected: boolean;
    read: boolean;
    write: boolean;
  }[];
  addRelay: (url: string, permission?: RelayPermission) => void;
  restoreDefaultRelays?: () => void;
  onRemoveRelay: (url: string) => void;
  isMobile: boolean;
  cycleRelayPermission: (url: string) => void;
  getRelayPermission: (url: string) => RelayPermission;
}

export const EnhancedRelayManagementSection: React.FC<
  EnhancedRelayManagementSectionProps
> = ({
  relayStatuses,
  addRelay,
  restoreDefaultRelays,
  onRemoveRelay,
  cycleRelayPermission,
  getRelayPermission,
  isMobile,
}) => {
  const { nostrClient, pubkey } = React.useContext(NostrContext);
  const [expandedRelays, setExpandedRelays] = useState<Set<string>>(new Set());
  const [showHealthStats, setShowHealthStats] = useState(false);
  const [showOutboxModal, setShowOutboxModal] = useState(false);

  // Get outbox mode from UI store
  const outboxMode = useUIStore((s) => s.outboxMode);

  const { relayUrls: allRelayUrls } = useRelayManager({
    nostrClient,
    initialRelays: DEFAULT_RELAY_URLS,
    pubkeyHex: pubkey || undefined,
  });

  const { relayInfos, isLoading } = useMultipleRelayInfo({
    relayUrls: allRelayUrls,
  });

  const toggleRelayExpansion = (url: string) => {
    const newExpanded = new Set(expandedRelays);
    if (newExpanded.has(url)) {
      newExpanded.delete(url);
    } else {
      newExpanded.add(url);
    }
    setExpandedRelays(newExpanded);
  };

  const getRelayDisplayName = (url: string) => {
    const info = relayInfos.get(url);
    if (info?.info?.name) {
      return info.info.name;
    }
    try {
      const urlObj = new URL(
        url.replace("ws://", "http://").replace("wss://", "https://")
      );
      return urlObj.hostname;
    } catch {
      return url.replace("wss://", "").replace("ws://", "");
    }
  };

  const getConnectionStatus = (url: string) => {
    const status = relayStatuses.find((s) => s.url === url);
    return status?.connected || false;
  };

  const getPermissionButtonStyle = (url: string): React.CSSProperties => {
    const permission = getRelayPermission(url);
    const baseStyle: React.CSSProperties = {
      padding: "0.25rem 0.5rem",
      border: "1px solid var(--border-color)",
      borderRadius: "0",
      cursor: "pointer",
      fontSize: "0.75rem",
      fontWeight: "bold",
      minWidth: "60px",
      textAlign: "center",
    };

    switch (permission) {
      case "read":
        return {
          ...baseStyle,
          backgroundColor: "#166534",
          color: "white",
        };
      case "write":
        return {
          ...baseStyle,
          backgroundColor: "#7c2d12",
          color: "white",
        };
      case "readwrite":
        return {
          ...baseStyle,
          backgroundColor: "#1e40af",
          color: "white",
        };
      case "indexer":
        return {
          ...baseStyle,
          backgroundColor: "#7c3aed",
          color: "white",
        };
      default:
        return {
          ...baseStyle,
          backgroundColor: "transparent",
          color: "var(--text-color)",
        };
    }
  };

  const getPermissionButtonText = (url: string): string => {
    const permission = getRelayPermission(url);
    switch (permission) {
      case "read":
        return "Read";
      case "write":
        return "Write";
      case "readwrite":
        return "R/W";
      case "indexer":
        return "Index";
      default:
        return "None";
    }
  };

  return (
    <>
      <SectionHeader title="Relay Management" />
      <TreeList>
        {/* Info Item */}
        <TreeListItem>
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              fontStyle: "italic",
              padding: "0.5rem 0",
              textAlign: "left",
            }}
          >
            NIP-11 compliant relay information available by expanding the relay
            item.
          </div>
        </TreeListItem>

        {/* Outbox Mode Toggle */}
        <TreeListItem>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              padding: "0.5rem 0",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                textAlign: "left",
                justifyContent: "flex-start",
                gap: "0.5rem",
              }}
            >
              <span
                style={{
                  fontSize: "0.875rem",
                  fontWeight: "400",
                  color: "var(--text-color)",
                }}
              >
                Outbox{" "}
                <span
                  style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}
                >
                  (beta)
                </span>
              </span>
              <button
                onClick={() => setShowOutboxModal(true)}
                style={{
                  padding: "0.25rem 0.5rem",
                  fontSize: "0.75rem",
                  textAlign: "left",
                  minWidth: "100px",
                  // border: "1px solid var(--border-color)",
                  backgroundColor: "var(--btn-bg)",
                  color: "var(--text-color)",
                  cursor: "pointer",
                  borderRadius: "0",
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.backgroundColor =
                    "var(--btn-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.backgroundColor =
                    "var(--btn-bg)";
                }}
              >
                [ Manage ]
              </button>
            </div>
            <ToggleButton
              value={outboxMode}
              onClick={() => setOutboxMode(!outboxMode)}
              disabled={false}
            />
          </div>
        </TreeListItem>

        {/* Add Relay Input */}
        <TreeListItem>
          <div style={{ padding: "0.5rem 0" }}>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                placeholder="Enter relay URL (e.g., wss://relay.example.com)"
                style={{
                  flex: 1,
                  padding: "0.5rem",
                  fontSize: "0.875rem",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--app-bg-color)",
                  color: "var(--text-color)",
                  outline: "none",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const input = e.target as HTMLInputElement;
                    const url = input.value.trim();
                    if (url) {
                      addRelay(url);
                      input.value = "";
                    }
                  }
                }}
              />
              <button
                type="button"
                style={{
                  padding: "0.5rem 1rem",
                  fontSize: "0.875rem",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--btn-bg)",
                  color: "var(--text-color)",
                  cursor: "pointer",
                  outline: "none",
                  minWidth: "60px",
                }}
                onClick={(e) => {
                  const input = (
                    e.target as HTMLElement
                  ).parentElement?.querySelector("input") as HTMLInputElement;
                  const url = input?.value.trim();
                  if (url) {
                    addRelay(url);
                    input.value = "";
                  }
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.backgroundColor =
                    "var(--btn-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.backgroundColor =
                    "var(--btn-bg)";
                }}
              >
                Add
              </button>
            </div>
          </div>
        </TreeListItem>

        {/* Relay Items */}
        {relayStatuses.map((status) => {
          const relayInfo = relayInfos.get(status.url);
          const isExpanded = expandedRelays.has(status.url);
          const displayName = getRelayDisplayName(status.url);
          const isConnected = getConnectionStatus(status.url);

          return (
            <TreeListItem lineTop="2rem" key={status.url}>
              {/* Main Relay Item */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                  cursor: "pointer",
                  padding: "0.5rem 0",
                }}
                onClick={() => toggleRelayExpansion(status.url)}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    color: "var(--text-color)",
                    fontSize: "0.875rem",
                    flex: 1,
                    textAlign: "left",
                  }}
                >
                  {/* Connection Status Indicator */}
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "0",
                      backgroundColor: isConnected
                        ? "var(--relay-connected)"
                        : "var(--relay-disconnected)",
                    }}
                  />

                  {/* Relay Icon */}
                  {relayInfo?.info?.icon && (
                    <img
                      src={relayInfo.info.icon}
                      alt=""
                      style={{
                        width: "16px",
                        height: "16px",
                        borderRadius: "2px",
                      }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}

                  {/* Relay Name/URL */}
                  <span style={{ fontWeight: "500", textAlign: "left" }}>
                    {displayName}
                  </span>

                  {/* Expand/Collapse Arrow */}
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      marginLeft: "auto",
                      marginRight: "1rem",
                    }}
                  >
                    {isExpanded ? "▼" : "▶"}
                  </span>
                </div>

                {/* Permission Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    cycleRelayPermission(status.url);
                  }}
                  style={getPermissionButtonStyle(status.url)}
                  title={`Click to cycle permissions: ${getRelayPermission(
                    status.url
                  )}`}
                >
                  {getPermissionButtonText(status.url)}
                </button>

                {/* Remove Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveRelay(status.url);
                  }}
                  style={{
                    padding: "0.25rem 0.5rem",
                    backgroundColor: "transparent",
                    border: "1px solid var(--border-color)",
                    borderRadius: "0",
                    color: "var(--text-color)",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    marginLeft: "0.5rem",
                  }}
                  title="Remove relay"
                >
                  ×
                </button>
              </div>

              {/* Expanded Details */}
              {isExpanded && relayInfo && (
                <TreeListItem isLast>
                  <div
                    style={{
                      padding: "0.5rem 0",
                      maxWidth: "100%",
                      overflow: "hidden",
                      wordWrap: "break-word",
                      wordBreak: "break-word",
                    }}
                  >
                    {/* Description */}
                    {relayInfo.info?.description && (
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          marginBottom: "0.5rem",
                          lineHeight: "1.4",
                          textAlign: "left",
                          maxWidth: "100%",
                          overflow: "hidden",
                          wordWrap: "break-word",
                          wordBreak: "break-word",
                        }}
                      >
                        {relayInfo.info.description}
                      </div>
                    )}

                    {/* Supported NIPs */}
                    {relayInfo.info?.supported_nips &&
                      Array.isArray(relayInfo.info.supported_nips) &&
                      relayInfo.info.supported_nips.length > 0 && (
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                            marginBottom: "0.5rem",
                            textAlign: "left",
                            maxWidth: "100%",
                            overflow: "hidden",
                            wordWrap: "break-word",
                            wordBreak: "break-word",
                          }}
                        >
                          <strong>Supported NIPs:</strong>{" "}
                          {relayInfo.info.supported_nips.join(", ")}
                        </div>
                      )}

                    {/* Software */}
                    {relayInfo.info?.software && (
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          marginBottom: "0.5rem",
                          textAlign: "left",
                          maxWidth: "100%",
                          overflow: "hidden",
                          wordWrap: "break-word",
                          wordBreak: "break-word",
                        }}
                      >
                        <strong>Software:</strong> {relayInfo.info.software}
                      </div>
                    )}

                    {/* Version */}
                    {relayInfo.info?.version && (
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          marginBottom: "0.5rem",
                          textAlign: "left",
                          maxWidth: "100%",
                          overflow: "hidden",
                          wordWrap: "break-word",
                          wordBreak: "break-word",
                        }}
                      >
                        <strong>Version:</strong> {relayInfo.info.version}
                      </div>
                    )}

                    {/* Limitations */}
                    {relayInfo.info?.limitation && (
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          marginBottom: "0.5rem",
                          textAlign: "left",
                          maxWidth: "100%",
                          overflow: "hidden",
                          wordWrap: "break-word",
                          wordBreak: "break-word",
                        }}
                      >
                        {relayInfo.info.limitation.auth_required && (
                          <div
                            style={{
                              textAlign: "left",
                              maxWidth: "100%",
                              overflow: "hidden",
                              wordWrap: "break-word",
                              wordBreak: "break-word",
                            }}
                          >
                            🔐 Authentication Required
                          </div>
                        )}
                        {relayInfo.info.limitation.payment_required && (
                          <div
                            style={{
                              textAlign: "left",
                              maxWidth: "100%",
                              overflow: "hidden",
                              wordWrap: "break-word",
                              wordBreak: "break-word",
                            }}
                          >
                            💰 Payment Required
                          </div>
                        )}
                        {relayInfo.info.limitation.min_pow_difficulty && (
                          <div
                            style={{
                              textAlign: "left",
                              maxWidth: "100%",
                              overflow: "hidden",
                              wordWrap: "break-word",
                              wordBreak: "break-word",
                            }}
                          >
                            ⚡ Min PoW:{" "}
                            {relayInfo.info.limitation.min_pow_difficulty} bits
                          </div>
                        )}
                        {relayInfo.info.limitation.max_message_length && (
                          <div
                            style={{
                              textAlign: "left",
                              maxWidth: "100%",
                              overflow: "hidden",
                              wordWrap: "break-word",
                              wordBreak: "break-word",
                            }}
                          >
                            📝 Max Message:{" "}
                            {relayInfo.info.limitation.max_message_length} chars
                          </div>
                        )}
                      </div>
                    )}

                    {/* Loading State */}
                    {isLoading && (
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          fontStyle: "italic",
                          textAlign: "left",
                          maxWidth: "100%",
                          overflow: "hidden",
                          wordWrap: "break-word",
                          wordBreak: "break-word",
                        }}
                      >
                        Loading relay information...
                      </div>
                    )}

                    {/* Error State */}
                    {relayInfo.error && (
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--btn-accent)",
                          textAlign: "left",
                          maxWidth: "100%",
                          overflow: "hidden",
                          wordWrap: "break-word",
                          wordBreak: "break-word",
                        }}
                      >
                        Failed to load relay info: {relayInfo.error}
                      </div>
                    )}
                  </div>
                </TreeListItem>
              )}
            </TreeListItem>
          );
        })}

        {/* Outbox Relays Button */}
        {/* <TreeListItem>
          <button
            onClick={() => setShowHealthStats(true)}
            style={{
              width: "100%",
              paddingLeft: "0.75rem",
              backgroundColor: "transparent",

              borderRadius: 0,
              color: "var(--text-color)",
              cursor: "pointer",
              fontSize: "0.75rem",
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ width: "50%" }}>Outbox Relays</span>
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                textAlign: "right",
                width: "50%",
              }}
            >
              View Stats
            </span>
          </button>
        </TreeListItem> */}

        {restoreDefaultRelays && (
          <TreeListItem isLast>
            <SettingsButton onClick={restoreDefaultRelays}>
              Restore Default Relays
            </SettingsButton>
          </TreeListItem>
        )}
      </TreeList>

      {/* Health Stats Modal */}
      <OutboxRelaysModal
        isOpen={showHealthStats}
        onClose={() => setShowHealthStats(false)}
        isMobile={isMobile}
      />

      {/* Outbox Management Modal */}
      <OutboxRelaysModal
        isOpen={showOutboxModal}
        onClose={() => setShowOutboxModal(false)}
        isMobile={isMobile}
      />
    </>
  );
};

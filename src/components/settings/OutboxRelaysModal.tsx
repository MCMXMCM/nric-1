import React, { useState, useEffect } from "react";
import { useOutboxRelayManager } from "../../hooks/useOutboxRelayManager";
import { getOutboxStorage } from "../../utils/nostr/outboxStorage";
import { formatRelativeTime } from "../../utils/nostr/utils";
import { nip19 } from "nostr-tools";
import { useNostrifyMigration } from "../../contexts/NostrifyMigrationProvider";

interface OutboxRelaysModalProps {
  isOpen: boolean;
  onClose: () => void;
  isMobile: boolean;
}

interface OutboxStats {
  totalUsers: number;
  totalRelays: number;
  totalEvents: number;
  lastDiscovery: number;
  discoveryRate: number;
}

export const OutboxRelaysModal: React.FC<OutboxRelaysModalProps> = ({
  isOpen,
  onClose,
  isMobile,
}) => {
  const {
    isInitialized,
    getMigrationStatus,
    discoverOutboxEvents,
    startMigration,
    stopMigration,
    increaseOutboxWeight,
    decreaseOutboxWeight,
  } = useOutboxRelayManager();

  // Get Nostrify pool for profile fetching
  const { nostrifyPool } = useNostrifyMigration();

  const [selectedTab, setSelectedTab] = useState<
    "overview" | "users" | "relays"
  >("overview");
  const [stats, setStats] = useState<OutboxStats>({
    totalUsers: 0,
    totalRelays: 0,
    totalEvents: 0,
    lastDiscovery: 0,
    discoveryRate: 0,
  });
  const [migrationStatus, setMigrationStatus] = useState<any>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryMessage, setDiscoveryMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [lastDiscoveryTime, setLastDiscoveryTime] = useState<number>(
    Date.now() - 30 * 60 * 1000
  );
  const [users, setUsers] = useState<
    Array<{
      pubkey: string;
      relayCount: number;
      lastSeen: number;
      displayName?: string;
      name?: string;
    }>
  >([]);
  const [relays, setRelays] = useState<
    Array<{
      relay: string;
      userCount: number;
      permissions: string[];
      lastSeen: number;
    }>
  >([]);
  const [loading, setLoading] = useState(false);

  // Fetch profile metadata for users to get display names using Nostrify
  const fetchUserProfiles = async (
    usersData: Array<{ pubkey: string; relayCount: number; lastSeen: number }>
  ) => {
    try {
      if (!nostrifyPool) return usersData;

      const profilePromises = usersData.map(async (user) => {
        try {
          // Use Nostrify to fetch profile metadata
          const profileEvents = await nostrifyPool.query([
            {
              kinds: [0], // Profile events
              authors: [user.pubkey],
              limit: 1,
            },
          ]);

          if (profileEvents.length > 0) {
            const profile = JSON.parse(profileEvents[0].content);
            return {
              ...user,
              displayName: profile.displayName || profile.name,
              name: profile.name,
            };
          }
          return user;
        } catch (error) {
          console.warn(`Failed to fetch profile for ${user.pubkey}:`, error);
          return user;
        }
      });

      return await Promise.all(profilePromises);
    } catch (error) {
      console.warn("Failed to fetch user profiles:", error);
      return usersData;
    }
  };

  // Load detailed data when modal opens
  const loadDetailedData = async () => {
    setLoading(true);
    try {
      const storage = getOutboxStorage();
      const [usersData, relaysData] = await Promise.all([
        storage.getAllUsers(),
        storage.getAllRelays(),
      ]);

      console.log("📦 OutboxRelaysModal: Loaded data:", {
        usersCount: usersData.length,
        relaysCount: relaysData.length,
        users: usersData,
        relays: relaysData,
      });

      // Fetch profile metadata for users
      const usersWithProfiles = await fetchUserProfiles(usersData);

      console.log(
        "📦 OutboxRelaysModal: Users with profiles:",
        usersWithProfiles
      );

      setUsers(usersWithProfiles);
      setRelays(relaysData);
    } catch (error) {
      console.error("Failed to load detailed outbox data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Update stats when modal opens
  useEffect(() => {
    if (isOpen) {
      updateStats();
      updateMigrationStatus();
      loadDetailedData();
    }
  }, [isOpen]);

  // Periodically refresh stats when migration is running
  useEffect(() => {
    if (isOpen && migrationStatus?.isRunning) {
      const interval = setInterval(() => {
        console.log("📦 Auto-refreshing stats (migration running)");
        updateStats();
        updateMigrationStatus();
      }, 10000); // Refresh every 10 seconds

      return () => clearInterval(interval);
    }
  }, [isOpen, migrationStatus?.isRunning]);

  const updateStats = async () => {
    try {
      const outboxStorage = getOutboxStorage();
      const [users, relays, events] = await Promise.all([
        outboxStorage.getTotalUsers(),
        outboxStorage.getTotalRelays(),
        outboxStorage.getTotalEvents(),
      ]);

      console.log("📦 OutboxRelaysModal: Stats update:", {
        users,
        relays,
        events,
      });

      setStats({
        totalUsers: users,
        totalRelays: relays,
        totalEvents: events,
        lastDiscovery: lastDiscoveryTime,
        discoveryRate: events > 0 ? events / users : 0,
      });
    } catch (error) {
      console.warn("Failed to update outbox stats:", error);
    }
  };

  const updateMigrationStatus = async () => {
    try {
      const status = await getMigrationStatus();
      setMigrationStatus(status);
    } catch (error) {
      console.warn("Failed to get migration status:", error);
    }
  };

  const handleDiscoverNow = async () => {
    setIsDiscovering(true);
    setDiscoveryMessage(null);

    try {
      // Get recent users from multiple sources
      const recentUsers = new Set<string>();

      // 1. Get users from session storage
      const sessionUsers = JSON.parse(
        sessionStorage.getItem("nostr-session-users") || "[]"
      );
      sessionUsers.forEach((pubkey: string) => {
        if (typeof pubkey === "string") {
          recentUsers.add(pubkey);
        }
      });

      // 2. Get users from localStorage recent activity
      const recentActivity = localStorage.getItem("nostr-recent-activity");
      if (recentActivity) {
        try {
          const activity = JSON.parse(recentActivity);
          if (Array.isArray(activity)) {
            activity.forEach((item: any) => {
              if (item.pubkey && typeof item.pubkey === "string") {
                recentUsers.add(item.pubkey);
              }
            });
          }
        } catch (e) {
          console.warn("Failed to parse recent activity:", e);
        }
      }

      // 3. If no users found, use some well-known pubkeys for testing
      if (recentUsers.size === 0) {
        console.log(
          "📦 No recent users found, using well-known pubkeys for discovery test"
        );
        const wellKnownPubkeys = [
          "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d", // jack
          "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2", // fiatjaf
          "85080d3bad70ccdcd7f74c29a44f55bb85cbcd3dd0cbb957da1d215bdb931204", // cameri
        ];
        wellKnownPubkeys.forEach((pubkey) => recentUsers.add(pubkey));
      }

      const usersArray = Array.from(recentUsers).slice(0, 10);
      console.log(
        `📦 Starting discovery for ${usersArray.length} users:`,
        usersArray
      );

      if (usersArray.length > 0) {
        setDiscoveryMessage({
          type: "info",
          text: `Searching for relay preferences for ${usersArray.length} users...`,
        });

        const result = await discoverOutboxEvents(usersArray);

        if (result.success) {
          // Update last discovery time
          setLastDiscoveryTime(Date.now());

          if (result.eventsFound > 0) {
            setDiscoveryMessage({
              type: "success",
              text: `✅ Found ${result.eventsFound} relay preferences from ${result.usersDiscovered} users`,
            });
            await updateStats();
            await loadDetailedData();
          } else {
            setDiscoveryMessage({
              type: "info",
              text: "No relay preferences found for these users. They may not have published NIP-65 relay lists yet.",
            });
          }
        } else {
          setDiscoveryMessage({
            type: "error",
            text: `❌ Discovery failed: ${result.error || "Unknown error"}`,
          });
        }
      } else {
        setDiscoveryMessage({
          type: "info",
          text: "No users to discover. Try interacting with more profiles first.",
        });
      }
    } catch (error) {
      console.error("Failed to discover outbox events:", error);
      setDiscoveryMessage({
        type: "error",
        text: `❌ Error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    } finally {
      setIsDiscovering(false);
      // Clear message after 5 seconds
      setTimeout(() => setDiscoveryMessage(null), 5000);
    }
  };

  if (!isOpen) return null;

  const formatTimeAgo = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "Just now";
  };

  const modalStyle: React.CSSProperties = {
    position: "fixed",
    top: 50,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: isMobile ? "1rem" : "2rem",
  };

  const contentStyle: React.CSSProperties = {
    backgroundColor: "var(--app-bg-color)",
    border: "1px solid var(--border-color)",
    borderRadius: 0,
    maxWidth: isMobile ? "100%" : "800px",
    width: "100%",
    height: "100%",
    maxHeight: isMobile ? "75vh" : "80vh",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };

  const headerStyle: React.CSSProperties = {
    padding: "1rem",
    borderBottom: "1px solid var(--border-color)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  };

  const bodyStyle: React.CSSProperties = {
    flex: 1,
    overflow: "auto",
    padding: "1rem",
  };

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    padding: "0.5rem 1rem",
    width: "33.33%",
    border: isActive
      ? "1px solid var(--accent-color)"
      : "1px dotted var(--border-color)",
    filter: isActive ? "var(--accent-glow-filter)" : "none",
    backgroundColor: "var(--app-bg-color)",
    cursor: "pointer",
    color: "var(--text-color)",
    textAlign: "center",
    fontSize: "0.875rem",
  });

  const statsStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr 1fr",
    gap: "1rem",
    marginBottom: "1rem",
    padding: "1rem",
    backgroundColor: "var(--app-bg-color)",
    border: "1px solid var(--border-color)",
  };

  const statItemStyle: React.CSSProperties = {
    textAlign: "center",
  };

  const statValueStyle: React.CSSProperties = {
    fontSize: "1.25rem",
    fontWeight: "bold",
    color: "var(--accent-color)",
  };

  const statLabelStyle: React.CSSProperties = {
    fontSize: "0.75rem",
    color: "var(--text-color)",
    marginTop: "0.25rem",
    opacity: 0.7,
  };

  const buttonStyle: React.CSSProperties = {
    padding: "0.5rem 1rem",
    backgroundColor: "var(--accent-color)",
    color: "white",
    border: "none",
    borderRadius: 0,
    cursor: "pointer",
    fontSize: "0.875rem",
    margin: "0.25rem",
  };

  const disabledButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: "var(--text-muted)",
    cursor: "not-allowed",
  };

  return (
    <div style={modalStyle} onClick={onClose}>
      <div style={contentStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <h2
            style={{
              margin: 0,
              fontSize: "1.25rem",
              color: "var(--text-color)",
            }}
          >
            📦 Outbox Relays
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.5rem",
              cursor: "pointer",
              color: "var(--text-color)",
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={bodyStyle}>
          {/* Stats Overview */}
          <div style={statsStyle}>
            <div style={statItemStyle}>
              <div style={statValueStyle}>{stats.totalUsers}</div>
              <div style={statLabelStyle}>Users Tracked</div>
            </div>
            <div style={statItemStyle}>
              <div style={statValueStyle}>{stats.totalRelays}</div>
              <div style={statLabelStyle}>Unique Relays</div>
            </div>
            <div style={statItemStyle}>
              <div style={statValueStyle}>{stats.totalEvents}</div>
              <div style={statLabelStyle}>NIP-65 Events</div>
            </div>
            <div style={statItemStyle}>
              <div style={statValueStyle}>
                {migrationStatus?.outboxWeight
                  ? Math.round(migrationStatus.outboxWeight * 100)
                  : 0}
                %
              </div>
              <div style={statLabelStyle}>Outbox Weight</div>
            </div>
            <div style={statItemStyle}>
              <div style={statValueStyle}>
                {stats.discoveryRate > 0 ? stats.discoveryRate.toFixed(1) : "0"}
              </div>
              <div style={statLabelStyle}>Events/User</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ marginBottom: "1rem", textAlign: "center" }}>
            <button
              style={isDiscovering ? disabledButtonStyle : buttonStyle}
              onClick={handleDiscoverNow}
              disabled={isDiscovering}
              title="Manually discover relay preferences for recent users"
            >
              {isDiscovering ? "Discovering..." : "🔍 Discover More"}
            </button>
            <button
              style={buttonStyle}
              onClick={async () => {
                if (migrationStatus?.isRunning) {
                  stopMigration();
                } else {
                  await startMigration();
                }
                await updateMigrationStatus();
              }}
              title={
                migrationStatus?.isRunning
                  ? "Stop background discovery"
                  : "Start background discovery"
              }
            >
              {migrationStatus?.isRunning ? "⏹️ Stop" : "🔄 Restart"} Migration
            </button>
          </div>

          {/* Discovery Message */}
          {discoveryMessage && (
            <div
              style={{
                padding: "0.75rem 1rem",
                marginBottom: "1rem",
                border: `1px solid ${
                  discoveryMessage.type === "success"
                    ? "var(--accent-color)"
                    : discoveryMessage.type === "error"
                    ? "#ff4444"
                    : "var(--border-color)"
                }`,
                backgroundColor:
                  discoveryMessage.type === "success"
                    ? "rgba(0, 255, 0, 0.1)"
                    : discoveryMessage.type === "error"
                    ? "rgba(255, 0, 0, 0.1)"
                    : "rgba(255, 255, 255, 0.05)",
                color: "var(--text-color)",
                fontSize: "0.875rem",
                textAlign: "center",
              }}
            >
              {discoveryMessage.text}
            </div>
          )}

          {/* Tabs */}
          <div
            style={{
              display: "flex",
              marginBottom: "1rem",
              justifyContent: "center",
              gap: "0.25rem",
            }}
          >
            <button
              style={tabStyle(selectedTab === "overview")}
              onClick={() => setSelectedTab("overview")}
            >
              Overview
            </button>
            <button
              style={tabStyle(selectedTab === "users")}
              onClick={() => setSelectedTab("users")}
            >
              Users ({stats.totalUsers})
            </button>
            <button
              style={tabStyle(selectedTab === "relays")}
              onClick={() => setSelectedTab("relays")}
            >
              Relays ({stats.totalRelays})
            </button>
          </div>

          {/* Tab Content */}
          {selectedTab === "overview" && (
            <div
              style={{
                padding: "1rem",
                border: "1px solid var(--border-color)",
              }}
            >
              <h3 style={{ color: "var(--text-color)", marginBottom: "1rem" }}>
                Outbox Model Status
              </h3>

              <div style={{ marginBottom: "1rem" }}>
                <strong style={{ color: "var(--text-color)" }}>
                  System Status:
                </strong>
                <span
                  style={{
                    color: isInitialized
                      ? "var(--accent-color)"
                      : "var(--text-muted)",
                    marginLeft: "0.5rem",
                  }}
                >
                  {isInitialized ? "✅ Active" : "⏸️ Inactive"}
                </span>
                {migrationStatus?.isRunning && (
                  <span
                    style={{
                      marginLeft: "0.5rem",
                      fontSize: "0.875rem",
                      color: "var(--accent-color)",
                    }}
                  >
                    • 🔄 Migration Running
                  </span>
                )}
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <strong style={{ color: "var(--text-color)" }}>
                  Migration Progress:
                </strong>
                <div
                  style={{
                    marginTop: "0.5rem",
                    backgroundColor: "var(--app-bg-color)",
                    height: "20px",
                    position: "relative",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <div
                    style={{
                      backgroundColor: "var(--accent-color)",
                      height: "100%",
                      width: `${
                        migrationStatus?.outboxWeight
                          ? migrationStatus.outboxWeight * 100
                          : 0
                      }%`,
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    marginTop: "0.25rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>
                    {migrationStatus?.outboxWeight
                      ? Math.round(migrationStatus.outboxWeight * 100)
                      : 0}
                    % outbox model
                  </span>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      style={{
                        ...buttonStyle,
                        padding: "0.25rem 0.5rem",
                        fontSize: "0.75rem",
                      }}
                      onClick={async () => {
                        decreaseOutboxWeight();
                        await updateMigrationStatus();
                      }}
                      disabled={
                        !migrationStatus?.outboxWeight ||
                        migrationStatus.outboxWeight <= 0
                      }
                    >
                      −
                    </button>
                    <button
                      style={{
                        ...buttonStyle,
                        padding: "0.25rem 0.5rem",
                        fontSize: "0.75rem",
                      }}
                      onClick={async () => {
                        increaseOutboxWeight();
                        await updateMigrationStatus();
                      }}
                      disabled={migrationStatus?.outboxWeight >= 1.0}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <strong style={{ color: "var(--text-color)" }}>
                  Last Discovery:
                </strong>
                <span
                  style={{ color: "var(--text-muted)", marginLeft: "0.5rem" }}
                >
                  {formatTimeAgo(stats.lastDiscovery)}
                </span>
              </div>

              <div
                style={{
                  padding: "1rem",
                  backgroundColor: "var(--app-bg-color)",
                  borderRadius: 0,
                  marginTop: "1rem",
                }}
              >
                <h4
                  style={{ color: "var(--text-color)", marginBottom: "0.5rem" }}
                >
                  What is the Outbox Model?
                </h4>
                <p
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.875rem",
                    lineHeight: "1.4",
                    margin: 0,
                    marginBottom: "0.75rem",
                  }}
                >
                  The outbox model improves relay efficiency by routing queries
                  to user-specific relays instead of querying random relays. It
                  learns from NIP-65 relay list events to build a routing table
                  of user preferences, reducing network load and improving
                  performance.
                </p>
                <h4
                  style={{
                    color: "var(--text-color)",
                    marginBottom: "0.5rem",
                    marginTop: "1rem",
                  }}
                >
                  {migrationStatus?.isRunning
                    ? "🔄 Migration Active"
                    : "How Migration Works"}
                </h4>
                <p
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.875rem",
                    lineHeight: "1.4",
                    margin: 0,
                  }}
                >
                  {migrationStatus?.isRunning ? (
                    <>
                      Migration is{" "}
                      <strong style={{ color: "var(--accent-color)" }}>
                        running in the background
                      </strong>
                      . It automatically discovers relay preferences every 30
                      seconds and gradually increases the outbox weight as more
                      data is collected. You can continue using the app
                      normally. The weight will increase from{" "}
                      {Math.round((migrationStatus?.outboxWeight || 0) * 100)}%
                      toward 100% as relay data is discovered.
                    </>
                  ) : (
                    <>
                      Migration starts automatically when you enable Outbox
                      Mode. The system runs in the background, discovering relay
                      preferences every 30 seconds and gradually increasing the
                      outbox weight as more data is found. You can manually
                      trigger discovery with "Discover Now" or restart migration
                      with "Start Migration".
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          {selectedTab === "users" && (
            <div
              style={{
                padding: "1rem",
                border: "1px solid var(--border-color)",
              }}
            >
              <h3 style={{ color: "var(--text-color)", marginBottom: "1rem" }}>
                Tracked Users ({users.length}) - Stats: {stats.totalUsers}
              </h3>
              {loading ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "2rem",
                    color: "var(--text-muted)",
                  }}
                >
                  Loading user data...
                </div>
              ) : users.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "2rem",
                    color: "var(--text-muted)",
                  }}
                >
                  📊 User tracking data will appear here as you interact with
                  profiles and notes.
                  <br />
                  <small
                    style={{
                      fontSize: "0.75rem",
                      marginTop: "0.5rem",
                      display: "block",
                    }}
                  >
                    The system automatically discovers outbox events for users
                    you interact with.
                  </small>
                </div>
              ) : (
                <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                  {users.map((user, index) => (
                    <div
                      key={user.pubkey}
                      style={{
                        padding: "0.75rem",
                        borderBottom:
                          index < users.length - 1
                            ? "1px solid var(--border-color)"
                            : "none",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            color: "var(--text-color)",
                            fontWeight: "500",
                          }}
                        >
                          {user.displayName ||
                            user.name ||
                            `${nip19.npubEncode(user.pubkey).slice(0, 16)}...`}
                        </div>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                          }}
                        >
                          {user.displayName || user.name
                            ? `${nip19.npubEncode(user.pubkey).slice(0, 16)}...`
                            : ""}
                          {user.displayName || user.name ? " • " : ""}
                          {user.relayCount} relay
                          {user.relayCount !== 1 ? "s" : ""} •{" "}
                          {formatRelativeTime(user.lastSeen)}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--accent-color)",
                        }}
                      >
                        {user.relayCount}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedTab === "relays" && (
            <div
              style={{
                padding: "1rem",
                border: "1px solid var(--border-color)",
              }}
            >
              <h3 style={{ color: "var(--text-color)", marginBottom: "1rem" }}>
                Discovered Relays ({relays.length})
              </h3>
              {loading ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "2rem",
                    color: "var(--text-muted)",
                  }}
                >
                  Loading relay data...
                </div>
              ) : relays.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "2rem",
                    color: "var(--text-muted)",
                  }}
                >
                  🌐 Relay discovery data will appear here as outbox events are
                  processed.
                  <br />
                  <small
                    style={{
                      fontSize: "0.75rem",
                      marginTop: "0.5rem",
                      display: "block",
                    }}
                  >
                    Each relay is associated with users based on their NIP-65
                    relay list events.
                  </small>
                </div>
              ) : (
                <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                  {relays.map((relay, index) => (
                    <div
                      key={relay.relay}
                      style={{
                        padding: "0.75rem",
                        borderBottom:
                          index < relays.length - 1
                            ? "1px solid var(--border-color)"
                            : "none",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            color: "var(--text-color)",
                            fontWeight: "500",
                            wordBreak: "break-all",
                          }}
                        >
                          {relay.relay}
                        </div>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                          }}
                        >
                          {relay.userCount} user
                          {relay.userCount !== 1 ? "s" : ""} •{" "}
                          {formatRelativeTime(relay.lastSeen)}
                        </div>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--accent-color)",
                            marginTop: "0.25rem",
                          }}
                        >
                          {relay.permissions.join(", ")}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--accent-color)",
                          marginLeft: "1rem",
                        }}
                      >
                        {relay.userCount}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

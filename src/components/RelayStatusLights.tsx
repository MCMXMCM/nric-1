import React, { useState, useEffect } from "react";
import type { RelayStatus } from "../types/nostr/types";
import { useOutboxRelayManager } from "../hooks/useOutboxRelayManager";
import { useOutboxDiscoveryStatus } from "./OutboxDiscoveryManager";

interface RelayStatusLightsProps {
  relayStatuses: RelayStatus[];
}

const RelayStatusLights: React.FC<RelayStatusLightsProps> = ({
  relayStatuses,
}) => {
  const [showPopover, setShowPopover] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);

  // Get outbox discovery status
  const { isDiscovering } = useOutboxDiscoveryStatus();

  // Detect mobile on resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Handle click to toggle popover
  const handleClick = () => {
    setShowPopover(!showPopover);
  };

  // Use outbox relay manager instead of dynamic relay manager
  const { healthMetrics: dynamicRelayMetrics } = useOutboxRelayManager({
    autoInitialize: true,
  });

  // Filter to only show read relays (those with read permission) and limit to 18
  const readRelayStatuses = relayStatuses
    .filter((status) => status.read)
    .slice(0, 18);

  // Get healthy dynamic relays
  const healthyDynamicRelays = dynamicRelayMetrics
    .filter((metrics) => metrics.isHealthy)
    .slice(0, 18);

  // Combine regular and dynamic relays, deduplicating by URL
  const allRelays = [];
  const seenUrls = new Set<string>();

  // Add regular relays first
  for (const relay of readRelayStatuses) {
    if (!seenUrls.has(relay.url)) {
      allRelays.push(relay);
      seenUrls.add(relay.url);
    }
  }

  // Add dynamic relays that aren't already in the regular list
  for (const dynamicRelay of healthyDynamicRelays) {
    if (!seenUrls.has(dynamicRelay.url)) {
      allRelays.push(dynamicRelay);
      seenUrls.add(dynamicRelay.url);
    }
  }

  // Limit total to 18
  const limitedRelays = allRelays.slice(0, 18);

  // Create a full 3x6 grid (18 slots total)
  const gridSlots = Array.from(
    { length: 18 },
    (_, index) => limitedRelays[index] || null
  );

  // Calculate indicator size to fit within a comfortable viewing size
  // 3 rows: 3h + 2g = total, where g = 0.1rem
  // 3 × 0.4rem + 2 × 0.1rem = 1.4rem total height
  const indicatorSize = "0.4rem";

  // Always use 6 columns for 3x6 grid
  const numColumns = 6;

  return (
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
      }}
    >
      {/* Discovery notification icon */}
      {isDiscovering && (
        <>
          <style>{`
            @keyframes outbox-pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.4; }
            }
          `}</style>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-color-secondary)",
              fontSize: "0.875rem",
              animation: "outbox-pulse 2s ease-in-out infinite",
            }}
            title="Discovering relay lists..."
          >
            📦
          </div>
        </>
      )}

      {/* Relay status grid */}
      <div
        style={{
          position: "relative",
          display: "grid",
          gridTemplateRows: `repeat(3, ${indicatorSize})`,
          gridTemplateColumns: `repeat(${numColumns}, ${indicatorSize})`,
          gridAutoFlow: "column",
          gap: "0.1rem",
          alignItems: "start",
          justifyItems: "start",
          marginRight: "8px",
          marginTop: "8px",

          padding: "8px", // Increased padding for larger touch target
          borderRadius: "0px",
          cursor: "pointer",
          transition: "background-color 0.2s ease",
          maxWidth: `${numColumns * 0.4 + (numColumns - 1) * 0.1}rem`, // 6 columns × 0.4rem + 5 gaps × 0.1rem = 2.9rem
          maxHeight: "1.4rem", // Match the calculated total height
          minHeight: "44px", // Minimum touch target size for mobile accessibility
          minWidth: "44px", // Minimum touch target size for mobile accessibility
          alignSelf: "center", // Center vertically within the parent container
        }}
        onMouseEnter={() => setShowPopover(true)}
        onMouseLeave={() => setShowPopover(false)}
        onClick={handleClick}
        title="Relay Status"
      >
        {gridSlots.map((relay, index) => {
          // If slot is empty, show an "off" indicator
          if (!relay) {
            return (
              <div
                key={`empty-${index}`}
                style={{
                  width: indicatorSize,
                  height: indicatorSize,
                  maxWidth: indicatorSize,
                  maxHeight: indicatorSize,
                  borderRadius: "0",
                  backgroundColor: "rgba(245, 158, 11, 0.15)", // Dim amber for empty slots
                  transition: "background-color 0.2s ease",
                }}
              />
            );
          }

          // Determine if this is a dynamic relay or regular relay
          // Check if this relay is in the dynamic relays list
          const dynamicMetrics = healthyDynamicRelays.find(
            (dr) => dr.url === relay.url
          );
          const isDynamicRelay = !!dynamicMetrics;

          let backgroundColor = "var(--relay-disconnected)";

          if (isDynamicRelay && dynamicMetrics) {
            // Calculate success rate for dynamic relays
            const successRate =
              dynamicMetrics.totalRequests > 0
                ? dynamicMetrics.successCount / dynamicMetrics.totalRequests
                : 0;

            // Use different colors based on performance
            if (successRate >= 0.9) {
              backgroundColor = "var(--relay-connected)"; // Green for excellent
            } else if (successRate >= 0.7) {
              backgroundColor = "#f59e0b"; // Amber for good
            } else if (successRate >= 0.5) {
              backgroundColor = "#f97316"; // Orange for fair
            } else {
              backgroundColor = "#ef4444"; // Red for poor
            }
          } else if (!isDynamicRelay) {
            // Regular relay logic
            const status = relay as RelayStatus;
            backgroundColor = status.connected
              ? "var(--relay-connected)"
              : "var(--relay-disconnected)";
          }

          return (
            <div
              key={
                isDynamicRelay
                  ? `dynamic-${dynamicMetrics?.url}`
                  : (relay as RelayStatus).url
              }
              style={{
                width: indicatorSize,
                height: indicatorSize,
                maxWidth: indicatorSize,
                maxHeight: indicatorSize,
                borderRadius: "0",
                backgroundColor,
                transition: "background-color 0.2s ease",
              }}
            />
          );
        })}
        {showPopover && (
          <div
            style={{
              position: "absolute",
              ...(isMobile
                ? {
                    top: "100%",
                    left: "50%",
                    transform: "translateX(-50%)",
                    marginTop: "0.5rem",
                  }
                : {
                    top: "0",
                    left: "100%",
                    marginLeft: "0.5rem",
                  }),
              backgroundColor: "var(--app-bg-color)",
              border: "1px dotted var(--border-color)",
              padding: "0.5rem",
              zIndex: 10000,
              minWidth: "200px",
              maxWidth: isMobile ? "calc(100vw - 2rem)" : "none",
              maxHeight: isMobile ? "50vh" : "none",
              overflowY: isMobile ? "auto" : "visible",
            }}
          >
            {limitedRelays.map((relay, index) => {
              // Check if this relay is in the dynamic relays list
              const dynamicMetrics = healthyDynamicRelays.find(
                (dr) => dr.url === relay.url
              );
              const isDynamicRelay = !!dynamicMetrics;

              let statusColor = "var(--relay-disconnected)";
              let statusText = "";
              let relayUrl = "";

              if (isDynamicRelay && dynamicMetrics) {
                const successRate =
                  dynamicMetrics.totalRequests > 0
                    ? dynamicMetrics.successCount / dynamicMetrics.totalRequests
                    : 0;

                if (successRate >= 0.9) {
                  statusColor = "var(--relay-connected)";
                  statusText = "Excellent";
                } else if (successRate >= 0.7) {
                  statusColor = "#f59e0b";
                  statusText = "Good";
                } else if (successRate >= 0.5) {
                  statusColor = "#f97316";
                  statusText = "Fair";
                } else {
                  statusColor = "#ef4444";
                  statusText = "Poor";
                }

                relayUrl = dynamicMetrics.url;
              } else {
                const status = relay as RelayStatus;
                statusColor = status.connected
                  ? "var(--relay-connected)"
                  : "var(--relay-disconnected)";
                statusText = status.connected ? "Connected" : "Disconnected";
                relayUrl = status.url;
              }

              return (
                <div
                  key={
                    isDynamicRelay
                      ? `dynamic-${dynamicMetrics?.url}`
                      : (relay as RelayStatus).url
                  }
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.5rem",
                    padding: "0.25rem 0",
                    borderBottom: "1px dotted var(--border-color)",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.375rem",
                      minWidth: "fit-content",
                    }}
                  >
                    <span
                      style={{
                        color: "var(--text-color-secondary)",
                        fontSize: "0.75rem",
                        fontWeight: "500",
                        minWidth: "1.5rem",
                      }}
                    >
                      {index + 1}.
                    </span>
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "0",
                        backgroundColor: statusColor,
                        flexShrink: 0,
                      }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <div
                      style={{
                        color: "var(--text-color)",
                        fontSize: "0.875rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        textAlign: "left",
                      }}
                    >
                      {relayUrl.replace("wss://", "")}
                      {isDynamicRelay && " (Dynamic)"}
                    </div>
                    {isDynamicRelay && dynamicMetrics && (
                      <div
                        style={{
                          color: "var(--text-color-secondary)",
                          fontSize: "0.75rem",
                          marginTop: "0.125rem",
                          textAlign: "left",
                        }}
                      >
                        {statusText} (
                        {Math.round(
                          (dynamicMetrics.successCount /
                            dynamicMetrics.totalRequests) *
                            100
                        )}
                        %) • {dynamicMetrics.totalRequests} requests
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default RelayStatusLights;

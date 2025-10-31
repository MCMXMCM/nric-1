import React from "react";

interface PullToRefreshIndicatorProps {
  isPulling: boolean;
  isRefreshing: boolean;
  pullDistance: number;
  canRefresh: boolean;
  threshold: number;
  isDarkMode?: boolean;
}

export const PullToRefreshIndicator: React.FC<PullToRefreshIndicatorProps> = ({
  isPulling,
  isRefreshing,
  pullDistance,
  canRefresh,
  threshold,
  isDarkMode = false,
}) => {
  if (!isPulling && !isRefreshing) {
    return null;
  }

  const progress = Math.min(pullDistance / threshold, 1);
  // Colors for classic punch card aesthetic
  const cardBg = isDarkMode ? "#2b2b2b" : "#f0e7d8"; // cream / dark
  const cardBorder = isDarkMode ? "#3a3a3a" : "#e2d6bf";
  const perforation = isDarkMode ? "#111" : "#d9cdb9";
  const textColor = isDarkMode ? "#c7c7c7" : "#4a463f";
  const accent = canRefresh
    ? isDarkMode
      ? "var(--accent-color)"
      : "var(--ibm-mustard)"
    : isDarkMode
      ? "var(--app-bg-color)"
      : "var(--ibm-pewter)";

  // Position the card in the gap between header and pulled content
  // It should stay at the top (top: 0) while the content is pulled down via translateY
  return (
    <div
      style={{
        position: "absolute",
        top: `-${pullDistance}px`, // Negative position to sit in the gap created by pulling
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 101, // Above the main layout header (z-index: 100)
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "relative",
          width: 300,
          height: 70, // Reduced from 90px to ensure card fits below header
          borderRadius: 6,
          background: cardBg,
          border: `2px solid ${cardBorder}`,
          boxShadow: isDarkMode
            ? "inset 0 0 0 1px rgba(255,255,255,0.02), 0 6px 16px rgba(0,0,0,0.25)"
            : "inset 0 0 0 1px rgba(0,0,0,0.02), 0 8px 18px rgba(0,0,0,0.12)",
          overflow: "hidden",
        }}
      >
        {/* Top perforation strip */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 16,
            background: `repeating-linear-gradient(90deg,
              transparent 0 18px,
              ${perforation} 18px 26px,
              transparent 26px 44px
            )`,
            opacity: 0.7,
          }}
        />

        {/* Left index margin */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: 26,
            background: isDarkMode ? "#232323" : "#e6dac4",
            borderRight: `1px dashed ${isDarkMode ? "#3a3a3a" : "#d3c5aa"}`,
          }}
        />

        {/* Hole grid (subtle) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(circle at 40px 34px, transparent 3px, ${cardBg} 3px)`,
            backgroundSize: "48px 24px",
            backgroundRepeat: "repeat",
            opacity: isDarkMode ? 0.06 : 0.12,
          }}
        />

        {/* Label and status */}
        <div
          style={{
            position: "absolute",
            top: 8, // Moved up from 12 to 8 for better fit in smaller card
            left: 40,
            right: 16,
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontFamily:
              'IBM Plex Sans, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial',
            color: textColor,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              lineHeight: 1.15,
            }}
          >
            <div style={{ fontSize: 11, opacity: 0.8 }}>
              {isRefreshing
                ? "Inserting new card..."
                : canRefresh
                  ? "Release to refresh"
                  : "Pull to refresh"}
            </div>
          </div>
        </div>

        {/* Progressive active holes (accent squares) */}
        {(() => {
          const rows = 4; // requested 4 rows
          const cols = 24; // many columns; spacing will stretch to edges
          const holeSize = 5; // keep overall height ≈ previous (56px)
          const rowGap = 4;
          const total = rows * cols;
          const visible = isRefreshing
            ? total
            : Math.max(0, Math.floor(progress * total));
          const cells: React.ReactNode[] = [];
          for (let i = 0; i < total; i++) {
            cells.push(
              <div
                key={i}
                style={{
                  width: holeSize,
                  height: holeSize,
                  borderRadius: 2,
                  background: accent,
                  opacity: i < visible ? 0.95 : 0.15,
                  transition: "opacity 120ms ease",
                }}
              />
            );
          }
          return (
            <div
              style={{
                position: "absolute",
                left: 40,
                right: 16,
                top: 24, // Moved up from 28 to 24 for better fit in smaller card
                height: rows * holeSize + (rows - 1) * rowGap,
                display: "grid",
                gridTemplateColumns: `repeat(${cols}, ${holeSize}px)`,
                gridAutoRows: `${holeSize}px`,
                columnGap: 0,
                rowGap,
                justifyContent: "space-between", // stretch columns to the right edge
                alignContent: "start",
                pointerEvents: "none",
              }}
            >
              {cells}
            </div>
          );
        })()}

        {/* Bottom guide line */}
        <div
          style={{
            position: "absolute",
            left: 26,
            right: 0,
            bottom: 8, // Moved up from 14 to 8 for better fit in smaller card
            height: 1,
            background: isDarkMode ? "#3a3a3a" : "#d9cdb9",
            opacity: 0.6,
          }}
        />
      </div>
    </div>
  );
};

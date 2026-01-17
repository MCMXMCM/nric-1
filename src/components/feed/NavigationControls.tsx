import React from "react";
import { feedStyles } from "./styles";
import { useHotkeyContext } from "../../contexts/HotkeyContext";
import { useUIStore } from "../lib/useUIStore";
import { setVimMode } from "../lib/uiStore";

interface NavigationControlsProps {
  isMobile: boolean;
  currentIndex: number;
  // Display index shown to user (1-based cumulative)
  displayIndex?: number;
  totalNotes: number;
  onNavigation: (direction: "up" | "down") => void;
}

export const NavigationControls: React.FC<NavigationControlsProps> = ({
  isMobile,
  onNavigation,
}) => {
  const {
    navigateFocus,
  } = useHotkeyContext();
  const vimMode = useUIStore((s) => s.vimMode || false);

  if (isMobile) {
    return null; // No longer showing index/total indicators
  }

  return (
    <>
      {/* Amber light indicator - clickable to toggle keyboard navigation */}
      <div
        style={{
          width: "12px",
          height: "12px",
          backgroundColor: vimMode
            ? "#d97706"
            : "#92400e", // Brighter when vim mode is on, darker when off
          border: `1px solid #92400e`,
          boxShadow: vimMode
            ? "0 0 4px #f59e0b, 0 0 8px rgba(245, 158, 11, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.16), inset 0 -1px 0 rgba(0, 0, 0, 0.3)"
            : "0 0 2px #92400e, 0 0 4px rgba(146, 64, 14, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 -1px 0 rgba(0, 0, 0, 0.3)",
          transition: "all 0.2s ease",
          position: "relative",
          opacity: vimMode ? 0.8 : 0.4,
          marginRight: "0.5rem",
          cursor: "pointer",
          borderRadius: "50%",
        }}
        onClick={() => {
          // Toggle vim mode setting (this will persist and control keyboard navigation)
          setVimMode(!vimMode);
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow =
            "0 0 6px #f59e0b, 0 0 12px rgba(245, 158, 11, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.16), inset 0 -1px 0 rgba(0, 0, 0, 0.3)";
          e.currentTarget.style.backgroundColor = "#f59e0b";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = vimMode
            ? "0 0 4px #f59e0b, 0 0 8px rgba(245, 158, 11, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.16), inset 0 -1px 0 rgba(0, 0, 0, 0.3)"
            : "0 0 2px #92400e, 0 0 4px rgba(146, 64, 14, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 -1px 0 rgba(0, 0, 0, 0.3)";
          e.currentTarget.style.backgroundColor = vimMode
            ? "#d97706"
            : "#92400e";
        }}
        title={
          vimMode
            ? "Click to disable Vim Mode"
            : "Click to enable Vim Mode"
        }
      />
      <span
        style={{
          ...feedStyles.navigationText,
          color: "var(--text-color)",
        }}
      >
        Navigate with j/k or
      </span>
      <button
        onClick={() => {
          navigateFocus("down");
          onNavigation("down"); // Keep the original callback for any other logic
        }}
        style={{
          ...feedStyles.transparentButton,
          color: "var(--text-color)",
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      </button>
      <button
        onClick={() => {
          navigateFocus("up");
          onNavigation("up"); // Keep the original callback for any other logic
        }}
        style={{
          ...feedStyles.transparentButton,
          color: "var(--text-color)",
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
    </>
  );
};

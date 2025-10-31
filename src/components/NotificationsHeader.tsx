import React from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { navigateHome } from "../utils/modalUrlState";
import { useUIStore } from "./lib/useUIStore";

interface NotificationsHeaderProps {
  isMobile: boolean;
  unreadCount: number;
}

const NotificationsHeader: React.FC<NotificationsHeaderProps> = ({
  isMobile,
  unreadCount,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const uiIsDarkMode = useUIStore((s) => s.isDarkMode);

  // Helper function to determine text color based on theme
  const getTextColor = () => {
    return uiIsDarkMode ? "var(--text-color)" : "var(--ibm-cream)";
  };

  // Helper function to determine background color based on theme
  const getBackgroundColor = () => {
    return uiIsDarkMode ? "var(--app-bg-color)" : "var(--ibm-burgundy)";
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        width: "100%",
        position: "relative",
        backgroundColor: getBackgroundColor(),
        padding: "0.5rem",
        minHeight: "2.5rem",
      }}
    >
      <div
        style={{
          cursor: "pointer",
          color: getTextColor(),
          fontSize: "0.875rem",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          display: "inline-block",
          minWidth: "50px",
          minHeight: "10px",
          marginLeft: "0.5rem",
        }}
        onClick={() => navigateHome(navigate, location)}
      >
        <span>{"< Feed"}</span>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          pointerEvents: "none",
          maxWidth: isMobile ? "50vw" : undefined,
          whiteSpace: isMobile ? "nowrap" : undefined,
          overflow: isMobile ? "hidden" : undefined,
          textOverflow: isMobile ? "ellipsis" : undefined,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontSize: "0.875rem",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            display: "inline-block",
            maxWidth: isMobile ? "50vw" : undefined,
            whiteSpace: isMobile ? "nowrap" : undefined,
            overflow: isMobile ? "hidden" : undefined,
            textOverflow: isMobile ? "ellipsis" : undefined,
            color: getTextColor(),
          }}
        >
          Notifications
        </span>
      </div>

      <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "transparent",
            color: getTextColor(),
            fontSize: "0.875rem",
            padding: "0.25rem 0.5rem",
            borderRadius: "4px",
            minWidth: "auto",
          }}
        >
          {unreadCount > 0 ? unreadCount : "0"}
        </div>
      </div>
    </div>
  );
};

export default NotificationsHeader;

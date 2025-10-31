import type { CSSProperties } from "react";

/**
 * Common button styles used throughout the profile view
 */
export const getBaseButtonStyle = (isMobile: boolean): CSSProperties => ({
  backgroundColor: "transparent",
  color: "var(--text-color)",
  border: "1px dotted var(--border-color)",
  
  fontSize: "0.75rem",
  textTransform: "uppercase",
  transition: "all 0.3s ease",
  borderRadius: "0",
  whiteSpace: "nowrap",
  height: isMobile ? "1.5rem" : "2rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "unset",
  cursor: "pointer",
});

/**
 * Back button specific styles
 */
export const getBackButtonStyle = (isMobile: boolean): CSSProperties => ({
  ...getBaseButtonStyle(isMobile),
  padding: "0.75rem",
  marginTop: "0.25rem",
  marginBottom: "0.25rem",
});

/**
 * Small action button styles (copy, share, etc.)
 */
export const getSmallButtonStyle = (): CSSProperties => ({
  backgroundColor: "transparent",
  color: "var(--note-view-header-text-color)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "0",
  border: "none",
  outline: "none",
  transition: "color 0.3s ease",
  padding: "0.25rem",
});

/**
 * Contact button styles (followers, following)
 */
export const getContactButtonStyle = (): CSSProperties => ({
  backgroundColor: "transparent",
  color: "var(--text-color)",
  border: "1px dotted var(--border-color)",
  
  fontSize: "0.75rem",
  textTransform: "uppercase",
  transition: "all 0.3s ease",
  borderRadius: "0",
  whiteSpace: "nowrap",
  height: "1.5rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "unset",
  padding: "0 0.5rem",
  cursor: "pointer",
});

/**
 * Follow button styles with state-based colors
 */
export const getFollowButtonStyle = (
  isFollowing: boolean,
  userPubkey: string | undefined,
  isSelf: boolean,
  isFollowBusy: boolean
): CSSProperties => ({
  ...getContactButtonStyle(),
  color: isFollowing ? "var(--app-text-secondary)" : "var(--text-color)",
  opacity: userPubkey && !isSelf ? 1 : 0.6,
  cursor:
    !userPubkey || isFollowing || isFollowBusy || isSelf
      ? "not-allowed"
      : "pointer",
});

/**
 * Container styles for different sections
 */
export const getMainContainerStyle = (isMobile: boolean): CSSProperties => ({
  width: "100%",
  maxWidth: isMobile ? "100%" : "1000px",
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  flex: 1,
  overflowX: "hidden",
  overflowY: "visible",
});

export const getContentAreaStyle = (isMobile: boolean): CSSProperties => ({
  width: "100%",
  margin: "0 auto",
  display: "flex",
  flexDirection: isMobile ? "column" : "row",
  gap: isMobile ? "0.25rem" : "0",
  padding: isMobile ? "0.25rem 0.25rem 0 0.25rem " : "1rem",
  boxSizing: "border-box",
  flex: 1,
  minHeight: 0,
  // Allow scrolling on mobile to prevent content from being cut off
  overflowY: isMobile ? "auto" : "visible",
});

export const getProfileSectionStyle = (isMobile: boolean): CSSProperties => ({
  maxHeight: isMobile ? "none" : "100%",
  overflowY: isMobile ? "visible" : "auto",
  flex: isMobile ? "none" : "1",
  minWidth: 0,
  
  position: isMobile ? "relative" : "sticky",
  top: isMobile ? 0 : "var(--safe-area-inset-top)",
  zIndex: isMobile ? 3 : 1,
  paddingBottom: !isMobile
    ? "calc(8rem + var(--safe-area-inset-bottom))"
    : "0",
  borderBottom: isMobile
    ? "none"
    : "1px dotted var(--border-color)",
});


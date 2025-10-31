import React from "react";
import LoadingTextPlaceholder from "../ui/LoadingTextPlaceholder";

interface NewNotesIndicatorProps {
  newNotesCount: number;
  isRefreshing: boolean;
  relayUrls: string[];
  showNoNewNotesMessage: boolean;
  onRefresh: () => void;
  onAddNewNotes?: () => void; // New callback for adding buffered notes directly
  isDarkMode: boolean;
  isMobile: boolean;
}

export const NewNotesIndicator: React.FC<NewNotesIndicatorProps> = ({
  newNotesCount,
  isRefreshing,
  relayUrls,
  showNoNewNotesMessage,
  onRefresh,
  onAddNewNotes,
  isDarkMode: _isDarkMode, // Unused - now using CSS variables
  isMobile,
}) => {
  // Debug logging to help identify issues (reduced to prevent spam)
  React.useEffect(() => {
    if (import.meta.env.DEV && Math.random() < 0.1) {
      console.log(
        `📊 NewNotesIndicator: Rendered with ${newNotesCount} new notes`,
        {
          isRefreshing,
          relayCount: relayUrls.length,
          isMobile,
          hasAddCallback: !!onAddNewNotes,
          showNoNewNotesMessage,
          isDisabled: isRefreshing || relayUrls.length === 0,
        }
      );
    }
  }, [
    newNotesCount,
    isRefreshing,
    relayUrls.length,
    isMobile,
    onAddNewNotes,
    showNoNewNotesMessage,
  ]);
  const getButtonText = () => {
    if (relayUrls.length === 0) return "No Relays";
    if (isRefreshing) return "__LOADING__";
    if (newNotesCount > 0) return `${newNotesCount} new`;
    return "Refresh";
  };

  const isDisabled = isRefreshing || relayUrls.length === 0;

  // Amber brightness calculation removed - now handled in FeedControls center section

  // Choose the appropriate click handler - now always refresh and jump to top
  const handleClick = () => {
    if (onAddNewNotes) {
      // Use the add new notes function which jumps to top and refreshes
      console.log(
        "🔄 Scroll-based refresh: jumping to top and refreshing feed"
      );
      onAddNewNotes();
    } else {
      // Fallback to regular refresh
      console.log("🔄 Refreshing feed");
      onRefresh();
    }
  };

  const buttonStyle: React.CSSProperties = {
    backgroundColor: "transparent",
    // border: "1px solid var(--theme-aware-border)",
    borderRadius: "0",
    border: "1px solid var(--border-color)",
    // outline: _isDarkMode
    //   ? "1px solid var(--border-color)"
    //   : "1px solid var(--ibm-cream)",
    // color: _isDarkMode ? "var(--text-color)" : "var(--ibm-cream)",
    fontSize: isMobile ? "0.875rem" : "0.75rem",
    fontWeight: "normal",
    textTransform: "uppercase" as const,
    transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)", // Smoother transition
    whiteSpace: "nowrap" as const,
    // height: isMobile ? "1.75rem" : "1.25rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: isMobile ? "0 0.875rem" : "0 0.75rem",
    cursor: isDisabled ? "not-allowed" : "pointer",
    marginRight: "0.5rem",
    opacity: isDisabled ? 0.6 : 1,
    minHeight: "2rem",
    height: "2rem",
    minWidth: isMobile ? "2.5rem" : "auto",
  };

  const getTitle = () => {
    return "Jump to top and refresh feed";
  };

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      style={buttonStyle}
      title={getTitle()}
      aria-live={newNotesCount > 0 ? "polite" : undefined}
    >
      {getButtonText() === "__LOADING__" ? (
        <LoadingTextPlaceholder
          style={{
            fontSize: "var(--font-size-base)",
            color: "var(--text-color)",
          }}
          type="custom"
          customLength={7}
        />
      ) : (
        <>
          <span>{getButtonText()}</span>
        </>
      )}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </button>
  );
};

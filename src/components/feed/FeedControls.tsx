import React from "react";
import { useNavigate } from "@tanstack/react-router";
import { FilterIndicators } from "./FilterIndicators";
import { NavigationControls } from "./NavigationControls";
import { NewNotesIndicator } from "./NewNotesIndicator";
import { RelaySelector } from "./RelaySelector";
import { OutboxProgressStatus } from "./OutboxProgressStatus";
import { feedStyles } from "./styles";
import { useUIStore } from "../lib/useUIStore";

interface FeedControlsProps {
  isMobile: boolean;
  isNoteRoute: boolean;
  // Filter props
  showReplies: boolean;
  showReposts: boolean;
  customHashtags: string[];
  onHashtagRemove: (hashtag: string) => void;
  showOptions: boolean;
  showClearCacheConfirm: boolean;
  longFormMode?: boolean;

  // Navigation props
  currentIndex: number;
  displayIndex?: number;
  totalNotes: number;
  onNavigation: (direction: "up" | "down") => void;
  isFetchingPage?: boolean;
  // Refresh feed props
  onRefreshFeed: () => void;
  onAddNewNotes?: () => void; // New callback for adding buffered notes directly
  isRefreshingFeed: boolean;
  relayUrls: string[];
  newNotesFound: number;
  showNoNewNotesMessage: boolean;
  // Relay selection props
  selectedRelay?: string;
  onRelaySelectionChange?: (selectedRelay: string) => void;
  // User authentication for following option
  userPubkey?: string | null;
  hasContacts?: boolean;
  contactsLoading?: boolean;
}

export const FeedControls: React.FC<FeedControlsProps> = ({
  isMobile,
  isNoteRoute,
  showReplies,
  showReposts,
  customHashtags,
  onHashtagRemove,
  showOptions,
  showClearCacheConfirm,
  longFormMode = false,

  currentIndex,
  displayIndex,
  totalNotes,
  onNavigation,
  onRefreshFeed,
  onAddNewNotes,
  isRefreshingFeed,
  relayUrls,
  newNotesFound,
  showNoNewNotesMessage,
  selectedRelay,
  onRelaySelectionChange,
  userPubkey,
  hasContacts = false,
  contactsLoading,
}) => {
  const navigate = useNavigate();
  const uiIsDarkMode = useUIStore((s) => s.isDarkMode);

  // Check if any filters are active
  // const hasActiveFilters =
  //   !showReplies || !showReposts || filterByFollow || customHashtags.length > 0;

  if (isNoteRoute) {
    return null;
  }

  return (
    <div
      style={{
        ...(isMobile
          ? feedStyles.bottomNavigation(isMobile)
          : feedStyles.controlsContainer(isMobile)),
        // zIndex: showOptions || showClearCacheConfirm ? -1 : 999,
        opacity: showOptions || showClearCacheConfirm ? 0 : 1,
        pointerEvents: showOptions || showClearCacheConfirm ? "none" : "auto",
      }}
    >
      {/* Mobile outbox progress status - positioned below all controls */}
      {isMobile && (
        <div
          style={{
            width: "100%",
            padding: "0.5rem 1rem",
            backgroundColor: "var(--app-bg-color)",
          }}
        >
          <OutboxProgressStatus isMobile={isMobile} />
        </div>
      )}
      <div
        style={{
          ...(isMobile
            ? feedStyles.bottomNavigationContent(isMobile)
            : {
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.125rem",
                width: "100%",
                justifyContent: "center",
                boxSizing: "border-box",
              }),
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: "0",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              justifyContent: "space-between",
              minHeight: isMobile ? "2.7rem" : "2.5rem",
              // backgroundColor: uiIsDarkMode
              //   ? "var(--app-bg-color)"
              //   : "var(--ibm-dark-teal)",
              // borderBottom:
              //   hasActiveFilters || !isMobile
              //     ? "none"
              //     : "1px solid var(--border-color)",
            }}
          >
            {/* Left section - Load New Notes + Relay Selector on desktop, New Notes on mobile */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                flex: isMobile ? "1" : "1",
                paddingLeft: "0.5rem",
                gap: "0.5rem",
              }}
            >
              {/* desktop New Notes Indicator */}
              {!isMobile && (
                <NewNotesIndicator
                  newNotesCount={newNotesFound}
                  isRefreshing={isRefreshingFeed}
                  relayUrls={relayUrls}
                  showNoNewNotesMessage={showNoNewNotesMessage}
                  onRefresh={onRefreshFeed}
                  onAddNewNotes={onAddNewNotes}
                  isDarkMode={uiIsDarkMode}
                  isMobile={false}
                />
              )}
              {/* desktop Relay Selector - positioned to the right of refresh button */}
              {!isMobile && onRelaySelectionChange && selectedRelay && (
                <RelaySelector
                  relayUrls={relayUrls}
                  selectedRelay={selectedRelay}
                  onRelaySelectionChange={onRelaySelectionChange}
                  isDarkMode={uiIsDarkMode}
                  isMobile={isMobile}
                  disabled={isRefreshingFeed}
                  userPubkey={userPubkey}
                  hasContacts={hasContacts}
                  contactsLoading={contactsLoading}
                />
              )}
              {/* mobile New Notes Indicator */}
              {isMobile && (
                <NewNotesIndicator
                  newNotesCount={newNotesFound}
                  isRefreshing={isRefreshingFeed}
                  relayUrls={relayUrls}
                  showNoNewNotesMessage={showNoNewNotesMessage}
                  onRefresh={onRefreshFeed}
                  onAddNewNotes={onAddNewNotes}
                  isDarkMode={uiIsDarkMode}
                  isMobile={true}
                />
              )}
            </div>

            {/* Center section - Navigation controls on desktop, Relay Selector on mobile */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                justifyContent: "center",
                flex: "1",
              }}
            >
              {/* mobile Relay Selector */}
              {isMobile && onRelaySelectionChange && selectedRelay && (
                <RelaySelector
                  relayUrls={relayUrls}
                  selectedRelay={selectedRelay}
                  onRelaySelectionChange={onRelaySelectionChange}
                  isDarkMode={uiIsDarkMode}
                  isMobile={isMobile}
                  disabled={isRefreshingFeed}
                  userPubkey={userPubkey}
                  hasContacts={hasContacts}
                  contactsLoading={contactsLoading}
                />
              )}

              {/* desktop Navigation controls */}
              {!isMobile && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                  }}
                >
                  <NavigationControls
                    isMobile={isMobile}
                    currentIndex={currentIndex}
                    displayIndex={displayIndex}
                    totalNotes={totalNotes}
                    onNavigation={onNavigation}
                  />
                </div>
              )}
            </div>

            {/* Right section - Empty (share/thread buttons moved to note headers) */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                flex: "1",
                paddingRight: "0.5rem",
              }}
            >
              {/* Desktop outbox progress status - positioned to the left of New Note button */}
              {!isMobile && (
                <button
                  onClick={() =>
                    navigate({
                      to: "/create",
                      search: { reply: "", quote: "" },
                    })
                  }
                  style={{
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
                    marginRight: "0.5rem",
                    minHeight: "1.25rem",
                    height: "1.25rem",
                    minWidth: isMobile ? "2.5rem" : "auto",
                  }}
                  title="Create a new note"
                >
                  New Note
                </button>
              )}

              {isMobile && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    // maxWidth: "25%",
                  }}
                >
                  <NavigationControls
                    isMobile={isMobile}
                    currentIndex={currentIndex}
                    displayIndex={displayIndex}
                    totalNotes={totalNotes}
                    onNavigation={onNavigation}
                  />
                  <button
                    onClick={() =>
                      navigate({
                        to: "/create",
                        search: { reply: "", quote: "" },
                      })
                    }
                    style={{
                      backgroundColor: "transparent",
                      fontSize: "var(--font-size-sm)",
                      border: "1px solid var(--border-color)",
                      // outline: uiIsDarkMode
                      //   ? "1px solid var(--border-color)"
                      //   : "1px solid var(--ibm-cream)",
                      textTransform: "uppercase" as const,
                      transition: "all 0.3s ease",
                      whiteSpace: "nowrap" as const,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-start",
                      height: "2rem",

                      minHeight: "2rem",
                      cursor: "pointer",
                      // border: "1px solid var(--theme-aware-border)",
                      padding: "0 0.75rem",
                      color: "var(--text-color)",
                      // color: uiIsDarkMode
                      //   ? "var(--text-color)"
                      //   : "var(--ibm-cream)",
                    }}
                    title="Create note"
                  >
                    <span style={{}}>New Note</span>
                  </button>
                </div>
              )}
              {/* Share and thread buttons moved to individual note headers */}
            </div>

            {/* Filter indicators */}
          </div>

          <FilterIndicators
            showReplies={showReplies}
            showReposts={showReposts}
            customHashtags={customHashtags}
            onHashtagRemove={onHashtagRemove}
            isMobile={isMobile}
            showOptions={showOptions}
            showClearCacheConfirm={showClearCacheConfirm}
            longFormMode={longFormMode}
          />
        </div>
        {/* Desktop outbox progress status - positioned at the bottom */}
        {!isMobile && (
          <div
            style={{
              width: "100%",
              padding: "0.5rem 1rem",
              backgroundColor: "var(--app-bg-color)",
            }}
          >
            <OutboxProgressStatus isMobile={isMobile} />
          </div>
        )}
      </div>
    </div>
  );
};

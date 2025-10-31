import React, { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { SectionHeader } from "./SectionHeader";
import { TreeList, TreeListItem } from "./TreeListItem";
import { SettingsButton } from "./SettingsButton";
import { useBookmarks } from "../../hooks/useBookmarks";

interface BookmarksSectionProps {
  isMobile?: boolean;
}

/**
 * Settings section for managing bookmarks
 * Allows users to view and manage their bookmarked notes
 */
export const BookmarksSection: React.FC<BookmarksSectionProps> = () => {
  const navigate = useNavigate();
  const { bookmarksCount, clearAllBookmarks } = useBookmarks();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleViewBookmarks = useCallback(() => {
    navigate({ to: "/bookmarks" });
  }, [navigate]);

  const handleClearAll = useCallback(() => {
    if (bookmarksCount === 0) {
      setShowClearConfirm(false);
      return;
    }
    clearAllBookmarks();
    setShowClearConfirm(false);
  }, [bookmarksCount, clearAllBookmarks]);

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <SectionHeader title="Bookmarks" paddingTop="0" />
      <TreeList style={{ overflow: "hidden" }}>
        {/* Bookmark count */}
        <TreeListItem>
          <div
            style={{
              color: "var(--text-color)",
              fontSize: "var(--font-size-sm)",
              textAlign: "start",
              fontWeight: "normal",
              opacity: 0.8,
            }}
          >
            Saved bookmarks: <strong>{bookmarksCount}</strong>
          </div>
        </TreeListItem>

        {/* View Bookmarks button */}
        <TreeListItem>
          <SettingsButton
            onClick={handleViewBookmarks}
            textAlign="start"
            style={{ width: "100%" }}
            disabled={bookmarksCount === 0}
          >
            {bookmarksCount === 0 ? "No bookmarks yet" : "View Bookmarks"}
          </SettingsButton>
        </TreeListItem>

        {/* Clear All button */}
        <TreeListItem isLast>
          {showClearConfirm ? (
            <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
              <SettingsButton
                onClick={handleClearAll}
                textAlign="start"
                style={{
                  flex: 1,
                  backgroundColor: "var(--danger-color, #dc2626)",
                  color: "white",
                }}
              >
                Confirm Delete
              </SettingsButton>
              <SettingsButton
                onClick={() => setShowClearConfirm(false)}
                textAlign="start"
                style={{ flex: 1 }}
              >
                Cancel
              </SettingsButton>
            </div>
          ) : (
            <SettingsButton
              onClick={() => setShowClearConfirm(true)}
              textAlign="start"
              style={{ width: "100%" }}
              disabled={bookmarksCount === 0}
            >
              Clear All Bookmarks
            </SettingsButton>
          )}
        </TreeListItem>
      </TreeList>
    </div>
  );
};

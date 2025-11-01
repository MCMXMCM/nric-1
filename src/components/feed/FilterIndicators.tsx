import React from "react";
import { feedStyles } from "./styles";

interface FilterIndicatorsProps {
  showReplies: boolean;
  showReposts: boolean;
  customHashtags: string[];
  onHashtagRemove: (hashtag: string) => void;
  isMobile: boolean;
  showOptions: boolean;
  showClearCacheConfirm: boolean;
  longFormMode?: boolean;
}

export const FilterIndicators: React.FC<FilterIndicatorsProps> = ({
  showReplies,
  showReposts,
  customHashtags,
  onHashtagRemove,
  isMobile,
  showOptions,
  showClearCacheConfirm,
  longFormMode = false,
}) => {
  // Check if any filters are active
  const hasActiveFilters =
    !showReplies || !showReposts || customHashtags.length > 0 || longFormMode;

  // Add WebKit scrollbar styles for mobile horizontal scrolling
  React.useEffect(() => {
    if (isMobile) {
      const styleId = 'filter-indicators-scrollbar-styles';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          .filter-indicators-container::-webkit-scrollbar {
            width: 0px;
            background: transparent;
          }
          .filter-indicators-container::-webkit-scrollbar-thumb {
            background: transparent;
          }
          .filter-indicators-container::-webkit-scrollbar-track {
            background: transparent;
          }
        `;
        document.head.appendChild(style);
      }
    }
  }, [isMobile]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        marginBottom: "0.25rem",
        marginTop: "0.25rem",
        borderBottom:
          hasActiveFilters && isMobile
            ? "1px solid var(--border-color) "
            : "none",
        opacity: showOptions || showClearCacheConfirm ? 0 : 1,
        pointerEvents: showOptions || showClearCacheConfirm ? "none" : "auto",
      }}
    >
      {/* Filter indicators container - evenly spaced across remaining width */}
      <div
        className={isMobile ? "filter-indicators-container" : undefined}
        style={{
          ...feedStyles.filterIndicatorsContainer(isMobile),
        }}
      >
        {/* "Filters:" label - only show when there are active filters */}
        {hasActiveFilters && (
          <span
            style={{
              borderRadius: "0",
              fontSize: "var(--font-size-xs)",
              color: "var(--text-color)",

              textTransform: "uppercase",
              opacity: 0.7,
              letterSpacing: "0.05em",
              marginRight: "0.25rem",
            }}
          >
            Filters:
          </span>
        )}
        {!showReplies && (
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
            }}
          >
            <span
              style={{
                ...feedStyles.filterText,
                textDecoration: "line-through",
                textTransform: "uppercase",
              }}
            >
              replies
            </span>
          </div>
        )}
        {!showReposts && (
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
            }}
          >
            <span
              style={{
                ...feedStyles.filterText,
                textDecoration: "line-through",
                textTransform: "uppercase",
              }}
            >
              reposts
            </span>
          </div>
        )}

        {longFormMode && (
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              paddingRight: "1rem",
              borderRight:
                customHashtags.length > 0
                  ? "1px dotted var(--border-color)"
                  : "none",
            }}
          >
            <span style={feedStyles.filterText}>LONGFORM</span>
          </div>
        )}
        {customHashtags &&
          customHashtags.length > 0 &&
          customHashtags.map((tag, index) => (
            <div
              key={`custom-${tag}`}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  paddingLeft: "0.5rem",
                  color: "var(--text-color)",
                  paddingRight: "1rem",
                  borderRight:
                    index === customHashtags.length - 1
                      ? "none"
                      : "1px dotted var(--border-color)",
                  fontSize: "var(--font-size-xs)",
                  borderRadius: 0,
                  backgroundColor: "var(--app-bg-color)",
                }}
              >
                #{tag.toUpperCase()}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onHashtagRemove(tag);
                  }}
                  style={{
                    color: "var(--text-color)",
                    fontSize: "var(--font-size-base)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textTransform: "uppercase",
                    transition: "all 0.3s ease",
                    borderRadius: "0",
                    whiteSpace: "nowrap",
                    height: "1.5rem",
                    minHeight: "1rem",
                    minWidth: "1rem",
                    background: "transparent",
                    cursor: "pointer",
                    border: "none",
                  }}
                  title="Remove hashtag"
                >
                  ×
                </button>
              </span>
            </div>
          ))}
      </div>
    </div>
  );
};

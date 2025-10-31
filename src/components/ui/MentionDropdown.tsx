import React, { useEffect, useRef } from "react";
import type { MentionMatch } from "../../hooks/useMentionAutocomplete";

export interface MentionDropdownProps {
  matches: MentionMatch[];
  selectedIndex: number;
  isActive: boolean;
  onSelect: (mention: MentionMatch) => void;
  onClose?: () => void;
  style?: React.CSSProperties;
  isMobile?: boolean;
}

const MentionDropdown: React.FC<MentionDropdownProps> = ({
  matches,
  selectedIndex,
  isActive,
  onSelect,
  onClose,
  style = {},
  isMobile = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  // Auto-scroll selected item into view
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedIndex]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isActive) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose?.();
      }
    };

    const handleTouchOutside = (e: TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose?.();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleTouchOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleTouchOutside);
    };
  }, [isActive, onClose]);

  if (!isActive || matches.length === 0) {
    return null;
  }

  const baseStyle: React.CSSProperties = isMobile
    ? {
        // On mobile, use absolute positioning just below textarea
        position: "absolute",
        backgroundColor: "var(--app-bg-color)",
        border: "1px solid var(--border-color)",
        borderRadius: "0.25rem",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
        zIndex: 1000,
        maxHeight: "150px",
        overflowY: "auto",
        width: "100%",
        top: "100%",
        left: 0,
        right: 0,
        marginTop: "2px",
      }
    : {
        // Desktop: absolute positioning
        position: "absolute",
        backgroundColor: "var(--app-bg-color)",
        border: "1px solid var(--border-color)",
        borderRadius: "0.5rem",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        zIndex: 1000,
        maxHeight: "300px",
        overflowY: "auto",
        minWidth: "200px",
        maxWidth: "400px",
        ...style,
      };

  return (
    <div ref={containerRef} style={baseStyle}>
      {matches.map((match, index) => (
        <div
          key={match.pubkey}
          ref={index === selectedIndex ? selectedItemRef : undefined}
          onClick={() => onSelect(match)}
          style={{
            padding: isMobile ? "0.5rem 0.75rem" : "0.75rem 1rem",
            cursor: "pointer",
            backgroundColor:
              index === selectedIndex ? "var(--hover-bg-color)" : "transparent",
            borderBottom:
              index < matches.length - 1
                ? "1px solid var(--border-color)"
                : "none",
            transition: "background-color 0.15s ease",
            userSelect: "none",
            textAlign: "left",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--hover-bg-color)";
          }}
          onMouseLeave={(e) => {
            if (index !== selectedIndex) {
              e.currentTarget.style.backgroundColor = "transparent";
            }
          }}
          onTouchStart={(e) => {
            e.currentTarget.style.backgroundColor = "var(--hover-bg-color)";
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            onSelect(match);
          }}
        >
          <div
            style={{
              fontWeight: 500,
              color: "var(--text-color)",
              fontSize: isMobile ? "0.875rem" : "var(--font-size-sm)",
              textAlign: "left",
            }}
          >
            {match.displayName}
          </div>
          <div
            style={{
              fontSize: isMobile ? "0.65rem" : "0.75rem",
              color: "var(--text-secondary)",
              marginTop: isMobile ? "0.1rem" : "0.25rem",
              opacity: 0.7,
              textAlign: "left",
            }}
          >
            {match.npub.slice(0, 12)}…
          </div>
        </div>
      ))}
    </div>
  );
};

export default MentionDropdown;

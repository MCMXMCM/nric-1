import React from "react";

interface AlwaysOnToggleButtonProps {
  value: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export const AlwaysOnToggleButton: React.FC<AlwaysOnToggleButtonProps> = ({
  value,
  onClick,
  disabled,
}) => (
  <div
    style={{
      display: "flex",
      gap: "0",
      width: "120px",
    }}
  >
    {/* ON Button */}
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        backgroundColor: value ? "#14532d" : "transparent",
        color: value ? "white" : "var(--text-color)",
        border: "1px dotted var(--border-color)",
        borderLeft: "none",
        padding: "0.25rem 0.5rem",
        cursor: disabled ? "not-allowed" : "pointer",

        fontSize: "0.875rem",
        transition: "all 0.3s ease",
        width: "120px",
        height: "100%",
        textAlign: "center",
        opacity: disabled ? 0.5 : 1,
        borderRadius: "0",
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = value
            ? "#0f3d1f"
            : "var(--hover-bg)";
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = value
            ? "#14532d"
            : "transparent";
        }
      }}
    >
      ON
    </button>
  </div>
);

import React from "react";

interface SettingsButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  variant?: "default" | "danger";
  disabled?: boolean;
  width?: string;
  textAlign?: "start" | "center" | "end";
  style?: React.CSSProperties;
}

export const SettingsButton: React.FC<SettingsButtonProps> = ({
  onClick,
  children,
  variant = "default",
  disabled = false,
  width = "100%",
  textAlign = "start",
  style = {},
}) => {
  const isDanger = variant === "danger";

  const baseStyle: React.CSSProperties = {
    backgroundColor: "transparent",
    color: isDanger ? "var(--btn-accent)" : "var(--text-color)",
    padding: "0.25rem 0.5rem",
    cursor: disabled ? "not-allowed" : "pointer",

    fontSize: "0.875rem",
    transition: "all 0.3s ease",
    width,
    height: "30px",
    textAlign,
    opacity: disabled ? 0.5 : 1,
    ...style,
  };

  return (
    <button onClick={onClick} disabled={disabled} style={baseStyle}>
      {children}
    </button>
  );
};

import React from "react";
import AppLogo from "./AppLogo";

interface StandardLoaderProps {
  message: string;
  subMessage?: string;
  fullHeight?: boolean;
  logoSize?: number;
  /** When true, uses the same logo size/centering as the splash screen */
  alignWithSplash?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * StandardLoader: small spinner → logo → message stack for consistent loading UIs.
 */
const StandardLoader: React.FC<StandardLoaderProps> = ({
  message,
  subMessage,
  fullHeight = true,
  logoSize,
  alignWithSplash = false,
  className = "",
  style = {},
}) => {
  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: fullHeight ? "100%" : "auto",
    minHeight: fullHeight ? "50px" : undefined,
    gap: "0.25rem",
    padding: "1rem",
    boxSizing: "border-box",
    ...style,
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={containerStyle}
      className={className}
    >
      <div style={{ marginTop: alignWithSplash ? -130 : 0 }}>
        <AppLogo
          size={logoSize ?? (alignWithSplash ? 250 : 120)}
          animated={true}
        />
      </div>
      <div
        style={{
          color: "var(--text-color)",
          fontSize: "var(--font-size-sm)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          textAlign: "center",
        }}
      >
        {message}
      </div>
      {subMessage && (
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: "var(--font-size-xs)",
            textAlign: "center",
          }}
        >
          {subMessage}
        </div>
      )}
    </div>
  );
};

export default StandardLoader;

import React from "react";

interface AppLogoProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  animated?: boolean;
}

/**
 * AppLogo renders the NRIC-1 logo with theme-aware asset selection.
 * When animated=true, shows a wave loading effect from top to bottom.
 */
const AppLogo: React.FC<AppLogoProps> = ({
  size = 64,
  className = "",
  style = {},
  animated = false,
}) => {
  const [isDarkMode, setIsDarkMode] = React.useState<boolean>(false);

  React.useEffect(() => {
    const selectTheme = () => {
      try {
        const stored = localStorage.getItem("darkMode");
        const darkMode =
          stored === "true" ||
          (stored === null &&
            window.matchMedia("(prefers-color-scheme: dark)").matches);
        setIsDarkMode(darkMode);
      } catch {
        setIsDarkMode(true);
      }
    };
    selectTheme();
  }, []);

  // If not animated, use the original img approach
  if (!animated) {
    const logoSrc = isDarkMode ? "/nric-logo-dark.svg" : "/nric-logo-light.svg";
    return (
      <img
        src={logoSrc}
        alt="NRIC-1 Logo"
        width={size}
        height={size}
        className={className}
        style={{ display: "block", ...style }}
      />
    );
  }

  // Animated version - use the actual logo SVG with CSS animation
  const logoSrc = isDarkMode ? "/nric-logo-dark.svg" : "/nric-logo-light.svg";

  return (
    <div
      className={`animated-logo ${className}`}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        ...style,
      }}
    >
      <style>
        {`
            .animated-logo {
              position: relative;
              overflow: hidden;
            }
            
            .animated-logo::before {
              content: '';
              position: absolute;
              top: 15%;
              left: 0;
              right: 0;
              height: 70%;
              background: linear-gradient(
                to bottom,
                transparent 0%,
                transparent 45%,
                var(--app-bg-color, #ffffff) 50%,
                var(--app-bg-color, #ffffff) 55%,
                transparent 60%,
                transparent 100%
              );
              animation: waveReveal 1.2s linear infinite;
              z-index: 1;
            }
            
            @keyframes waveReveal {
              0% {
                transform: translateY(-100%);
              }
              100% {
                transform: translateY(100%);
              }
            }
          `}
      </style>
      <img
        src={logoSrc}
        alt="NRIC-1 Logo"
        width={size}
        height={size}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          objectFit: "contain",
        }}
      />
    </div>
  );
};

export default AppLogo;

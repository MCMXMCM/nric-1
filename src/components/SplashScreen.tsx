import { useEffect, useState } from "react";
import { useRelayConnectionStatus } from "../hooks/useRelayConnectionStatus";
import StandardLoader from "./ui/StandardLoader";

interface SplashScreenProps {
  onComplete: () => void;
  isBootstrap?: boolean;
  children?: React.ReactNode;
}

export default function SplashScreen({
  onComplete,
  isBootstrap = false,
  children,
}: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [showBootstrap, setShowBootstrap] = useState(false);
  const { hasMinimumConnections, isConnecting } = useRelayConnectionStatus();

  // Bootstrap mode logic
  useEffect(() => {
    if (isBootstrap) {
      // Only show bootstrap splash for web clients (non-PWA)
      function isPwaInstalled() {
        return ["fullscreen", "standalone", "minimal-ui"].some(
          (displayMode) =>
            window.matchMedia(`(display-mode: ${displayMode})`).matches
        );
      }

      const isPWA = isPwaInstalled();
      const firstVisitKey = "bootstrap-splash-shown";

      // Show bootstrap splash for web clients on first visit
      if (!isPWA) {
        const isFirst = !sessionStorage.getItem(firstVisitKey);
        if (isFirst) {
          sessionStorage.setItem(firstVisitKey, "true");
          setShowBootstrap(true);
        }
      }
    }
  }, [isBootstrap]);

  // Hide bootstrap splash when relays are connected
  useEffect(() => {
    if (
      isBootstrap &&
      showBootstrap &&
      hasMinimumConnections &&
      !isConnecting
    ) {
      // Small delay to ensure smooth transition
      const timer = setTimeout(() => {
        setShowBootstrap(false);
        setIsVisible(false);
        setTimeout(onComplete, 400);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [
    isBootstrap,
    showBootstrap,
    hasMinimumConnections,
    isConnecting,
    onComplete,
  ]);

  useEffect(() => {
    // For bootstrap mode, don't auto-hide - let the parent component control it
    if (isBootstrap) {
      return;
    }

    // Duration is short for update splash, otherwise immediate
    const duration = 1200;
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onComplete, 400);
    }, duration);
    return () => clearTimeout(timer);
  }, [onComplete, isBootstrap]);

  // For bootstrap mode, don't show splash if not needed
  if (isBootstrap && !showBootstrap) {
    return <>{children}</>;
  }

  return (
    <>
      <div>
        {isVisible && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "var(--app-bg-color )",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10001,
              fontFamily:
                'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            {/* Use StandardLoader for consistent animated logo */}
            <div
              style={{
                marginBottom: "40px",
              }}
            >
              <StandardLoader
                message=""
                alignWithSplash={true}
                logoSize={250}
              />
            </div>

            {/* Bootstrap mode text */}
            {isBootstrap && (
              <div
                style={{
                  marginTop: "20px",
                  color: "var(--text-color)",
                  fontSize: "var(--font-size-sm)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  textAlign: "center",
                }}
              >
                initializing client...
              </div>
            )}
          </div>
        )}
      </div>
      {children}
    </>
  );
}

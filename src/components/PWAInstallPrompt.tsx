import React, { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if app is already installed
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true
    ) {
      setIsInstalled(true);
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstallPrompt(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowInstallPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      console.log("User accepted the install prompt");
    } else {
      console.log("User dismissed the install prompt");
    }

    setDeferredPrompt(null);
    setShowInstallPrompt(false);
  };

  const handleDismiss = () => {
    setShowInstallPrompt(false);
  };

  if (isInstalled || !showInstallPrompt) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: "var(--app-bg-color )",
        color: "var(--text-color)",
        padding: "16px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
        zIndex: 1000,
        maxWidth: "90vw",
        width: "400px",
        border: "1px solid #333",
      }}
    >
      <div
        style={{ marginBottom: "12px", fontWeight: "bold", textAlign: "left" }}
      >
        Install NRIC-1
      </div>
      <div
        style={{
          marginBottom: "16px",
          fontSize: "14px",
          opacity: 0.8,
          textAlign: "left",
        }}
      >
        Add this app to your home screen for a better experience. Learn more:{" "}
        <a href="/about" style={{ color: "var(--link-color)" }}>
          NRIC-1/about
        </a>
      </div>
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <button
          onClick={handleDismiss}
          style={{
            padding: "8px 16px",
            backgroundColor: "transparent",
            color: "var(--text-color)",
            border: "1px solid #666",
            cursor: "pointer",
          }}
        >
          Not now
        </button>
        <button
          onClick={handleInstallClick}
          style={{
            padding: "8px 16px",
            backgroundColor: "var(--app-bg-color )",
            color: "var(--text-color)",
            border: "none",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Install
        </button>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;

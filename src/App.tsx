import "./App.css";
import { useState, useEffect, useMemo } from "react";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createIDBPersister, PERSIST_KEY } from "./utils/persistQueryClient";
import { NostrProvider } from "./contexts/NostrContext";
import NostrifyMigrationProvider from "./contexts/NostrifyMigrationProvider";
import { ModalProvider } from "./contexts/ModalContext";

import { UserContactsProvider } from "./contexts/UserContactsContext";
import { NdkWalletProvider } from "./contexts/NdkWalletContext";

import HapticProvider from "./components/HapticProvider";
import PWAInstallPrompt from "./components/PWAInstallPrompt";
import PWAUpdatePrompt from "./components/PWAUpdatePrompt";
import BrowserUpdatePrompt from "./components/BrowserUpdatePrompt";
import SplashScreen from "./components/SplashScreen";
import { EnhancedOutboxDiscoveryManager } from "./components/EnhancedOutboxDiscoveryManager";
import {
  initializeThreadEventManager,
  cleanupThreadEventManager,
} from "./utils/nostr/threadEventManager";
import { createAppRouter } from "./router";

function App() {
  const [showSplash, setShowSplash] = useState(true);

  // Create a QueryClient instance
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            gcTime: 10 * 60 * 1000, // 10 minutes - reduced from 7 days for better iOS Safari memory management
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
    []
  );

  // Create the router with QueryClient context
  const router = useMemo(() => createAppRouter(queryClient), [queryClient]);

  // Persist React Query cache to IndexedDB
  const persister = useMemo(() => createIDBPersister(PERSIST_KEY), []);

  // Initialize thread event manager
  useEffect(() => {
    initializeThreadEventManager(queryClient);

    return () => {
      cleanupThreadEventManager();
    };
  }, [queryClient]);

  // Metadata store initialization removed - now handled by TanStack Query persistence

  // Expose QueryClient globally for prefetch utilities
  useEffect(() => {
    try {
      (window as any).__queryClient = queryClient;
    } catch {}
  }, [queryClient]);

  useEffect(() => {
    // Apply theme attribute based on saved preference or system preference
    const applyTheme = () => {
      try {
        const stored = localStorage.getItem("darkMode");
        const isDarkMode =
          stored === "true" ||
          (stored === null &&
            window.matchMedia("(prefers-color-scheme: dark)").matches);
        const root = document.documentElement;
        if (!root) return;
        if (isDarkMode) {
          root.removeAttribute("data-theme"); // default CSS is dark
        } else {
          root.setAttribute("data-theme", "light");
        }

        // Update iOS PWA theme colors to match app background
        const themeColor = isDarkMode ? "#000000" : "#f5efe5";
        const metaThemeColor = document.querySelector(
          'meta[name="theme-color"]'
        );
        if (metaThemeColor) {
          metaThemeColor.setAttribute("content", themeColor);
        } else {
          const newMetaThemeColor = document.createElement("meta");
          newMetaThemeColor.name = "theme-color";
          newMetaThemeColor.content = themeColor;
          document.head.appendChild(newMetaThemeColor);
        }

        // Update iOS PWA status bar style
        const metaStatusBarStyle = document.querySelector(
          'meta[name="apple-mobile-web-app-status-bar-style"]'
        );
        if (metaStatusBarStyle) {
          metaStatusBarStyle.setAttribute(
            "content",
            isDarkMode ? "black" : "default"
          );
        } else {
          const newMetaStatusBarStyle = document.createElement("meta");
          newMetaStatusBarStyle.name = "apple-mobile-web-app-status-bar-style";
          newMetaStatusBarStyle.content = isDarkMode ? "black" : "default";
          document.head.appendChild(newMetaStatusBarStyle);
        }

        if ((window as any).updateThemeColors) {
          (window as any).updateThemeColors();
        }
      } catch {}
    };

    // Initial apply on mount
    applyTheme();

    // Listen for localStorage changes (when settings are toggled from within the app)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "darkMode" && e.newValue !== null) {
        // Update theme immediately when preference changes
        applyTheme();
      }
    };

    // Listen for custom events (for same-window localStorage changes)
    const handleDarkModeChange = () => {
      // Update theme immediately on custom event
      applyTheme();
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("darkModeChanged", handleDarkModeChange);

    // Listen for system theme changes (only if user hasn't manually set a preference)
    let mediaQuery: MediaQueryList | null = null;
    let mediaQueryHandler: ((e: MediaQueryListEvent) => void) | null = null;

    if (localStorage.getItem("darkMode") === null) {
      mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQueryHandler = (_e: MediaQueryListEvent) => {
        // Update theme when system theme changes and no explicit preference is set
        applyTheme();
      };

      mediaQuery.addEventListener("change", mediaQueryHandler);
    }

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("darkModeChanged", handleDarkModeChange);
      if (mediaQuery && mediaQueryHandler) {
        mediaQuery.removeEventListener("change", mediaQueryHandler);
      }
    };
  }, []);

  useEffect(() => {
    // Decide whether to show the custom splash
    // Rule:
    // - If running as PWA (standalone), only show splash when an update is in progress
    // - Otherwise (browser), show splash on first visit then skip
    function isPwaInstalled() {
      // Check for 'standalone', 'fullscreen', or 'minimal-ui' display modes
      // which indicate an installed PWA or similar app-like experience.
      return ["fullscreen", "standalone", "minimal-ui"].some(
        (displayMode) =>
          window.matchMedia(`(display-mode: ${displayMode})`).matches
      );
    }
    const isPWA = isPwaInstalled();
    const firstVisitKey = "splash-shown";

    const decide = () => {
      const updateInProgress = (window as any).__pwaUpdateInProgress === true;
      if (isPWA) {
        setShowSplash(updateInProgress);
      } else {
        const isFirst = !sessionStorage.getItem(firstVisitKey);
        if (isFirst) sessionStorage.setItem(firstVisitKey, "true");
        setShowSplash(isFirst);
      }
    };

    decide();

    const handler = (e: any) => {
      const inProgress = !!(e && e.detail && e.detail.inProgress);
      if (isPWA) {
        setShowSplash(inProgress);
      }
    };
    window.addEventListener("pwa-update-state", handler);
    return () => window.removeEventListener("pwa-update-state", handler);
  }, []);

  const handleSplashComplete = () => {
    setShowSplash(false);
  };

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
          overflowX: "hidden",
          /* Remove safe area padding from here - it will be handled in NostrFeed component */
          boxSizing: "border-box",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--app-bg-color )", // Theme-aware background
        }}
      >
        <HapticProvider>
          <NostrProvider>
            <ModalProvider>
              <NostrifyMigrationProvider>
                <UserContactsProvider>
                  <EnhancedOutboxDiscoveryManager>
                    <NdkWalletProvider>
                      <SplashScreen onComplete={() => {}} isBootstrap={true}>
                        <RouterProvider router={router} />
                        <PWAInstallPrompt />
                        <PWAUpdatePrompt />
                        <BrowserUpdatePrompt />
                      </SplashScreen>
                    </NdkWalletProvider>
                  </EnhancedOutboxDiscoveryManager>
                </UserContactsProvider>
              </NostrifyMigrationProvider>
            </ModalProvider>
          </NostrProvider>
        </HapticProvider>

        {/* Splash screen overlay */}
        {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
      </div>
    </PersistQueryClientProvider>
  );
}

export default App;

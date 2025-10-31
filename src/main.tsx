import { StrictMode } from "react";
import { registerHoverPrefetch } from "./utils/registerHoverPrefetch";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// Restore last route early (before React mounts) to preserve location/state on PWA relaunch
try {
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true;
  const isAtRoot =
    window.location.pathname === "/" &&
    (!window.location.search || window.location.search === "") &&
    (!window.location.hash || window.location.hash === "");
  const hasDeepLink =
    window.location.pathname.startsWith("/note/") ||
    window.location.pathname.startsWith("/npub/") ||
    window.location.pathname.startsWith("/create") ||
    new URLSearchParams(window.location.search).has("note") ||
    new URLSearchParams(window.location.search).has("action");
  const raw = localStorage.getItem("lastRouteInfo");
  const info = raw
    ? (JSON.parse(raw) as { path: string; savedAt: number })
    : null;
  const maxAgeMs = 30 * 24 * 60 * 60 * 1000; // 30 days
  const isFresh =
    info && typeof info.savedAt === "number"
      ? Date.now() - info.savedAt < maxAgeMs
      : false;
  if (
    isStandalone &&
    isAtRoot &&
    !hasDeepLink &&
    info &&
    info.path &&
    info.path !== "/" &&
    isFresh
  ) {
    const ua =
      typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
    const isIOS =
      /iP(ad|hone|od)/.test(ua) || (/Mac/.test(ua) && "ontouchend" in document);
    // On iOS PWAs, avoid creating an extra ghost history entry; prefer replaceState.
    // On other platforms, keep pushState to preserve a root entry for proper back behavior.
    if (isIOS) {
      window.history.replaceState(null, "", info.path);
    } else {
      window.history.pushState(null, "", info.path);
    }
    try {
      // Reset feed checkpoint on cold start to avoid stale back targets
      sessionStorage.removeItem("feedCheckpointSet");
    } catch {}
  }
} catch {
  // no-op
}

// Service worker registration is handled automatically by Vite PWA plugin
// The manual registration was removed to prevent conflicts with Vite's built-in SW

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register global hover/touch prefetch after mounting
try {
  registerHoverPrefetch();
} catch {
  // no-op
}

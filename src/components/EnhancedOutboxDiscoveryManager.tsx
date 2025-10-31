import React, { useContext, createContext } from "react";
import { NostrContext } from "../contexts/NostrContext";
import { useUserContactsContext } from "../contexts/UserContactsContext";
import { useEnhancedOutboxDiscovery } from "../hooks/useEnhancedOutboxDiscovery";
import { useRelayManager } from "../hooks/useRelayManager";
import { DEFAULT_RELAY_URLS } from "../utils/nostr/constants";
import { useUIStore } from "./lib/useUIStore";
import { ContactRelayProgressProvider } from "../contexts/ContactRelayProgressContext";

interface EnhancedOutboxDiscoveryContextType {
  isDiscovering: boolean;
  hasCompletedInitialDiscovery: boolean;
  discoveryProgress: {
    completed: number;
    total: number;
    percentage: number;
  };
}

const EnhancedOutboxDiscoveryContext =
  createContext<EnhancedOutboxDiscoveryContextType>({
    isDiscovering: false,
    hasCompletedInitialDiscovery: false,
    discoveryProgress: {
      completed: 0,
      total: 0,
      percentage: 0,
    },
  });

export const useEnhancedOutboxDiscoveryStatus = () =>
  useContext(EnhancedOutboxDiscoveryContext);

/**
 * Enhanced component that manages automatic NIP-65 outbox discovery with progress tracking
 * Must be placed inside UserContactsProvider to access contacts
 */
export function EnhancedOutboxDiscoveryManager({
  children,
}: {
  children?: React.ReactNode;
}) {
  console.log("📦 EnhancedOutboxDiscoveryManager: Component function called");
  console.log(
    "📦 EnhancedOutboxDiscoveryManager: Component mounted at",
    new Date().toISOString()
  );

  // Simple test to see if component is being rendered
  if (typeof window !== "undefined") {
    console.log("📦 EnhancedOutboxDiscoveryManager: Window object available");
    // Don't use alert in production, but this will help us see if the component is being rendered
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    ) {
      console.log(
        "📦 EnhancedOutboxDiscoveryManager: Running on localhost - component is being rendered"
      );
    }
  }

  try {
    const { pubkey, nostrClient } = useContext(NostrContext);
    const { contacts = [], isLoading: contactsLoading } =
      useUserContactsContext();

    console.log("📦 EnhancedOutboxDiscoveryManager: Contexts loaded", {
      hasPubkey: !!pubkey,
      hasNostrClient: !!nostrClient,
      contactCount: contacts.length,
      contactsLoading,
    });

    // Get relay configuration
    const { readRelays } = useRelayManager({
      nostrClient,
      initialRelays: DEFAULT_RELAY_URLS,
      pubkeyHex: pubkey,
    });

    const relayUrls =
      readRelays && readRelays.length > 0 ? readRelays : DEFAULT_RELAY_URLS;

    // Respect user Outbox toggle; only auto-discover when enabled
    const outboxMode = useUIStore((s) => s.outboxMode);

    console.log("📦 EnhancedOutboxDiscoveryManager: Component rendered", {
      hasPubkey: !!pubkey,
      contactCount: contacts.length,
      relayCount: relayUrls.length,
      outboxMode,
      contactsLoading,
      enabled: Boolean(
        outboxMode && pubkey && contacts.length > 0 && !contactsLoading
      ),
    });

    // Wait for contacts to load before enabling discovery
    if (outboxMode && pubkey && (contacts.length === 0 || contactsLoading)) {
      console.log(
        "📦 EnhancedOutboxDiscoveryManager: Waiting for contacts to load...",
        { contactsLoading, contactCount: contacts.length }
      );
      console.log(
        "📦 EnhancedOutboxDiscoveryManager: Contacts will be loaded from TanStack Query cache"
      );
    }

    // Automatically discover NIP-65 relay lists for followed users with progress tracking
    const { isDiscovering, hasCompletedInitialDiscovery, discoveryProgress } =
      useEnhancedOutboxDiscovery({
        pubkey,
        contacts,
        relayUrls,
        enabled: (() => {
          const baseEnabled = Boolean(
            outboxMode && pubkey && contacts.length > 0 && !contactsLoading
          );
          if (!baseEnabled) return false;

          // On iOS Safari, defer discovery until the first feed page has succeeded
          // or 10 seconds have elapsed since component mount
          const ua =
            typeof navigator !== "undefined" ? navigator.userAgent : "";
          const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
          const isMobile = /Mobi|Android/i.test(ua);
          const isIosSafari = isSafari && isMobile;

          if (!isIosSafari) return true;

          const feedReady = (globalThis as any).__feedFirstPageReady === true;
          const firstMountedAt =
            (globalThis as any).__discoveryManagerMountedAt || Date.now();
          (globalThis as any).__discoveryManagerMountedAt = firstMountedAt;
          const elapsed = Date.now() - firstMountedAt;
          return feedReady || elapsed >= 10000; // 10s grace period
        })(),
      });

    console.log("📦 EnhancedOutboxDiscoveryManager: About to render", {
      isDiscovering,
      hasCompletedInitialDiscovery,
      discoveryProgress,
    });

    return (
      <ContactRelayProgressProvider>
        <EnhancedOutboxDiscoveryContext.Provider
          value={{
            isDiscovering,
            hasCompletedInitialDiscovery,
            discoveryProgress,
          }}
        >
          {children}
        </EnhancedOutboxDiscoveryContext.Provider>
      </ContactRelayProgressProvider>
    );
  } catch (error) {
    console.error(
      "📦 EnhancedOutboxDiscoveryManager: Error in component",
      error
    );
    return <>{children}</>;
  }
}

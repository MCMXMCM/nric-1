import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { useUserContactsContext } from "./UserContactsContext";
import { getOutboxStorage } from "../utils/nostr/outboxStorage";
import { useUIStore } from "../components/lib/useUIStore";

interface ContactRelayProgress {
  totalContacts: number;
  contactsWithRelays: number;
  percentage: number;
  isComplete: boolean;
  isRunning: boolean;
  error?: string;
  metadataProgress: {
    loaded: number;
    total: number;
    isLoading: boolean;
  };
}

interface ContactRelayProgressContextType {
  progress: ContactRelayProgress;
  startProgressTracking: () => void;
  stopProgressTracking: () => void;
  resetProgress: () => void;
}

const ContactRelayProgressContext =
  createContext<ContactRelayProgressContextType>({
    progress: {
      totalContacts: 0,
      contactsWithRelays: 0,
      percentage: 0,
      isComplete: false,
      isRunning: false,
      metadataProgress: {
        loaded: 0,
        total: 0,
        isLoading: false,
      },
    },
    startProgressTracking: () => {},
    stopProgressTracking: () => {},
    resetProgress: () => {},
  });

export const useContactRelayProgress = () =>
  useContext(ContactRelayProgressContext);

interface ContactRelayProgressProviderProps {
  children: React.ReactNode;
}

export function ContactRelayProgressProvider({
  children,
}: ContactRelayProgressProviderProps) {
  const { contacts = [] } = useUserContactsContext();
  const outboxModeEnabled = useUIStore((s) => s.outboxMode);
  const [progress, setProgress] = useState<ContactRelayProgress>({
    totalContacts: 0,
    contactsWithRelays: 0,
    percentage: 0,
    isComplete: false,
    isRunning: false,
    metadataProgress: {
      loaded: 0,
      total: 0,
      isLoading: false,
    },
  });

  const progressIntervalRef = useRef<number | null>(null);
  const isTrackingRef = useRef(false);

  const updateProgress = useCallback(async () => {
    if (!isTrackingRef.current || contacts.length === 0) {
      return;
    }

    try {
      const storage = getOutboxStorage();
      const allUsers = await storage.getAllUsers();

      // Count contacts that have at least one relay preference
      const contactsWithRelays = allUsers.filter(
        (user) => user.relayCount > 0
      ).length;
      const percentage = Math.min(
        Math.round((contactsWithRelays / contacts.length) * 100),
        100
      );
      const isComplete = percentage >= 100;

      setProgress((prev) => ({
        ...prev,
        totalContacts: contacts.length,
        contactsWithRelays,
        percentage,
        isComplete,
        isRunning: !isComplete,
      }));

      // Stop tracking when complete
      if (isComplete) {
        isTrackingRef.current = false;
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
      }
    } catch (error) {
      console.error("Failed to update contact relay progress:", error);
      setProgress((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Unknown error",
      }));
    }
  }, [contacts.length]);

  const startProgressTracking = useCallback(() => {
    if (contacts.length === 0 || isTrackingRef.current) {
      return;
    }

    isTrackingRef.current = true;
    setProgress((prev) => ({
      ...prev,
      totalContacts: contacts.length,
      contactsWithRelays: 0,
      percentage: 0,
      isComplete: false,
      isRunning: true,
      error: undefined,
    }));

    // Update progress every 2 seconds
    progressIntervalRef.current = setInterval(updateProgress, 2000);

    // Initial update
    updateProgress();
  }, [contacts.length, updateProgress]);

  const stopProgressTracking = useCallback(() => {
    isTrackingRef.current = false;
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setProgress((prev) => ({
      ...prev,
      isRunning: false,
    }));
  }, []);

  const resetProgress = useCallback(() => {
    isTrackingRef.current = false;
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setProgress({
      totalContacts: 0,
      contactsWithRelays: 0,
      percentage: 0,
      isComplete: false,
      isRunning: false,
      metadataProgress: {
        loaded: 0,
        total: 0,
        isLoading: false,
      },
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  // Initialize progress from IndexedDB on mount
  useEffect(() => {
    if (contacts.length === 0 || !outboxModeEnabled) {
      // Don't initialize if outbox mode is disabled
      if (!outboxModeEnabled) {
        if (import.meta.env.DEV) {
          console.log(
            "📦 ContactRelayProgressContext: Skipping initialization - outbox mode disabled"
          );
        }
      }
      return;
    }

    const initializeProgress = async () => {
      try {
        const storage = getOutboxStorage();
        const allUsers = await storage.getAllUsers();
        const contactsWithRelays = allUsers.filter(
          (user) => user.relayCount > 0
        ).length;
        const percentage = Math.min(
          Math.round((contactsWithRelays / contacts.length) * 100),
          100
        );

        setProgress({
          totalContacts: contacts.length,
          contactsWithRelays,
          percentage,
          isComplete: percentage >= 100,
          isRunning: false, // Not actively running on page load
          metadataProgress: {
            loaded: 0,
            total: 0,
            isLoading: false,
          },
        });
      } catch (error) {
        console.error("Failed to initialize outbox progress:", error);
      }
    };

    initializeProgress();
  }, [contacts.length, outboxModeEnabled]);

  // Auto-start tracking when contacts are available and discovery is incomplete
  useEffect(() => {
    if (
      outboxModeEnabled &&
      contacts.length > 0 &&
      !isTrackingRef.current &&
      !progress.isComplete &&
      progress.percentage < 100
    ) {
      startProgressTracking();
    } else if (!outboxModeEnabled && isTrackingRef.current) {
      // Stop tracking if outbox mode is disabled
      if (import.meta.env.DEV) {
        console.log(
          "📦 ContactRelayProgressContext: Stopping tracking - outbox mode disabled"
        );
      }
    }
  }, [
    contacts.length,
    progress.isComplete,
    progress.percentage,
    startProgressTracking,
    outboxModeEnabled,
  ]);

  return (
    <ContactRelayProgressContext.Provider
      value={{
        progress,
        startProgressTracking,
        stopProgressTracking,
        resetProgress,
      }}
    >
      {children}
    </ContactRelayProgressContext.Provider>
  );
}

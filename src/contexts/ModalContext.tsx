import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { LoginState } from "../hooks/useLoginState";
import { NostrContext } from "./NostrContext";

interface UnlockModalState {
  isOpen: boolean;
  actionLabel: string;
  onUnlocked: () => Promise<void> | void;
}

interface ModalContextValue extends LoginState {
  // Unlock modal state
  unlockModal: UnlockModalState;
  showUnlockModal: (
    actionLabel: string,
    onUnlocked: () => Promise<void> | void
  ) => void;
  hideUnlockModal: () => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

interface ModalProviderProps {
  children: ReactNode;
}

export const ModalProvider: React.FC<ModalProviderProps> = ({ children }) => {
  const { listSavedAccounts } = useContext(NostrContext) as any;

  // Login modal states
  const [showLoginOptionsModal, setShowLoginOptionsModal] = useState(false);
  const [showSavedAccountsModal, setShowSavedAccountsModal] = useState(false);
  const [showNsecLoginModal, setShowNsecLoginModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    id: string;
    action: () => Promise<void> | void;
    actionName: string;
  } | null>(null);

  // Unlock modal state
  const [unlockModal, setUnlockModal] = useState<UnlockModalState>({
    isOpen: false,
    actionLabel: "Continue",
    onUnlocked: async () => {},
  });

  // Require login for an action
  const requireLogin = useCallback(
    (action: () => Promise<void> | void, actionName: string) => {
      const actionId = Math.random().toString(36).substr(2, 9);
      setPendingAction({
        id: actionId,
        action,
        actionName,
      });
      setShowLoginOptionsModal(true);
    },
    []
  );

  // Handle successful login
  const handleLoginSuccess = useCallback(async () => {
    console.log("🔄 handleLoginSuccess called - closing modals...");

    // Close all modals IMMEDIATELY (synchronous)
    setShowLoginOptionsModal(false);
    setShowSavedAccountsModal(false);
    setShowNsecLoginModal(false);

    console.log("🔄 Modal states set to false");

    // Execute pending action if exists (async, but don't block modal closing)
    if (pendingAction) {
      // Execute in background without blocking modal close
      const actionResult = pendingAction.action();
      if (actionResult && typeof actionResult.catch === "function") {
        actionResult.catch((error: any) => {
          console.error(
            `Failed to execute pending action ${pendingAction.actionName}:`,
            error
          );
        });
      }
      setPendingAction(null);
    }
  }, [pendingAction]);

  // Handle login cancellation
  const handleLoginCancel = useCallback(() => {
    setShowLoginOptionsModal(false);
    setShowSavedAccountsModal(false);
    setShowNsecLoginModal(false);
    setPendingAction(null);
  }, []);

  // Navigation handlers
  const handleShowSavedAccounts = useCallback(async () => {
    setShowLoginOptionsModal(false);
    try {
      const accounts = await listSavedAccounts();
      if (accounts.length > 0) {
        setShowSavedAccountsModal(true);
      } else {
        // No saved accounts, show nsec login instead
        setShowNsecLoginModal(true);
      }
    } catch (error) {
      console.error("Failed to load saved accounts:", error);
      setShowNsecLoginModal(true);
    }
  }, [listSavedAccounts]);

  const handleShowNsecLogin = useCallback(() => {
    setShowLoginOptionsModal(false);
    setShowNsecLoginModal(true);
  }, []);

  // Unlock modal handlers
  const showUnlockModal = useCallback(
    (actionLabel: string, onUnlocked: () => Promise<void> | void) => {
      setUnlockModal({
        isOpen: true,
        actionLabel,
        onUnlocked,
      });
    },
    []
  );

  const hideUnlockModal = useCallback(() => {
    setUnlockModal({
      isOpen: false,
      actionLabel: "Continue",
      onUnlocked: async () => {},
    });
  }, []);

  const contextValue: ModalContextValue = {
    showLoginOptionsModal,
    showSavedAccountsModal,
    showNsecLoginModal,
    pendingAction,
    requireLogin,
    handleLoginSuccess,
    handleLoginCancel,
    setShowLoginOptionsModal,
    setShowSavedAccountsModal,
    setShowNsecLoginModal,
    handleShowSavedAccounts,
    handleShowNsecLogin,
    unlockModal,
    showUnlockModal,
    hideUnlockModal,
  };

  return (
    <ModalContext.Provider value={contextValue}>
      {children}
    </ModalContext.Provider>
  );
};

export const useModalContext = (): ModalContextValue => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModalContext must be used within a ModalProvider");
  }
  return context;
};

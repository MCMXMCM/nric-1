import { useState, useCallback, useContext } from "react";
import { NostrContext } from "../contexts/NostrContext";

export interface PendingAction {
  id: string;
  action: () => Promise<void> | void;
  actionName: string;
}

export interface LoginState {
  // Modal visibility states
  showLoginOptionsModal: boolean;
  showSavedAccountsModal: boolean;
  showNsecLoginModal: boolean;
  
  // Current pending action
  pendingAction: PendingAction | null;
  
  // Action handlers
  requireLogin: (action: () => Promise<void> | void, actionName: string) => void;
  handleLoginSuccess: () => void;
  handleLoginCancel: () => void;
  
  // Modal handlers
  setShowLoginOptionsModal: (show: boolean) => void;
  setShowSavedAccountsModal: (show: boolean) => void;
  setShowNsecLoginModal: (show: boolean) => void;
  
  // Navigation handlers
  handleShowSavedAccounts: () => void;
  handleShowNsecLogin: () => void;
}

export const useLoginState = (): LoginState => {
  const { listSavedAccounts } = useContext(NostrContext);
  
  const [showLoginOptionsModal, setShowLoginOptionsModal] = useState(false);
  const [showSavedAccountsModal, setShowSavedAccountsModal] = useState(false);
  const [showNsecLoginModal, setShowNsecLoginModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  // Require login for an action
  const requireLogin = useCallback((action: () => Promise<void> | void, actionName: string) => {
    const actionId = Math.random().toString(36).substr(2, 9);
    setPendingAction({
      id: actionId,
      action,
      actionName,
    });
    setShowLoginOptionsModal(true);
  }, []);

  // Handle successful login
  const handleLoginSuccess = useCallback(async () => {
    console.log('🔄 handleLoginSuccess called - closing modals...');
    
    // Close all modals IMMEDIATELY (synchronous)
    setShowLoginOptionsModal(false);
    setShowSavedAccountsModal(false);
    setShowNsecLoginModal(false);
    
    console.log('🔄 Modal states set to false');
    
    // Execute pending action if exists (async, but don't block modal closing)
    if (pendingAction) {
      // Execute in background without blocking modal close
      const actionResult = pendingAction.action();
      if (actionResult && typeof actionResult.catch === 'function') {
        actionResult.catch((error: any) => {
          console.error(`Failed to execute pending action ${pendingAction.actionName}:`, error);
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

  return {
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
  };
};

import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import {
  parseModalState,
  updateUrlWithModalState,
  type ModalState,
} from "../utils/modalUrlState";

/**
 * Hook to manage profile modal states and URL synchronization
 */
export const useProfileModals = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [showContactsModal, setShowContactsModal] = useState<
    null | "followers" | "following"
  >(null);
  const [showUnlockModal, setShowUnlockModal] = useState<boolean>(false);
  const [unlockActionLabel, setUnlockActionLabel] = useState<string>("Follow");
  const [pendingAction, setPendingAction] = useState<"follow" | "mute" | null>(null);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);

  // Parse modal state from URL
  const modalState = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return parseModalState(params);
  }, [location.search]);

  // Sync URL modal state with local state
  useEffect(() => {

    if (modalState.contacts && !showContactsModal) {

      setShowContactsModal(modalState.contacts);
    } else if (!modalState.contacts && showContactsModal) {

      setShowContactsModal(null);
    }
    if (modalState.edit && !showEditModal) {
      setShowEditModal(true);
    } else if (!modalState.edit && showEditModal) {
      setShowEditModal(false);
    }
  }, [modalState.contacts, modalState.edit, showContactsModal, showEditModal]);

  // Update URL state when contacts modal state changes
  const updateContactsModalState = useCallback(
    (mode: null | "followers" | "following") => {
      const newModalState: ModalState = { ...modalState };
      if (mode) {
        newModalState.contacts = mode;
      } else {
        delete newModalState.contacts;
      }
      // When opening the modal, push a new history entry so Back returns to it.
      // When closing, replace to avoid extra entries.
      const replace = !mode; // false when opening, true when closing
      updateUrlWithModalState(newModalState, navigate, location, replace);
      setShowContactsModal(mode);
    },
    [modalState, navigate, location]
  );

  const updateEditModalState = useCallback(
    (open: boolean) => {
      const newModalState: ModalState = { ...modalState };
      if (open) {
        newModalState.edit = true;
      } else {
        delete newModalState.edit;
      }
      updateUrlWithModalState(newModalState, navigate, location);
      setShowEditModal(open);
    },
    [modalState, navigate, location]
  );

  const openUnlockModal = useCallback((actionLabel: string = "Follow", action: "follow" | "mute" = "follow") => {
    setUnlockActionLabel(actionLabel);
    setPendingAction(action);
    setShowUnlockModal(true);
  }, []);

  const closeUnlockModal = useCallback(() => {
    setShowUnlockModal(false);
  }, []);

  const executePendingAction = useCallback(() => {
    const action = pendingAction;
    setPendingAction(null);
    return action;
  }, [pendingAction]);

  return {
    showContactsModal,
    showUnlockModal,
    unlockActionLabel,
    pendingAction,
    showEditModal,
    updateContactsModalState,
    updateEditModalState,
    openUnlockModal,
    closeUnlockModal,
    executePendingAction,
  };
};

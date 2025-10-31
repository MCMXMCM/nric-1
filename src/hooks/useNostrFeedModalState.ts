import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import {
  parseModalState,
  updateUrlWithModalState,
  type ModalState,
} from "../utils/modalUrlState";

export const useNostrFeedModalState = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Parse modal state from URL
  const modalState = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return parseModalState(params);
  }, [location.search]);

  // Thread modal state
  const [showThreadModal, setShowThreadModal] = useState<boolean>(false);
  useEffect(() => {
    if (modalState.thread && !showThreadModal) {
      setShowThreadModal(true);
    } else if (!modalState.thread && showThreadModal) {
      setShowThreadModal(false);
    }
  }, [modalState.thread, showThreadModal]);

  // Reply modal state
  const [showReplyModal, setShowReplyModal] = useState<boolean>(false);
  useEffect(() => {
    if (modalState.reply && !showReplyModal) {
      setShowReplyModal(true);
    } else if (!modalState.reply && showReplyModal) {
      setShowReplyModal(false);
    }
  }, [modalState.reply, showReplyModal]);

  // Repost modal state
  const [showRepostModal, setShowRepostModal] = useState<boolean>(false);
  useEffect(() => {
    if (modalState.repost && !showRepostModal) {
      setShowRepostModal(true);
    } else if (!modalState.repost && showRepostModal) {
      setShowRepostModal(false);
    }
  }, [modalState.repost, showRepostModal]);

  // Zap modal state
  const [showZapModal, setShowZapModal] = useState<boolean>(false);
  useEffect(() => {
    if (modalState.zap && !showZapModal) {
      setShowZapModal(true);
    } else if (!modalState.zap && showZapModal) {
      setShowZapModal(false);
    }
  }, [modalState.zap, showZapModal]);

  // Track if any modal is open (for disabling swipe gestures)
  const isAnyModalOpen = useMemo(() => {
    return showReplyModal || showRepostModal || showThreadModal || showZapModal;
  }, [showReplyModal, showRepostModal, showThreadModal, showZapModal]);

  // Update URL state when thread modal state changes
  const updateThreadModalState = useCallback(
    (noteId: string | null) => {
      const newModalState: ModalState = { ...modalState };
      if (noteId) {
        newModalState.thread = noteId;
      } else {
        delete newModalState.thread;
      }
      updateUrlWithModalState(newModalState, navigate, location);
      // Note: setShowThreadModal is handled by the URL sync effect to prevent double state updates
    },
    [modalState, navigate, location]
  );

  const updateReplyModalState = useCallback(
    (noteId: string | null) => {
      const newModalState: ModalState = { ...modalState };
      if (noteId) {
        newModalState.reply = noteId;
      } else {
        delete newModalState.reply;
      }
      updateUrlWithModalState(newModalState, navigate, location);
      // Note: setShowReplyModal is handled by the URL sync effect to prevent double state updates
    },
    [modalState, navigate, location]
  );

  const updateRepostModalState = useCallback(
    (noteId: string | null) => {
      const newModalState: ModalState = { ...modalState };
      if (noteId) {
        newModalState.repost = noteId;
      } else {
        delete newModalState.repost;
      }
      updateUrlWithModalState(newModalState, navigate, location);
      // Note: setShowRepostModal is handled by the URL sync effect to prevent double state updates
    },
    [modalState, navigate, location]
  );

  const updateZapModalState = useCallback(
    (noteId: string | null) => {
      const newModalState: ModalState = { ...modalState };
      if (noteId) {
        newModalState.zap = noteId;
      } else {
        delete newModalState.zap;
      }
      updateUrlWithModalState(newModalState, navigate, location);
      // Note: setShowZapModal is handled by the URL sync effect to prevent double state updates
    },
    [modalState, navigate, location]
  );

  return {
    modalState,
    showThreadModal,
    setShowThreadModal,
    showReplyModal,
    setShowReplyModal,
    showRepostModal,
    setShowRepostModal,
    showZapModal,
    setShowZapModal,
    isAnyModalOpen,
    updateThreadModalState,
    updateReplyModalState,
    updateRepostModalState,
    updateZapModalState,
  };
};

import React from "react";
import { ConfirmModal } from "./Modal";

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemName: string;
  itemType?: string;
  isMobile?: boolean;
}

/**
 * Example of a specialized confirmation modal using the new Modal system
 * Demonstrates how to create domain-specific modals with consistent behavior
 */
export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  itemName,
  itemType = "item",
  isMobile = false,
}) => {
  return (
    <ConfirmModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title={`Delete ${itemType}`}
      message={`Are you sure you want to delete "${itemName}"? This action cannot be undone.`}
      confirmText="Delete"
      cancelText="Cancel"
      variant="danger"
      isMobile={isMobile}
    />
  );
};

export default ConfirmDeleteModal;

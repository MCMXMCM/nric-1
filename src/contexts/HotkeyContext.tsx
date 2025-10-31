import React, { createContext, useContext, type ReactNode } from "react";
import { useHotkeySystem } from "../hooks/useHotkeySystem";
import { useFocusManagement } from "../hooks/useFocusManagement";
import type { HotkeyAction, HotkeyConfig } from "../types/hotkeys";

interface HotkeyContextValue {
  // Hotkey system
  registerContext: (context: any) => void;
  unregisterContext: (contextId: string) => void;
  setActiveContext: (contextId: string | null) => void;
  registerGlobalShortcuts: (shortcuts: HotkeyConfig[]) => void;
  isEnabled: boolean;

  // Focus management
  focusState: any;
  setFocusedIndex: (index: number, noteId?: string | null) => void;
  navigateFocus: (
    direction: "up" | "down" | "first" | "last",
    steps?: number
  ) => void;
  isItemFocused: (index: number) => boolean;
  getFocusStyles: (index: number) => React.CSSProperties;
  handleKeyboardInteraction: () => void;
  handleMouseInteraction: () => void;
  activateKeyboardNavigation: () => void;
  deactivateKeyboardNavigation: () => void;

  // Actions
  onAction: (action: HotkeyAction, context?: string) => void;
}

const HotkeyContext = createContext<HotkeyContextValue | null>(null);

interface HotkeyProviderProps {
  children: ReactNode;
  totalItems?: number;
  initialIndex?: number;
  onAction?: (action: HotkeyAction, context?: string) => void;
  onFocusChange?: (index: number, noteId: string | null) => void;
  enabled?: boolean;
}

export const HotkeyProvider: React.FC<HotkeyProviderProps> = ({
  children,
  totalItems = 0,
  initialIndex = 0,
  onAction,
  onFocusChange,
  enabled = true,
}) => {
  const hotkeySystem = useHotkeySystem({
    enabled,
    onAction,
  });

  const focusManagement = useFocusManagement({
    totalItems,
    initialIndex,
    onFocusChange,
    enabled,
  });

  const contextValue: HotkeyContextValue = {
    // Hotkey system
    registerContext: hotkeySystem.registerContext,
    unregisterContext: hotkeySystem.unregisterContext,
    setActiveContext: hotkeySystem.setActiveContext,
    registerGlobalShortcuts: hotkeySystem.registerGlobalShortcuts,
    isEnabled: hotkeySystem.isEnabled,

    // Focus management
    focusState: focusManagement.focusState,
    setFocusedIndex: focusManagement.setFocusedIndex,
    navigateFocus: focusManagement.navigateFocus,
    isItemFocused: focusManagement.isItemFocused,
    getFocusStyles: focusManagement.getFocusStyles,
    handleKeyboardInteraction: focusManagement.handleKeyboardInteraction,
    handleMouseInteraction: focusManagement.handleMouseInteraction,
    activateKeyboardNavigation: focusManagement.activateKeyboardNavigation,
    deactivateKeyboardNavigation: focusManagement.deactivateKeyboardNavigation,

    // Actions
    onAction: onAction || (() => {}),
  };

  return (
    <HotkeyContext.Provider value={contextValue}>
      {children}
    </HotkeyContext.Provider>
  );
};

export const useHotkeyContext = (): HotkeyContextValue => {
  const context = useContext(HotkeyContext);
  if (!context) {
    throw new Error("useHotkeyContext must be used within a HotkeyProvider");
  }
  return context;
};

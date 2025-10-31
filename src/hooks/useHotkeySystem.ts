import { useCallback, useEffect, useRef, useState } from 'react';
import type { HotkeyConfig, HotkeyContext, HotkeySystemState, HotkeyAction } from '../types/hotkeys';

interface UseHotkeySystemProps {
  enabled?: boolean;
  onAction?: (action: HotkeyAction, context?: string) => void;
}

export const useHotkeySystem = ({ enabled = true, onAction }: UseHotkeySystemProps = {}) => {
  const [state, setState] = useState<HotkeySystemState>({
    contexts: new Map(),
    activeContext: null,
    globalShortcuts: [],
    focusState: {
      focusedIndex: -1,
      focusedNoteId: null,
      isFocused: false,
      focusVisible: false,
      isKeyboardNavigationActive: false,
      lastKeyboardNavigationTime: 0,
    },
    isEnabled: enabled,
  });

  const keySequenceRef = useRef<string[]>([]);
  const sequenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Register a hotkey context
  const registerContext = useCallback((context: HotkeyContext) => {
    setState(prev => {
      const newContexts = new Map(prev.contexts);
      newContexts.set(context.id, context);
      return {
        ...prev,
        contexts: newContexts,
      };
    });
  }, []);

  // Unregister a hotkey context
  const unregisterContext = useCallback((contextId: string) => {
    setState(prev => {
      const newContexts = new Map(prev.contexts);
      newContexts.delete(contextId);
      return {
        ...prev,
        contexts: newContexts,
        activeContext: prev.activeContext === contextId ? null : prev.activeContext,
      };
    });
  }, []);

  // Set active context
  const setActiveContext = useCallback((contextId: string | null) => {
    // Reduced debug logging to prevent console spam
    if (import.meta.env.DEV && Math.random() < 0.1) {
      console.log('🔥 setActiveContext called with:', contextId);
    }
    setState(prev => ({
      ...prev,
      activeContext: contextId,
    }));
  }, []);

  // Register global shortcuts
  const registerGlobalShortcuts = useCallback((shortcuts: HotkeyConfig[]) => {
    setState(prev => ({
      ...prev,
      globalShortcuts: [...prev.globalShortcuts, ...shortcuts],
    }));
  }, []);

  // Update focus state
  const updateFocusState = useCallback((focusState: Partial<typeof state.focusState>) => {
    setState(prev => ({
      ...prev,
      focusState: { ...prev.focusState, ...focusState },
    }));
  }, []);

  // Check if element should be ignored for hotkeys
  const shouldIgnoreElement = useCallback((element: HTMLElement): boolean => {
    const tagName = element.tagName.toLowerCase();
    const isInput = ['input', 'textarea', 'select'].includes(tagName);
    const isContentEditable = element.isContentEditable;
    const isModal = element.closest('[role="dialog"]') !== null;
    
    return isInput || isContentEditable || (isModal && !element.hasAttribute('data-hotkey-enabled'));
  }, []);

  // Parse key combination
  const parseKeyCombination = useCallback((event: KeyboardEvent): string => {
    const parts: string[] = [];
    
    if (event.ctrlKey) parts.push('ctrl');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    if (event.metaKey) parts.push('meta');
    
    // Normalize key names
    let key = event.key.toLowerCase();
    if (key === ' ') key = 'space';
    // Keep arrow keys as 'arrowup', 'arrowdown', etc. to match our shortcuts
    
    parts.push(key);
    return parts.join('+');
  }, []);

  // Handle key sequence (for multi-key shortcuts like 'g+g')
  const handleKeySequence = useCallback((key: string, shortcuts: HotkeyConfig[]): HotkeyConfig | null => {
    keySequenceRef.current.push(key);

    const sequence = keySequenceRef.current.join(' ');
    const matchingShortcut = shortcuts.find(shortcut => shortcut.enabled && shortcut.key === sequence) || null;

    if (matchingShortcut) {
      // Clear sequence on match
      keySequenceRef.current = [];
      if (sequenceTimeoutRef.current) {
        clearTimeout(sequenceTimeoutRef.current);
        sequenceTimeoutRef.current = undefined;
      }
      return matchingShortcut;
    }

    // Continue waiting for next key in sequence
    if (sequenceTimeoutRef.current) {
      clearTimeout(sequenceTimeoutRef.current);
    }
    sequenceTimeoutRef.current = setTimeout(() => {
      keySequenceRef.current = [];
    }, 600);

    return null;
  }, []);

  // Find matching shortcut
  const findMatchingShortcut = useCallback((keyCombo: string, shortcuts: HotkeyConfig[]): HotkeyConfig | null => {
    // Try direct match first
    const directMatch = shortcuts.find(shortcut => shortcut.enabled && shortcut.key === keyCombo && !shortcut.key.includes(' '));
    if (directMatch) return directMatch;

    // Always feed key into sequence matcher to allow multi-key combos like 'g g'
    const sequenceMatch = handleKeySequence(keyCombo, shortcuts);
    if (sequenceMatch) return sequenceMatch;

    return null;
  }, [handleKeySequence]);

  // Main keyboard event handler
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!state.isEnabled) {
      console.log("🔥 Hotkey system disabled");
      return;
    }
    
    const target = event.target as HTMLElement;
    if (shouldIgnoreElement(target)) {
      console.log("🔥 Ignoring element:", target.tagName, target.className);
      return;
    }
    
    const keyCombo = parseKeyCombination(event);
    
    // Get active shortcuts
    const activeContext = state.activeContext ? state.contexts.get(state.activeContext) : null;
    const allShortcuts = [
      ...state.globalShortcuts,
      ...(activeContext?.shortcuts || []),
    ];
    
    const matchingShortcut = findMatchingShortcut(keyCombo, allShortcuts);
    
    if (matchingShortcut) {
      if (matchingShortcut.preventDefault !== false) {
        event.preventDefault();
      }
      if (matchingShortcut.stopPropagation) {
        event.stopPropagation();
      }
      
      matchingShortcut.action();
      
      // Notify parent component
      if (onAction) {
        const action = matchingShortcut.key as HotkeyAction;
        onAction(action, state.activeContext || undefined);
      }
    }
  }, [state, shouldIgnoreElement, parseKeyCombination, findMatchingShortcut, onAction]);

  // Set up global event listener
  useEffect(() => {
    if (!enabled) return;
    
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (sequenceTimeoutRef.current) {
        clearTimeout(sequenceTimeoutRef.current);
      }
    };
  }, [enabled, handleKeyDown]);

  // Keep internal enabled state in sync with prop
  useEffect(() => {
    setState(prev => ({
      ...prev,
      isEnabled: enabled,
    }));
  }, [enabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sequenceTimeoutRef.current) {
        clearTimeout(sequenceTimeoutRef.current);
      }
    };
  }, []);

  return {
    state,
    registerContext,
    unregisterContext,
    setActiveContext,
    registerGlobalShortcuts,
    updateFocusState,
    isEnabled: state.isEnabled,
  };
};

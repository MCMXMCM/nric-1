import { useState, useCallback } from 'react';

// Session-based storage for tracking user's zaps
// This is a simple solution that tracks zaps during the current session
// A more robust solution would query zap receipts from relays
let sessionZaps = new Set<string>();

export interface UseUserZapsResult {
  hasZappedNote: (noteId: string) => boolean;
  markNoteAsZapped: (noteId: string) => void;
}

/**
 * Hook to track which notes the current user has zapped in this session
 * This provides immediate UI feedback for zap actions
 */
export function useUserZaps(): UseUserZapsResult {
  const [, forceUpdate] = useState({});

  const hasZappedNote = useCallback((noteId: string): boolean => {
    return sessionZaps.has(noteId);
  }, []);

  const markNoteAsZapped = useCallback((noteId: string) => {
    sessionZaps.add(noteId);
    // Force re-render to update UI
    forceUpdate({});
  }, []);

  return {
    hasZappedNote,
    markNoteAsZapped,
  };
}

/**
 * Clear all session zap tracking (useful for testing or logout)
 */
export function clearSessionZaps() {
  sessionZaps.clear();
}

import { useMemo } from 'react';
import type { Note } from '../types/nostr/types';

interface ThreadNote {
  note: Note;
  depth: number;
  parentId: string | null;
}

interface UseThreadNavigationProps {
  mainNote: Note | null;
  comments: Note[];
  threadStructure: Map<string, Note[]> | undefined;
  collapsedNotes: Set<string>;
}

export const useThreadNavigation = ({
  mainNote,
  comments,
  threadStructure,
  collapsedNotes,
}: UseThreadNavigationProps) => {
  
  // Flatten thread structure into navigable list
  const flattenedNotes = useMemo(() => {
    const result: ThreadNote[] = [];
    
    // Add main note first if available
    if (mainNote) {
      result.push({
        note: mainNote,
        depth: 0,
        parentId: null,
      });
    }
    
    // Helper to recursively add notes and their children
    const addNoteAndChildren = (note: Note, depth: number, parentId: string | null) => {
      result.push({
        note,
        depth,
        parentId,
      });
      
      // If this note is collapsed, don't add its children
      if (collapsedNotes.has(note.id)) {
        return;
      }
      
      // Add children if they exist in thread structure
      const children = threadStructure?.get(note.id) || [];
      for (const child of children) {
        addNoteAndChildren(child, depth + 1, note.id);
      }
    };
    
    // Add all comments and their nested replies
    for (const comment of comments) {
      // Skip if already added (shouldn't happen but be safe)
      if (result.some(r => r.note.id === comment.id)) {
        continue;
      }
      
      addNoteAndChildren(comment, 1, mainNote?.id || null);
    }
    
    return result;
  }, [mainNote, comments, threadStructure, collapsedNotes]);
  
  const totalNotes = flattenedNotes.length;
  
  const getNoteByIndex = (index: number): ThreadNote | null => {
    if (index < 0 || index >= flattenedNotes.length) {
      return null;
    }
    return flattenedNotes[index];
  };
  
  return {
    flattenedNotes,
    totalNotes,
    getNoteByIndex,
  };
};


import { useCallback, useRef } from 'react';
import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { Note } from '../types/nostr/types';

interface NotePage {
  notes: Note[];
  nextCursor?: number;
  loaded: number;
}

interface PublishNoteData {
  content: string;
  tags?: string[][];
  kind?: number;
  relayUrls: string[];
}

interface OptimisticNoteOptions {
  tempId?: string;
  userPubkey: string;
  createdAt?: number;
}

interface OptimisticUpdateContext {
  previousData: InfiniteData<NotePage> | undefined;
  optimisticNote: Note;
  queryKeys: string[][];
  tempId: string;
}

/**
 * Creates an optimistic note for immediate UI feedback
 */
function createOptimisticNote(
  noteData: PublishNoteData,
  options: OptimisticNoteOptions
): Note {
  const tempId = options.tempId || `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const createdAt = options.createdAt || Math.floor(Date.now() / 1000);

  return {
    id: tempId,
    pubkey: options.userPubkey,
    created_at: createdAt,
    kind: noteData.kind || 1,
    tags: noteData.tags || [],
    content: noteData.content,
    imageUrls: [],
    videoUrls: [],
    receivedAt: Date.now(),
    // Mark as optimistic for UI handling
    _optimistic: true,
    _tempId: tempId
  } as Note & { _optimistic: boolean; _tempId: string };
}

/**
 * Gets all relevant query keys that should be updated for a note
 */
function getRelevantQueryKeys(
  queryClient: ReturnType<typeof useQueryClient>
): string[][] {
  const queryKeys: string[][] = [];
  
  // Get all current queries
  const queries = queryClient.getQueryCache().getAll();
  
  queries.forEach(query => {
    const queryKey = query.queryKey as readonly unknown[];
    
    // Add feed queries
    if (queryKey[0] === 'feed' && queryKey[1] === 'notes') {
      queryKeys.push([...queryKey] as string[]);
    }
    
    // Add profile queries if this is the user's own note
    if (queryKey[0] === 'profile' && queryKey[1] === 'notes') {
      queryKeys.push([...queryKey] as string[]);
    }
  });
  
  return queryKeys;
}

/**
 * Hook for publishing notes with optimistic updates
 */
export function usePublishNote() {
  const queryClient = useQueryClient();
  const rollbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useMutation<any, Error, PublishNoteData, OptimisticUpdateContext>({
    mutationFn: async (noteData: PublishNoteData): Promise<any> => {
      // TODO: Replace with your actual publish logic
      return await publishNoteToRelays(noteData);
    },

    // Optimistic update
    onMutate: async (noteData: PublishNoteData) => {
      const userPubkey = getCurrentUserPubkey(); // TODO: Get from your auth context
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Create optimistic note
      const optimisticNote = createOptimisticNote(noteData, {
        tempId,
        userPubkey
      });

      // Get all relevant query keys
      const queryKeys = getRelevantQueryKeys(queryClient);
      
      // Cancel outgoing refetches for all relevant queries
      await Promise.all(
        queryKeys.map(key => queryClient.cancelQueries({ queryKey: key }))
      );

      // Snapshot previous values
      const previousData = queryKeys.length > 0 
        ? queryClient.getQueryData(queryKeys[0]) as InfiniteData<NotePage>
        : undefined;

      // Apply optimistic updates to all relevant queries
      queryKeys.forEach(queryKey => {
        queryClient.setQueryData(queryKey, (oldData: InfiniteData<NotePage> | undefined) => {
          if (!oldData || !oldData.pages || oldData.pages.length === 0) {
            // Create initial data structure if none exists
            return {
              pages: [{
                notes: [optimisticNote],
                loaded: 1,
                nextCursor: undefined
              }],
              pageParams: [undefined]
            };
          }

          const firstPage = oldData.pages[0];
          
          // Check for duplicates (shouldn't happen with temp IDs, but be safe)
          const noteExists = firstPage.notes.some(note => 
            note.id === optimisticNote.id || 
            (note as any)._tempId === (optimisticNote as any)._tempId
          );
          
          if (noteExists) {
            return oldData;
          }

          return {
            ...oldData,
            pages: [
              {
                ...firstPage,
                notes: [optimisticNote, ...firstPage.notes],
                loaded: firstPage.loaded + 1
              },
              ...oldData.pages.slice(1)
            ]
          };
        });
      });

      console.log('✨ Applied optimistic update for note:', {
        tempId,
        content: noteData.content.slice(0, 50) + '...',
        queryKeys: queryKeys.length
      });

      return { 
        previousData, 
        optimisticNote, 
        queryKeys, 
        tempId 
      };
    },

    // Handle success - replace optimistic note with real one
    onSuccess: (publishedEvent: any, _noteData: PublishNoteData, context?: OptimisticUpdateContext) => {
      if (!context) return;

      const { queryKeys, tempId } = context;
      
      // Convert published event to note
      const realNote: Note = {
        id: publishedEvent.id,
        pubkey: publishedEvent.pubkey,
        created_at: publishedEvent.created_at,
        kind: publishedEvent.kind || 1,
        tags: publishedEvent.tags,
        content: publishedEvent.content,
        imageUrls: [],
        videoUrls: [],
        receivedAt: Date.now()
      };

      console.log('✅ Replacing optimistic note with real note:', {
        tempId,
        realId: realNote.id
      });

      // Replace optimistic note with real note in all relevant queries
      queryKeys.forEach(queryKey => {
        queryClient.setQueryData(queryKey, (oldData: InfiniteData<NotePage> | undefined) => {
          if (!oldData) return oldData;

          return {
            ...oldData,
            pages: oldData.pages.map(page => ({
              ...page,
              notes: page.notes.map(note => {
                const isOptimisticNote = (note as any)._tempId === tempId;
                return isOptimisticNote ? realNote : note;
              })
            }))
          };
        });
      });

      // Clear any pending rollback
      if (rollbackTimeoutRef.current) {
        clearTimeout(rollbackTimeoutRef.current);
        rollbackTimeoutRef.current = null;
      }

      // Optional: Invalidate queries after a delay to ensure consistency
      setTimeout(() => {
        queryKeys.forEach(queryKey => {
          queryClient.invalidateQueries({ queryKey, exact: true });
        });
      }, 5000); // 5 second delay
    },

    // Handle error - rollback optimistic update
    onError: (error: Error, _noteData: PublishNoteData, context?: OptimisticUpdateContext) => {
      console.error('❌ Failed to publish note, rolling back optimistic update:', error);

      if (!context) return;

      const { previousData, queryKeys, tempId } = context;

      // Remove optimistic note from all relevant queries
      queryKeys.forEach(queryKey => {
        if (previousData && queryKey.join('|') === queryKeys[0].join('|')) {
          // Restore original data for the main query
          queryClient.setQueryData(queryKey, previousData);
        } else {
          // Remove optimistic note from other queries
          queryClient.setQueryData(queryKey, (oldData: InfiniteData<NotePage> | undefined) => {
            if (!oldData) return oldData;

            return {
              ...oldData,
              pages: oldData.pages.map(page => ({
                ...page,
                notes: page.notes.filter(note => 
                  (note as any)._tempId !== tempId
                ),
                loaded: Math.max(0, page.loaded - 1)
              }))
            };
          });
        }
      });

      // Show user-friendly error message
      // TODO: Integrate with your notification system
      showErrorNotification(`Failed to publish note: ${error.message}`);
    },

    // Cleanup timeout on unmount
    onSettled: () => {
      if (rollbackTimeoutRef.current) {
        clearTimeout(rollbackTimeoutRef.current);
        rollbackTimeoutRef.current = null;
      }
    },
  });
}

/**
 * Hook for optimistic reactions (likes, reposts, etc.)
 */
export function useOptimisticReaction() {
  const queryClient = useQueryClient();

  const addReaction = useCallback(async (
    noteId: string, 
    reactionType: 'like' | 'repost' | 'zap',
    value?: string
  ) => {

    // Find and update the note in cache
    const queries = queryClient.getQueryCache().getAll();
    
    queries.forEach(query => {
      const queryKey = query.queryKey as readonly unknown[];
      
      if (queryKey[0] === 'feed' || queryKey[0] === 'profile') {
        queryClient.setQueryData(queryKey, (oldData: InfiniteData<NotePage> | undefined) => {
          if (!oldData) return oldData;

          return {
            ...oldData,
            pages: oldData.pages.map(page => ({
              ...page,
              notes: page.notes.map(note => {
                if (note.id !== noteId) return note;

                // Add optimistic reaction
                const updatedNote = { ...note } as any;
                if (reactionType === 'like') {
                  updatedNote._optimisticLikes = (updatedNote._optimisticLikes || 0) + 1;
                } else if (reactionType === 'repost') {
                  updatedNote._optimisticReposts = (updatedNote._optimisticReposts || 0) + 1;
                }

                return updatedNote;
              })
            }))
          };
        });
      }
    });

    try {
      // TODO: Implement actual reaction publishing
      await publishReaction(noteId, reactionType, value);
      
      console.log('✅ Reaction published successfully');
    } catch (error) {
      console.error('❌ Failed to publish reaction, rolling back:', error);
      
      // Rollback optimistic update
      queries.forEach(query => {
        const queryKey = query.queryKey as readonly unknown[];
        
        if (queryKey[0] === 'feed' || queryKey[0] === 'profile') {
          queryClient.setQueryData(queryKey, (oldData: InfiniteData<NotePage> | undefined) => {
            if (!oldData) return oldData;

            return {
              ...oldData,
              pages: oldData.pages.map(page => ({
                ...page,
                notes: page.notes.map(note => {
                  if (note.id !== noteId) return note;

                  const updatedNote = { ...note } as any;
                  if (reactionType === 'like') {
                    updatedNote._optimisticLikes = Math.max(0, (updatedNote._optimisticLikes || 0) - 1);
                  } else if (reactionType === 'repost') {
                    updatedNote._optimisticReposts = Math.max(0, (updatedNote._optimisticReposts || 0) - 1);
                  }

                  return updatedNote;
                })
              }))
            };
          });
        }
      });
    }
  }, [queryClient]);

  return { addReaction };
}

/**
 * Placeholder functions - replace with your actual implementations
 */
async function publishNoteToRelays(noteData: PublishNoteData): Promise<any> {
  // TODO: Implement your actual note publishing logic
  console.log('Publishing note:', noteData);
  return Promise.resolve({ id: 'temp-id', ...noteData });
}

async function publishReaction(noteId: string, reactionType: string, value?: string): Promise<any> {
  // TODO: Implement your actual reaction publishing logic
  console.log('Publishing reaction:', { noteId, reactionType, value });
  return Promise.resolve({ id: 'reaction-id', kind: 7 });
}

function getCurrentUserPubkey(): string {
  // TODO: Get from your auth context
  return 'user-pubkey';
}

function showErrorNotification(message: string): void {
  // TODO: Integrate with your notification system
  console.error(message);
}

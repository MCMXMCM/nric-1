/**
 * Global Thread Tree Hook
 * 
 * Enhanced version of useNostrifyThread that uses a persistent global thread tree
 * for consistent navigation and reduced network requests.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useCallback, useMemo, useEffect } from 'react';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import type { Note } from '../types/nostr/types';
import { extractImageUrls, extractVideoUrls } from '../utils/nostr/utils';
import { CACHE_KEYS } from '../utils/cacheKeys';
import {
  createEmptyThreadTree,
  mergeNotesIntoTree,
  buildThreadView,
  getThreadTreeFromStorage,
  saveThreadTreeToStorage,
  discoverConversationRoot,
  getCachedRoot,
  type ThreadView,
} from '../utils/threadCache';

interface UseNostrifyThreadGlobalConfig {
  parentEventId: string;
  rootThreadId?: string; // Optional: pass if known to use correct tree
  relayUrls: string[];
  enabled?: boolean;
  pageSize?: number;
  maxDepth?: number;
  mutedPubkeys?: string[];
  contactPubkeys?: string[]; // For outbox model routing when logged in
}

interface UseNostrifyThreadGlobalResult {
  data: Note[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  hasNextPage: boolean;
  fetchNextPage: () => Promise<void>;
  isFetchingNextPage: boolean;
  threadStructure: Map<string, Note[]>;
  threadView: ThreadView | null;
  navigationContext: any;
  discoveredRootId: string; // The discovered or provided root of this conversation
}

/**
 * Hook for fetching thread data using global thread tree
 */
export function useNostrifyThreadGlobal(
  config: UseNostrifyThreadGlobalConfig
): UseNostrifyThreadGlobalResult {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const {
    parentEventId,
    rootThreadId,
    relayUrls: _relayUrls,
    enabled = true,
    maxDepth = 3,
    mutedPubkeys = [],
    // contactPubkeys - currently unused, but kept in config for future outbox model implementation
  } = config;

  // Helper to fetch a single note by ID
  const fetchNoteById = useCallback(async (noteId: string): Promise<Note | null> => {
    if (!nostr) return null;
    
    try {
      const events = await nostr.query([{
        kinds: [1],
        ids: [noteId],
        limit: 1
      }]);
      
      if (!events || events.length === 0) return null;
      
      const event = events[0] as NostrEvent;
      return {
        id: event.id,
        pubkey: event.pubkey,
        content: event.content,
        created_at: event.created_at,
        kind: event.kind || 1,
        tags: event.tags || [],
        imageUrls: extractImageUrls(event.content),
        videoUrls: extractVideoUrls(event.content),
        receivedAt: Date.now()
      };
    } catch (error) {
      console.warn('Failed to fetch note:', noteId, error);
      return null;
    }
  }, [nostr]);

  // Discover the true conversation root
  const rootDiscoveryQuery = useQuery({
    queryKey: ['thread', 'root-discovery', parentEventId],
    enabled: enabled && !!parentEventId && !rootThreadId, // Skip if rootThreadId already provided
    queryFn: async () => {
      // Check cache first
      const cached = getCachedRoot(parentEventId);
      if (cached) {
        return cached;
      }
      
      // Discover the root
      const discoveredRoot = await discoverConversationRoot(parentEventId, fetchNoteById);
      return discoveredRoot;
    },
    staleTime: Infinity, // Root discovery is permanent for a given note
    gcTime: 60 * 60 * 1000, // Keep in cache for 1 hour
  });

  // Determine the root ID for this thread tree
  // Priority: provided rootThreadId > discovered root > parentEventId (fallback)
  const effectiveRootId = rootThreadId || rootDiscoveryQuery.data || parentEventId;

  // Convert events to notes
  const processEvents = useCallback((events: NostrEvent[]): Note[] => {
    return events
      .filter(event => {
        if (mutedPubkeys.includes(event.pubkey)) return false;
        return true;
      })
      .map(event => {
        const imageUrls = extractImageUrls(event.content);
        const videoUrls = extractVideoUrls(event.content);
        
        return {
          id: event.id,
          pubkey: event.pubkey,
          content: event.content,
          created_at: event.created_at,
          kind: event.kind || 1,
          tags: event.tags || [],
          imageUrls,
          videoUrls,
          receivedAt: Date.now()
        };
      })
      .sort((a, b) => a.created_at - b.created_at);
  }, [mutedPubkeys]);

  // Global thread tree query - this is the main cache
  const threadTreeQuery = useQuery({
    queryKey: CACHE_KEYS.THREAD.GLOBAL_TREE(effectiveRootId),
    enabled: enabled && !!parentEventId,
    queryFn: async () => {
      // Try to load from session storage first
      const stored = getThreadTreeFromStorage(effectiveRootId);
      if (stored) {
        return stored;
      }
      
      // Create empty tree
      return createEmptyThreadTree(effectiveRootId);
    },
    staleTime: Infinity, // Never automatically mark as stale
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes after unmount
  });

  // Helper: Fetch thread data from Nostr
  const fetchThreadData = useCallback(async (
    targetParentId: string,
    depth: number = 3
  ): Promise<Note[]> => {
    if (!nostr) throw new Error('Nostrify not available');

    // Paginated fetch helper
    const fetchLevelReplies = async (frontierIds: string[]): Promise<Note[]> => {
      const collected: Note[] = [];
      const seen = new Set<string>();
      let until: number | undefined = undefined;
      const PAGE_LIMIT = 200;
      
      while (true) {
        // DO NOT filter by authors/contactPubkeys here - we want ALL replies
        // The contactPubkeys are only for outbox model relay selection, not filtering
        const filter: NostrFilter = { 
          kinds: [1], 
          '#e': frontierIds, 
          limit: PAGE_LIMIT
        };
        if (until) filter.until = until;
        
        const events = await nostr.query([filter]);
        if (!events || events.length === 0) break;
        
        const notes = processEvents(events as NostrEvent[]);
        let added = 0;
        for (const n of notes) {
          if (seen.has(n.id)) continue;
          seen.add(n.id);
          collected.push(n);
          added++;
        }
        
        const minCreated = Math.min(...(events as NostrEvent[]).map(e => e.created_at || 0));
        const nextUntil = (minCreated || 0) - 1;
        if (events.length < PAGE_LIMIT) break;
        if (until !== undefined && nextUntil >= until) break;
        until = nextUntil;
      }
      
      collected.sort((a, b) => (a.created_at - b.created_at) || a.id.localeCompare(b.id));
      return collected;
    };

    try {
      // Step 1: Get the parent note
      const parentEvents = await nostr.query([{
        kinds: [1],
        ids: [targetParentId],
        limit: 1
      }]);
      
      const parentNotes = processEvents(parentEvents);
      let allNotes = [...parentNotes];
      
      // Step 2: Get direct replies
      // DO NOT filter by authors - we want ALL replies, not just from contacts
      const directEvents = await nostr.query([{
        kinds: [1],
        '#e': [targetParentId],
        limit: 200
      }]);
      
      let directNotes = processEvents(directEvents);
      const existingIds = new Set(allNotes.map(note => note.id));
      let newDirectNotes = directNotes.filter(note => !existingIds.has(note.id));
      
      // Fallback pagination if needed
      if (newDirectNotes.length === 0) {
        const fetchedDirect = await fetchLevelReplies([targetParentId]);
        if (fetchedDirect.length > 0) {
          const seen = new Set(allNotes.map(n => n.id));
          for (const n of fetchedDirect) {
            if (!seen.has(n.id)) {
              allNotes.push(n);
              seen.add(n.id);
            }
          }
          newDirectNotes = fetchedDirect;
        }
      } else {
        allNotes = [...allNotes, ...newDirectNotes];
      }
      
      // Step 3: Recursively fetch nested replies using BFS
      // CRITICAL: We need to explore all levels up to maxDepth, even if notes are in cache
      // This ensures that when navigating to a parent, we get ALL descendants
      let currentDepth = 1;
      let frontierIds = newDirectNotes.map(n => n.id);
      const exploredIds = new Set<string>([targetParentId, ...newDirectNotes.map(n => n.id)]);
      
      while (currentDepth < depth && frontierIds.length > 0) {
        const levelReplies = await fetchLevelReplies(frontierIds);
        const existingIdsSet = new Set(allNotes.map(note => note.id));
        const newNestedNotes = levelReplies.filter(note => !existingIdsSet.has(note.id));
        
        // Add newly discovered notes to allNotes
        if (newNestedNotes.length > 0) {
          allNotes = [...allNotes, ...newNestedNotes];
        }
        
        // Update frontier: include ALL replies at this level, not just new ones
        // This is critical because a cached note might have replies we haven't explored yet
        const allRepliesAtLevel = levelReplies.filter(note => !exploredIds.has(note.id));
        
        if (allRepliesAtLevel.length === 0) {
          // No new nodes to explore at this level, stop
          break;
        }
        
        // Add explored IDs to prevent revisiting
        allRepliesAtLevel.forEach(note => exploredIds.add(note.id));
        
        // Update frontier with ALL notes from this level (including cached ones)
        // so we can explore their children
        frontierIds = allRepliesAtLevel.map(note => note.id);
        currentDepth++;
      }
      
      return allNotes;
    } catch (error) {
      console.warn('Failed to fetch thread data:', error);
      throw error;
    }
  }, [nostr, processEvents]);

  // Missing data query - fetch only what's not in the tree
  const missingDataQuery = useQuery({
    queryKey: ['thread', 'missing-data', effectiveRootId, parentEventId, maxDepth],
    enabled: enabled && threadTreeQuery.isSuccess && !!threadTreeQuery.data,
    queryFn: async () => {
      const tree = threadTreeQuery.data;
      if (!tree) return [];

      const parentNode = tree.nodes.get(parentEventId);
      
      // Always fetch if node doesn't exist
      if (!parentNode) {
        console.log('Node not in tree, fetching:', parentEventId);
        const newNotes = await fetchThreadData(parentEventId, maxDepth);
        
        // Merge into global tree
        const updatedTree = mergeNotesIntoTree(tree, newNotes, [parentEventId]);
        
        // Update the query cache with a NEW object reference to ensure subscribers/memos recompute
        const clonedTree = {
          ...updatedTree,
          nodes: new Map(updatedTree.nodes),
          relationships: {
            childToParent: new Map(updatedTree.relationships.childToParent),
            parentToChildren: new Map(
              updatedTree.relationships.parentToChildren
            ),
            siblings: new Map(updatedTree.relationships.siblings),
          },
        } as typeof updatedTree;
        queryClient.setQueryData(
          CACHE_KEYS.THREAD.GLOBAL_TREE(effectiveRootId),
          clonedTree
        );
        
        // Save to session storage
        saveThreadTreeToStorage(updatedTree);
        
        return newNotes;
      }
      
      // If children fetch was never attempted, fetch now
      if (!parentNode.childrenFetchAttempted) {
        console.log('Children not fetched yet, fetching for:', parentEventId);
        const newNotes = await fetchThreadData(parentEventId, maxDepth);
        
        // Merge into global tree
        const updatedTree = mergeNotesIntoTree(tree, newNotes, [parentEventId]);
        
        // Update the query cache with a NEW object reference to ensure subscribers/memos recompute
        const clonedTree2 = {
          ...updatedTree,
          nodes: new Map(updatedTree.nodes),
          relationships: {
            childToParent: new Map(updatedTree.relationships.childToParent),
            parentToChildren: new Map(
              updatedTree.relationships.parentToChildren
            ),
            siblings: new Map(updatedTree.relationships.siblings),
          },
        } as typeof updatedTree;
        queryClient.setQueryData(
          CACHE_KEYS.THREAD.GLOBAL_TREE(effectiveRootId),
          clonedTree2
        );
        
        // Save to session storage
        saveThreadTreeToStorage(updatedTree);
        
        return newNotes;
      }
      
      // CRITICAL: Check if this node's direct children are incomplete
      // This handles the navigation case where a nested reply becomes the main view
      const directChildIds = tree.relationships.parentToChildren.get(parentEventId) || [];
      if (directChildIds.length > 0) {
        // Check if any direct children have unexplored descendants
        let needsDeepFetch = false;
        for (const childId of directChildIds) {
          const childNode = tree.nodes.get(childId);
          if (childNode && !childNode.childrenFetchAttempted) {
            // At least one child hasn't been explored for its own children
            // This means we might be missing nested replies
            needsDeepFetch = true;
            break;
          }
        }
        
        if (needsDeepFetch) {
          console.log('Navigation detected: re-fetching to ensure all nested replies are visible for:', parentEventId);
          const newNotes = await fetchThreadData(parentEventId, maxDepth);
          
          // Merge into global tree
          const updatedTree = mergeNotesIntoTree(tree, newNotes, [
            parentEventId,
            ...directChildIds.filter(id => {
              const node = tree.nodes.get(id);
              return node && !node.childrenFetchAttempted;
            })
          ]);
          
          // Update the query cache
          const clonedTree = {
            ...updatedTree,
            nodes: new Map(updatedTree.nodes),
            relationships: {
              childToParent: new Map(updatedTree.relationships.childToParent),
              parentToChildren: new Map(
                updatedTree.relationships.parentToChildren
              ),
              siblings: new Map(updatedTree.relationships.siblings),
            },
          } as typeof updatedTree;
          queryClient.setQueryData(
            CACHE_KEYS.THREAD.GLOBAL_TREE(effectiveRootId),
            clonedTree
          );
          
          saveThreadTreeToStorage(updatedTree);
          return newNotes;
        }
      }
      
      // Check if we need deeper nested data
      const view = buildThreadView(tree, parentEventId, maxDepth);
      if (view.hasUnfetchedContent) {
        // Identify nodes that need fetching
        const nodesToFetch: string[] = [];
        const checkNode = (nodeId: string, currentDepth: number) => {
          if (currentDepth >= maxDepth) return;
          const node = tree.nodes.get(nodeId);
          if (node && node.hasUnfetchedChildren && !node.childrenFetchAttempted) {
            nodesToFetch.push(nodeId);
          }
          // Check children
          const children = tree.relationships.parentToChildren.get(nodeId) || [];
          children.forEach(childId => checkNode(childId, currentDepth + 1));
        };
        checkNode(parentEventId, 0);
        
        if (nodesToFetch.length > 0) {
          console.log('Fetching nested data for nodes:', nodesToFetch);
          const allNewNotes: Note[] = [];
          
          for (const nodeId of nodesToFetch) {
            try {
              const notes = await fetchThreadData(nodeId, 2); // Fetch 2 levels deep
              allNewNotes.push(...notes);
            } catch (error) {
              console.warn('Failed to fetch for node:', nodeId, error);
            }
          }
          
          if (allNewNotes.length > 0) {
            const updatedTree = mergeNotesIntoTree(
              tree,
              allNewNotes,
              nodesToFetch
            );
            const clonedTree3 = {
              ...updatedTree,
              nodes: new Map(updatedTree.nodes),
              relationships: {
                childToParent: new Map(
                  updatedTree.relationships.childToParent
                ),
                parentToChildren: new Map(
                  updatedTree.relationships.parentToChildren
                ),
                siblings: new Map(updatedTree.relationships.siblings),
              },
            } as typeof updatedTree;
            queryClient.setQueryData(
              CACHE_KEYS.THREAD.GLOBAL_TREE(effectiveRootId),
              clonedTree3
            );
            saveThreadTreeToStorage(updatedTree);
          }
          
          return allNewNotes;
        }
      }
      
      return [];
    },
    staleTime: 30 * 1000, // Consider stale after 30 seconds - preserves data during quick navigation
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Write all notes to global per-note cache
  useEffect(() => {
    const tree = threadTreeQuery.data;
    if (!tree) return;
    
    for (const [noteId, node] of tree.nodes) {
      queryClient.setQueryData(CACHE_KEYS.NOTE(noteId), node.note);
    }
  }, [threadTreeQuery.data, queryClient]);

  // Build the current view from the global tree
  const threadView = useMemo(() => {
    const tree = threadTreeQuery.data;
    if (!tree) return null;
    
    return buildThreadView(tree, parentEventId, maxDepth);
  }, [threadTreeQuery.data, parentEventId, maxDepth]);

  // SOLUTION 1: Complete thread structure reconstruction
  // Ensure all relationships from the global tree are included in the structure Map
  // This fixes the bug where nested replies disappear after navigation
  // because resolvedThreadStructure wasn't being rebuilt to include already-loaded nested data
  const buildCompleteThreadStructure = useCallback((): Map<string, Note[]> => {
    if (!threadTreeQuery.data) return new Map();
    
    const structure = new Map<string, Note[]>();
    const tree = threadTreeQuery.data;
    
    // Collect all direct parent-child relationships from the global tree
    if (tree.relationships?.parentToChildren) {
      for (const [parentId, childIds] of tree.relationships.parentToChildren) {
        const children: Note[] = [];
        
        // Get actual Note objects for each child ID
        for (const childId of childIds) {
          const node = tree.nodes.get(childId);
          if (node?.note) {
            children.push(node.note);
          }
        }
        
        // Only add if we found actual children
        if (children.length > 0) {
          // Sort by creation time for consistent ordering
          structure.set(
            parentId,
            children.sort((a, b) => a.created_at - b.created_at)
          );
        }
      }
    }
    
    return structure;
  }, [threadTreeQuery.data]);

  // Merge complete tree structure with threadView structure
  // This ensures we capture ALL relationships, especially after navigation
  const enhancedThreadStructure = useMemo(() => {
    const fromView = threadView?.threadStructure || new Map<string, Note[]>();
    const fromTree = buildCompleteThreadStructure();
    
    // If both empty, return empty map
    if (fromTree.size === 0 && fromView.size === 0) {
      return new Map<string, Note[]>();
    }
    
    // Start with tree structure (more complete) and fill with view structure
    const merged = new Map<string, Note[]>(fromTree);
    
    // Merge in threadView structure to ensure we have the most up-to-date data
    for (const [parentId, children] of fromView) {
      const existing = merged.get(parentId) || [];
      
      // Merge and deduplicate by ID
      const byId = new Map<string, Note>();
      existing.forEach((n) => byId.set(n.id, n));
      children.forEach((n) => byId.set(n.id, n));
      
      // Sort merged result
      const merged_children = Array.from(byId.values()).sort(
        (a, b) => a.created_at - b.created_at
      );
      
      if (merged_children.length > 0) {
        merged.set(parentId, merged_children);
      }
    }
    
    return merged;
  }, [threadView?.threadStructure, buildCompleteThreadStructure]);

  // Extract data for compatibility with existing code
  const allNotes = useMemo(() => {
    if (!threadView) return [];
    
    // Flatten all notes in the view
    const notes = new Set<Note>();
    
    if (threadView.parent) {
      notes.add(threadView.parent);
    }
    
    threadView.directChildren.forEach(note => notes.add(note));
    
    threadView.threadStructure.forEach(children => {
      children.forEach(note => notes.add(note));
    });
    
    return Array.from(notes).sort((a, b) => a.created_at - b.created_at);
  }, [threadView]);

  // Fetch next page (for compatibility)
  const fetchNextPage = useCallback(async () => {
    // In the global tree model, we don't have traditional pagination
    // Instead, we can try to fetch more nested content
    if (!threadTreeQuery.data) return;
    
    // Trigger refetch of missing data
    await missingDataQuery.refetch();
  }, [threadTreeQuery.data, missingDataQuery]);

  // Check if we're loading initial data for a new parent
  const isLoadingInitialData = 
    threadTreeQuery.isLoading || 
    rootDiscoveryQuery.isLoading ||
    (missingDataQuery.isLoading && (!threadView || threadView.directChildren.length === 0)) ||
    // Keep loading state while missingDataQuery hasn't successfully fetched yet AND we have no data to show
    (threadTreeQuery.isSuccess && 
     !missingDataQuery.isSuccess && 
     (!threadView || threadView.directChildren.length === 0));

  return {
    data: allNotes,
    isLoading: isLoadingInitialData,
    error: threadTreeQuery.error || missingDataQuery.error || rootDiscoveryQuery.error,
    refetch: () => {
      threadTreeQuery.refetch();
      missingDataQuery.refetch();
      rootDiscoveryQuery.refetch();
    },
    hasNextPage: threadView?.hasUnfetchedContent || false,
    fetchNextPage,
    isFetchingNextPage: missingDataQuery.isFetching && !isLoadingInitialData,
    threadStructure: enhancedThreadStructure,
    threadView,
    navigationContext: null, // TODO: Implement
    discoveredRootId: effectiveRootId, // Return the discovered root for navigation
  };
}


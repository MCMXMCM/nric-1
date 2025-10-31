/**
 * Global Thread Tree Cache
 * 
 * This module provides a persistent, centralized thread structure that stores
 * ALL fetched notes and relationships across the entire conversation tree.
 * 
 * Benefits:
 * - Consistent navigation: Previously viewed content remains visible
 * - Reduced network requests: Only fetch missing pieces
 * - Better mobile performance: Fewer fetches, faster navigation
 * - Predictable behavior: Content doesn't disappear on navigation
 */

import type { Note } from '../types/nostr/types';

/**
 * Represents a single node in the thread tree with full relationship context
 */
export interface ThreadNode {
  /** The actual note data */
  note: Note;
  
  /** ID of parent note (null for root) */
  parentId: string | null;
  
  /** IDs of direct children (replies) */
  childrenIds: string[];
  
  /** IDs of sibling notes (notes with same parent) */
  siblingIds: string[];
  
  /** Depth from root note (0 = root) */
  depth: number;
  
  /** Timestamp when this node was fetched */
  fetchedAt: number;
  
  /** Whether this node might have unfetched children */
  hasUnfetchedChildren: boolean;
  
  /** Whether we attempted to fetch children and got a response */
  childrenFetchAttempted: boolean;
}

/**
 * The complete thread tree structure
 */
export interface ThreadTree {
  /** Root note ID for this thread */
  rootId: string;
  
  /** Map of note ID to thread node */
  nodes: Map<string, ThreadNode>;
  
  /** Bidirectional relationship maps for efficient traversal */
  relationships: {
    /** Map from child ID to parent ID */
    childToParent: Map<string, string>;
    
    /** Map from parent ID to array of child IDs */
    parentToChildren: Map<string, string[]>;
    
    /** Map from note ID to array of sibling IDs */
    siblings: Map<string, string[]>;
  };
  
  /** Timestamp of last update */
  lastUpdated: number;
  
  /** Maximum depth currently in the tree */
  maxDepth: number;
}

/**
 * Navigation context for a specific note within the thread
 */
export interface NavigationContext {
  /** Current note ID being viewed */
  currentNoteId: string;
  
  /** Parent note ID (null if root) */
  parentId: string | null;
  
  /** Direct children IDs */
  childrenIds: string[];
  
  /** Sibling note IDs */
  siblingIds: string[];
  
  /** Path from root to current note */
  ancestorPath: string[];
  
  /** Total count of descendants */
  descendantCount: number;
  
  /** Depth of current note */
  depth: number;
}

/**
 * Result of building a thread view from the global tree
 */
export interface ThreadView {
  /** The parent/main note being viewed */
  parent: Note | null;
  
  /** Direct children (replies) to the parent */
  directChildren: Note[];
  
  /** Thread structure map (parent ID -> children) */
  threadStructure: Map<string, Note[]>;
  
  /** ID-based children map for efficient lookups */
  childrenIdMap: Record<string, string[]>;
  
  /** Whether there might be more data to fetch */
  hasUnfetchedContent: boolean;
}

/**
 * Create an empty thread tree for a given root note
 */
export function createEmptyThreadTree(rootId: string): ThreadTree {
  return {
    rootId,
    nodes: new Map(),
    relationships: {
      childToParent: new Map(),
      parentToChildren: new Map(),
      siblings: new Map(),
    },
    lastUpdated: Date.now(),
    maxDepth: 0,
  };
}

/**
 * Create a thread node from a note
 */
export function createThreadNode(
  note: Note,
  parentId: string | null,
  depth: number
): ThreadNode {
  return {
    note,
    parentId,
    childrenIds: [],
    siblingIds: [],
    depth,
    fetchedAt: Date.now(),
    hasUnfetchedChildren: true, // Assume true until we fetch
    childrenFetchAttempted: false,
  };
}

/**
 * Determine parent ID from note's e-tags using NIP-10 logic
 */
export function extractParentId(note: Note): string | null {
  const eTags = note.tags.filter(tag => tag[0] === 'e');
  if (eTags.length === 0) return null;
  
  // Strategy 1: Look for 'reply' marker (NIP-10 standard)
  const replyTag = eTags.find(tag => tag.length > 3 && tag[3] === 'reply');
  if (replyTag && replyTag[1]) return replyTag[1];
  
  // Strategy 2: If no reply tag, use NIP-10 positional logic
  if (eTags.length === 1) {
    // Single e tag - this is a direct reply to that note
    return eTags[0][1] || null;
  } else if (eTags.length >= 2) {
    // Multiple e tags - second one is usually the immediate parent
    return eTags[1][1] || null;
  }
  
  // Fallback to first e tag
  return eTags[0][1] || null;
}

/**
 * Add or update a node in the thread tree
 */
export function addNodeToTree(
  tree: ThreadTree,
  note: Note,
  parentId: string | null = null
): ThreadTree {
  // If parent not specified, try to extract from note
  const actualParentId = parentId ?? extractParentId(note);
  
  // Calculate depth
  let depth = 0;
  if (actualParentId) {
    const parentNode = tree.nodes.get(actualParentId);
    depth = parentNode ? parentNode.depth + 1 : 1;
  }
  
  // Create or update node
  const existingNode = tree.nodes.get(note.id);
  const node: ThreadNode = existingNode
    ? {
        ...existingNode,
        note, // Update note data
        parentId: actualParentId,
        depth,
        fetchedAt: Date.now(),
      }
    : createThreadNode(note, actualParentId, depth);
  
  // Update nodes map
  tree.nodes.set(note.id, node);
  
  // Update relationships
  if (actualParentId) {
    // Update child-to-parent map
    tree.relationships.childToParent.set(note.id, actualParentId);
    
    // Update parent-to-children map
    const existingChildren = tree.relationships.parentToChildren.get(actualParentId) || [];
    if (!existingChildren.includes(note.id)) {
      tree.relationships.parentToChildren.set(actualParentId, [...existingChildren, note.id]);
      
      // Update parent node's children list
      const parentNode = tree.nodes.get(actualParentId);
      if (parentNode && !parentNode.childrenIds.includes(note.id)) {
        parentNode.childrenIds.push(note.id);
      }
    }
    
    // Update siblings map
    const siblings = existingChildren.filter(id => id !== note.id);
    if (siblings.length > 0) {
      tree.relationships.siblings.set(note.id, siblings);
      
      // Update node's sibling list
      node.siblingIds = siblings;
      
      // Add this note to each sibling's sibling list
      siblings.forEach(siblingId => {
        const siblingNode = tree.nodes.get(siblingId);
        if (siblingNode && !siblingNode.siblingIds.includes(note.id)) {
          siblingNode.siblingIds.push(note.id);
          
          const existingSiblings = tree.relationships.siblings.get(siblingId) || [];
          if (!existingSiblings.includes(note.id)) {
            tree.relationships.siblings.set(siblingId, [...existingSiblings, note.id]);
          }
        }
      });
    }
  }
  
  // Update max depth
  tree.maxDepth = Math.max(tree.maxDepth, depth);
  tree.lastUpdated = Date.now();
  
  return tree;
}

/**
 * Merge an array of notes into the thread tree
 */
export function mergeNotesIntoTree(
  tree: ThreadTree,
  notes: Note[],
  markChildrenFetched?: string[]
): ThreadTree {
  // Sort notes by depth (parents before children) for proper relationship building
  const sortedNotes = [...notes].sort((a, b) => {
    const aParent = extractParentId(a);
    const bParent = extractParentId(b);
    
    // Root notes (no parent) come first
    if (!aParent && bParent) return -1;
    if (aParent && !bParent) return 1;
    
    // Then by creation time
    return a.created_at - b.created_at;
  });
  
  // Add each note to the tree
  sortedNotes.forEach(note => {
    addNodeToTree(tree, note);
  });
  
  // Mark nodes as having their children fetched
  if (markChildrenFetched) {
    markChildrenFetched.forEach(noteId => {
      const node = tree.nodes.get(noteId);
      if (node) {
        node.childrenFetchAttempted = true;
        node.hasUnfetchedChildren = false;
      }
    });
  }
  
  return tree;
}

/**
 * Get navigation context for a specific note
 */
export function getNavigationContext(
  tree: ThreadTree,
  noteId: string
): NavigationContext | null {
  const node = tree.nodes.get(noteId);
  if (!node) return null;
  
  // Build ancestor path
  const ancestorPath: string[] = [];
  let currentId: string | null = node.parentId;
  while (currentId) {
    ancestorPath.unshift(currentId);
    const currentNode = tree.nodes.get(currentId);
    currentId = currentNode?.parentId || null;
  }
  
  // Count descendants
  const countDescendants = (id: string): number => {
    const children = tree.relationships.parentToChildren.get(id) || [];
    return children.length + children.reduce((sum, childId) => sum + countDescendants(childId), 0);
  };
  
  return {
    currentNoteId: noteId,
    parentId: node.parentId,
    childrenIds: [...node.childrenIds],
    siblingIds: [...node.siblingIds],
    ancestorPath,
    descendantCount: countDescendants(noteId),
    depth: node.depth,
  };
}

/**
 * Build a thread view for a specific parent note
 * 
 * Note: maxDepth is a hint but we build the complete structure for all fetched data.
 * The UI components can choose how deep to display, but the data structure should contain everything.
 */
export function buildThreadView(
  tree: ThreadTree,
  parentNoteId: string,
  _maxDepth: number = 3
): ThreadView {
  const parentNode = tree.nodes.get(parentNoteId);
  
  if (!parentNode) {
    return {
      parent: null,
      directChildren: [],
      threadStructure: new Map(),
      childrenIdMap: {},
      hasUnfetchedContent: false,
    };
  }
  
  // Get direct children
  const directChildrenIds = tree.relationships.parentToChildren.get(parentNoteId) || [];
  const directChildren = directChildrenIds
    .map(id => tree.nodes.get(id)?.note)
    .filter((note): note is Note => Boolean(note))
    .sort((a, b) => a.created_at - b.created_at);
  
  // Build complete nested structure for ALL fetched data (no depth limit here)
  // The UI components will handle depth limiting for display
  const threadStructure = new Map<string, Note[]>();
  const childrenIdMap: Record<string, string[]> = {};
  let hasUnfetchedContent = false;
  
  // BFS to build complete structure
  const queue: Array<{ noteId: string; currentDepth: number }> = [
    { noteId: parentNoteId, currentDepth: 0 },
  ];
  const visited = new Set<string>([parentNoteId]);
  
  while (queue.length > 0) {
    const { noteId, currentDepth } = queue.shift()!;
    
    const childIds = tree.relationships.parentToChildren.get(noteId) || [];
    if (childIds.length === 0) continue;
    
    // Get child notes
    const childNotes = childIds
      .map(id => tree.nodes.get(id)?.note)
      .filter((note): note is Note => Boolean(note))
      .sort((a, b) => a.created_at - b.created_at);
    
    if (childNotes.length > 0) {
      threadStructure.set(noteId, childNotes);
      childrenIdMap[noteId] = childIds;
    }
    
    // Check if any children have unfetched content
    childIds.forEach(childId => {
      const childNode = tree.nodes.get(childId);
      if (childNode?.hasUnfetchedChildren) {
        hasUnfetchedContent = true;
      }
      
      // Add to queue if not visited - no depth limit for structure building
      if (!visited.has(childId)) {
        visited.add(childId);
        queue.push({ noteId: childId, currentDepth: currentDepth + 1 });
      }
    });
  }
  
  return {
    parent: parentNode.note,
    directChildren,
    threadStructure,
    childrenIdMap,
    hasUnfetchedContent,
  };
}

/**
 * Serialize thread tree for storage
 */
export function serializeThreadTree(tree: ThreadTree): string {
  const serializable = {
    rootId: tree.rootId,
    nodes: Array.from(tree.nodes.entries()).map(([id, node]) => [id, node]),
    relationships: {
      childToParent: Array.from(tree.relationships.childToParent.entries()),
      parentToChildren: Array.from(tree.relationships.parentToChildren.entries()),
      siblings: Array.from(tree.relationships.siblings.entries()),
    },
    lastUpdated: tree.lastUpdated,
    maxDepth: tree.maxDepth,
  };
  
  return JSON.stringify(serializable);
}

/**
 * Deserialize thread tree from storage
 */
export function deserializeThreadTree(serialized: string): ThreadTree {
  const parsed = JSON.parse(serialized);
  
  return {
    rootId: parsed.rootId,
    nodes: new Map(parsed.nodes),
    relationships: {
      childToParent: new Map(parsed.relationships.childToParent),
      parentToChildren: new Map(parsed.relationships.parentToChildren),
      siblings: new Map(parsed.relationships.siblings),
    },
    lastUpdated: parsed.lastUpdated,
    maxDepth: parsed.maxDepth,
  };
}

/**
 * Check if thread tree is stale and needs refresh
 */
export function isThreadTreeStale(tree: ThreadTree, maxAgeMs: number = 5 * 60 * 1000): boolean {
  return Date.now() - tree.lastUpdated > maxAgeMs;
}

/**
 * Get or initialize thread tree from session storage
 */
export function getThreadTreeFromStorage(rootId: string): ThreadTree | null {
  try {
    const stored = sessionStorage.getItem(`thread-tree:${rootId}`);
    if (stored) {
      return deserializeThreadTree(stored);
    }
  } catch (error) {
    console.warn('Failed to load thread tree from storage:', error);
  }
  return null;
}

/**
 * Save thread tree to session storage
 */
export function saveThreadTreeToStorage(tree: ThreadTree): void {
  try {
    const serialized = serializeThreadTree(tree);
    sessionStorage.setItem(`thread-tree:${tree.rootId}`, serialized);
  } catch (error) {
    console.warn('Failed to save thread tree to storage:', error);
  }
}

/**
 * Clear thread tree from session storage
 */
export function clearThreadTreeFromStorage(rootId: string): void {
  try {
    sessionStorage.removeItem(`thread-tree:${rootId}`);
  } catch (error) {
    console.warn('Failed to clear thread tree from storage:', error);
  }
}

/**
 * Cache for discovered conversation roots
 * Maps any note ID to its conversation root
 */
const rootDiscoveryCache = new Map<string, string>();

/**
 * Discover the true root of a conversation by following parent references
 * This ensures all notes in the same conversation share the same ThreadTree
 * 
 * @param noteId - The note ID to start from
 * @param fetchNote - Function to fetch a note by ID (should return Note with tags)
 * @returns The root note ID for this conversation
 */
export async function discoverConversationRoot(
  noteId: string,
  fetchNote: (id: string) => Promise<Note | null>
): Promise<string> {
  // Check cache first
  const cached = rootDiscoveryCache.get(noteId);
  if (cached) {
    console.log(`[Root Discovery] Cache hit for ${noteId.slice(0, 8)}: root is ${cached.slice(0, 8)}`);
    return cached;
  }

  console.log(`[Root Discovery] Starting root discovery from ${noteId.slice(0, 8)}`);
  
  const visited = new Set<string>();
  let currentId = noteId;
  let maxHops = 50; // Prevent infinite loops
  
  while (maxHops > 0) {
    // Prevent loops
    if (visited.has(currentId)) {
      console.log(`[Root Discovery] Loop detected at ${currentId.slice(0, 8)}, stopping`);
      break;
    }
    visited.add(currentId);
    
    try {
      // Fetch the current note
      const note = await fetchNote(currentId);
      if (!note) {
        console.log(`[Root Discovery] Note ${currentId.slice(0, 8)} not found, using as root`);
        break;
      }
      
      // Extract parent ID
      const parentId = extractParentId(note);
      
      if (!parentId) {
        // No parent means this is the root
        console.log(`[Root Discovery] Found root: ${currentId.slice(0, 8)} (no parent)`);
        break;
      }
      
      console.log(`[Root Discovery] ${currentId.slice(0, 8)} -> parent: ${parentId.slice(0, 8)}`);
      currentId = parentId;
    } catch (error) {
      console.warn(`[Root Discovery] Error fetching note ${currentId.slice(0, 8)}:`, error);
      // If we can't fetch, use current as root
      break;
    }
    
    maxHops--;
  }
  
  if (maxHops === 0) {
    console.warn(`[Root Discovery] Max hops reached, using ${currentId.slice(0, 8)} as root`);
  }
  
  // Cache the result for all visited notes
  visited.forEach(id => {
    rootDiscoveryCache.set(id, currentId);
  });
  
  console.log(`[Root Discovery] Result: ${noteId.slice(0, 8)} belongs to conversation root ${currentId.slice(0, 8)}`);
  return currentId;
}

/**
 * Clear the root discovery cache (useful for testing or memory management)
 */
export function clearRootDiscoveryCache(): void {
  rootDiscoveryCache.clear();
}

/**
 * Get cached root for a note ID without discovery
 */
export function getCachedRoot(noteId: string): string | undefined {
  return rootDiscoveryCache.get(noteId);
}


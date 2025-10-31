/**
 * Tests for Global Thread Tree Cache
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Note } from '../../types/nostr/types';
import {
  createEmptyThreadTree,
  createThreadNode,
  extractParentId,
  addNodeToTree,
  mergeNotesIntoTree,
  getNavigationContext,
  buildThreadView,
  serializeThreadTree,
  deserializeThreadTree,
  isThreadTreeStale,
} from '../threadCache';

// Helper to create a test note
function createTestNote(
  id: string,
  content: string = 'Test content',
  parentId: string | null = null,
  createdAt: number = Date.now()
): Note {
  const tags: string[][] = [];
  if (parentId) {
    tags.push(['e', parentId, '', 'reply']);
  }
  
  return {
    id,
    pubkey: 'test-pubkey',
    content,
    created_at: Math.floor(createdAt / 1000),
    kind: 1,
    tags,
    imageUrls: [],
    videoUrls: [],
    receivedAt: createdAt,
  };
}

describe('threadCache', () => {
  describe('createEmptyThreadTree', () => {
    it('should create an empty thread tree with correct structure', () => {
      const tree = createEmptyThreadTree('root-123');
      
      expect(tree.rootId).toBe('root-123');
      expect(tree.nodes.size).toBe(0);
      expect(tree.maxDepth).toBe(0);
      expect(tree.relationships.childToParent.size).toBe(0);
      expect(tree.relationships.parentToChildren.size).toBe(0);
      expect(tree.relationships.siblings.size).toBe(0);
      expect(tree.lastUpdated).toBeGreaterThan(0);
    });
  });

  describe('createThreadNode', () => {
    it('should create a thread node with correct properties', () => {
      const note = createTestNote('note-1', 'Test note');
      const node = createThreadNode(note, 'parent-1', 2);
      
      expect(node.note).toBe(note);
      expect(node.parentId).toBe('parent-1');
      expect(node.depth).toBe(2);
      expect(node.childrenIds).toEqual([]);
      expect(node.siblingIds).toEqual([]);
      expect(node.hasUnfetchedChildren).toBe(true);
      expect(node.childrenFetchAttempted).toBe(false);
    });

    it('should handle root node (no parent)', () => {
      const note = createTestNote('root-1', 'Root note');
      const node = createThreadNode(note, null, 0);
      
      expect(node.parentId).toBeNull();
      expect(node.depth).toBe(0);
    });
  });

  describe('extractParentId', () => {
    it('should extract parent ID from reply marker tag', () => {
      const note = createTestNote('child-1', 'Reply', 'parent-1');
      const parentId = extractParentId(note);
      
      expect(parentId).toBe('parent-1');
    });

    it('should handle single e-tag', () => {
      const note: Note = {
        ...createTestNote('child-1', 'Reply'),
        tags: [['e', 'parent-1']],
      };
      const parentId = extractParentId(note);
      
      expect(parentId).toBe('parent-1');
    });

    it('should handle multiple e-tags (NIP-10 positional)', () => {
      const note: Note = {
        ...createTestNote('child-1', 'Reply'),
        tags: [
          ['e', 'root-1', '', 'root'],
          ['e', 'parent-1', '', 'reply'],
        ],
      };
      const parentId = extractParentId(note);
      
      expect(parentId).toBe('parent-1');
    });

    it('should return null for notes with no e-tags', () => {
      const note: Note = {
        ...createTestNote('root-1', 'Root'),
        tags: [],
      };
      const parentId = extractParentId(note);
      
      expect(parentId).toBeNull();
    });
  });

  describe('addNodeToTree', () => {
    let tree: ReturnType<typeof createEmptyThreadTree>;

    beforeEach(() => {
      tree = createEmptyThreadTree('root-1');
    });

    it('should add a root note correctly', () => {
      const rootNote = createTestNote('root-1', 'Root note');
      addNodeToTree(tree, rootNote, null);
      
      expect(tree.nodes.size).toBe(1);
      expect(tree.nodes.has('root-1')).toBe(true);
      expect(tree.maxDepth).toBe(0);
      
      const node = tree.nodes.get('root-1')!;
      expect(node.depth).toBe(0);
      expect(node.parentId).toBeNull();
    });

    it('should add a child note and update relationships', () => {
      const rootNote = createTestNote('root-1', 'Root');
      const childNote = createTestNote('child-1', 'Reply', 'root-1');
      
      addNodeToTree(tree, rootNote, null);
      addNodeToTree(tree, childNote, 'root-1');
      
      expect(tree.nodes.size).toBe(2);
      
      const rootNode = tree.nodes.get('root-1')!;
      const childNode = tree.nodes.get('child-1')!;
      
      expect(childNode.parentId).toBe('root-1');
      expect(childNode.depth).toBe(1);
      expect(rootNode.childrenIds).toContain('child-1');
      
      expect(tree.relationships.childToParent.get('child-1')).toBe('root-1');
      expect(tree.relationships.parentToChildren.get('root-1')).toContain('child-1');
    });

    it('should handle siblings correctly', () => {
      const rootNote = createTestNote('root-1', 'Root');
      const child1 = createTestNote('child-1', 'Reply 1', 'root-1');
      const child2 = createTestNote('child-2', 'Reply 2', 'root-1');
      const child3 = createTestNote('child-3', 'Reply 3', 'root-1');
      
      addNodeToTree(tree, rootNote, null);
      addNodeToTree(tree, child1, 'root-1');
      addNodeToTree(tree, child2, 'root-1');
      addNodeToTree(tree, child3, 'root-1');
      
      const node1 = tree.nodes.get('child-1')!;
      const node2 = tree.nodes.get('child-2')!;
      const node3 = tree.nodes.get('child-3')!;
      
      // Each child should have the other two as siblings
      expect(node1.siblingIds).toContain('child-2');
      expect(node1.siblingIds).toContain('child-3');
      expect(node2.siblingIds).toContain('child-1');
      expect(node2.siblingIds).toContain('child-3');
      expect(node3.siblingIds).toContain('child-1');
      expect(node3.siblingIds).toContain('child-2');
    });

    it('should update maxDepth correctly', () => {
      const notes = [
        createTestNote('root-1', 'Root'),
        createTestNote('child-1', 'L1', 'root-1'),
        createTestNote('child-2', 'L2', 'child-1'),
        createTestNote('child-3', 'L3', 'child-2'),
      ];
      
      addNodeToTree(tree, notes[0], null);
      expect(tree.maxDepth).toBe(0);
      
      addNodeToTree(tree, notes[1], 'root-1');
      expect(tree.maxDepth).toBe(1);
      
      addNodeToTree(tree, notes[2], 'child-1');
      expect(tree.maxDepth).toBe(2);
      
      addNodeToTree(tree, notes[3], 'child-2');
      expect(tree.maxDepth).toBe(3);
    });
  });

  describe('mergeNotesIntoTree', () => {
    it('should merge multiple notes into tree', () => {
      const tree = createEmptyThreadTree('root-1');
      const notes = [
        createTestNote('root-1', 'Root'),
        createTestNote('child-1', 'Reply 1', 'root-1'),
        createTestNote('child-2', 'Reply 2', 'root-1'),
        createTestNote('nested-1', 'Nested', 'child-1'),
      ];
      
      mergeNotesIntoTree(tree, notes);
      
      expect(tree.nodes.size).toBe(4);
      expect(tree.maxDepth).toBe(2);
    });

    it('should mark nodes as having children fetched', () => {
      const tree = createEmptyThreadTree('root-1');
      const notes = [
        createTestNote('root-1', 'Root'),
        createTestNote('child-1', 'Reply', 'root-1'),
      ];
      
      mergeNotesIntoTree(tree, notes, ['root-1']);
      
      const rootNode = tree.nodes.get('root-1')!;
      expect(rootNode.childrenFetchAttempted).toBe(true);
      expect(rootNode.hasUnfetchedChildren).toBe(false);
    });

    it('should handle duplicate notes gracefully', () => {
      const tree = createEmptyThreadTree('root-1');
      const note = createTestNote('root-1', 'Root');
      
      mergeNotesIntoTree(tree, [note]);
      mergeNotesIntoTree(tree, [note]);
      
      expect(tree.nodes.size).toBe(1);
    });
  });

  describe('getNavigationContext', () => {
    let tree: ReturnType<typeof createEmptyThreadTree>;

    beforeEach(() => {
      tree = createEmptyThreadTree('root-1');
      const notes = [
        createTestNote('root-1', 'Root'),
        createTestNote('child-1', 'Reply 1', 'root-1'),
        createTestNote('child-2', 'Reply 2', 'root-1'),
        createTestNote('nested-1', 'Nested 1', 'child-1'),
        createTestNote('nested-2', 'Nested 2', 'child-1'),
      ];
      mergeNotesIntoTree(tree, notes);
    });

    it('should return null for non-existent note', () => {
      const context = getNavigationContext(tree, 'non-existent');
      expect(context).toBeNull();
    });

    it('should return correct context for root note', () => {
      const context = getNavigationContext(tree, 'root-1');
      
      expect(context).not.toBeNull();
      expect(context!.currentNoteId).toBe('root-1');
      expect(context!.parentId).toBeNull();
      expect(context!.depth).toBe(0);
      expect(context!.ancestorPath).toEqual([]);
      expect(context!.childrenIds).toContain('child-1');
      expect(context!.childrenIds).toContain('child-2');
    });

    it('should return correct context for child note', () => {
      const context = getNavigationContext(tree, 'child-1');
      
      expect(context).not.toBeNull();
      expect(context!.currentNoteId).toBe('child-1');
      expect(context!.parentId).toBe('root-1');
      expect(context!.depth).toBe(1);
      expect(context!.ancestorPath).toEqual(['root-1']);
      expect(context!.siblingIds).toContain('child-2');
      expect(context!.childrenIds).toContain('nested-1');
      expect(context!.childrenIds).toContain('nested-2');
    });

    it('should return correct context for deeply nested note', () => {
      const context = getNavigationContext(tree, 'nested-1');
      
      expect(context).not.toBeNull();
      expect(context!.currentNoteId).toBe('nested-1');
      expect(context!.parentId).toBe('child-1');
      expect(context!.depth).toBe(2);
      expect(context!.ancestorPath).toEqual(['root-1', 'child-1']);
      expect(context!.siblingIds).toContain('nested-2');
    });

    it('should count descendants correctly', () => {
      const context = getNavigationContext(tree, 'root-1');
      expect(context!.descendantCount).toBe(4); // 2 children + 2 nested
      
      const childContext = getNavigationContext(tree, 'child-1');
      expect(childContext!.descendantCount).toBe(2); // 2 nested
    });
  });

  describe('buildThreadView', () => {
    let tree: ReturnType<typeof createEmptyThreadTree>;

    beforeEach(() => {
      tree = createEmptyThreadTree('root-1');
      const notes = [
        createTestNote('root-1', 'Root', null, 1000),
        createTestNote('child-1', 'Reply 1', 'root-1', 2000),
        createTestNote('child-2', 'Reply 2', 'root-1', 3000),
        createTestNote('nested-1', 'Nested 1', 'child-1', 4000),
        createTestNote('nested-2', 'Nested 2', 'child-1', 5000),
        createTestNote('deep-1', 'Deep', 'nested-1', 6000),
      ];
      mergeNotesIntoTree(tree, notes);
    });

    it('should return empty view for non-existent parent', () => {
      const view = buildThreadView(tree, 'non-existent', 3);
      
      expect(view.parent).toBeNull();
      expect(view.directChildren).toEqual([]);
      expect(view.threadStructure.size).toBe(0);
    });

    it('should build correct view for root note', () => {
      const view = buildThreadView(tree, 'root-1', 3);
      
      expect(view.parent).not.toBeNull();
      expect(view.parent!.id).toBe('root-1');
      expect(view.directChildren).toHaveLength(2);
      expect(view.directChildren[0].id).toBe('child-1');
      expect(view.directChildren[1].id).toBe('child-2');
    });

    it('should build complete structure regardless of maxDepth', () => {
      // New behavior: buildThreadView always builds the complete structure for all fetched data
      // maxDepth is a hint for UI components to control display depth, not structure building
      const view1 = buildThreadView(tree, 'root-1', 1);
      expect(view1.threadStructure.size).toBe(3); // Full tree always built
      
      const view2 = buildThreadView(tree, 'root-1', 2);
      expect(view2.threadStructure.size).toBe(3); // Same - full tree
      
      const view3 = buildThreadView(tree, 'root-1', 3);
      expect(view3.threadStructure.size).toBe(3); // Same - full tree
      
      // All views should have the same complete structure
      expect(view1.threadStructure.size).toBe(view2.threadStructure.size);
      expect(view2.threadStructure.size).toBe(view3.threadStructure.size);
    });

    it('should build nested structure correctly', () => {
      const view = buildThreadView(tree, 'root-1', 3);
      
      const rootChildren = view.threadStructure.get('root-1');
      expect(rootChildren).toHaveLength(2);
      
      const child1Children = view.threadStructure.get('child-1');
      expect(child1Children).toHaveLength(2);
      expect(child1Children![0].id).toBe('nested-1');
      expect(child1Children![1].id).toBe('nested-2');
    });

    it('should sort children chronologically', () => {
      const view = buildThreadView(tree, 'root-1', 3);
      
      expect(view.directChildren[0].created_at).toBeLessThan(
        view.directChildren[1].created_at
      );
    });

    it('should build childrenIdMap correctly', () => {
      const view = buildThreadView(tree, 'root-1', 3);
      
      expect(view.childrenIdMap['root-1']).toContain('child-1');
      expect(view.childrenIdMap['root-1']).toContain('child-2');
      expect(view.childrenIdMap['child-1']).toContain('nested-1');
      expect(view.childrenIdMap['child-1']).toContain('nested-2');
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize thread tree correctly', () => {
      const tree = createEmptyThreadTree('root-1');
      const notes = [
        createTestNote('root-1', 'Root'),
        createTestNote('child-1', 'Reply', 'root-1'),
      ];
      mergeNotesIntoTree(tree, notes);
      
      const serialized = serializeThreadTree(tree);
      expect(typeof serialized).toBe('string');
      
      const deserialized = deserializeThreadTree(serialized);
      
      expect(deserialized.rootId).toBe(tree.rootId);
      expect(deserialized.nodes.size).toBe(tree.nodes.size);
      expect(deserialized.maxDepth).toBe(tree.maxDepth);
      expect(deserialized.lastUpdated).toBe(tree.lastUpdated);
      
      // Check nodes are preserved
      expect(deserialized.nodes.has('root-1')).toBe(true);
      expect(deserialized.nodes.has('child-1')).toBe(true);
      
      // Check relationships are preserved
      expect(deserialized.relationships.childToParent.get('child-1')).toBe('root-1');
      expect(deserialized.relationships.parentToChildren.get('root-1')).toContain('child-1');
    });
  });

  describe('isThreadTreeStale', () => {
    it('should return false for fresh tree', () => {
      const tree = createEmptyThreadTree('root-1');
      expect(isThreadTreeStale(tree)).toBe(false);
    });

    it('should return true for stale tree', () => {
      const tree = createEmptyThreadTree('root-1');
      tree.lastUpdated = Date.now() - (10 * 60 * 1000); // 10 minutes ago
      
      expect(isThreadTreeStale(tree, 5 * 60 * 1000)).toBe(true);
    });

    it('should respect custom maxAge', () => {
      const tree = createEmptyThreadTree('root-1');
      tree.lastUpdated = Date.now() - (2 * 60 * 1000); // 2 minutes ago
      
      expect(isThreadTreeStale(tree, 1 * 60 * 1000)).toBe(true);
      expect(isThreadTreeStale(tree, 3 * 60 * 1000)).toBe(false);
    });
  });
});


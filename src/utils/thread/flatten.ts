import type { Note } from "../../types/nostr/types";

export type FlattenedNode = {
  id: string;
  note: Note | null;
  depth: number;
};

type BuildIndexMapInput = {
  parent: Note | null;
  topLevelReplies: Note[];
  threadStructure?: Map<string, Note[]>;
  childrenIdMap?: Record<string, string[]>;
  // When false, only top-level replies are included
  includeNested: boolean;
  // Optional full note lookup for id lists
  noteLookup?: (id: string) => Note | undefined;
  // Optional: collapsed note ids should still appear but not expand children
  collapsed?: Set<string>;
  // Optional: limit traversal depth to match UI (e.g., 4 levels including main)
  maxDepth?: number;
};

export function buildFlattenedThread({
  parent,
  topLevelReplies,
  threadStructure,
  childrenIdMap,
  includeNested,
  noteLookup,
  collapsed,
  maxDepth,
}: BuildIndexMapInput): {
  nodes: FlattenedNode[];
  idToIndex: Map<string, number>;
} {
  const nodes: FlattenedNode[] = [];
  const idToIndex = new Map<string, number>();

  // Main note first when present
  if (parent) {
    nodes.push({ id: parent.id, note: parent, depth: 0 });
    idToIndex.set(parent.id, nodes.length - 1);
  }

  const pushNode = (n: Note, depth: number) => {
    nodes.push({ id: n.id, note: n, depth });
    idToIndex.set(n.id, nodes.length - 1);
  };

  const resolveChildren = (id: string): Note[] => {
    // Prefer explicit structure
    let children: Note[] | undefined = threadStructure?.get(id);
    if (children && children.length) return children.sort((a, b) => a.created_at - b.created_at);

    // Fallback to childrenIdMap
    const ids = childrenIdMap?.[id];
    if (ids && ids.length && noteLookup) {
      const notes = ids
        .map((cid) => noteLookup(cid))
        .filter((n): n is Note => Boolean(n))
        .sort((a, b) => a.created_at - b.created_at);
      return notes;
    }
    return [];
  };

  const walk = (note: Note, depth: number) => {
    pushNode(note, depth);
    if (!includeNested) return;
    if (collapsed && collapsed.has(note.id)) return; // do not traverse into collapsed
    if (typeof maxDepth === 'number' && depth >= maxDepth) return; // stop at maxDepth
    const children = resolveChildren(note.id);
    for (const child of children) {
      walk(child, depth + 1);
    }
  };

  for (const reply of topLevelReplies.sort((a, b) => a.created_at - b.created_at)) {
    walk(reply, 1);
  }

  return { nodes, idToIndex };
}



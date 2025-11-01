import React, { useEffect } from "react";
import type { Note } from "../../types/nostr/types";
import { useDisplayNames } from "../../hooks/useDisplayNames";

type ThreadSummaryProps = {
  parentNote: Note | null;
  directReplies: Note[];
  threadStructure?: Map<string, Note[]>;
  getDisplayNameForPubkey: (pubkey: string) => string;
  isMobileLayout: boolean;
  relayUrls: string[];
  expandedNestedReplies: Set<string>;
  navigate: (opts: any) => void;
  isLoading?: boolean;
  prefetchThreadFn?: (noteId: string) => void;
};

// Build a flat list of { id, pubkey, depth } for a compact threaded outline
function buildOutline(
  parent: Note | null,
  directReplies: Note[],
  structure?: Map<string, Note[]>,
  maxDepth: number = 10 // Increased from 6 to capture complete thread
): Array<{ id: string; pubkey: string; depth: number }> {
  const result: Array<{ id: string; pubkey: string; depth: number }> = [];
  const visited = new Set<string>();

  const walk = (ids: string[], depth: number) => {
    if (depth > maxDepth) return;
    for (const id of ids) {
      if (visited.has(id)) continue;
      visited.add(id);
      // Helper to find a note by ID in all available sources
      const findAny = (candidateId: string): Note | null => {
        // Check direct replies first
        const directReply = directReplies.find((n) => n.id === candidateId);
        if (directReply) return directReply;

        // Check structure
        if (structure) {
          for (const [, children] of structure) {
            const hit = children.find((n) => n.id === candidateId);
            if (hit) return hit;
          }
        }

        return null;
      };
      const n = findAny(id);
      if (!n) continue;
      result.push({ id: n.id, pubkey: n.pubkey, depth });
      const children = (structure && structure.get(n.id)) || [];
      if (children.length > 0) {
        walk(
          children.map((c) => c.id),
          depth + 1
        );
      }
    }
  };

  // Include parent/root at depth 0 when available
  if (parent) {
    result.push({ id: parent.id, pubkey: parent.pubkey, depth: 0 });
  }

  // Seed with direct replies first, ordered by time
  const seedIds = [...directReplies]
    .sort((a, b) => a.created_at - b.created_at)
    .map((n) => n.id);
  walk(seedIds, 1);

  // Fallback: If we have structure data but didn't capture all replies, add them
  if (structure && structure.size > 0) {
    const allStructureNotes = new Set<string>();
    for (const [, children] of structure) {
      children.forEach((child) => allStructureNotes.add(child.id));
    }

    // Add any structure notes that weren't captured by the walk
    for (const [, children] of structure) {
      children.forEach((child) => {
        if (!visited.has(child.id)) {
          result.push({ id: child.id, pubkey: child.pubkey, depth: 1 });
          visited.add(child.id);
        }
      });
    }
  }

  return result;
}

const ThreadSummary: React.FC<ThreadSummaryProps> = ({
  parentNote,
  directReplies,
  threadStructure,
  getDisplayNameForPubkey,
  isMobileLayout,
  relayUrls,
  expandedNestedReplies,
  navigate,
  isLoading = false,
  prefetchThreadFn,
}) => {
  if (isMobileLayout) return null;
  if (!parentNote) return null;

  // Get pubkeys that need metadata fetching
  const { fetchDisplayNames, getPubkeysNeedingFetch } =
    useDisplayNames(relayUrls);

  // Collect all unique pubkeys from the thread
  const allPubkeys = React.useMemo(() => {
    const pubkeys = new Set<string>();
    if (parentNote) pubkeys.add(parentNote.pubkey);
    directReplies.forEach((reply) => pubkeys.add(reply.pubkey));
    if (threadStructure) {
      for (const [, notes] of threadStructure) {
        notes.forEach((note) => pubkeys.add(note.pubkey));
      }
    }
    return Array.from(pubkeys);
  }, [parentNote, directReplies, threadStructure]);

  // Automatically fetch metadata for pubkeys that need it
  useEffect(() => {
    const needsFetch = getPubkeysNeedingFetch(allPubkeys);
    if (needsFetch.length > 0) {
      fetchDisplayNames(needsFetch);
    }
  }, [allPubkeys, fetchDisplayNames, getPubkeysNeedingFetch]);

  const outline = buildOutline(parentNote, directReplies, threadStructure);

  // Show loading state or empty state
  if (outline.length === 0) {
    if (isLoading) {
      // Show minimal loading indicator
      return (
        <div
          aria-label="Thread summary loading"
          style={{
            padding: "0.5rem 0",
            margin: "0.5rem 0 0rem 0",
            background: "var(--app-bg-color)",
            textAlign: "left",
          }}
        >
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-color)",
              opacity: 0.5,
              padding: "0 1rem 0 0",
            }}
          >
            Loading thread...
          </div>
        </div>
      );
    }
    return null;
  }

  // Function to check if a note is visible in the current thread view
  // Updated to match NestedReplies component logic (maxDepth = 4)
  const isNoteVisible = (noteId: string, depth: number): boolean => {
    // Depth 0 and 1 are always visible (main note and direct replies)
    if (depth <= 1) return true;

    // For depth 2, check if parent (depth 1) is expanded
    if (depth === 2) {
      // Find parent in direct replies
      const parentId = directReplies.find((reply) =>
        threadStructure?.get(reply.id)?.some((child) => child.id === noteId)
      )?.id;
      return parentId ? expandedNestedReplies.has(parentId) : false;
    }

    // For depth 3, check if both parent levels are expanded
    if (depth === 3) {
      // Find grandparent and parent
      for (const reply of directReplies) {
        const children = threadStructure?.get(reply.id) || [];
        for (const child of children) {
          const grandchildren = threadStructure?.get(child.id) || [];
          if (grandchildren.some((gc) => gc.id === noteId)) {
            // Check if both parent levels are expanded
            return (
              expandedNestedReplies.has(reply.id) &&
              expandedNestedReplies.has(child.id)
            );
          }
        }
      }
      return false;
    }

    // Depth 4+ are not visible in main view (would need "Continue thread")
    return false;
  };

  // Function to get the appropriate link for a note
  const getNoteLink = (noteId: string, depth: number): string => {
    if (isNoteVisible(noteId, depth)) {
      return `#note-${noteId}`;
    }

    // If note is not visible, find its visible parent to link to
    if (depth >= 3) {
      // Find the parent note that would show "Continue thread"
      for (const [parentId, children] of threadStructure || []) {
        if (children.some((child) => child.id === noteId)) {
          return `#note-${parentId}`;
        }
      }
    }

    // Fallback to the note itself
    return `#note-${noteId}`;
  };

  // Function to handle link clicks for non-visible notes
  const handleLinkClick = (
    e: React.MouseEvent,
    noteId: string,
    depth: number
  ) => {
    if (isNoteVisible(noteId, depth)) {
      return; // Let default anchor behavior work
    }

    e.preventDefault();
    // Navigate to the note's thread
    navigate({ to: `/thread/${noteId}` });
  };

  return (
    <div
      aria-label="Thread summary"
      style={{
        // border: "1px solid var(--border-color)",
        // borderRadius: "6px",
        padding: "0.5rem 0",
        margin: "0.5rem 0 0rem 0",
        background: "var(--app-bg-color)",
        textAlign: "left",
        maxHeight: "80vh",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      <ul style={{ listStyle: "none", margin: 0, padding: "0 1rem 0 0" }}>
        {outline.map((item) => {
          const name = getDisplayNameForPubkey(item.pubkey);
          const indentLevel = Math.max(0, item.depth);
          const isVisible = isNoteVisible(item.id, item.depth);
          const linkHref = getNoteLink(item.id, item.depth);

          return (
            <li key={item.id} style={{ margin: 0, padding: 0 }}>
              <a
                href={linkHref}
                onClick={(e) => handleLinkClick(e, item.id, item.depth)}
                onMouseEnter={() => prefetchThreadFn?.(item.id)}
                onTouchStart={() => prefetchThreadFn?.(item.id)}
                style={{
                  display: "block",
                  marginLeft: `${indentLevel}rem`,
                  color: "var(--ibm-slate-blue)",
                  textDecoration: "none",
                  fontSize: "0.75rem",
                  lineHeight: 1.6,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "100%",
                  opacity: isVisible ? 1 : 0.7, // Slightly dim non-visible notes
                }}
                title={
                  isVisible ? `Go to ${name}'s reply` : `Go to ${name}'s thread`
                }
              >
                {name}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default ThreadSummary;

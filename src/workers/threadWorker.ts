// Web Worker for NIP-10 processing and sorting
// Runs off main thread to avoid jank on large threads

interface WorkerInputEvent {
  type: "process";
  sequenceNumber: number;
  events: Array<{
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: Array<string[]>;
    content: string;
  }>;
}

interface WorkerOutputPatch {
  type: "patch";
  sequenceNumber: number;
  updatedChildren: Record<string, string[]>;
  notes: Array<{
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: Array<string[]>;
    content: string;
  }>;
}

// NIP-10: Determine immediate parent id from event tags
// Priority: tag with marker "reply"; otherwise the last non-"root" e-tag; fallback to last e-tag
function getImmediateParentId(tags: Array<string[]>): string | null {
  try {
    const eTags = tags.filter((t) => Array.isArray(t) && t[0] === "e");
    if (eTags.length === 0) return null;

    const replyTag = eTags.find((t: any) => t[3] === "reply");
    if (replyTag && typeof replyTag[1] === "string") {
      return replyTag[1] as string;
    }

    // Prefer the last tag that isn't explicitly marked as root
    for (let i = eTags.length - 1; i >= 0; i -= 1) {
      const marker = eTags[i][3];
      if (marker !== "root") {
        const id = eTags[i][1];
        if (typeof id === "string") return id as string;
      }
    }

    // Fallback to the last e-tag
    const fallbackId = eTags[eTags.length - 1][1];
    return typeof fallbackId === "string" ? (fallbackId as string) : null;
  } catch {
    return null;
  }
}

// Maintain state across multiple messages for incremental processing
interface WorkerState {
  // Map of parentId -> Set of child events (for deduping and sorting)
  childrenByParent: Map<string, Map<string, any>>;
}

const workerState: WorkerState = {
  childrenByParent: new Map(),
};

// Process input and emit a patch
function processEvents(events: any[]): {
  updatedChildren: Record<string, string[]>;
  notes: any[];
} {
  const processedNotes: any[] = [];
  const updatedParents = new Set<string>();

  for (const event of events) {
    const parentId = getImmediateParentId(event.tags);
    if (!parentId) continue;

    processedNotes.push(event);
    updatedParents.add(parentId);

    // Track this child under its parent
    if (!workerState.childrenByParent.has(parentId)) {
      workerState.childrenByParent.set(parentId, new Map());
    }
    workerState.childrenByParent.get(parentId)!.set(event.id, event);
  }

  // Build sorted children lists for all affected parents
  const updatedChildren: Record<string, string[]> = {};
  for (const parentId of updatedParents) {
    const childrenMap = workerState.childrenByParent.get(parentId);
    if (!childrenMap) continue;

    // Sort by created_at asc, then by id for determinism
    const sorted = Array.from(childrenMap.values()).sort((a, b) => {
      if (a.created_at !== b.created_at) {
        return a.created_at - b.created_at;
      }
      return a.id.localeCompare(b.id);
    });

    updatedChildren[parentId] = sorted.map((n) => n.id);
  }

  return {
    updatedChildren,
    notes: processedNotes,
  };
}

// Listen for messages from main thread
self.onmessage = (event: MessageEvent<WorkerInputEvent>) => {
  if (event.data.type === "process") {
    const { sequenceNumber, events } = event.data;
    const patch = processEvents(events);

    const output: WorkerOutputPatch = {
      type: "patch",
      sequenceNumber,
      ...patch,
    };

    self.postMessage(output);
  }
};

// Main-thread bridge to threadWorker
// Handles message sequencing, batching, and response tracking

import type { Note } from "../types/nostr/types";

export interface WorkerPatch {
  updatedChildren: Record<string, string[]>;
  notes: Note[];
}

let worker: Worker | null = null;
let sequenceNumber = 0;
const pendingRequests = new Map<
  number,
  {
    resolve: (patch: WorkerPatch) => void;
    reject: (err: Error) => void;
  }
>();

// Lazy-load worker
function getWorker(): Worker {
  if (!worker) {
    // Create worker from threadWorker.ts (webpack will handle bundling)
    worker = new Worker(new URL("./threadWorker.ts", import.meta.url), {
      type: "module",
    });

    // Set up message handler
    worker.onmessage = (event) => {
      const { type, sequenceNumber: seqNum, updatedChildren, notes } =
        event.data;

      if (type === "patch") {
        const pending = pendingRequests.get(seqNum);
        if (pending) {
          pending.resolve({
            updatedChildren,
            notes,
          });
          pendingRequests.delete(seqNum);
        }
      }
    };

    worker.onerror = (err: ErrorEvent | Error) => {
      const error = err instanceof ErrorEvent 
        ? new Error(err.message || "Worker error")
        : err;
      console.error("Worker error:", error);
      // Reject all pending requests
      for (const [, { reject }] of pendingRequests) {
        reject(error);
      }
      pendingRequests.clear();
    };
  }
  return worker;
}

// Process events in worker and return patch
export function processEventsInWorker(
  events: Array<{
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
  }>
): Promise<WorkerPatch> {
  return new Promise((resolve, reject) => {
    const seqNum = sequenceNumber++;
    pendingRequests.set(seqNum, { resolve, reject });

    try {
      const worker = getWorker();
      worker.postMessage({
        type: "process",
        sequenceNumber: seqNum,
        events,
      });

      // Timeout after 30s
      const timeout = setTimeout(() => {
        pendingRequests.delete(seqNum);
        reject(new Error("Worker timeout"));
      }, 30000);

      // Clear timeout on resolve/reject
      const original = pendingRequests.get(seqNum);
      if (original) {
        const originalResolve = original.resolve;
        const originalReject = original.reject;
        pendingRequests.set(seqNum, {
          resolve: (patch) => {
            clearTimeout(timeout);
            originalResolve(patch);
          },
          reject: (err) => {
            clearTimeout(timeout);
            originalReject(err);
          },
        });
      }
    } catch (err) {
      pendingRequests.delete(seqNum);
      reject(err);
    }
  });
}

// Terminate worker (for cleanup)
export function terminateWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  pendingRequests.clear();
  sequenceNumber = 0;
}

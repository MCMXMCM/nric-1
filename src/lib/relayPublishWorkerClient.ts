import type { Event } from 'nostr-tools';

let worker: Worker | undefined;
let seq = 0;
const pending = new Map<
  number,
  { resolve: (v: string[]) => void; reject: (e: Error) => void; timeout: ReturnType<typeof setTimeout> }
>();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/relayPublishWorker.ts', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = (e: MessageEvent) => {
    const { type, id, successes, message } = e.data || {};
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timeout);
    if (type === 'PUBLISH_DONE') entry.resolve(successes || []);
    else entry.reject(new Error(message || 'Publish worker failed'));
  };
  worker.postMessage({ type: 'INIT' });
  return worker;
}

/**
 * Publish via a dedicated worker (mirrors Primal-style offload). Falls back to main-thread pool on failure.
 */
export function terminateRelayPublishWorker(): void {
  if (worker) {
    try {
      worker.terminate();
    } catch {
      // ignore
    }
    worker = undefined;
    pending.forEach((p) => {
      clearTimeout(p.timeout);
      p.reject(new Error('Worker terminated'));
    });
    pending.clear();
  }
}

export async function publishViaRelayWorker(
  relayUrls: string[],
  event: Event,
  timeoutMs = 55_000
): Promise<string[]> {
  const w = ensureWorker();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Publish worker timeout'));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timeout });
    try {
      w.postMessage({ type: 'PUBLISH', id, relayUrls, event });
    } catch (e) {
      clearTimeout(timeout);
      pending.delete(id);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

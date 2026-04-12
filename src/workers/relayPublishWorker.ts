/// <reference lib="webworker" />
import { SimplePool } from 'nostr-tools';
import type { Event } from 'nostr-tools';

let pool: SimplePool | undefined;

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data || {};
  if (msg.type === 'INIT') {
    pool = new SimplePool();
    return;
  }
  if (msg.type === 'PUBLISH' && pool && msg.event && Array.isArray(msg.relayUrls)) {
    const { id, relayUrls, event } = msg as {
      id: number;
      relayUrls: string[];
      event: Event;
    };
    try {
      const settled = await Promise.allSettled(pool.publish(relayUrls, event));
      const successes: string[] = [];
      settled.forEach((res) => {
        if (res.status === 'fulfilled') successes.push(res.value as string);
      });
      if (successes.length === 0) {
        self.postMessage({
          type: 'PUBLISH_ERR',
          id,
          message: 'Publish failed on all relays',
        });
        return;
      }
      self.postMessage({ type: 'PUBLISH_DONE', id, successes });
    } catch (err) {
      self.postMessage({
        type: 'PUBLISH_ERR',
        id,
        message: err instanceof Error ? err.message : 'Publish worker error',
      });
    }
  }
};

export {};

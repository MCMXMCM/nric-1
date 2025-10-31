// Thread tree builder worker

export interface BuildTreeMsg {
  type: 'build-tree';
  events: Array<{
    id: string;
    content: string;
    pubkey: string;
    created_at: number;
    tags: any[];
  }>;
}

type AnyMsg = BuildTreeMsg;

const post = (data: unknown) => {
  try { (self as unknown as Worker).postMessage(data); } catch {}
};

self.onmessage = (e: MessageEvent<AnyMsg>) => {
  const msg = e.data as AnyMsg;
  if (!msg) return;
  try {
    if (msg.type === 'build-tree') {
      const out: Record<string, Array<{ id: string; content: string; pubkey: string; created_at: number; tags: any[] }>> = {};
      for (const ev of msg.events) {
        const eTags = (ev.tags || []).filter((t: any) => Array.isArray(t) && t[0] === 'e');
        let parentId: string | null = null;
        const replyTag = eTags.find((t: any) => t[3] === 'reply');
        const rootTag = eTags.find((t: any) => t[3] === 'root');
        if (replyTag && replyTag[1]) parentId = replyTag[1];
        else if (rootTag && rootTag[1] && !replyTag) parentId = rootTag[1];
        else if (eTags.length === 1 && eTags[0][1]) parentId = eTags[0][1];
        else if (eTags.length >= 2 && eTags[1][1]) parentId = eTags[1][1];
        if (!parentId) continue;
        const note = {
          id: ev.id,
          content: ev.content || '',
          pubkey: ev.pubkey,
          created_at: ev.created_at,
          tags: ev.tags || [],
        };
        if (!out[parentId]) out[parentId] = [];
        out[parentId].push(note);
      }
      Object.keys(out).forEach((pid) => {
        out[pid].sort((a, b) => (a.created_at - b.created_at) || a.id.localeCompare(b.id));
      });
      post({ type: 'tree', childrenByParentId: out });
    }
  } catch (err) {
    post({ type: 'error', error: String(err) });
  }
};

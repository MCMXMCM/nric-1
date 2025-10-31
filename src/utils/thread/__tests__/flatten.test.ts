import { describe, it, expect } from "vitest";
import { buildFlattenedThread } from "../../thread/flatten";

const mk = (id: string, created_at: number, tags: any[] = [] as any) => ({
  id,
  created_at,
  content: "",
  pubkey: "x",
  tags,
} as any);

describe("buildFlattenedThread", () => {
  it("orders main, top-level, then nested by created_at", () => {
    const parent = mk("p", 1);
    const a = mk("a", 2);
    const b = mk("b", 3);
    const a1 = mk("a1", 4);
    const b1 = mk("b1", 5);

    const thread = new Map<string, any[]>([
      ["a", [a1]],
      ["b", [b1]],
    ]);

    const { nodes } = buildFlattenedThread({
      parent,
      topLevelReplies: [b, a],
      threadStructure: thread as any,
      includeNested: true,
    });

    expect(nodes.map((n) => n.id)).toEqual(["p", "a", "a1", "b", "b1"]);
  });

  it("respects collapsed set by not traversing children", () => {
    const parent = mk("p", 1);
    const a = mk("a", 2);
    const a1 = mk("a1", 3);
    const thread = new Map<string, any[]>([["a", [a1]]]);
    const { nodes } = buildFlattenedThread({
      parent,
      topLevelReplies: [a],
      threadStructure: thread as any,
      includeNested: true,
      collapsed: new Set(["a"]),
    });
    expect(nodes.map((n) => n.id)).toEqual(["p", "a"]);
  });
});



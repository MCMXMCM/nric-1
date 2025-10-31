import React from "react";
import { render as rtlRender, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ThreadSummary from "../ThreadSummary";
import type { Note } from "../../../types/nostr/types";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, gcTime: 0 },
  },
});

const render = (ui: React.ReactElement) =>
  rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

const makeNote = (id: string, pubkey: string, created_at: number): Note => ({
  id,
  pubkey,
  content: "",
  created_at,
  kind: 1,
  tags: [],
  imageUrls: [],
  videoUrls: [],
  receivedAt: Date.now(),
});

describe("ThreadSummary", () => {
  it("renders hierarchical links to note anchors on desktop", () => {
    const parent = makeNote("p", "pk0", 1);
    const r1 = makeNote("a", "pk1", 2);
    const r2 = makeNote("b", "pk2", 3);
    const c11 = makeNote("a1", "pk3", 4);

    const structure = new Map<string, Note[]>();
    structure.set(parent.id, [r1, r2]);
    structure.set(r1.id, [c11]);

    render(
      <ThreadSummary
        parentNote={parent}
        directReplies={[r1, r2]}
        threadStructure={structure}
        getDisplayNameForPubkey={(pk) => `name:${pk}`}
        isMobileLayout={false}
        relayUrls={[]}
        expandedNestedReplies={new Set([parent.id, r1.id])}
        navigate={() => {}}
      />
    );

    // links exist with proper anchors
    expect(screen.getByText("name:pk1").getAttribute("href")).toBe("#note-a");
    expect(screen.getByText("name:pk2").getAttribute("href")).toBe("#note-b");
    expect(screen.getByText("name:pk3").getAttribute("href")).toBe("#note-a1");
  });

  it("does not render on mobile", () => {
    const parent = makeNote("p", "pk0", 1);
    const r1 = makeNote("a", "pk1", 2);
    render(
      <ThreadSummary
        parentNote={parent}
        directReplies={[r1]}
        threadStructure={new Map()}
        getDisplayNameForPubkey={(pk) => pk}
        isMobileLayout={true}
        relayUrls={[]}
        expandedNestedReplies={new Set()}
        navigate={() => {}}
      />
    );
    expect(screen.queryByText("Thread preview")).toBeNull();
  });
});

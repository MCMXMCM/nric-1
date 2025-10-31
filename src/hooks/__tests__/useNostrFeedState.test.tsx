import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, act, waitFor, screen } from "@testing-library/react";
import { useNostrFeedState } from "../useNostrFeedState";

function TestHarness() {
  const state = useNostrFeedState();

  // Expose helpers to tests via window for simplicity
  (window as any).__feed = state;

  return (
    <div>
      <div data-testid="index">{state.currentIndex}</div>
      <div data-testid="length">{state.notes.length}</div>
    </div>
  );
}

describe("useNostrFeedState - index clamping", () => {
  beforeEach(() => {
    localStorage.clear();
    (window as any).__feed = undefined;
  });

  it("clamps currentIndex when notes length shrinks", async () => {
    render(<TestHarness />);

    const feed = () =>
      (window as any).__feed as ReturnType<typeof useNostrFeedState>;

    await act(async () => {
      feed().setNotes([
        {
          id: "a",
          pubkey: "p",
          content: "x",
          created_at: 1,
          tags: [],
          imageUrls: [],
          videoUrls: [],
          receivedAt: Date.now(),
        } as any,
        {
          id: "b",
          pubkey: "p",
          content: "y",
          created_at: 2,
          tags: [],
          imageUrls: [],
          videoUrls: [],
          receivedAt: Date.now(),
        } as any,
        {
          id: "c",
          pubkey: "p",
          content: "z",
          created_at: 3,
          tags: [],
          imageUrls: [],
          videoUrls: [],
          receivedAt: Date.now(),
        } as any,
      ]);
      feed().updateCurrentIndex(2);
    });

    expect(screen.getByTestId("index").textContent).toBe("2");
    expect(screen.getByTestId("length").textContent).toBe("3");

    await act(async () => {
      // Shrink list to a single note
      feed().setNotes([
        {
          id: "a",
          pubkey: "p",
          content: "x",
          created_at: 1,
          tags: [],
          imageUrls: [],
          videoUrls: [],
          receivedAt: Date.now(),
        } as any,
      ]);
    });

    await waitFor(() => {
      expect(screen.getByTestId("length").textContent).toBe("1");
      expect(screen.getByTestId("index").textContent).toBe("0");
    });
  });

  it("resets index to 0 when notes become empty", async () => {
    render(<TestHarness />);
    const feed = () =>
      (window as any).__feed as ReturnType<typeof useNostrFeedState>;

    await act(async () => {
      feed().setNotes([
        {
          id: "a",
          pubkey: "p",
          content: "x",
          created_at: 1,
          tags: [],
          imageUrls: [],
          videoUrls: [],
          receivedAt: Date.now(),
        } as any,
        {
          id: "b",
          pubkey: "p",
          content: "y",
          created_at: 2,
          tags: [],
          imageUrls: [],
          videoUrls: [],
          receivedAt: Date.now(),
        } as any,
      ]);
      feed().updateCurrentIndex(1);
    });

    expect(screen.getByTestId("index").textContent).toBe("1");
    expect(screen.getByTestId("length").textContent).toBe("2");

    await act(async () => {
      feed().setNotes([]);
    });

    await waitFor(() => {
      expect(screen.getByTestId("length").textContent).toBe("0");
      expect(screen.getByTestId("index").textContent).toBe("0");
    });
  });

  it("clamps saved index from localStorage when notes hydrate smaller", async () => {
    localStorage.setItem("currentIndex", "10");

    render(<TestHarness />);
    const feed = () =>
      (window as any).__feed as ReturnType<typeof useNostrFeedState>;

    // Initially there are no notes; index should be 10 in state, but effect will clamp after notes load
    expect(screen.getByTestId("length").textContent).toBe("0");

    await act(async () => {
      feed().setNotes([
        {
          id: "only",
          pubkey: "p",
          content: "x",
          created_at: 1,
          tags: [],
          imageUrls: [],
          videoUrls: [],
          receivedAt: Date.now(),
        } as any,
      ]);
    });

    await waitFor(() => {
      expect(screen.getByTestId("length").textContent).toBe("1");
      expect(screen.getByTestId("index").textContent).toBe("0");
      // Also verify localStorage updated (now stores displayed value)
      expect(localStorage.getItem("currentIndex")).toBe("1");
    });
  });

  it("preserves feed state on page refresh simulation", async () => {
    // First "session" - simulate having notes and being at a specific position
    localStorage.setItem("currentIndex", "5");
    localStorage.setItem("currentNoteId", "note-4"); // Note at index 4

    render(<TestHarness />);
    const feed = () =>
      (window as any).__feed as ReturnType<typeof useNostrFeedState>;

    // Simulate loading notes (same or greater than the saved index)
    const mockNotes = Array.from({ length: 10 }, (_, i) => ({
      id: `note-${i}`,
      pubkey: "test-pubkey",
      content: `Content ${i}`,
      created_at: Date.now() - i * 1000,
      tags: [],
      imageUrls: [],
      videoUrls: [],
      receivedAt: Date.now(),
    })) as any[];

    await act(async () => {
      feed().setNotes(mockNotes);
    });

    // Verify the index was restored correctly (should be at position 4, which is display index 5)
    await waitFor(() => {
      expect(screen.getByTestId("length").textContent).toBe("10");
      expect(screen.getByTestId("index").textContent).toBe("4"); // 0-based index for display index 5
    });

    // Verify localStorage maintains the correct value
    expect(localStorage.getItem("currentIndex")).toBe("5");
  });

  it("handles refresh with fewer notes than saved index", async () => {
    // Simulate having been at index 5, but now only 3 notes are available
    localStorage.setItem("currentIndex", "5");
    localStorage.setItem("currentNoteId", "note-4"); // This note won't exist in the smaller set

    render(<TestHarness />);
    const feed = () =>
      (window as any).__feed as ReturnType<typeof useNostrFeedState>;

    // Load fewer notes than the saved index
    const mockNotes = Array.from({ length: 3 }, (_, i) => ({
      id: `note-${i}`,
      pubkey: "test-pubkey",
      content: `Content ${i}`,
      created_at: Date.now() - i * 1000,
      tags: [],
      imageUrls: [],
      videoUrls: [],
      receivedAt: Date.now(),
    })) as any[];

    await act(async () => {
      // Set currentIndex to the saved value to simulate restoration
      feed().setCurrentIndex(4); // 0-based index for display index 5
      feed().setDisplayIndex(5); // Set displayIndex to match the saved state
      // Then set the smaller set to trigger clamping
      feed().setNotes(mockNotes);
    });

    // Wait for clamping to occur (the debounced effect takes ~120ms)
    await waitFor(
      () => {
        expect(screen.getByTestId("length").textContent).toBe("3");
        expect(screen.getByTestId("index").textContent).toBe("2");
        // localStorage should be updated to reflect the clamped index
        expect(localStorage.getItem("currentIndex")).toBe("3");
      },
      { timeout: 1000 }
    );
  });

  it("preserves feed state with same note content after refresh", async () => {
    // Simulate a refresh scenario where the same notes are loaded
    const savedIndex = "3";
    localStorage.setItem("currentIndex", savedIndex);
    localStorage.setItem("currentNoteId", "note-2"); // Note at index 1

    render(<TestHarness />);
    const feed = () =>
      (window as any).__feed as ReturnType<typeof useNostrFeedState>;

    // Load the same notes that would be cached
    const mockNotes = [
      {
        id: "note-1",
        pubkey: "p1",
        content: "First note",
        created_at: 1000,
        tags: [],
        imageUrls: [],
        videoUrls: [],
        receivedAt: Date.now(),
      },
      {
        id: "note-2",
        pubkey: "p2",
        content: "Second note",
        created_at: 2000,
        tags: [],
        imageUrls: [],
        videoUrls: [],
        receivedAt: Date.now(),
      },
      {
        id: "note-3",
        pubkey: "p3",
        content: "Third note",
        created_at: 3000,
        tags: [],
        imageUrls: [],
        videoUrls: [],
        receivedAt: Date.now(),
      },
      {
        id: "note-4",
        pubkey: "p4",
        content: "Fourth note",
        created_at: 4000,
        tags: [],
        imageUrls: [],
        videoUrls: [],
        receivedAt: Date.now(),
      },
      {
        id: "note-5",
        pubkey: "p5",
        content: "Fifth note",
        created_at: 5000,
        tags: [],
        imageUrls: [],
        videoUrls: [],
        receivedAt: Date.now(),
      },
    ] as any[];

    await act(async () => {
      feed().setNotes(mockNotes);
    });

    // Should restore to the saved position (display index 3 = internal index 2, but note-2 is at index 1)
    await waitFor(() => {
      expect(screen.getByTestId("length").textContent).toBe("5");
      expect(screen.getByTestId("index").textContent).toBe("1"); // note-2 is at index 1
    });

    // Verify the current note is the expected one
    expect(feed().notes[1].id).toBe("note-2");
  });
});

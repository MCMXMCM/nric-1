import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HotkeyProvider } from "../../../contexts/HotkeyContext";
import { useThreadHotkeys } from "../../../hooks/useThreadHotkeys";

const TestThreadHotkeys: React.FC<{
  count: number;
  enabled?: boolean;
  handlers: Partial<{
    onNavigateUp: () => void;
    onNavigateDown: () => void;
    onNavigateFirst: () => void;
    onNavigateLast: () => void;
    onFocusThread?: () => void;
  }>;
}> = ({ count, enabled = true, handlers }) => {
  useThreadHotkeys({
    onNavigateUp: handlers.onNavigateUp,
    onNavigateDown: handlers.onNavigateDown,
    onNavigateFirst: handlers.onNavigateFirst,
    onNavigateLast: handlers.onNavigateLast,
    onFocusThread: handlers.onFocusThread,
    hasNotes: count > 0,
    enabled,
  });

  return null;
};

describe("Thread hotkeys - navigation", () => {
  it("triggers j/k and arrow keys and Home/End when enabled and has notes", async () => {
    const user = userEvent.setup();
    const onUp = vi.fn();
    const onDown = vi.fn();
    const onFirst = vi.fn();
    const onLast = vi.fn();

    render(
      <HotkeyProvider totalItems={10} enabled={true}>
        <TestThreadHotkeys
          count={10}
          handlers={{
            onNavigateUp: onUp,
            onNavigateDown: onDown,
            onNavigateFirst: onFirst,
            onNavigateLast: onLast,
          }}
        />
      </HotkeyProvider>
    );

    // j / k
    await user.keyboard("j");
    await user.keyboard("k");
    // arrows
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowUp}");
    // Home / End
    await user.keyboard("{Home}");
    await user.keyboard("{End}");
    // g g sequence
    await user.keyboard("g g");

    expect(onDown).toHaveBeenCalled();
    expect(onUp).toHaveBeenCalled();
    expect(onFirst).toHaveBeenCalled();
    expect(onLast).toHaveBeenCalled();
  });

  it("does not trigger when disabled or no notes", async () => {
    const user = userEvent.setup();
    const onUp = vi.fn();

    const { rerender } = render(
      <HotkeyProvider totalItems={0} enabled={false}>
        <TestThreadHotkeys
          count={0}
          enabled={false}
          handlers={{ onNavigateUp: onUp }}
        />
      </HotkeyProvider>
    );

    await user.keyboard("k");
    expect(onUp).not.toHaveBeenCalled();

    rerender(
      <HotkeyProvider totalItems={0} enabled={true}>
        <TestThreadHotkeys
          count={0}
          enabled={true}
          handlers={{ onNavigateUp: onUp }}
        />
      </HotkeyProvider>
    );

    await user.keyboard("k");
    expect(onUp).not.toHaveBeenCalled();
  });

  it("triggers 'f' key to focus thread on selected note", async () => {
    const user = userEvent.setup();
    const onFocusThread = vi.fn();

    render(
      <HotkeyProvider totalItems={10} enabled={true}>
        <TestThreadHotkeys
          count={10}
          handlers={{
            onFocusThread,
          }}
        />
      </HotkeyProvider>
    );

    // First need to navigate to select a note (keyboard navigation must be active)
    await user.keyboard("j");
    // Then press 'f' to focus thread
    await user.keyboard("f");

    expect(onFocusThread).toHaveBeenCalled();
  });

  it("enables keyboard navigation when enabled prop becomes true", async () => {
    const user = userEvent.setup();
    const onDown = vi.fn();

    const { rerender } = render(
      <HotkeyProvider totalItems={10} enabled={false}>
        <TestThreadHotkeys
          count={10}
          enabled={false}
          handlers={{ onNavigateDown: onDown }}
        />
      </HotkeyProvider>
    );

    // J key should not work when disabled
    await user.keyboard("j");
    expect(onDown).not.toHaveBeenCalled();

    // Re-render with enabled=true (simulating first navigation to thread)
    rerender(
      <HotkeyProvider totalItems={10} enabled={true}>
        <TestThreadHotkeys
          count={10}
          enabled={true}
          handlers={{ onNavigateDown: onDown }}
        />
      </HotkeyProvider>
    );

    // J key should now work
    await user.keyboard("j");
    expect(onDown).toHaveBeenCalled();
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import {
  uiStore,
  setMuteLikes,
  setNotificationsLastSeen,
} from "../../lib/uiStore";

describe("uiStore notification prefs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists muteLikes to localStorage", () => {
    setMuteLikes(true);
    expect(uiStore.state.muteLikes).toBe(true);
    expect(localStorage.getItem("muteLikes")).toBe("true");
  });

  it("persists notificationsLastSeen map", () => {
    const map = { me: 123 };
    setNotificationsLastSeen(map);
    expect(uiStore.state.notificationsLastSeen?.me).toBe(123);
    expect(
      JSON.parse(localStorage.getItem("notificationsLastSeen") || "{}").me
    ).toBe(123);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { ViewNsecModal } from "../ViewNsecModal";

vi.mock("../../../utils/nostr/nip07", () => ({
  tryLoadPersistedSecret: vi.fn(),
}));

import { tryLoadPersistedSecret } from "../../../utils/nostr/nip07";

describe("ViewNsecModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders passphrase input and unlocks to show keys", async () => {
    (tryLoadPersistedSecret as any).mockResolvedValue(
      "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );

    render(
      <ViewNsecModal isOpen={true} onClose={() => {}} pubkeyHex="deadbeef" />
    );

    fireEvent.change(screen.getByPlaceholderText(/enter passphrase/i), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));

    await waitFor(() => {
      expect(screen.getByText(/secret \(hex\)/i)).toBeInTheDocument();
      expect(screen.getByText(/secret \(nsec\)/i)).toBeInTheDocument();
    });

    // Should render nsec1 prefix
    expect(screen.getByText(/nsec1/i)).toBeInTheDocument();
  });

  it("shows error on invalid passphrase", async () => {
    (tryLoadPersistedSecret as any).mockResolvedValue(null);

    render(
      <ViewNsecModal isOpen={true} onClose={() => {}} pubkeyHex="deadbeef" />
    );

    fireEvent.change(screen.getByPlaceholderText(/enter passphrase/i), {
      target: { value: "bad" },
    });

    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/passphrase must be at least 8 characters/i)
      ).toBeInTheDocument();
    });

    // Now provide longer but wrong passphrase; still error
    fireEvent.change(screen.getByPlaceholderText(/enter passphrase/i), {
      target: { value: "wrongpassphrase" },
    });
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/invalid passphrase or no saved secret/i)
      ).toBeInTheDocument();
    });
  });
});

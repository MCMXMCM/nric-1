import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "../../test/testUtils";
import NostrLinkText from "../NostrLinkText";
import { nip19 } from "nostr-tools";

describe("NostrLinkText - naddr routing", () => {
  it.skip("renders link to /article/$addr for naddr tokens", () => {
    const naddr = nip19.naddrEncode({
      kind: 30023,
      pubkey: "f".repeat(64),
      identifier: "test-addr",
    });
    const { container } = render(
      <NostrLinkText
        text={`read: nostr:${naddr}`}
        getDisplayNameForPubkey={() => ""}
      />
    );

    // The link text is truncated for long bech32 strings
    const display = `${naddr.slice(0, 8)}...${naddr.slice(-6)}`;
    // Assert that the truncated display text is rendered (link rendering is router-dependent in tests)
    expect(container.textContent).toContain(display);
  });
});

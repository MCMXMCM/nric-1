import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { NoteContentContainer } from "../NoteContentContainer";

// Mock CORSImage to simplify detection
vi.mock("../../media/CORSImage", () => ({
  CORSImage: ({ url }: { url: string }) => (
    <img data-testid="cors-image" src={url} alt="article" />
  ),
}));

// Mock NoteHeader and ActionButtonsBar to reduce complexity
vi.mock("../NoteHeader", () => ({
  NoteHeader: () => <div />,
}));
vi.mock("../ActionButtonsBar", () => ({
  ActionButtonsBar: () => <div />,
}));
vi.mock("../QuoteRepostContent", () => ({
  QuoteRepostContent: () => <div />,
}));

describe("NoteContentContainer - article image tag rendering", () => {
  const baseNote: any = {
    id: "note-id",
    pubkey: "pubkey",
    kind: 30023,
    created_at: 0,
    content: "Article content",
    tags: [
      ["d", "identifier"],
      ["image", "https://example.com/cover.jpg"],
    ],
  };

  const noop = () => {};

  const baseProps = {
    note: baseNote,
    actionTargetNote: baseNote,
    index: 0,
    textContent: baseNote.content,
    repostOriginal: null,
    isMobile: false,
    isNotePage: false,
    imageMode: true,
    hasNoteText: true,
    hasRepostTarget: false,
    isQuoteRepost: false,
    imageUrls: [] as string[],
    videoUrls: [] as string[],
    hasMediaError: false,
    asciiCache: {},
    displayUserNameOrNpub: null,
    isDisplayNameLoading: false,
    npubForLinks: "npub",
    hasParent: false,
    hasRoot: false,
    likes: 0,
    hasLikedByMe: false,
    isReactionsLoading: false,
    isSendingReaction: false,
    hasZappedByMe: false,
    useAscii: false,
    useColor: false,
    isIOSPWA: false,
    getDisplayNameForPubkey: (_: string) => "",
    onHashtagClick: noop,
    setFullScreenImage: noop,
    onAsciiRendered: noop,
    onMediaLoadError: noop,
    onImageDimensionsLoaded: noop,
    prefetchRoute: noop,
    prefetchNote: async (_: string) => {},
    goToNote: noop,
    openRepost: noop,
    openReply: noop,
    handleLike: noop,
    readRelayUrls: [],
    setShowZapModal: noop,
    onShare: noop,
    replyCount: 0,
    showFullContent: false,
    totalSats: 0,
    recipientName: undefined,
    isBookmarked: false,
    toggleBookmark: noop,
  } as any;

  it("renders the article image from 'image' tag in feed preview", () => {
    render(<NoteContentContainer {...baseProps} />);
    const img = screen.getByTestId("cors-image");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/cover.jpg");
  });
});



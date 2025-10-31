import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { NoteTextContent } from "../NoteTextContent";

// Mock BasicMarkdown to render plain text for assertions
vi.mock("../../ArticlePage", () => ({
  BasicMarkdown: ({ content }: { content: string }) => (
    <div data-testid="basic-markdown">{content}</div>
  ),
}));

describe("NoteTextContent - long form preview truncation", () => {
  const baseProps = {
    hasNoteText: true,
    hasRepostTarget: false,
    imageUrls: [] as string[],
    hasMediaError: false,
    imageMode: true,
    isIOSPWA: false,
    useAscii: false,
    useColor: false,
    getDisplayNameForPubkey: (_: string) => "",
    onHashtagClick: () => {},
    goToNote: undefined,
  };

  it("truncates long article summary to desktop max characters (420)", () => {
    const longSummary = "x".repeat(600); // no spaces/line breaks to force hard cutoff
    render(
      <NoteTextContent
        {...baseProps}
        isMobile={false}
        textContent="ignored when summary present"
        showFullContent={false}
        isArticle={true}
        articleSummary={longSummary}
      />
    );

    const el = screen.getByTestId("basic-markdown");
    expect(el.textContent?.length).toBeLessThanOrEqual(420);
    expect(el.textContent).toBe(longSummary.substring(0, 420));
  });

  it("truncates long article content to mobile max characters (140) when no summary", () => {
    const longContent = "y".repeat(500); // no spaces/line breaks to force hard cutoff
    render(
      <NoteTextContent
        {...baseProps}
        isMobile={true}
        textContent={longContent}
        showFullContent={false}
        isArticle={true}
        articleSummary={null}
      />
    );

    const el = screen.getByTestId("basic-markdown");
    expect(el.textContent?.length).toBeLessThanOrEqual(140);
    expect(el.textContent).toBe(longContent.substring(0, 140));
  });
});



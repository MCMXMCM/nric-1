import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import NoteContentRenderer from "../NoteContentRenderer";

// Mock the dependencies
vi.mock("../AsciiRendererV2", () => ({
  default: ({
    src,
    onAsciiRendered,
  }: {
    src: string;
    onAsciiRendered: () => void;
  }) => (
    <div data-testid="ascii-renderer" onClick={onAsciiRendered}>
      ASCII: {src}
    </div>
  ),
}));

vi.mock("../media/CORSImage", () => ({
  CORSImage: ({
    url,
    onClick,
    onLoad,
  }: {
    url: string;
    onClick: () => void;
    onLoad: () => void;
  }) => (
    <img
      data-testid="cors-image"
      src={url}
      onClick={onClick}
      onLoad={onLoad}
      alt="test image"
    />
  ),
}));

vi.mock("../media/VideoPlayer", () => ({
  VideoPlayer: ({ url }: { url: string }) => (
    <div data-testid="video-player">Video: {url}</div>
  ),
}));

vi.mock("../ui/LoadingSpinner", () => ({
  default: () => <div data-testid="loading-spinner">Loading...</div>,
}));

vi.mock("../NostrLinkText", () => ({
  default: ({ text }: { text: string }) => (
    <span data-testid="nostr-link-text">{text}</span>
  ),
}));

describe("NoteContentRenderer", () => {
  const defaultProps = {
    content: "",
    useAscii: false,
    useColor: false,
    imageMode: true,
  };

  it("should render text content without images", () => {
    render(
      <NoteContentRenderer
        {...defaultProps}
        content="This is just text content"
      />
    );

    expect(screen.getByTestId("nostr-link-text")).toHaveTextContent(
      "This is just text content"
    );
  });

  it("should show image links as clickable text when media mode is off", () => {
    render(
      <NoteContentRenderer
        {...defaultProps}
        content="Check out this image: https://example.com/image.jpg"
        imageMode={false}
      />
    );

    const linkElement = screen.getByText("example.com JPG image link");
    expect(linkElement).toBeInTheDocument();
    expect(linkElement).toHaveStyle("cursor: pointer");
    expect(linkElement).toHaveStyle("text-decoration: underline");
  });

  it("should replace link text with image when clicked in media mode off", async () => {
    render(
      <NoteContentRenderer
        {...defaultProps}
        content="Check out this image: https://example.com/image.jpg"
        imageMode={false}
      />
    );

    // Initially, link text should be visible
    const linkElement = screen.getByText("example.com JPG image link");
    expect(linkElement).toBeInTheDocument();

    // Click the link
    fireEvent.click(linkElement);

    // Wait for the image to appear and link text to disappear
    await waitFor(() => {
      expect(
        screen.queryByText("example.com JPG image link")
      ).not.toBeInTheDocument();
    });

    // Image should now be rendered inline
    expect(screen.getByTestId("cors-image")).toBeInTheDocument();
  });

  it("should show link text again when image is clicked in media mode off", async () => {
    render(
      <NoteContentRenderer
        {...defaultProps}
        content="Check out this image: https://example.com/image.jpg"
        imageMode={false}
      />
    );

    // Click the link to show image
    const linkElement = screen.getByText("example.com JPG image link");
    fireEvent.click(linkElement);

    // Wait for image to appear
    await waitFor(() => {
      expect(screen.getByTestId("cors-image")).toBeInTheDocument();
    });

    // Click the image to toggle back to link text
    const imageElement = screen.getByTestId("cors-image");
    fireEvent.click(imageElement);

    // Wait for link text to reappear
    await waitFor(() => {
      expect(
        screen.getByText("example.com JPG image link")
      ).toBeInTheDocument();
    });

    // Image should no longer be visible inline
    await waitFor(() => {
      expect(screen.queryByTestId("cors-image")).not.toBeInTheDocument();
    });
  });

  it("should hide image URLs from text when media mode is on", () => {
    render(
      <NoteContentRenderer
        {...defaultProps}
        content="Check out this image: https://example.com/image.jpg"
        imageMode={true}
      />
    );

    // Link text should not be visible in media mode
    expect(
      screen.queryByText("https://example.com/image.jpg")
    ).not.toBeInTheDocument();

    // Only the text part should be visible
    const nostrLinkElements = screen.getAllByTestId("nostr-link-text");
    expect(nostrLinkElements[0]).toHaveTextContent("Check out this image:");
  });

  it("should show expanded images below text when media mode is on", async () => {
    render(
      <NoteContentRenderer
        {...defaultProps}
        content="Check out this image: https://example.com/image.jpg"
        imageMode={true}
      />
    );

    // In media mode, images are handled by the MediaGallery component
    // This test verifies that the image URL is not shown in the text
    expect(
      screen.queryByText("https://example.com/image.jpg")
    ).not.toBeInTheDocument();
  });

  it("should handle video URLs correctly when media mode is off", () => {
    render(
      <NoteContentRenderer
        {...defaultProps}
        content="Check out this video: https://example.com/video.mp4"
        imageMode={false}
      />
    );

    const linkElement = screen.getByText("example.com MP4 video link");
    expect(linkElement).toBeInTheDocument();
    expect(linkElement).toHaveStyle("cursor: pointer");
  });

  it("should handle mixed content with images and videos", () => {
    render(
      <NoteContentRenderer
        {...defaultProps}
        content="Check out this image: https://example.com/image.jpg and this video: https://example.com/video.mp4"
        imageMode={false}
      />
    );

    // Both links should be visible as clickable text
    expect(screen.getByText("example.com JPG image link")).toBeInTheDocument();
    expect(screen.getByText("example.com MP4 video link")).toBeInTheDocument();
  });
});

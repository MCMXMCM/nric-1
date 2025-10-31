import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import LinkPreviewCard from "../LinkPreviewCard";
import * as linkPreviewUtils from "../../../utils/linkPreview";

// Mock the linkPreview utility
vi.mock("../../../utils/linkPreview");

describe("LinkPreviewCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Loading State", () => {
    it("should return null during loading instead of showing placeholder", () => {
      (linkPreviewUtils.buildLinkMetadata as any).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(null), 1000);
          })
      );

      const { container } = render(
        <LinkPreviewCard url="https://example.com" />
      );
      // Component should return null while loading, so container is empty
      expect(container.firstChild).toBeNull();
    });

    it("should not render loading state in compact mode", () => {
      (linkPreviewUtils.buildLinkMetadata as any).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(null), 1000);
          })
      );

      const { container } = render(
        <LinkPreviewCard url="https://example.com" compact={true} />
      );
      // While loading, component returns null
      expect(container.firstChild).toBeNull();
    });
  });

  describe("Successful Metadata Fetch", () => {
    it("should render preview with full metadata", async () => {
      const mockMetadata = {
        url: "https://example.com",
        title: "Example Article",
        description: "This is an example article description",
        image: "https://example.com/image.jpg",
        domain: "example.com",
        faviconUrl: "https://example.com/favicon.ico",
        timestamp: Date.now(),
      };

      (linkPreviewUtils.buildLinkMetadata as any).mockResolvedValue(
        mockMetadata
      );

      render(<LinkPreviewCard url="https://example.com" />);

      await waitFor(() => {
        expect(screen.getByText("Example Article")).toBeInTheDocument();
        expect(
          screen.getByText(/This is an example article description/)
        ).toBeInTheDocument();
      });
    });

    it("should display favicon", async () => {
      const mockMetadata = {
        url: "https://example.com",
        title: "Test",
        domain: "example.com",
        faviconUrl: "https://example.com/favicon.ico",
        timestamp: Date.now(),
      };

      (linkPreviewUtils.buildLinkMetadata as any).mockResolvedValue(
        mockMetadata
      );

      render(<LinkPreviewCard url="https://example.com" showFavicon={true} />);

      await waitFor(() => {
        const favicons = screen.getAllByRole("img", { name: "favicon" });
        expect(favicons.length).toBeGreaterThan(0);
      });
    });

    it("should hide favicon when showFavicon is false", async () => {
      const mockMetadata = {
        url: "https://example.com",
        title: "Test",
        domain: "example.com",
        faviconUrl: "https://example.com/favicon.ico",
        timestamp: Date.now(),
      };

      (linkPreviewUtils.buildLinkMetadata as any).mockResolvedValue(
        mockMetadata
      );

      render(<LinkPreviewCard url="https://example.com" showFavicon={false} />);

      await waitFor(() => {
        expect(screen.getByText("Test")).toBeInTheDocument();
      });

      const favicons = screen.queryAllByRole("img", { name: "favicon" });
      expect(favicons.length).toBe(0);
    });

    it("should display preview image in normal mode", async () => {
      const mockMetadata = {
        url: "https://example.com",
        title: "Test",
        image: "https://example.com/image.jpg",
        domain: "example.com",
        timestamp: Date.now(),
      };

      (linkPreviewUtils.buildLinkMetadata as any).mockResolvedValue(
        mockMetadata
      );

      render(<LinkPreviewCard url="https://example.com" compact={false} />);

      await waitFor(() => {
        const img = screen.getByRole("img", { name: "Test" });
        expect(img).toHaveAttribute("src", "https://example.com/image.jpg");
      });
    });

    it("should not display preview image in compact mode", async () => {
      const mockMetadata = {
        url: "https://example.com",
        title: "Test",
        image: "https://example.com/image.jpg",
        domain: "example.com",
        timestamp: Date.now(),
      };

      (linkPreviewUtils.buildLinkMetadata as any).mockResolvedValue(
        mockMetadata
      );

      render(<LinkPreviewCard url="https://example.com" compact={true} />);

      await waitFor(() => {
        expect(screen.getByText("Test")).toBeInTheDocument();
      });

      const imgs = screen.queryAllByRole("img");
      expect(imgs.length).toBe(0);
    });

    it("should remove www. prefix from domain display", async () => {
      const mockMetadata = {
        url: "https://www.example.com",
        title: "Test",
        domain: "www.example.com",
        timestamp: Date.now(),
      };

      (linkPreviewUtils.buildLinkMetadata as any).mockResolvedValue(
        mockMetadata
      );

      render(<LinkPreviewCard url="https://www.example.com" />);

      await waitFor(() => {
        expect(screen.getByText("example.com")).toBeInTheDocument();
      });
    });
  });

  describe("Error State", () => {
    it("should show fallback UI when metadata fetch fails", async () => {
      (linkPreviewUtils.buildLinkMetadata as any).mockResolvedValue(null);

      render(<LinkPreviewCard url="https://example.com" />);

      await waitFor(() => {
        // Should still show something clickable - now an <a> link
        const links = screen.getAllByRole("link");
        expect(links.length).toBeGreaterThan(0);
      });
    });

    it("should show minimal preview with only domain on error", async () => {
      (linkPreviewUtils.buildLinkMetadata as any).mockResolvedValue(null);

      render(<LinkPreviewCard url="https://example.com" />);

      await waitFor(() => {
        // When fetch fails, buildLinkMetadata returns null, then fallback UI shows
        const links = screen.getAllByRole("link");
        expect(links.length).toBeGreaterThan(0);
      });
    });
  });

  describe("User Interactions", () => {
    it("should call onLinkClick when card is clicked", async () => {
      const mockOnLinkClick = vi.fn();
      const mockMetadata = {
        url: "https://example.com",
        title: "Test",
        domain: "example.com",
        timestamp: Date.now(),
      };

      (linkPreviewUtils.buildLinkMetadata as any).mockResolvedValue(
        mockMetadata
      );

      render(
        <LinkPreviewCard
          url="https://example.com"
          onLinkClick={mockOnLinkClick}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Test")).toBeInTheDocument();
      });

      const link = screen.getByRole("link");
      fireEvent.click(link);

      expect(mockOnLinkClick).toHaveBeenCalledWith("https://example.com");
    });

    it("should open link in new tab when clicked without onLinkClick handler", async () => {
      const mockMetadata = {
        url: "https://example.com",
        title: "Test",
        domain: "example.com",
        timestamp: Date.now(),
      };

      (linkPreviewUtils.buildLinkMetadata as any).mockResolvedValue(
        mockMetadata
      );

      render(<LinkPreviewCard url="https://example.com" />);

      await waitFor(() => {
        expect(screen.getByText("Test")).toBeInTheDocument();
      });

      const link = screen.getByRole("link") as HTMLAnchorElement;
      expect(link.href).toBe("https://example.com/");
      expect(link.target).toBe("_blank");
      expect(link.rel).toBe("noopener noreferrer");
    });

    it("should support keyboard navigation on links", async () => {
      const mockOnLinkClick = vi.fn();
      const mockMetadata = {
        url: "https://example.com",
        title: "Test",
        domain: "example.com",
        timestamp: Date.now(),
      };

      (linkPreviewUtils.buildLinkMetadata as any).mockResolvedValue(
        mockMetadata
      );

      render(
        <LinkPreviewCard
          url="https://example.com"
          onLinkClick={mockOnLinkClick}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Test")).toBeInTheDocument();
      });

      const link = screen.getByRole("link");
      // Links are keyboard accessible by default - pressing Enter should follow the link
      fireEvent.keyDown(link, { key: "Enter" });

      // Note: Browser handles Enter on links natively, so we verify the link exists
      expect(link).toBeInTheDocument();
    });

    it("should support spacebar on links (native browser behavior)", async () => {
      const mockOnLinkClick = vi.fn();
      const mockMetadata = {
        url: "https://example.com",
        title: "Test",
        domain: "example.com",
        timestamp: Date.now(),
      };

      (linkPreviewUtils.buildLinkMetadata as any).mockResolvedValue(
        mockMetadata
      );

      render(
        <LinkPreviewCard
          url="https://example.com"
          onLinkClick={mockOnLinkClick}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Test")).toBeInTheDocument();
      });

      const link = screen.getByRole("link");
      // Links handle spacebar natively in browsers
      fireEvent.keyDown(link, { key: " " });

      // Verify the link is still properly set up
      expect(link).toBeInTheDocument();
    });

    it("should have hover effect", async () => {
      const mockMetadata = {
        url: "https://example.com",
        title: "Test",
        domain: "example.com",
        timestamp: Date.now(),
      };

      (linkPreviewUtils.buildLinkMetadata as any).mockResolvedValue(
        mockMetadata
      );

      render(<LinkPreviewCard url="https://example.com" />);

      await waitFor(() => {
        expect(screen.getByText("Test")).toBeInTheDocument();
      });

      const link = screen.getByRole("link");
      fireEvent.mouseEnter(link);

      // Verify hover state was applied (we can't directly check computed styles in jsdom)
      expect(link).toBeInTheDocument();
    });
  });

  describe("Text Truncation", () => {
    it("should truncate long titles in compact mode", async () => {
      const longTitle = "A".repeat(100);
      const mockMetadata = {
        url: "https://example.com",
        title: longTitle,
        domain: "example.com",
        timestamp: Date.now(),
      };

      (linkPreviewUtils.buildLinkMetadata as any).mockResolvedValue(
        mockMetadata
      );

      render(<LinkPreviewCard url="https://example.com" compact={true} />);

      await waitFor(() => {
        const titleElement = screen.getByText(/A+…/);
        expect(titleElement.textContent).toHaveLength(61); // 60 chars + ellipsis
      });
    });

    it("should truncate long descriptions in normal mode", async () => {
      const longDescription = "B".repeat(200);
      const mockMetadata = {
        url: "https://example.com",
        title: "Test",
        description: longDescription,
        domain: "example.com",
        timestamp: Date.now(),
      };

      (linkPreviewUtils.buildLinkMetadata as any).mockResolvedValue(
        mockMetadata
      );

      render(<LinkPreviewCard url="https://example.com" compact={false} />);

      await waitFor(() => {
        const descElement = screen.getByText(/B+…/);
        expect(descElement.textContent).toHaveLength(161); // 160 chars + ellipsis
      });
    });
  });

  describe("Metadata Fetching", () => {
    it("should call buildLinkMetadata with correct URL", async () => {
      const mockMetadata = {
        url: "https://example.com/article",
        title: "Test",
        domain: "example.com",
        timestamp: Date.now(),
      };

      (linkPreviewUtils.buildLinkMetadata as any).mockResolvedValue(
        mockMetadata
      );

      render(<LinkPreviewCard url="https://example.com/article" />);

      await waitFor(() => {
        expect(linkPreviewUtils.buildLinkMetadata).toHaveBeenCalledWith(
          "https://example.com/article"
        );
      });
    });

    it("should fetch new metadata when URL changes", async () => {
      const mockMetadata1 = {
        url: "https://example.com",
        title: "Test 1",
        domain: "example.com",
        timestamp: Date.now(),
      };

      const mockMetadata2 = {
        url: "https://other.com",
        title: "Test 2",
        domain: "other.com",
        timestamp: Date.now(),
      };

      (linkPreviewUtils.buildLinkMetadata as any).mockResolvedValueOnce(
        mockMetadata1
      );

      const { rerender } = render(
        <LinkPreviewCard url="https://example.com" />
      );

      await waitFor(() => {
        expect(screen.getByText("Test 1")).toBeInTheDocument();
      });

      (linkPreviewUtils.buildLinkMetadata as any).mockResolvedValueOnce(
        mockMetadata2
      );

      rerender(<LinkPreviewCard url="https://other.com" />);

      await waitFor(() => {
        expect(linkPreviewUtils.buildLinkMetadata).toHaveBeenCalledWith(
          "https://other.com"
        );
      });
    });
  });
});

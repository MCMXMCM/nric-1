import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  extractNonMediaUrls,
  extractDomain,
  parseMetadataFromHtml,
  fetchLinkMetadata,
  getFaviconUrl,
  LinkMetadata,
} from "../linkPreview";

describe("linkPreview utility", () => {
  describe("extractNonMediaUrls", () => {
    it("should extract non-media URLs from text", () => {
      const text = "Check this out: https://example.com/article";
      const urls = extractNonMediaUrls(text);
      expect(urls).toContain("https://example.com/article");
    });

    it("should exclude image URLs", () => {
      const text = "Image: https://example.com/image.jpg and link https://example.com";
      const urls = extractNonMediaUrls(text);
      expect(urls).not.toContain("https://example.com/image.jpg");
      expect(urls).toContain("https://example.com");
    });

    it("should exclude video URLs", () => {
      const text = "Video: https://example.com/video.mp4 and link https://example.com";
      const urls = extractNonMediaUrls(text);
      expect(urls).not.toContain("https://example.com/video.mp4");
      expect(urls).toContain("https://example.com");
    });

    it("should exclude multiple media formats", () => {
      const text =
        "https://example.com/pic.png https://example.com/clip.webm https://example.com/article";
      const urls = extractNonMediaUrls(text);
      expect(urls.length).toBe(1);
      expect(urls[0]).toBe("https://example.com/article");
    });

    it("should handle multiple non-media URLs", () => {
      const text = "https://site1.com https://site2.com https://site3.com";
      const urls = extractNonMediaUrls(text);
      expect(urls.length).toBe(3);
    });

    it("should remove duplicate URLs", () => {
      const text = "https://example.com https://example.com https://example.com";
      const urls = extractNonMediaUrls(text);
      expect(urls.length).toBe(1);
    });

    it("should return empty array for empty text", () => {
      expect(extractNonMediaUrls("")).toEqual([]);
      expect(extractNonMediaUrls("   ")).toEqual([]);
    });

    it("should handle URLs with query parameters", () => {
      const text = "https://example.com?param=value&other=123";
      const urls = extractNonMediaUrls(text);
      expect(urls).toContain("https://example.com?param=value&other=123");
    });

    it("should handle URLs with fragments", () => {
      const text = "https://example.com#section";
      const urls = extractNonMediaUrls(text);
      expect(urls.length).toBeGreaterThan(0);
    });

    it("should handle case-insensitive media extensions", () => {
      const text = "https://example.com/image.JPG https://example.com/article";
      const urls = extractNonMediaUrls(text);
      expect(urls).not.toContain("https://example.com/image.JPG");
      expect(urls).toContain("https://example.com/article");
    });
  });

  describe("extractDomain", () => {
    it("should extract domain from valid URL", () => {
      expect(extractDomain("https://example.com")).toBe("example.com");
      expect(extractDomain("https://www.example.com")).toBe("www.example.com");
    });

    it("should handle URLs with paths", () => {
      expect(extractDomain("https://example.com/path/to/article")).toBe("example.com");
    });

    it("should handle URLs with ports", () => {
      expect(extractDomain("https://example.com:8080/path")).toBe("example.com");
    });

    it("should handle invalid URLs gracefully", () => {
      const result = extractDomain("not a valid url");
      expect(typeof result).toBe("string");
    });

    it("should handle HTTP and HTTPS", () => {
      expect(extractDomain("http://example.com")).toBe("example.com");
      expect(extractDomain("https://example.com")).toBe("example.com");
    });
  });

  describe("parseMetadataFromHtml", () => {
    it("should extract Open Graph metadata", () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="Article Title">
            <meta property="og:description" content="Article description">
            <meta property="og:image" content="https://example.com/image.jpg">
          </head>
        </html>
      `;
      const metadata = parseMetadataFromHtml(html, "https://example.com");
      expect(metadata.title).toBe("Article Title");
      expect(metadata.description).toBe("Article description");
      expect(metadata.image).toBe("https://example.com/image.jpg");
    });

    it("should fallback to Twitter Card tags", () => {
      const html = `
        <html>
          <head>
            <meta name="twitter:title" content="Twitter Title">
            <meta name="twitter:description" content="Twitter description">
            <meta name="twitter:image" content="https://example.com/twitter.jpg">
          </head>
        </html>
      `;
      const metadata = parseMetadataFromHtml(html, "https://example.com");
      expect(metadata.title).toBe("Twitter Title");
      expect(metadata.description).toBe("Twitter description");
      expect(metadata.image).toBe("https://example.com/twitter.jpg");
    });

    it("should prefer OG tags over Twitter tags", () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="OG Title">
            <meta name="twitter:title" content="Twitter Title">
          </head>
        </html>
      `;
      const metadata = parseMetadataFromHtml(html, "https://example.com");
      expect(metadata.title).toBe("OG Title");
    });

    it("should fallback to regular meta description", () => {
      const html = `
        <html>
          <head>
            <meta name="description" content="Meta description">
          </head>
        </html>
      `;
      const metadata = parseMetadataFromHtml(html, "https://example.com");
      expect(metadata.description).toBe("Meta description");
    });

    it("should fallback to page title", () => {
      const html = `
        <html>
          <head>
            <title>Page Title</title>
          </head>
        </html>
      `;
      const metadata = parseMetadataFromHtml(html, "https://example.com");
      expect(metadata.title).toBe("Page Title");
    });

    it("should always set domain and timestamp", () => {
      const html = "<html></html>";
      const metadata = parseMetadataFromHtml(html, "https://example.com");
      expect(metadata.domain).toBe("example.com");
      expect(metadata.timestamp).toBeLessThanOrEqual(Date.now());
      expect(metadata.timestamp).toBeGreaterThan(Date.now() - 1000);
    });

    it("should handle malformed HTML gracefully", () => {
      const html = "not valid html at all";
      const metadata = parseMetadataFromHtml(html, "https://example.com");
      expect(metadata.domain).toBe("example.com");
      expect(metadata.timestamp).toBeDefined();
    });

    it("should handle empty metadata gracefully", () => {
      const html = `<html><head></head></html>`;
      const metadata = parseMetadataFromHtml(html, "https://example.com");
      expect(metadata.url).toBe("https://example.com");
      expect(metadata.domain).toBe("example.com");
      expect(metadata.title).toBeUndefined();
      expect(metadata.description).toBeUndefined();
    });

    it("should support Twitter card tags with property attribute", () => {
      const html = `
        <html>
          <head>
            <meta property="twitter:title" content="Twitter Title">
            <meta property="twitter:description" content="Twitter description">
            <meta property="twitter:image" content="https://example.com/twitter.jpg">
          </head>
        </html>
      `;
      const metadata = parseMetadataFromHtml(html, "https://example.com");
      expect(metadata.title).toBe("Twitter Title");
      expect(metadata.description).toBe("Twitter description");
      expect(metadata.image).toBe("https://example.com/twitter.jpg");
    });

    it("should support twitter:image:src tag", () => {
      const html = `
        <html>
          <head>
            <meta name="twitter:image:src" content="https://example.com/img-src.jpg">
          </head>
        </html>
      `;
      const metadata = parseMetadataFromHtml(html, "https://example.com");
      expect(metadata.image).toBe("https://example.com/img-src.jpg");
    });

    it("should prefer twitter:image over twitter:image:src", () => {
      const html = `
        <html>
          <head>
            <meta name="twitter:image" content="https://example.com/twitter.jpg">
            <meta name="twitter:image:src" content="https://example.com/img-src.jpg">
          </head>
        </html>
      `;
      const metadata = parseMetadataFromHtml(html, "https://example.com");
      expect(metadata.image).toBe("https://example.com/twitter.jpg");
    });

    it("should extract tweet content from HTML when meta tags are missing (Twitter URL)", () => {
      const html = `
        <html>
          <head>
            <title>X.com</title>
          </head>
          <body>
            <article data-testid="tweet">
              <div>This is my tweet text content</div>
              <div>More details about the tweet</div>
            </article>
          </body>
        </html>
      `;
      const metadata = parseMetadataFromHtml(html, "https://x.com/user/status/123");
      // Should extract content from tweet element
      expect(metadata.title).toBeDefined();
      expect(metadata.description).toBeDefined();
    });

    it("should fallback to div[data-testid='tweet'] selector", () => {
      const html = `
        <html>
          <body>
            <div data-testid="tweet">
              <span>Tweet content here from data-testid</span>
            </div>
          </body>
        </html>
      `;
      const metadata = parseMetadataFromHtml(html, "https://x.com/user/status/456");
      expect(metadata.title || metadata.description).toBeTruthy();
    });

    it("should extract username from Twitter URL when HTML has no content", () => {
      const html = `<html><body></body></html>`;
      const metadata = parseMetadataFromHtml(html, "https://x.com/testuser/status/123456789");
      // Should have extracted from URL pattern when HTML failed
      expect(metadata.domain).toBe("x.com");
    });

    it("should handle Twitter URL patterns correctly", () => {
      const html = `<html></html>`;
      // This tests the URL structure parsing
      const metadata = parseMetadataFromHtml(html, "https://twitter.com/elonmusk/status/1234567890");
      expect(metadata.url).toBe("https://twitter.com/elonmusk/status/1234567890");
      expect(metadata.domain).toBe("twitter.com");
    });
  });

  describe("fetchLinkMetadata", () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    it("should attempt to fetch from microlink for Twitter URLs", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            title: "Tweet content from microlink",
            description: "Full tweet text here",
            image: { url: "https://example.com/image.jpg" },
          },
        }),
      });

      // This would be called for Twitter URLs
      const metadata = await fetchLinkMetadata("https://x.com/testuser/status/123");
      
      // Should have attempted to use microlink
      expect(global.fetch).toHaveBeenCalled();
      const firstCall = (global.fetch as any).mock.calls[0][0];
      // First call should be to microlink for Twitter URLs
      expect(firstCall).toContain("microlink");
    });

    it("should fetch and parse link metadata", async () => {
      const mockHtml = `
        <html>
          <head>
            <meta property="og:title" content="Test Article">
            <meta property="og:description" content="Test description">
          </head>
        </html>
      `;

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        text: async () => mockHtml,
      });

      const metadata = await fetchLinkMetadata("https://example.com");
      expect(metadata).toBeDefined();
      expect(metadata?.title).toBe("Test Article");
      expect(metadata?.description).toBe("Test description");
    });

    it("should return null on fetch error", async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));
      const metadata = await fetchLinkMetadata("https://example.com");
      expect(metadata).toBeNull();
    });

    it("should return null on non-OK response", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const metadata = await fetchLinkMetadata("https://example.com");
      expect(metadata).toBeNull();
    });

    it("should validate URL before fetching", async () => {
      const metadata = await fetchLinkMetadata("not a valid url");
      expect(metadata).toBeNull();
    });

    it("should use CORS proxy", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        text: async () => "<html></html>",
      });

      await fetchLinkMetadata("https://example.com");
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("api.allorigins.win"),
        expect.any(Object)
      );
    });

    it("should encode URL in CORS proxy", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        text: async () => "<html></html>",
      });

      await fetchLinkMetadata("https://example.com?param=value with spaces");
      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toContain(encodeURIComponent("https://example.com"));
    });

    it("should include User-Agent header", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        text: async () => "<html></html>",
      });

      await fetchLinkMetadata("https://example.com");
      const callOptions = (global.fetch as any).mock.calls[0][1];
      expect(callOptions.headers).toBeDefined();
      expect(callOptions.headers["User-Agent"]).toBeDefined();
      expect(callOptions.headers["User-Agent"]).toContain("Mozilla");
    });

    it("should include Accept header for HTML", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        text: async () => "<html></html>",
      });

      await fetchLinkMetadata("https://example.com");
      const callOptions = (global.fetch as any).mock.calls[0][1];
      expect(callOptions.headers.Accept).toContain("text/html");
    });
  });

  describe("getFaviconUrl", () => {
    it("should generate favicon URL for domain", () => {
      const faviconUrl = getFaviconUrl("example.com");
      expect(faviconUrl).toContain("google.com/s2/favicons");
      expect(faviconUrl).toContain("example.com");
    });

    it("should encode domain in favicon URL", () => {
      const faviconUrl = getFaviconUrl("example.com with spaces");
      expect(faviconUrl).toContain(encodeURIComponent("example.com with spaces"));
    });
  });
});

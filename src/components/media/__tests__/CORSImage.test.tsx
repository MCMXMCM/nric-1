import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, act } from "@testing-library/react";
import { CORSImage } from "../CORSImage";
import { mediaLoader } from "../../../services/mediaLoader";

// Minimal mock for IntersectionObserver
class MockIntersectionObserver {
  callback: any;
  constructor(cb: any) {
    this.callback = cb;
  }
  observe() {
    this.callback([{ isIntersecting: true }]);
  }
  disconnect() {}
}

// @ts-ignore
global.IntersectionObserver = MockIntersectionObserver;

// Ensure window.devicePixelRatio is stable in tests
Object.defineProperty(window, "devicePixelRatio", {
  value: 2,
  configurable: true,
});

describe("CORSImage responsive optimization", () => {
  it("adds srcset and sizes when enableOptimization=true", () => {
    const { container } = render(
      <CORSImage
        url="https://example.com/image.jpg"
        isLoading={false}
        onClick={() => {}}
        onLoad={() => {}}
        onError={() => {}}
        style={{
          width: 300,
          height: "auto",
          objectFit: "cover",
          borderRadius: 8,
        }}
        loading="lazy"
        decoding="async"
        fetchPriority="auto"
        isMobile={true}
        enableOptimization={true}
        expectedWidth={300}
        expectedHeight={200}
        isDarkMode={false}
        showPlaceholder={false}
        sizesHint="(max-width: 768px) 48vw, 33vw"
      />
    );

    const img = container.querySelector("img")!;
    expect(img).toBeTruthy();
    expect(img.getAttribute("sizes")).toBe("(max-width: 768px) 48vw, 33vw");
    const srcset = img.getAttribute("srcset") || "";
    // should include weserv proxy with width parameter
    expect(srcset).toContain("https://images.weserv.nl/?url=");
    expect(srcset).toMatch(/\s320w/);
    expect(srcset).toMatch(/\s768w/);
  });
});

// Removed stall watchdog test - the watchdog was causing performance issues
// by adding artificial delays to image loading. Images now load immediately.

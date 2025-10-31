import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
} from "react";
import type { FC } from "react";
import { mediaLoader } from "../services/mediaLoader";
import { createOptimizedImageBitmap } from "../utils/imageOptimization";
import LoadingSpinner from "./ui/LoadingSpinner";

export interface AsciiRendererV2Props {
  src: string;
  type: "image" | "video";
  width?: number;
  height?: number;
  useColor?: boolean;
  onError?: () => void;
  onAsciiRendered?: (ascii: string) => void; // kept for API compatibility
  cachedAscii?: string; // kept for API compatibility
}

export type AsciiRendererProps = AsciiRendererV2Props;

const AsciiRendererV2: FC<AsciiRendererV2Props> = ({
  src,
  type,
  width = 600,
  height = 400,
  useColor = true,
  onError,
  onAsciiRendered,
}: AsciiRendererV2Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const lastUrlRef = useRef<string | null>(null);
  const lastBitmapRef = useRef<ImageBitmap | null>(null);
  const cleanupIntervalRef = useRef<number | null>(null);
  const webglContextRef = useRef<WebGLRenderingContext | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  const [error, setError] = useState<boolean>(false);
  const [showOriginal, setShowOriginal] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [containerDimensions, setContainerDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  const [charWidthPerEm, setCharWidthPerEm] = useState<number>(0.6);
  const [ramp, setRamp] = useState<string>(
    ' .`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$'
  );

  const isMobile =
    typeof window !== "undefined" ? window.innerWidth <= 768 : false;
  const onErrorRef = useRef<typeof onError | undefined>(undefined);
  const onAsciiRenderedRef = useRef<typeof onAsciiRendered | undefined>(
    undefined
  );
  const readySignaledRef = useRef<string | null>(null);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onAsciiRenderedRef.current = onAsciiRendered;
  }, [onAsciiRendered]);

  const signalReadyOnce = useCallback(() => {
    try {
      if (readySignaledRef.current !== src) {
        readySignaledRef.current = src;
        onAsciiRenderedRef.current?.("[bitmap-ready]");
      }
    } catch {}
  }, [src]);

  // Ensure iOS PWA inline playback compatibility
  useEffect(() => {
    const video = videoElRef.current;
    if (!video) return;
    try {
      video.setAttribute("playsinline", "");
      // Older iOS requires this vendor-prefixed attribute
      video.setAttribute("webkit-playsinline", "");
      video.setAttribute("x-webkit-airplay", "allow");
      // Prefer loading only metadata to avoid aggressive preloading on iOS
      video.preload = "metadata";
    } catch {}
  }, []);

  // Measure monospace width per em for accurate fit
  useEffect(() => {
    try {
      const span = document.createElement("span");
      span.style.position = "absolute";
      span.style.visibility = "hidden";
      span.style.whiteSpace = "pre";
      span.style.fontFamily =
        'Menlo, Consolas, Monaco, "Courier New", monospace';
      span.style.fontSize = "100px";
      span.textContent = "M";
      document.body.appendChild(span);
      const widthPx = span.getBoundingClientRect().width;
      document.body.removeChild(span);
      if (widthPx > 0) setCharWidthPerEm(widthPx / 100);
    } catch {}
  }, []);

  // Compute density-ordered glyph ramp for precision
  useEffect(() => {
    try {
      const base =
        ' .`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$';
      const canvas = document.createElement("canvas");
      const size = 48;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.textBaseline = "top";
      ctx.font = `${Math.floor(
        size * 0.86
      )}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
      const densities: Array<{ char: string; density: number }> = [];
      for (const ch of base) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = "#000000";
        ctx.fillText(ch, 2, 2);
        const img = ctx.getImageData(0, 0, size, size);
        const data = img.data;
        let darkSum = 0;
        for (let p = 0; p < data.length; p += 4) {
          const r = data[p];
          const g = data[p + 1];
          const b = data[p + 2];
          const avg = (r + g + b) / 3;
          const darkness = 1 - avg / 255;
          darkSum += darkness;
        }
        const density = darkSum / (size * size);
        densities.push({ char: ch, density });
      }
      densities.sort((a, b) => a.density - b.density);
      setRamp(densities.map((d) => d.char).join(""));
    } catch {}
  }, []);

  // Compute output size that preserves image aspect and matches container width
  const computeOutputSize = useCallback(
    (containerW: number, aspect: number) => {
      if (!containerW || !aspect)
        return { w: Math.floor(width), h: Math.floor(height) };
      const w = Math.floor(containerW);
      const h = Math.floor(w / aspect);
      return { w, h };
    },
    [width, height]
  );

  // Render via worker (WebGL) and receive an ImageBitmap
  const log = (...args: any[]) => {
    try {
      console.debug("[AsciiRendererV2]", ...args);
    } catch {}
  };

  const renderWithWorker = useCallback(
    async (
      imageUrl: string,
      aspect: number,
      containerW: number
    ): Promise<ImageBitmap> => {
      // Limit concurrent workers to prevent WebGL context accumulation
      const maxWorkers = 3;
      const activeWorkers = (globalThis as any).__asciiWorkers || 0;

      if (activeWorkers >= maxWorkers) {
        log("Too many active ASCII workers, waiting for cleanup");
        // Wait for cleanup before proceeding
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (!workerRef.current) {
        workerRef.current = new Worker(
          new URL("../workers/asciiWorker.ts", import.meta.url),
          { type: "module" }
        );
        workerRef.current.addEventListener("message", (e: MessageEvent) => {
          const m = e.data as any;
          if (m && m.type === "log") {
            log(m.message, m.data);
          }
        });

        // Set up more frequent cleanup for the worker to prevent WebGL context accumulation
        cleanupIntervalRef.current = window.setInterval(
          () => {
            if (workerRef.current) {
              workerRef.current.postMessage({ type: "cleanup" });
            }
          },
          2 * 60 * 1000
        ); // Clean up every 2 minutes to prevent WebGL context accumulation

        // Track active workers
        (globalThis as any).__asciiWorkers =
          ((globalThis as any).__asciiWorkers || 0) + 1;
      }
      const worker = workerRef.current;

      const tryFetch = async (url: string): Promise<Response | null> => {
        try {
          const r = await fetch(url, { mode: "cors", cache: "force-cache" });
          if (r && r.ok) return r;
        } catch {}
        try {
          const r2 = await fetch(url, { mode: "cors", cache: "no-store" });
          if (r2 && r2.ok) return r2;
        } catch {}
        return null;
      };

      const toProxy = (url: string) =>
        url.startsWith("https://corsproxy.io/?")
          ? url
          : `https://corsproxy.io/?${encodeURIComponent(url)}`;

      log("fetching image", { imageUrl });
      let resp = await tryFetch(imageUrl);
      if (!resp) {
        const proxied = toProxy(imageUrl);
        log("direct fetch failed; retrying via proxy", { proxied });
        resp = await tryFetch(proxied);
        if (!resp) throw new Error("fetch failed");
        imageUrl = proxied; // use proxied URL downstream for consistency
      }

      const blob = await resp.blob();

      // Create optimized bitmap for ASCII processing to reduce memory usage
      const optimizationResult = await createOptimizedImageBitmap(blob, {
        isMobile,
        quality: "high",
        imageOrientation: "none",
        premultiplyAlpha: "premultiply",
      });

      const { bitmap, dimensions, wasResized, memoryReduction } =
        optimizationResult;

      // Log optimization results for debugging large images
      if (wasResized) {
        log("Optimized large image for ASCII processing", {
          dimensions: `${dimensions.width}×${dimensions.height}`,
          memoryReduction: `${memoryReduction.toFixed(1)}%`,
          context: "ASCII rendering",
        });
      }
      const perEm = charWidthPerEm || 0.6;
      const caps = { cols: isMobile ? 160 : 240, rows: isMobile ? 180 : 200 };
      const { w, h } = computeOutputSize(containerW, aspect);
      const transfer: Transferable[] = [bitmap as unknown as Transferable];
      let requestId = Math.floor(Math.random() * 1e9);
      return await new Promise<ImageBitmap>((resolve, reject) => {
        const onMsg = (e: MessageEvent) => {
          const msg = e.data as any;
          if (msg && msg.type === "bitmap" && msg.bitmap) {
            // If worker supports requestId, ignore stale responses
            if (
              typeof msg.requestId === "number" &&
              msg.requestId !== requestId
            ) {
              return;
            }
            worker.removeEventListener("message", onMsg);
            log("worker returned bitmap", {
              cols: msg.cols,
              rows: msg.rows,
              w: (msg.bitmap as ImageBitmap).width,
              h: (msg.bitmap as ImageBitmap).height,
            });
            resolve(msg.bitmap as ImageBitmap);
          } else if (msg && msg.type === "error") {
            worker.removeEventListener("message", onMsg);
            log("worker error", msg.error);
            reject(new Error(String(msg.error)));
          }
        };
        worker.addEventListener("message", onMsg);
        log("posting render request", { perEm, caps, out: { w, h } });
        worker.postMessage(
          {
            type: "render-gl",
            bitmap,
            options: {
              useColor,
              charWidthPerEm: perEm,
              caps,
              output: { width: Math.max(1, w), height: Math.max(1, h) },
              ramp,
              requestId,
            },
          },
          transfer
        );
      });
    },
    [charWidthPerEm, isMobile, computeOutputSize, useColor, ramp]
  );

  // Present ImageBitmap on a canvas
  const presentBitmap = useCallback((bitmap: ImageBitmap) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    lastBitmapRef.current = bitmap;
    const ctx2d = canvas.getContext("2d");
    if (ctx2d) {
      try {
        ctx2d.clearRect(0, 0, canvas.width, canvas.height);
        ctx2d.imageSmoothingEnabled = true;
        ctx2d.drawImage(bitmap, 0, 0);
      } catch (e) {
        log("2d drawImage failed; requesting re-render", e);
      }
    }
  }, []);

  // Re-present cached bitmap when toggling back to ASCII view
  useEffect(() => {
    if (!showOriginal && lastBitmapRef.current) {
      // defer to next frame to ensure canvas is mounted
      const id = requestAnimationFrame(() =>
        presentBitmap(lastBitmapRef.current!)
      );
      return () => cancelAnimationFrame(id);
    }
  }, [showOriginal, presentBitmap]);

  // Handle cached ASCII - this component renders bitmaps, not text
  // The cachedAscii prop is not used in this bitmap-based renderer

  // Load and render image using worker
  useEffect(() => {
    let cancelled = false;
    setError(false);
    setIsLoading(true);
    // reset ready signal for new src
    readySignaledRef.current = null;
    const run = async () => {
      try {
        const result = await mediaLoader.loadMedia(src);
        let imageUrl = src; // Default to original URL

        if (result.success) {
          imageUrl = result.url; // Use resolved URL if available
        }
        // If mediaLoader fails, still try the original URL - let the img element decide

        lastUrlRef.current = imageUrl;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = async () => {
          if (cancelled) return;
          const aspect = img.naturalWidth / img.naturalHeight;
          setImageAspect(aspect);
          // Ensure we have a real width; if zero, try parent width or fallback to window width
          let containerW = containerRef.current?.clientWidth || 0;
          if (!containerW && containerRef.current?.parentElement) {
            containerW = (containerRef.current.parentElement as HTMLElement)
              .clientWidth;
          }
          if (!containerW && typeof window !== "undefined") {
            containerW = Math.min(window.innerWidth, width);
          }
          try {
            log("start render", { aspect, containerW });
            const bmp = await renderWithWorker(
              imageUrl,
              aspect,
              containerW || width
            );
            if (cancelled) return;
            presentBitmap(bmp);
            setIsLoading(false);
            signalReadyOnce();
          } catch {
            log("render failed, falling back to original");
            setError(true);
            setShowOriginal(true);
            setIsLoading(false);
            onErrorRef.current?.();
            signalReadyOnce();
          }
        };
        img.onerror = () => {
          // Don't log CORS errors to console to reduce noise
          if (cancelled) return;
          setError(true);
          setShowOriginal(true);
          setIsLoading(false);
          onErrorRef.current?.();
          signalReadyOnce();
        };
        img.src = imageUrl;
      } catch {
        // If everything fails, try original URL as fallback
        if (cancelled) return;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = async () => {
          if (cancelled) return;
          const aspect = img.naturalWidth / img.naturalHeight;
          setImageAspect(aspect);
          let containerW = containerRef.current?.clientWidth || 0;
          if (!containerW && containerRef.current?.parentElement) {
            containerW = (containerRef.current.parentElement as HTMLElement)
              .clientWidth;
          }
          if (!containerW && typeof window !== "undefined") {
            containerW = Math.min(window.innerWidth, width);
          }
          try {
            log("start render fallback", { aspect, containerW });
            const bmp = await renderWithWorker(
              src,
              aspect,
              containerW || width
            );
            if (cancelled) return;
            presentBitmap(bmp);
            setIsLoading(false);
            signalReadyOnce();
          } catch {
            log("fallback render failed");
            setError(true);
            setShowOriginal(true);
            setIsLoading(false);
            onErrorRef.current?.();
            signalReadyOnce();
          }
        };
        img.onerror = () => {
          if (cancelled) return;
          setError(true);
          setShowOriginal(true);
          setIsLoading(false);
          onErrorRef.current?.();
          signalReadyOnce();
        };
        img.src = src;
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [src, renderWithWorker, presentBitmap, width, signalReadyOnce]);

  // Observe container size
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        setContainerDimensions({ width: w, height: h });
      }
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Ensure we have an initial measurement synchronously on mount
  useLayoutEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        setContainerDimensions({ width: rect.width, height: rect.height });
      } else if (containerRef.current.parentElement) {
        const parentRect = (
          containerRef.current.parentElement as HTMLElement
        ).getBoundingClientRect();
        if (parentRect.width > 0 || parentRect.height > 0) {
          setContainerDimensions({
            width: parentRect.width,
            height: parentRect.height,
          });
        }
      }
    }
  }, []);

  // Re-render bitmap when container width changes
  useEffect(() => {
    if (!lastUrlRef.current || !imageAspect || !containerDimensions?.width)
      return;
    let cancelled = false;
    const rerender = async () => {
      try {
        const bmp = await renderWithWorker(
          lastUrlRef.current!,
          imageAspect,
          containerDimensions.width
        );
        if (cancelled) return;
        presentBitmap(bmp);
        // already signaled ready in main path
      } catch {}
    };
    rerender();
    return () => {
      cancelled = true;
    };
  }, [
    containerDimensions?.width,
    imageAspect,
    renderWithWorker,
    presentBitmap,
  ]);

  // Ensure an initial render once both container width and computed ramp are ready
  useEffect(() => {
    if (!lastUrlRef.current || !imageAspect) return;
    if (!containerDimensions?.width) return;
    // trigger a render if we became ready but previous effect ran before container had size
    (async () => {
      try {
        const bmp = await renderWithWorker(
          lastUrlRef.current!,
          imageAspect,
          containerDimensions.width
        );
        presentBitmap(bmp);
        setIsLoading(false);
        signalReadyOnce();
      } catch {
        log("ready render failed");
        setError(true);
        setShowOriginal(true);
        setIsLoading(false);
        onErrorRef.current?.();
        signalReadyOnce();
      }
    })();
  }, [
    containerDimensions?.width,
    imageAspect,
    ramp,
    renderWithWorker,
    signalReadyOnce,
  ]);

  // Absolute last-resort: after mount and next frame, if still loading and we have URL and aspect, try a render once
  useEffect(() => {
    let raf = 0;
    if (
      isLoading &&
      lastUrlRef.current &&
      imageAspect &&
      containerRef.current
    ) {
      raf = requestAnimationFrame(async () => {
        if (!containerRef.current) return;
        const cw =
          containerRef.current.clientWidth ||
          (containerRef.current.parentElement
            ? (containerRef.current.parentElement as HTMLElement).clientWidth
            : width);
        if (!cw) return;
        try {
          const bmp = await renderWithWorker(
            lastUrlRef.current!,
            imageAspect!,
            cw
          );
          presentBitmap(bmp);
          setIsLoading(false);
          signalReadyOnce();
        } catch {}
      });
    }
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [
    isLoading,
    imageAspect,
    renderWithWorker,
    presentBitmap,
    width,
    signalReadyOnce,
  ]);

  // PERFORMANCE FIX: Enhanced cleanup to prevent WebGL memory leaks
  useEffect(() => {
    return () => {
      isMountedRef.current = false;

      // Clear cleanup interval
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current);
        cleanupIntervalRef.current = null;
      }

      // Clean up worker
      if (workerRef.current) {
        // Send final cleanup message before terminating
        try {
          workerRef.current.postMessage({ type: "cleanup" });
        } catch (error) {
          console.warn("Error sending final cleanup to worker:", error);
        }

        workerRef.current.terminate();
        workerRef.current = null;

        // Decrement active worker count
        (globalThis as any).__asciiWorkers = Math.max(
          0,
          ((globalThis as any).__asciiWorkers || 0) - 1
        );
      }

      // Clean up bitmap
      if (lastBitmapRef.current) {
        lastBitmapRef.current.close();
        lastBitmapRef.current = null;
      }

      // PERFORMANCE FIX: Clean up WebGL context to prevent memory leaks
      if (webglContextRef.current) {
        const gl = webglContextRef.current;
        // Force cleanup of WebGL resources
        const ext = gl.getExtension("WEBGL_lose_context");
        if (ext) {
          ext.loseContext();
        }
        webglContextRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <div
        ref={containerRef}
        style={{
          width: isMobile ? "100vw" : "100%",
          height: "auto",
          position: "relative",
          overflowX: "hidden",
          overflowY: "hidden",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          cursor: "pointer",
          margin: isMobile ? "0" : "auto",
          boxSizing: "border-box",
          borderRadius: "8px", // Match non-ASCII images
          padding: "4px", // Add consistent padding like non-ASCII images
        }}
        tabIndex={0}
        onClick={() => {
          const next = !showOriginal;
          setShowOriginal(next);
          if (!next && lastBitmapRef.current) {
            // toggling back to ASCII: ensure repaint on next frame
            const id = requestAnimationFrame(() => {
              // Some mobile browsers need a tiny delay and style flush before draw
              setTimeout(() => {
                presentBitmap(lastBitmapRef.current!);
              }, 0);
            });
            setTimeout(() => cancelAnimationFrame(id), 16);
          }
        }}
      >
        {error ? (
          <div style={{ color: "var(--text-color)", textAlign: "center" }}>
            Failed to load media
          </div>
        ) : isLoading ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "100%",
              width: "100%",
              minHeight: height,
            }}
          >
            <LoadingSpinner size="small" width={width} height={height - 100} />
          </div>
        ) : (
          <div
            className="ascii-container"
            style={{
              maxWidth: "100%",
              width: "100%",
              overflow: "hidden",
              backgroundColor: "#000000",
              margin: "0",
              boxSizing: "border-box",
              borderRadius: "0", // Remove border radius from inner container
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                paddingTop: imageAspect ? `${100 / imageAspect}%` : undefined,
                minHeight: !imageAspect ? height : undefined,
                willChange: "transform",
              }}
            >
              <canvas
                ref={canvasRef}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  display: showOriginal ? "none" : "block",
                  imageRendering: "auto" as any,
                }}
              />
              {type === "image" ? (
                <img
                  src={lastUrlRef.current || src}
                  alt="Original"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    borderRadius: "0",
                    objectFit: "contain",
                    display: showOriginal ? "block" : "none",
                  }}
                  crossOrigin="anonymous"
                />
              ) : (
                <video
                  ref={videoElRef}
                  src={lastUrlRef.current || src}
                  controls
                  playsInline
                  preload="metadata"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    display: showOriginal ? "block" : "none",
                  }}
                  // Prevent bubbling to container which toggles ASCII/video view
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default AsciiRendererV2;

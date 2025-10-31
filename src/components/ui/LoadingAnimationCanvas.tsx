import React, { useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";

interface LoadingAnimationCanvasProps {
  size?: "small" | "large";
  className?: string;
  style?: React.CSSProperties;
  width?: number;
  height?: number;
}

// Inject a lightweight CSS pulse animation for immediate feedback pre-RAF
let pulseStylesInjected = false;
function ensurePulseStyles() {
  if (pulseStylesInjected) return;
  try {
    const style = document.createElement("style");
    style.textContent = `
@keyframes spinner-pulse { 0% { transform: scale(0.98); opacity: 0.85; } 50% { transform: scale(1.02); opacity: 1; } 100% { transform: scale(0.98); opacity: 0.85; } }
.spinner-pre-anim { animation: spinner-pulse 800ms ease-in-out infinite; will-change: transform, opacity; }
`;
    document.head.appendChild(style);
    pulseStylesInjected = true;
  } catch {}
}

// ASCII characters for the animation
const ASCII_CHARS = [
  "!",
  "@",
  "#",
  "$",
  "%",
  "^",
  "&",
  "*",
  "(",
  ")",
  "-",
  "=",
  "+",
  "[",
  "]",
  "{",
  "}",
  "|",
  "\\",
  ":",
  ";",
  '"',
  "'",
  "<",
  ">",
  ",",
  ".",
  "?",
  "/",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
];

const SPECIAL_CHARS = [
  "█",
  "▓",
  "▒",
  "░",
  "■",
  "□",
  "▪",
  "▫",
  "▬",
  "▭",
  "▮",
  "▯",
  "▰",
  "▱",
];

interface CharCell {
  char: string;
  x: number;
  y: number;
  lastUpdate: number;
  updateInterval: number;
  scale: number;
  opacity: number;
}

const LoadingAnimationCanvas: React.FC<LoadingAnimationCanvasProps> = ({
  size = "large",
  className = "",
  style = {},
  width,
  height,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const cellsRef = useRef<CharCell[]>([]);
  const lastTimeRef = useRef<number>(0);
  const fontSizeRef = useRef<number>(14); // px
  const cellWidthRef = useRef<number>(0);
  const cellHeightRef = useRef<number>(0);
  const originRef = useRef<{ ox: number; oy: number }>({ ox: 0, oy: 0 });
  const hasStartedRef = useRef<boolean>(false);

  // Better mobile/portrait detection incl. iOS PWA standalone
  const isStandalone =
    typeof window !== "undefined" &&
    ((window.matchMedia &&
      window.matchMedia("(display-mode: standalone)").matches) ||
      (window.navigator as any)?.standalone === true);
  const isPortrait =
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(orientation: portrait)").matches;
  const isMobile =
    typeof window !== "undefined" &&
    (window.innerWidth <= 768 ||
      (window.screen &&
        (window.screen.width <= 812 || window.screen.height <= 812)) ||
      isStandalone);

  // Animations enabled on all platforms

  // Get random character
  const getRandomChar = useCallback(() => {
    const allChars = [...ASCII_CHARS, ...SPECIAL_CHARS];
    return allChars[Math.floor(Math.random() * allChars.length)];
  }, []);

  // Initialize cells based on size
  const initializeCells = useCallback(
    (canvasWidth: number, canvasHeight: number) => {
      // Determine grid dimensions
      let rows: number;
      let cols: number;

      // Preserve DOM-like metrics for large by default; when user passes explicit size, add more characters
      const preserveMetrics = size === "large" && !width && !height;
      const dynamicGrid = size === "large" && (!!width || !!height);
      const baseFontPx = size === "small" ? 12 : 14; // match DOM ~0.75rem and 0.875rem
      const gapWidthRatio = 1.1; // roughly gap: 0.1em
      const gapHeightRatio = 1.2; // match DOM line-height-ish

      let cellWidth: number;
      let cellHeight: number;

      if (size === "small") {
        // Fixed small grid
        rows = 3;
        cols = 8;
        const cw = canvasWidth / cols;
        const ch = canvasHeight / rows;
        const fontSize = Math.min(cw * 0.8, ch * 0.8);
        fontSizeRef.current = fontSize;
        cellWidth = cw;
        cellHeight = ch;
      } else if (dynamicGrid) {
        // Large + explicit width/height: compute rows/cols to fill while preserving font & spacing
        fontSizeRef.current = baseFontPx;
        cellWidth = baseFontPx * gapWidthRatio;
        cellHeight = baseFontPx * gapHeightRatio;
        cols = Math.max(8, Math.floor(canvasWidth / cellWidth));
        rows = Math.max(4, Math.floor(canvasHeight / cellHeight));
      } else if (preserveMetrics) {
        // Large default with preserved metrics and default grid size
        fontSizeRef.current = baseFontPx;
        cellWidth = baseFontPx * gapWidthRatio;
        cellHeight = baseFontPx * gapHeightRatio;
        cols = 32;
        rows = 16;
      } else {
        // Fallback scaling behavior
        cols = 32;
        rows = 16;
        const cw = canvasWidth / cols;
        const ch = canvasHeight / rows;
        const fontSize = Math.min(cw * 0.8, ch * 0.8);
        fontSizeRef.current = fontSize;
        cellWidth = cw;
        cellHeight = ch;
      }

      cellWidthRef.current = cellWidth;
      cellHeightRef.current = cellHeight;

      // Compute origin to center grid
      const totalW = cols * cellWidth;
      const totalH = rows * cellHeight;
      const ox = (canvasWidth - totalW) / 2 + cellWidth / 2;
      const oy = (canvasHeight - totalH) / 2 + cellHeight / 2;
      originRef.current = { ox, oy };

      const cells: CharCell[] = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          cells.push({
            char: getRandomChar(),
            x: ox + col * cellWidth,
            y: oy + row * cellHeight,
            // Force initial updates to occur on first frame by setting lastUpdate well in the past
            lastUpdate: -1000 - Math.random() * 2000,
            updateInterval: 1000 + Math.random() * 2000, // 1-3 seconds
            scale: 0.98 + Math.random() * 0.04, // subtle jitter ~ [0.98, 1.02]
            opacity: 0.8 + Math.random() * 0.2,
          });
        }
      }

      return { cells };
    },
    [size, getRandomChar, width, height]
  );

  // Animation loop
  const animate = useCallback(
    (currentTime: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const cells = cellsRef.current;

      // On first RAF, remove pre-anim CSS
      if (!hasStartedRef.current) {
        hasStartedRef.current = true;
        try {
          containerRef.current?.classList.remove("spinner-pre-anim");
        } catch {}
      }

      // Clear canvas
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // Use precomputed font size
      const fontSize = fontSizeRef.current;

      // Set text properties
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${fontSize}px "IBM Plex Mono", monospace`;

      // Update and draw cells
      cells.forEach((cell) => {
        // Update character if it's time
        if (currentTime - cell.lastUpdate > cell.updateInterval) {
          cell.char = getRandomChar();
          cell.lastUpdate = currentTime;
          cell.scale = 0.98 + Math.random() * 0.04;
          cell.opacity = 0.8 + Math.random() * 0.2;
        }

        // Save context
        ctx.save();

        // Apply transformations (no rotation, subtle scaling)
        ctx.translate(cell.x, cell.y);
        ctx.scale(cell.scale, cell.scale);

        // Set color based on theme
        const isDarkMode =
          document.documentElement.getAttribute("data-theme") !== "light";
        const textColor = isDarkMode ? "#64748b" : "#1a1a1a";

        ctx.fillStyle = textColor;
        ctx.globalAlpha = cell.opacity;

        // Draw character
        ctx.fillText(cell.char, 0, 0);

        // Restore context
        ctx.restore();
      });

      // Continue animation
      animationRef.current = requestAnimationFrame(animate);
    },
    [getRandomChar]
  );

  // Initialize canvas and start animation
  useEffect(() => {
    ensurePulseStyles();
    try {
      containerRef.current?.classList.add("spinner-pre-anim");
    } catch {}

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size with mobile vertical aspect ratio
    let canvasWidth = width || (size === "small" ? 200 : 600);
    let canvasHeight = height || (size === "small" ? 80 : 300);

    // Use vertical aspect ratio for mobile large animations
    if (size === "large" && !width && !height && isMobile) {
      if (isPortrait) {
        canvasWidth = 400;
        canvasHeight = 600; // Vertical aspect ratio for mobile portrait
      } else {
        canvasWidth = 600;
        canvasHeight = 400; // Landscape mobile
      }
    }

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Initialize cells
    const { cells } = initializeCells(canvasWidth, canvasHeight);
    cellsRef.current = cells;

    // Draw a first frame synchronously for immediate visual feedback
    (function drawOnce() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const fontSize = fontSizeRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${fontSize}px "IBM Plex Mono", monospace`;
      const isDarkMode =
        document.documentElement.getAttribute("data-theme") !== "light";
      const textColor = isDarkMode ? "#64748b" : "#1a1a1a";
      ctx.fillStyle = textColor;
      cellsRef.current.forEach((cell) => {
        ctx.save();
        ctx.translate(cell.x, cell.y);
        ctx.scale(cell.scale, cell.scale);
        ctx.globalAlpha = cell.opacity;
        ctx.fillText(cell.char, 0, 0);
        ctx.restore();
      });
    })();

    // Start animation
    hasStartedRef.current = false;
    lastTimeRef.current = performance.now();
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      try {
        containerRef.current?.classList.remove("spinner-pre-anim");
      } catch {}
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [size, width, height, initializeCells, animate, isMobile, isPortrait]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const containerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    ...style,
  };

  const canvasStyle: React.CSSProperties = {
    display: "block",
    maxWidth: "100%",
    height: "auto",
  };

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      style={containerStyle}
      className={className}
    >
      <canvas
        ref={canvasRef}
        style={canvasStyle}
        width={
          width ||
          (size === "small"
            ? 200
            : isPortrait && isMobile
            ? 400
            : isMobile
            ? 600
            : 600)
        }
        height={
          height ||
          (size === "small"
            ? 80
            : isPortrait && isMobile
            ? 600
            : isMobile
            ? 400
            : 300)
        }
      />
    </motion.div>
  );
};

export default LoadingAnimationCanvas;

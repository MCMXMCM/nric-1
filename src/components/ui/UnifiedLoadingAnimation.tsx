import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";

// Shared character sets
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

export type LoadingAnimationType = "grid" | "text" | "multiline" | "xl";
export type LoadingSpeed = "slow" | "normal" | "fast";
export type LoadingSize = "small" | "large";

export interface UnifiedLoadingAnimationProps {
  /** Type of loading animation */
  type: LoadingAnimationType;

  /** For grid type: size preset */
  size?: LoadingSize;

  /** For text type: number of characters */
  length?: number;

  /** For multiline type: number of lines and characters per line */
  lineCount?: number;
  lineLength?: number;

  /** For xl type: dimensions in pixels */
  width?: number;
  height?: number;

  /** Animation speed */
  speed?: LoadingSpeed;

  /** Additional styling */
  className?: string;
  style?: React.CSSProperties;
}

export const UnifiedLoadingAnimation: React.FC<
  UnifiedLoadingAnimationProps
> = ({
  type,
  size = "large",
  length = 20,
  lineCount = 3,
  lineLength = 15,
  width = 400,
  height = 300,
  speed = "normal",
  className = "",
  style = {},
}) => {
  // Animations enabled on all platforms
  const [grid, setGrid] = useState<string[][]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const animationRef = useRef<number | null>(null);
  const gridRef = useRef<string[][]>([]);
  const lastUpdateRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Animation timing based on speed
  const animationInterval = useMemo(() => {
    switch (speed) {
      case "slow":
        return 200;
      case "fast":
        return 50;
      case "normal":
      default:
        return 100;
    }
  }, [speed]);

  // Grid dimensions based on type and size
  const gridDimensions = useMemo(() => {
    switch (type) {
      case "grid":
        return size === "small" ? { rows: 3, cols: 8 } : { rows: 16, cols: 32 };
      case "text":
        return { rows: 1, cols: length };
      case "multiline":
        return { rows: lineCount, cols: lineLength };
      case "xl":
        const fontPx = 14;
        const cellW = fontPx * 1.1;
        const cellH = fontPx * 1.2;
        const cols = Math.max(8, Math.floor(width / cellW));
        const rows = Math.max(8, Math.floor(height / cellH));
        return { rows, cols };
      default:
        return { rows: 3, cols: 8 };
    }
  }, [type, size, length, lineCount, lineLength, width, height]);

  // Generate random character
  const getRandomChar = useCallback(() => {
    const allChars = [...ASCII_CHARS, ...SPECIAL_CHARS];
    return allChars[Math.floor(Math.random() * allChars.length)];
  }, []);

  // Initialize grid
  const initializeGrid = useCallback(() => {
    const { rows, cols } = gridDimensions;
    const newGrid: string[][] = [];

    for (let i = 0; i < rows; i++) {
      const row: string[] = [];
      for (let j = 0; j < cols; j++) {
        row.push(getRandomChar());
      }
      newGrid.push(row);
    }

    return newGrid;
  }, [gridDimensions, getRandomChar]);

  // Update grid characters
  const updateGrid = useCallback(() => {
    const { rows, cols } = gridDimensions;
    const currentGrid = gridRef.current;
    const newGrid = currentGrid.map((row) => [...row]);

    // Determine update count based on type
    let updatesCount: number;
    switch (type) {
      case "text":
        updatesCount = Math.min(Math.floor(Math.random() * 3) + 1, cols);
        break;
      case "multiline":
        updatesCount = Math.min(Math.floor(Math.random() * 3) + 2, rows * cols);
        break;
      case "xl":
        updatesCount = Math.min(8, Math.max(3, Math.floor(rows * cols * 0.01)));
        break;
      case "grid":
      default:
        updatesCount = Math.floor(Math.random() * 3) + 2;
        break;
    }

    for (let i = 0; i < updatesCount; i++) {
      const row = Math.floor(Math.random() * rows);
      const col = Math.floor(Math.random() * cols);
      newGrid[row][col] = getRandomChar();
    }

    gridRef.current = newGrid;
    setGrid(newGrid);
  }, [gridDimensions, getRandomChar, type]);

  // Animation loop
  useEffect(() => {
    const initialGrid = initializeGrid();
    gridRef.current = initialGrid;
    setGrid(initialGrid);
    setIsVisible(true);

    const animate = (timestamp: number) => {
      if (timestamp - lastUpdateRef.current >= animationInterval) {
        updateGrid();
        lastUpdateRef.current = timestamp;
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    const startTimer = setTimeout(() => {
      animationRef.current = requestAnimationFrame(animate);
    }, 100);

    return () => {
      clearTimeout(startTimer);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [initializeGrid, updateGrid, animationInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Render styles based on type
  const renderStyles = useMemo(() => {
    const baseStyle: React.CSSProperties = {
      color: "var(--text-color)",
      userSelect: "none",
      cursor: "default",
      ...style,
    };

    switch (type) {
      case "text":
        return {
          container: {
            display: "inline-block",
            fontSize: "inherit",
            lineHeight: "inherit",
            letterSpacing: "inherit",
            whiteSpace: "nowrap" as const,
            ...baseStyle,
          },
          grid: {
            display: "flex",
            gap: "0",
          },
        };

      case "multiline":
        return {
          container: {
            display: "flex",
            flexDirection: "column" as const,
            fontSize: "inherit",
            lineHeight: "inherit",
            letterSpacing: "inherit",
            ...baseStyle,
          },
          grid: {
            display: "flex",
            flexDirection: "column" as const,
            gap: "0.5rem",
          },
        };

      case "xl":
        return {
          container: {
            width: `${width}px`,
            height: `${height}px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            ...baseStyle,
          },
          grid: {
            display: "grid",
            gridTemplateColumns: `repeat(${gridDimensions.cols}, 1fr)`,
            gridTemplateRows: `repeat(${gridDimensions.rows}, 1fr)`,
            gap: "1px",
            fontSize: "14px",
            lineHeight: 1,
          },
        };

      case "grid":
      default:
        return {
          container: {
            display: "flex",
            flexDirection: "column" as const,
            alignItems: "center",
            justifyContent: "center",
            fontSize: size === "small" ? "0.75rem" : "0.875rem",
            lineHeight: "1.2",
            letterSpacing: "0.05em",
            ...baseStyle,
          },
          grid: {
            display: "flex",
            flexDirection: "column" as const,
            gap: "0.1em",
            whiteSpace: "pre" as const,
          },
        };
    }
  }, [type, size, width, height, style, gridDimensions]);

  // Animation variants
  const charVariants = {
    initial: { opacity: 0, scale: 0.8 },
    animate: {
      opacity: 1,
      scale: 1,
      transition: { duration: 0.3, ease: "easeOut" },
    },
    exit: {
      opacity: 0,
      scale: 0.8,
      transition: { duration: 0.2, ease: "easeIn" },
    },
  };

  const renderRow = (row: string[], rowIndex: number) => {
    if (type === "multiline") {
      const depth = Math.min(rowIndex, 3);
      return (
        <motion.div
          key={`line-${rowIndex}`}
          initial={{ opacity: 0, height: 0, scaleY: 0 }}
          animate={{ opacity: 1, height: "auto", scaleY: 1 }}
          exit={{ opacity: 0, height: 0, scaleY: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          style={{
            position: "relative",
            paddingLeft: `${(depth + 1) * 1.5}rem`,
            paddingTop: "0.5rem",
            paddingBottom: "0.5rem",
            textAlign: "left",
          }}
        >
          {/* Tree-like connectors for multiline */}
          <div
            style={{
              position: "absolute",
              left: "0",
              top: "50%",
              marginLeft: `${depth * 1.5}rem`,
              width: rowIndex === 0 ? "1rem" : `${depth * 1.5}rem`,
              height: "1px",
              backgroundColor: "var(--border-color)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "0",
              top: "0",
              bottom: "50%",
              width: "1px",
              marginLeft: `${depth * 1.5}rem`,
              backgroundColor: "var(--border-color)",
            }}
          />
          <span style={{ display: "inline-block", whiteSpace: "nowrap" }}>
            {row.map((char, colIndex) => renderChar(char, rowIndex, colIndex))}
          </span>
        </motion.div>
      );
    }

    return (
      <div
        key={rowIndex}
        style={{
          display: "flex",
          gap: type === "grid" ? "0.1em" : "0",
          justifyContent: type === "grid" ? "center" : "flex-start",
        }}
      >
        {row.map((char, colIndex) => renderChar(char, rowIndex, colIndex))}
      </div>
    );
  };

  const renderChar = (char: string, rowIndex: number, colIndex: number) => (
    <motion.span
      key={`${rowIndex}-${colIndex}`}
      data-cell={`${rowIndex}-${colIndex}`}
      variants={charVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      style={{
        display: "inline-block",
        minWidth: "1ch",
        textAlign: "center",
        transition: "color 0.2s ease",
        width: type === "xl" ? "14px" : undefined,
        height: type === "xl" ? "14px" : undefined,
      }}
    >
      {char}
    </motion.span>
  );

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          ref={containerRef}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          style={renderStyles.container}
          className={className}
        >
          <div style={renderStyles.grid}>
            {grid.map((row, rowIndex) => renderRow(row, rowIndex))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default UnifiedLoadingAnimation;

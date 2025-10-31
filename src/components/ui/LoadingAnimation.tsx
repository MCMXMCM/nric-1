import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface LoadingAnimationProps {
  size?: "small" | "large";
  className?: string;
  style?: React.CSSProperties;
}

// ASCII characters for the animation - visually distinctive and varied
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

// Special characters that look more "hacker-like"
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

const LoadingAnimation: React.FC<LoadingAnimationProps> = ({
  size = "large",
  className = "",
  style = {},
}) => {
  // Animations enabled on all platforms
  const [grid, setGrid] = useState<string[][]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const animationRef = useRef<number | null>(null);
  const gridRef = useRef<string[][]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Calculate grid dimensions based on size - memoized to prevent recreation
  const gridDimensions = React.useMemo(() => {
    if (size === "small") {
      return { rows: 3, cols: 8 };
    }
    return { rows: 16, cols: 32 };
  }, [size]);

  // Generate a random character - memoized to prevent recreation
  const getRandomChar = React.useCallback(() => {
    const allChars = [...ASCII_CHARS, ...SPECIAL_CHARS];
    return allChars[Math.floor(Math.random() * allChars.length)];
  }, []);

  // Initialize the grid - memoized to prevent recreation
  const initializeGrid = React.useCallback(() => {
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

  // Update random characters in the grid by mutating DOM spans instead of React state
  const updateGrid = React.useCallback(() => {
    const { rows, cols } = gridDimensions;
    const root = containerRef.current;
    if (!root) return;

    // Update 2-4 random positions per frame for smooth animation
    const updatesCount = Math.floor(Math.random() * 3) + 2;

    for (let i = 0; i < updatesCount; i++) {
      const row = Math.floor(Math.random() * rows);
      const col = Math.floor(Math.random() * cols);
      const cell = root.querySelector<HTMLSpanElement>(
        `span[data-cell="${row}-${col}"]`
      );
      if (cell) {
        cell.textContent = getRandomChar();
      }
    }
  }, [gridDimensions, getRandomChar]);

  // Start the animation
  useEffect(() => {
    const initialGrid = initializeGrid();
    gridRef.current = initialGrid;
    setGrid(initialGrid); // one-time render of initial grid
    setIsVisible(true);

    const animate = () => {
      updateGrid();
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
  }, [initializeGrid, updateGrid]);

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
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",

    fontSize: size === "small" ? "0.75rem" : "0.875rem",
    lineHeight: "1.2",
    letterSpacing: "0.05em",
    color: "var(--text-color)",
    ...style,
  };

  const gridStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "0.1em",
    whiteSpace: "pre",
    userSelect: "none",
    cursor: "default",
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    gap: "0.1em",
    justifyContent: "center",
  };

  const charVariants = {
    initial: {
      opacity: 0,
      scale: 0.8,
    },
    animate: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.3,
        ease: "easeOut",
      },
    },
    exit: {
      opacity: 0,
      scale: 0.8,
      transition: {
        duration: 0.2,
        ease: "easeIn",
      },
    },
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          style={containerStyle}
          className={className}
        >
          <div ref={containerRef} style={gridStyle}>
            {grid.map((row, rowIndex) => (
              <div key={rowIndex} style={rowStyle}>
                {row.map((char, colIndex) => (
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
                    }}
                  >
                    {char}
                  </motion.span>
                ))}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LoadingAnimation;

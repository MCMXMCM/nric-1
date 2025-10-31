import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface LoadingTextMultiLineProps {
  lineCount: number;
  lineLength: number;
  className?: string;
  style?: React.CSSProperties;
  speed?: "slow" | "normal" | "fast";
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

const LoadingTextMultiLine: React.FC<LoadingTextMultiLineProps> = ({
  lineCount,
  lineLength,
  className = "",
  style = {},
}) => {
  const [lines, setLines] = useState<string[][]>([]);
  const animationRef = useRef<number | null>(null);
  const linesRef = useRef<string[][]>([]);

  // Generate a random character
  const getRandomChar = useCallback(() => {
    const allChars = [...ASCII_CHARS, ...SPECIAL_CHARS];
    return allChars[Math.floor(Math.random() * allChars.length)];
  }, []);

  // Initialize lines
  const initializeLines = useCallback(() => {
    const newLines: string[][] = [];
    for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
      const line: string[] = [];
      for (let charIndex = 0; charIndex < lineLength; charIndex++) {
        line.push(getRandomChar());
      }
      newLines.push(line);
    }
    return newLines;
  }, [lineCount, lineLength, getRandomChar]);

  // Update random characters across all lines
  const updateLines = useCallback(() => {
    const currentLines = linesRef.current;
    const newLines = currentLines.map((line) => [...line]);

    // Update 2-4 random positions across all lines per frame
    const totalUpdates = Math.min(
      Math.floor(Math.random() * 3) + 2,
      lineCount * lineLength
    );

    for (let i = 0; i < totalUpdates; i++) {
      const lineIndex = Math.floor(Math.random() * lineCount);
      const charIndex = Math.floor(Math.random() * lineLength);
      newLines[lineIndex][charIndex] = getRandomChar();
    }

    linesRef.current = newLines;
    setLines(newLines);
  }, [lineCount, lineLength, getRandomChar]);

  // Start the animation
  useEffect(() => {
    const initialLines = initializeLines();
    linesRef.current = initialLines;
    setLines(initialLines);

    const animate = () => {
      updateLines();
      animationRef.current = requestAnimationFrame(animate);
    };

    // Start animation after a short delay
    const startTimer = setTimeout(() => {
      animationRef.current = requestAnimationFrame(animate);
    }, 100);

    return () => {
      clearTimeout(startTimer);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [initializeLines, updateLines]);

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

    fontSize: "inherit",
    lineHeight: "inherit",
    letterSpacing: "inherit",
    color: "var(--text-color)",
    userSelect: "none",
    cursor: "default",
    ...style,
  };

  const lineStyle: React.CSSProperties = {
    display: "inline-block",
    whiteSpace: "nowrap",
  };

  const charVariants = {
    initial: {
      scale: 0.9,
    },
    animate: {
      scale: 1,
      transition: {
        duration: 1,
        ease: "easeOut",
      },
    },
    exit: {
      scale: 0.9,
      transition: {
        duration: 0.1,
        ease: "easeIn",
      },
    },
  };

  const lineVariants = {
    initial: {
      opacity: 0,
      height: 0,
      scaleY: 0,
    },
    animate: {
      opacity: 1,
      height: "auto",
      scaleY: 1,
      transition: {
        duration: 0.2,
        ease: "easeOut",
      },
    },
    exit: {
      opacity: 0,
      height: 0,
      scaleY: 0,
      transition: {
        duration: 0.2,
        ease: "easeIn",
      },
    },
  };

  return (
    <motion.div
      data-testid="loading-text-multiline"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      style={containerStyle}
      className={className}
    >
      <AnimatePresence mode="sync">
        {lines.map((line, lineIndex) => {
          const depth = Math.min(lineIndex, 3); // Limit depth to 3 levels (0, 1, 2)

          return (
            <motion.div
              key={`line-${lineIndex}`}
              variants={lineVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={{
                position: "relative",
                paddingLeft: `${(depth + 1) * 1.5}rem`,
                paddingTop: "0.5rem",
                paddingBottom: "0.5rem",
                textAlign: "left",
              }}
            >
              {/* Horizontal connector */}
              <div
                style={{
                  position: "absolute",
                  left: "0",
                  top: "50%",
                  marginLeft: `${depth * 1.5}rem`,
                  width: lineIndex === 0 ? "1rem" : `${depth * 1.5}rem`,
                  height: "1px",
                  backgroundColor: "var(--border-color)",
                }}
              />
              {/* Vertical line (truncate at end for last item) */}
              <div
                style={{
                  position: "absolute",
                  left: "0",
                  opacity: 1,
                  top: "0",
                  bottom: "50%",
                  width: "1px",
                  marginLeft: `${depth * 1.5}rem`,
                  backgroundColor: "var(--border-color)",
                }}
              />
              <motion.span style={lineStyle}>
                {line.map((char, charIndex) => (
                  <motion.span
                    key={`${lineIndex}-${charIndex}-${char}`}
                    variants={charVariants}
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
              </motion.span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
};

export default LoadingTextMultiLine;

import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";

interface LoadingTextProps {
  length: number;
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

const LoadingText: React.FC<LoadingTextProps> = ({
  length,
  className = "",
  style = { color: "var(--text-color)" },
  speed = "normal",
}) => {
  const [chars, setChars] = useState<string[]>([]);
  const animationRef = useRef<number | null>(null);
  const charsRef = useRef<string[]>([]);
  const lastUpdateRef = useRef<number>(0);

  // Get animation interval based on speed
  const getAnimationInterval = useCallback(() => {
    switch (speed) {
      case "slow":
        return 300; // 300ms between updates for smoother animation
      case "fast":
        return 50; // 50ms between updates
      case "normal":
      default:
        return 100; // 100ms between updates
    }
  }, [speed]);

  // Generate a random character
  const getRandomChar = useCallback(() => {
    const allChars = [...ASCII_CHARS, ...SPECIAL_CHARS];
    return allChars[Math.floor(Math.random() * allChars.length)];
  }, []);

  // Initialize characters
  const initializeChars = useCallback(() => {
    const newChars: string[] = [];
    for (let i = 0; i < length; i++) {
      newChars.push(getRandomChar());
    }
    return newChars;
  }, [length, getRandomChar]);

  // Update random characters
  const updateChars = useCallback(() => {
    const currentChars = charsRef.current;
    const newChars = [...currentChars];

    // Update only 1 character per frame for smoother animation
    const index = Math.floor(Math.random() * length);
    newChars[index] = getRandomChar();

    charsRef.current = newChars;
    setChars(newChars);
  }, [length, getRandomChar]);

  // Start the animation
  useEffect(() => {
    const initialChars = initializeChars();
    charsRef.current = initialChars;
    setChars(initialChars);

    const animate = (timestamp: number) => {
      const interval = getAnimationInterval();

      if (timestamp - lastUpdateRef.current >= interval) {
        updateChars();
        lastUpdateRef.current = timestamp;
      }

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
  }, [initializeChars, updateChars, getAnimationInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const containerStyle: React.CSSProperties = {
    display: "inline-block",

    fontSize: "inherit",
    lineHeight: "inherit",
    letterSpacing: "inherit",

    whiteSpace: "nowrap",
    userSelect: "none",
    cursor: "default",
    ...style,
  };

  const charVariants = {
    initial: {
      opacity: 0,
      scale: 0.9,
    },
    animate: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.15,
        ease: "easeOut",
      },
    },
    exit: {
      opacity: 0,
      scale: 0.9,
      transition: {
        duration: 0.1,
        ease: "easeIn",
      },
    },
  };

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      style={containerStyle}
      className={className}
    >
      {chars.map((char, index) => (
        <motion.span
          key={`${index}-${char}`}
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
    </motion.span>
  );
};

export default LoadingText;

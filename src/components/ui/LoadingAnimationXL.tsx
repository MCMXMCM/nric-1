import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface LoadingAnimationXLProps {
  width: number;
  height: number;
  className?: string;
  style?: React.CSSProperties;
}

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

const LoadingAnimationXL: React.FC<LoadingAnimationXLProps> = ({
  width,
  height,
  className = "",
  style = {},
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [grid, setGrid] = useState<string[][]>([]);
  const gridRef = useRef<string[][]>([]);
  const rafRef = useRef<number | null>(null);

  // Fixed DOM-like font metrics
  const fontPx = 14; // ~0.875rem
  const cellW = fontPx * 1.1; // include horizontal gap
  const cellH = fontPx * 1.2; // include line-height spacing

  // Compute rows/cols to fill given dimensions
  const { rows, cols } = useMemo(() => {
    const c = Math.max(8, Math.floor(width / cellW));
    const r = Math.max(8, Math.floor(height / cellH));
    return { rows: r, cols: c };
  }, [width, height]);

  const getRandomChar = useCallback(() => {
    const all = [...ASCII_CHARS, ...SPECIAL_CHARS];
    return all[Math.floor(Math.random() * all.length)];
  }, []);

  const initGrid = useCallback(() => {
    const g: string[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: string[] = [];
      for (let c = 0; c < cols; c++) row.push(getRandomChar());
      g.push(row);
    }
    return g;
  }, [rows, cols, getRandomChar]);

  const updateGrid = useCallback(() => {
    const current = gridRef.current;
    const next = current.map((row) => [...row]);
    // update a handful of random cells per frame
    const updates = Math.min(8, Math.max(3, Math.floor(rows * cols * 0.01)));
    for (let i = 0; i < updates; i++) {
      const r = Math.floor(Math.random() * rows);
      const c = Math.floor(Math.random() * cols);
      next[r][c] = getRandomChar();
    }
    gridRef.current = next;
    setGrid(next);
  }, [rows, cols, getRandomChar]);

  useEffect(() => {
    const g = initGrid();
    gridRef.current = g;
    setGrid(g);
    // start RAF loop
    const loop = () => {
      updateGrid();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [initGrid, updateGrid]);

  const outerStyle: React.CSSProperties = {
    width: `${width}px`,
    height: `${height}px`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...style,
  };

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${cols}, ${cellW}px)`,
    gridTemplateRows: `repeat(${rows}, ${cellH}px)`,
    gap: `${Math.max(0, cellH - fontPx)}px ${Math.max(0, cellW - fontPx)}px`,

    fontSize: `${fontPx}px`,
    lineHeight: 1,
    userSelect: "none",
    color: "var(--text-color)",
  };

  return (
    <div ref={containerRef} className={className} style={outerStyle}>
      <div style={gridStyle}>
        {grid.map((row, r) =>
          row.map((char, c) => (
            <span
              key={`${r}-${c}`}
              style={{
                display: "inline-block",
                width: `${fontPx}px`,
                height: `${fontPx}px`,
                textAlign: "center",
                transition: "opacity 120ms ease",
              }}
            >
              {char}
            </span>
          ))
        )}
      </div>
    </div>
  );
};

export default LoadingAnimationXL;

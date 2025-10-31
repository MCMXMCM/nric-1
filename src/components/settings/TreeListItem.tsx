import React, { type ReactNode } from "react";

interface TreeListItemProps {
  children: ReactNode;
  isLast?: boolean;
  hasSubItems?: boolean;
  paddingTop?: string;
  paddingBottom?: string;
  onClick?: () => void;
  lineTop?: string;
  style?: React.CSSProperties;
}

export const TreeListItem: React.FC<TreeListItemProps> = ({
  children,
  isLast = false,
  hasSubItems = false,
  paddingTop = "0.25rem",
  paddingBottom = "0.25rem",
  lineTop = "50%",
  onClick,
  style = {},
}) => {
  const itemStyle: React.CSSProperties = {
    position: "relative",
    paddingLeft: "1.5rem",
    paddingTop,
    paddingBottom,
    cursor: onClick ? "pointer" : "default",
    ...style,
  };

  return (
    <li style={itemStyle} onClick={onClick}>
      {/* Horizontal line */}
      <div
        style={{
          position: "absolute",
          left: "0",
          top: lineTop,
          width: "1rem",
          height: "1px",
          backgroundColor: "var(--border-color)",
        }}
      />
      {/* Vertical line */}
      <div
        style={{
          position: "absolute",
          left: "0",
          top: "0",
          bottom: isLast ? `calc(100% - ${lineTop})` : hasSubItems ? "0" : "0",
          width: "1px",
          backgroundColor: "var(--border-color)",
        }}
      />
      {children}
    </li>
  );
};

interface TreeListProps {
  children: ReactNode;
  style?: React.CSSProperties;
}

export const TreeList: React.FC<TreeListProps> = ({ children, style = {} }) => {
  const defaultStyle: React.CSSProperties = {
    position: "relative",
    margin: "0 0 0 2rem",
    padding: 0,
    listStyleType: "none",
    ...style,
  };

  return <ul style={defaultStyle}>{children}</ul>;
};

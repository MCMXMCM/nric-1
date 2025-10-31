import React from "react";

interface SectionHeaderProps {
  title: string;
  paddingTop?: string;
  color?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  paddingTop = "1rem",
  color,
}) => {
  return (
    <div
      style={{
        textAlign: "left",
        paddingTop,
        width: "100%",
        display: "flex",
        justifyContent: "start",
        alignItems: "center",

        fontSize: "0.875rem",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        margin: 0,
      }}
    >
      <h4
        style={{
          margin: 0,
          padding: 0,
          fontSize: "0.875rem",
          fontWeight: "bold",
          color: color || "var(--text-color)",
        }}
      >
        {title}
      </h4>
    </div>
  );
};

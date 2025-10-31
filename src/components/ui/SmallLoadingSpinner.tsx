import React from "react";
import StandardLoader from "./StandardLoader";

interface SmallLoadingSpinnerProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Small ASCII loading spinner for route transitions.
 * Designed to work with persistent MainLayout navbar - only fills content area.
 */
const SmallLoadingSpinner: React.FC<SmallLoadingSpinnerProps> = ({
  className = "",
  style = {},
}) => {
  return (
    <StandardLoader
      message="Loading..."
      alignWithSplash={true}
      className={className}
      style={style}
    />
  );
};

export default SmallLoadingSpinner;

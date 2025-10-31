import React from "react";
// import { useContactRelayProgress } from "../../contexts/ContactRelayProgressContext";

interface OutboxProgressStatusProps {
  isMobile: boolean;
}

export const OutboxProgressStatus: React.FC<OutboxProgressStatusProps> = () => {
  // const { progress } = useContactRelayProgress();

  // // Show if running OR incomplete (not 100%)
  // if (
  //   !progress.isRunning &&
  //   (progress.isComplete || progress.percentage === 0)
  // ) {
  //   return null;
  // }

  const progressBarStyle: React.CSSProperties = {
    width: "100%",
    height: "2px",
    backgroundColor: "var(--border-color)",
    position: "relative",
    overflow: "hidden",
  };

  const progressFillStyle: React.CSSProperties = {
    height: "100%",
    // width: `${progress.percentage}%`,
    backgroundColor: "var(--ibm-mustard)",
    transition: "width 0.5s ease-out",
    position: "absolute",
    top: 0,
    left: 0,
  };

  return (
    <div style={progressBarStyle}>
      <div style={progressFillStyle} />
    </div>
  );
};

import React from "react";

/**
 * HapticProvider component - SIMPLIFIED
 * The useHaptic hook should now be used directly in components that need haptic feedback
 * This provider is kept for backward compatibility but no longer manages global haptic state
 */
const HapticProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return <>{children}</>;
};

export default HapticProvider;

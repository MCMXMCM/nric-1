import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useHaptic } from "use-haptic";

export interface RadialMenuOption {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  color?: string;
}

interface RadialMenuProps {
  options: RadialMenuOption[];
  size?: number;
  className?: string;
}

export const RadialMenu: React.FC<RadialMenuProps> = ({
  options,
  size = 28, // Balanced size - small enough to fit in rows, large enough to be usable
  className = "",
}) => {
  const { triggerHaptic } = useHaptic();
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedOption, setSelectedOption] = useState<RadialMenuOption | null>(
    null
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const dialRef = useRef<HTMLButtonElement>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const previousSelectedOptionRef = useRef<RadialMenuOption | null>(null);

  // Close menu when clicking outside or on touch end
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsDragging(false);
        setSelectedOption(null);
        previousSelectedOptionRef.current = null; // Reset haptic tracking
        // Clear radial menu active state
        document.body.removeAttribute("data-radial-menu-active");
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside, {
        passive: true,
      });
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("touchstart", handleClickOutside);
      };
    }
  }, [isOpen]);

  const handleOptionClick = (
    option: RadialMenuOption,
    event: React.MouseEvent | Event | any
  ) => {
    // Stop event propagation to prevent interference with router navigation
    // Only call stopPropagation if it's a real event with the method
    if (event && typeof event.stopPropagation === "function") {
      event.stopPropagation();
    }
    // Don't prevent default - let the navigation work normally

    option.onClick();
    setIsOpen(false);
    setIsDragging(false);
    setSelectedOption(null);
    previousSelectedOptionRef.current = null; // Reset haptic tracking
  };

  // Calculate which option is under the touch/mouse position
  const getOptionUnderPosition = useCallback(
    (clientX: number, clientY: number): RadialMenuOption | null => {
      if (!dialRef.current) return null;

      const dialRect = dialRef.current.getBoundingClientRect();
      const dialCenterX = dialRect.left + dialRect.width / 2;
      const dialCenterY = dialRect.top + dialRect.height / 2;

      // Calculate relative position from dial center
      const relativeX = clientX - dialCenterX;
      const relativeY = clientY - dialCenterY;

      // Only consider touches above the dial center (y < 0) since options are only above
      // Also ensure the touch is within a reasonable horizontal range
      if (relativeY >= 0 || Math.abs(relativeX) > 200) return null;

      // Check if position is over any option with generous touch areas
      for (let i = 0; i < options.length; i++) {
        const { x, y } = getMenuItemPosition(i);

        // Proportional touch detection area for easier selection
        // Extended area: 85px wide and 75px tall for better targeting with smaller buttons
        const buttonWidth = 100;
        const buttonHeight = 85;
        const halfWidth = buttonWidth / 2;
        const halfHeight = buttonHeight / 2;

        if (
          relativeX >= x - halfWidth &&
          relativeX <= x + halfWidth &&
          relativeY >= y - halfHeight &&
          relativeY <= y + halfHeight
        ) {
          return options[i];
        }
      }

      // If no direct hit, use directional selection for easier targeting
      // Find the closest option based on direction from dial center
      let closestOption = null;
      let closestDistance = Infinity;

      for (let i = 0; i < options.length; i++) {
        const { x, y } = getMenuItemPosition(i);
        const distance = Math.sqrt((relativeX - x) ** 2 + (relativeY - y) ** 2);

        // If touch is within a reasonable distance (180px), consider it a valid selection
        if (distance < 180 && distance < closestDistance) {
          closestDistance = distance;
          closestOption = options[i];
        }
      }

      return closestOption;
    },
    [options]
  );

  // Touch event handlers
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      // Note: Removed preventDefault() to avoid passive listener errors
      e.stopPropagation();

      // Prevent iOS text selection/highlighting
      document.getSelection()?.removeAllRanges();

      // Signal that radial menu is active to prevent pull-to-refresh
      document.body.setAttribute("data-radial-menu-active", "true");

      const touch = e.touches[0];
      touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

      // Haptic feedback for initial touch
      try {
        if (typeof triggerHaptic === "function") {
          triggerHaptic();
        }
      } catch (error) {
        // Silently handle haptic feedback errors
      }

      // Start press timer for long press detection
      pressTimerRef.current = setTimeout(() => {
        setIsOpen(true);
        setIsDragging(true);
        // Note: Haptic feedback for menu open removed - must be in original gesture context
      }, 200); // 200ms long press threshold
    },
    [triggerHaptic]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging || !isOpen) return;

      // Note: Removed preventDefault() to avoid passive listener errors
      e.stopPropagation();

      // Continue to prevent text selection during drag
      document.getSelection()?.removeAllRanges();

      const touch = e.touches[0];
      const option = getOptionUnderPosition(touch.clientX, touch.clientY);

      // Note: Haptic feedback for option selection removed - must be in original gesture context
      if (option !== previousSelectedOptionRef.current) {
        previousSelectedOptionRef.current = option;
        // Option selection tracking still works, just no haptic feedback
      }

      setSelectedOption(option);
    },
    [isDragging, isOpen, getOptionUnderPosition, triggerHaptic]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      // Note: Removed preventDefault() to avoid passive listener errors
      e.stopPropagation();

      // Capture selected option IMMEDIATELY to prevent race conditions
      const optionToExecute = selectedOption;

      // Clear radial menu active state
      document.body.removeAttribute("data-radial-menu-active");

      // Clear press timer
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }

      if (isDragging && optionToExecute) {
        // Note: Haptic feedback for option execution removed - must be in original gesture context
        // Execute the captured option
        handleOptionClick(optionToExecute, {} as React.MouseEvent);
      } else {
        // Close menu if no option was selected
        setIsOpen(false);
        setIsDragging(false);
        setSelectedOption(null);
        previousSelectedOptionRef.current = null; // Reset haptic tracking
      }
    },
    [isDragging, selectedOption, handleOptionClick, triggerHaptic]
  );

  // Mouse event handlers (for desktop testing)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Note: Removed preventDefault() to avoid potential issues
      touchStartPosRef.current = { x: e.clientX, y: e.clientY };

      // Note: Haptic feedback for initial mouse press removed - must be in original gesture context

      pressTimerRef.current = setTimeout(() => {
        setIsOpen(true);
        setIsDragging(true);
        // Note: Haptic feedback for menu open removed - must be in original gesture context
      }, 200);
    },
    [triggerHaptic]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !isOpen) return;

      const option = getOptionUnderPosition(e.clientX, e.clientY);

      // Note: Haptic feedback for option selection removed - must be in original gesture context
      if (option !== previousSelectedOptionRef.current) {
        previousSelectedOptionRef.current = option;
        // Option selection tracking still works, just no haptic feedback
      }

      setSelectedOption(option);
    },
    [isDragging, isOpen, getOptionUnderPosition, triggerHaptic]
  );

  const handleMouseUp = useCallback(() => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }

    if (isDragging && selectedOption) {
      // Note: Haptic feedback for option execution removed - must be in original gesture context
      handleOptionClick(selectedOption, {} as React.MouseEvent);
    } else {
      setIsOpen(false);
      setIsDragging(false);
      setSelectedOption(null);
      previousSelectedOptionRef.current = null; // Reset haptic tracking
    }
  }, [isDragging, selectedOption, handleOptionClick, triggerHaptic]);

  // Set up global mouse move/up listeners when dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Prevent text selection globally when menu is open
  useEffect(() => {
    if (isOpen) {
      const preventSelection = (e: Event) => {
        e.preventDefault();
        document.getSelection()?.removeAllRanges();
      };

      const preventContextMenu = (e: Event) => {
        e.preventDefault();
      };

      document.addEventListener("selectstart", preventSelection);
      document.addEventListener("contextmenu", preventContextMenu);
      document.addEventListener("touchstart", preventSelection, {
        passive: false,
      });

      return () => {
        document.removeEventListener("selectstart", preventSelection);
        document.removeEventListener("contextmenu", preventContextMenu);
        document.removeEventListener("touchstart", preventSelection);
      };
    }
  }, [isOpen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
      }
    };
  }, []);

  // Calculate positions for menu items in a 180-degree arc above the dial
  const getMenuItemPosition = (index: number) => {
    // Get the dial's current position relative to viewport
    const dialElement = dialRef.current;
    if (!dialElement) {
      // Fallback to default positioning if dial ref not available
      const radius = 200;

      // For single option, place it directly above (12 o'clock)
      if (options.length === 1) {
        return { x: 0, y: -radius };
      }

      // For multiple options, distribute them evenly across the upper semicircle
      const startAngle = -Math.PI;
      const endAngle = 0;
      const angleRange = endAngle - startAngle;
      const angleStep = angleRange / (options.length - 1);

      const angle = startAngle + index * angleStep;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      return { x, y };
    }

    const dialRect = dialElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const minSpace = 40;

    // Calculate dial center in viewport coordinates
    const dialCenterX = dialRect.left + dialRect.width / 2;
    const dialCenterY = dialRect.top + dialRect.height / 2;

    // For single option, place it directly above
    if (options.length === 1) {
      return { x: 0, y: -(dialCenterY - minSpace) };
    }

    // Calculate angles for all options
    const startAngle = -Math.PI;
    const endAngle = 0;
    const angleRange = endAngle - startAngle;
    const angleStep = angleRange / (options.length - 1);

    // The semicircle spans from angle -π (left) to 0 (right), with bottom at -π/2
    // Leftmost point: x = -radius (at angle -π, cos(-π) = -1)
    // Rightmost point: x = radius (at angle 0, cos(0) = 1)
    // Bottommost point: y = -radius (at angle -π/2, sin(-π/2) = -1)

    // For SYMMETRIC spacing, ensure the semicircle fits left-right
    // We need: -maxRadius >= -(dialCenterX - minSpace)  AND  maxRadius <= (viewportWidth - dialCenterX - minSpace)
    // This means: maxRadius <= dialCenterX - minSpace  AND  maxRadius <= viewportWidth - dialCenterX - minSpace
    // To be symmetric, use the minimum of left and right space
    const symmetricMaxRadius = Math.min(
      dialCenterX - minSpace,
      viewportWidth - dialCenterX - minSpace
    );

    // Also ensure it fits vertically (top and bottom)
    const verticalMaxRadius = dialCenterY - minSpace;

    // Use the minimum to fit everything
    let maxRadius = Math.min(symmetricMaxRadius, verticalMaxRadius);

    // Ensure minimum usable radius
    maxRadius = Math.max(maxRadius, 100);

    // Calculate this specific option's position with the symmetric radius
    const angle = startAngle + index * angleStep;
    const finalX = Math.cos(angle) * maxRadius;
    const finalY = Math.sin(angle) * maxRadius;

    return { x: finalX, y: finalY };
  };

  const getMenuItemStyle = (index: number) => {
    const { x, y } = getMenuItemPosition(index);
    const option = options[index];
    const isSelected = selectedOption === option;

    return {
      position: "absolute" as const,
      left: `${x}px`,
      top: `${y}px`,
      transform: `translate(-50%, -50%) scale(${isSelected ? 1.2 : 1})`,
      opacity: isOpen ? 1 : 0,
      visibility: isOpen ? ("visible" as const) : ("hidden" as const),
      transition: isOpen
        ? `all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) ${index * 80}ms`
        : "none",
      zIndex: 2147483647,
      pointerEvents: isOpen ? ("auto" as const) : ("none" as const),
    };
  };

  // Calculate connecting line from option to dial center (stopping 1rem away from dial edge)
  const getLineStyle = (index: number) => {
    const { x, y } = getMenuItemPosition(index);

    // Calculate the angle from dial center to option
    const angle = Math.atan2(y, x);
    const dialRadius = size * 0.4; // Half the dial size (radius of the dial)
    const stopDistance = 16; // 1rem = 16px away from dial edge
    const connectionDistance = dialRadius + stopDistance; // Distance from dial center to connection point

    // Calculate connection point coordinates (1rem away from dial edge)
    const connectionX = Math.cos(angle) * connectionDistance;
    const connectionY = Math.sin(angle) * connectionDistance;

    // Calculate line from option to connection point
    const deltaX = connectionX - x;
    const deltaY = connectionY - y;
    const lineLength = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const lineAngle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

    return {
      position: "absolute" as const,
      left: `${x}px`,
      top: `${y}px`,
      width: `${lineLength}px`,
      height: "1px", // Thinner line like in vintage control panels
      backgroundColor: "var(--text-color)", // Use text color for better visibility
      transformOrigin: "0 50%",
      transform: `rotate(${lineAngle}deg)`,
      opacity: isOpen ? 0.8 : 0,
      transition: `opacity 0.25s ease ${index * 80}ms`,
      zIndex: 2147483647,
    };
  };

  return (
    <>
      <style>
        {`
          .radial-menu {
            z-index: 2147483647 !important;
            position: relative !important;
            overflow: visible !important;
            isolation: isolate !important;
            -webkit-user-select: none !important;
            -webkit-touch-callout: none !important;
            -webkit-tap-highlight-color: transparent !important;
            user-select: none !important;
            touch-action: none !important;
          }
          .radial-menu * {
            z-index: 2147483647 !important;
            overflow: visible !important;
            -webkit-user-select: none !important;
            -webkit-touch-callout: none !important;
            -webkit-tap-highlight-color: transparent !important;
            user-select: none !important;
          }
          ${
            isOpen
              ? `
            body {
              -webkit-user-select: none !important;
              -webkit-touch-callout: none !important;
              user-select: none !important;
              overscroll-behavior-x: none !important;
              touch-action: none !important;
            }
            html {
              overscroll-behavior-x: none !important;
              touch-action: none !important;
            }
          `
              : ""
          }
        `}
      </style>
      <div
        ref={menuRef}
        className={`radial-menu ${className}`}
        style={{
          position: "relative",
          display: "inline-block",
          zIndex: 2147483647,
          overflow: "visible",
          isolation: "isolate",
          backgroundColor: "transparent",
          border: "none",
          outline: "none",
        }}
      >
        {/* Larger invisible touch area for mobile - positioned outside dial container */}
        <div
          style={{
            position: "absolute",
            top: "-30px",
            left: "-28px",
            width: `${size * 0.8 + 60}px`, // 60px larger (30px on each side)
            height: `${size * 0.8 + 60}px`,
            borderRadius: "50%",
            zIndex: 2147483646,
            cursor: "pointer",
            touchAction: "none",
            backgroundColor: "transparent",
            border: "none",
            outline: "none",
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
        />

        {/* Main dial button - Vintage control dial design */}
        <div
          style={{
            width: `${size}px`,
            height: `${size}px`,
            minWidth: `${size}px`,
            minHeight: `${size}px`,
            borderRadius: "50%",
            position: "relative",
            // Beige/tan background surface like the reference image
            background: `
              radial-gradient(circle at 30% 30%, #f5f0e8 0%, #e8dcc6 30%, #d4c4a0 70%, #c4b18a 100%)
            `,
            // Subtle shadow to give depth
            boxShadow: `
              0 2px 8px rgba(0, 0, 0, 0.15),
              inset 0 1px 2px rgba(255, 255, 255, 0.3),
              inset 0 -1px 2px rgba(0, 0, 0, 0.1)
            `,
            border: "1px solid #b8a082",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2147483647,
          }}
        >
          <button
            ref={dialRef}
            onClick={() => {
              try {
                triggerHaptic();
              } catch (error) {
                // Silently handle haptic feedback errors
              }
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            style={{
              width: `${size * 0.8}px`, // Inner knob is smaller
              height: `${size * 0.8}px`,
              minWidth: `${size * 0.8}px`,
              minHeight: `${size * 0.8}px`,
              borderRadius: "50%",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              zIndex: 2147483647,
              transform: isOpen ? "scale(0.95)" : "scale(1)", // Subtle press effect
              transition: "all 0.15s ease",
              touchAction: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
              WebkitTouchCallout: "none",
              WebkitTapHighlightColor: "transparent",
              outline: "none",
              // Dark metallic knob like the reference
              background: `
                radial-gradient(circle at 25% 25%, 
                  #4a4a4a 0%, 
                  #2d2d2d 30%, 
                  #1a1a1a 70%, 
                  #0d0d0d 100%
                )
              `,
              // Metallic rim effect
              boxShadow: `
                0 1px 3px rgba(0, 0, 0, 0.4),
                inset 0 1px 1px rgba(255, 255, 255, 0.1),
                inset 0 -1px 1px rgba(0, 0, 0, 0.3),
                inset 0 0 0 1px rgba(255, 255, 255, 0.05)
              `,
            }}
            title="Hold and drag for actions menu"
          >
            {/* Small indicator dot on the knob */}
            <div
              style={{
                position: "absolute",
                top: "15%",
                right: "25%",
                width: `${size * 0.08}px`,
                height: `${size * 0.08}px`,
                borderRadius: "50%",
                background: `
                  radial-gradient(circle at 30% 30%, 
                    #666 0%, 
                    #333 50%, 
                    #111 100%
                  )
                `,
                boxShadow: `
                  inset 0 1px 1px rgba(255, 255, 255, 0.1),
                  inset 0 -1px 1px rgba(0, 0, 0, 0.5)
                `,
              }}
            />
          </button>
        </div>

        {/* Menu options rendered via portal to avoid clipping */}
        {isOpen &&
          dialRef.current &&
          createPortal(
            <div
              // Fullscreen overlay to intercept clicks and close menu if user taps outside
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 2147483646,
                backgroundColor: "transparent",
              }}
              onClick={() => {
                setIsOpen(false);
                setIsDragging(false);
                setSelectedOption(null);
                previousSelectedOptionRef.current = null;
                document.body.removeAttribute("data-radial-menu-active");
              }}
              onTouchStart={() => {
                setIsOpen(false);
                setIsDragging(false);
                setSelectedOption(null);
                previousSelectedOptionRef.current = null;
                document.body.removeAttribute("data-radial-menu-active");
              }}
            >
              <div
                // Menu content container – stop propagation so clicks on menu don't close immediately
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                style={{
                  position: "fixed",
                  top: `${
                    dialRef.current.getBoundingClientRect().top +
                    dialRef.current.offsetHeight / 2
                  }px`,
                  left: `${
                    dialRef.current.getBoundingClientRect().left +
                    dialRef.current.offsetWidth / 2
                  }px`,
                  transform: "translate(-50%, -50%)",
                  pointerEvents: isOpen ? "auto" : "none",
                  zIndex: 2147483647,
                  overflow: "visible",
                }}
              >
                {/* Connection lines - single line from option to dial center */}
                {isOpen &&
                  options.map((_, index) => (
                    <div key={`line-${index}`} style={getLineStyle(index)} />
                  ))}

                {/* Menu items */}
                {options.map((option, index) => (
                  <div key={option.id} style={getMenuItemStyle(index)}>
                    <button
                      onClick={(e) => handleOptionClick(option, e)}
                      style={{
                        padding: "4px 8px",
                        // borderRadius: "4px",
                        border:
                          selectedOption === option
                            ? "2px solid var(--accent-color)"
                            : "1px solid var(--border-color)",
                        backgroundColor:
                          selectedOption === option
                            ? "var(--accent-color)"
                            : "var(--theme-aware-surface)",
                        color:
                          selectedOption === option
                            ? "white"
                            : option.color || "var(--text-color)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow:
                          selectedOption === option
                            ? "0 4px 16px rgba(0, 0, 0, 0.3)"
                            : "0 2px 8px rgba(0, 0, 0, 0.15)",
                        transition: "all 0.15s ease",
                        position: "relative",
                        zIndex: 2147483647,
                        pointerEvents: "none", // Prevent individual button clicks during drag
                        touchAction: "none",
                        userSelect: "none",
                        fontSize: "11px",
                        fontWeight: "500",
                        width: "75px",
                        textAlign: "center",
                        whiteSpace: "nowrap",
                        // Vintage control panel styling
                        background:
                          selectedOption === option
                            ? "var(--accent-color)"
                            : "var(--app-bg-color)",
                      }}
                    >
                      {option.label}
                    </button>
                  </div>
                ))}
              </div>
            </div>,
            document.body
          )}
      </div>
    </>
  );
};

import { useRef, useCallback, useEffect } from 'react';

/**
 * Hook to manage scroll restoration stabilization by preventing
 * layout-changing operations during the critical restoration period
 * while allowing user interactions
 */
export function useScrollRestorationStabilizer() {
  const layoutStabilizationLockRef = useRef<number>(0);
  const userInteractionLockRef = useRef<number>(0);
  const pendingOperationsRef = useRef<Array<() => void>>([]);

  // Check if we're in the layout stabilization period (blocks layout operations)
  const isLayoutStabilizing = useCallback(() => {
    return Date.now() < layoutStabilizationLockRef.current;
  }, []);

  // Check if we're blocking user interactions (shorter period)
  const isUserInteractionBlocked = useCallback(() => {
    return Date.now() < userInteractionLockRef.current;
  }, []);

  // Legacy method for backward compatibility
  const isStabilizing = useCallback(() => {
    return isLayoutStabilizing();
  }, [isLayoutStabilizing]);

  // Start stabilization period (called when scroll restoration begins)
  const startStabilization = useCallback((layoutDurationMs: number = 2000, userInteractionDurationMs: number = 500) => {
    layoutStabilizationLockRef.current = Date.now() + layoutDurationMs;
    userInteractionLockRef.current = Date.now() + userInteractionDurationMs;
    console.log(`🔒 Starting scroll stabilization: layout=${layoutDurationMs}ms, interaction=${userInteractionDurationMs}ms`);
  }, []);

  // Queue an operation to run after stabilization
  const queueOperation = useCallback((operation: () => void) => {
    if (isStabilizing()) {
      pendingOperationsRef.current.push(operation);
      console.log(`📋 Queued operation during stabilization (${pendingOperationsRef.current.length} pending)`);
    } else {
      // Execute immediately if not stabilizing
      operation();
    }
  }, [isStabilizing]);

  // Execute all pending operations (called when stabilization ends)
  const executePendingOperations = useCallback(() => {
    const operations = pendingOperationsRef.current.splice(0);
    if (operations.length > 0) {
      console.log(`🚀 Executing ${operations.length} queued operations after stabilization`);
      operations.forEach(op => {
        try {
          op();
        } catch (error) {
          console.warn('Error executing queued operation:', error);
        }
      });
    }
  }, []);

  // Monitor stabilization status and execute pending operations when done
  useEffect(() => {
    if (layoutStabilizationLockRef.current === 0) return;

    const checkInterval = setInterval(() => {
      if (!isLayoutStabilizing()) {
        clearInterval(checkInterval);
        executePendingOperations();
      }
    }, 100);

    return () => clearInterval(checkInterval);
  }, [isLayoutStabilizing, executePendingOperations]);

  // Clear all pending operations (useful for cleanup)
  const clearPendingOperations = useCallback(() => {
    pendingOperationsRef.current = [];
  }, []);

  return {
    isStabilizing,
    isLayoutStabilizing,
    isUserInteractionBlocked,
    startStabilization,
    queueOperation,
    executePendingOperations,
    clearPendingOperations,
  };
}

// Global stabilizer instance for cross-component coordination
let globalStabilizer: ReturnType<typeof useScrollRestorationStabilizer> | null = null;

export function getGlobalScrollStabilizer() {
  if (!globalStabilizer) {
    // Create a non-React implementation for global use
    let layoutStabilizationLockTime = 0;
    let userInteractionLockTime = 0;
    const pendingOperations: Array<() => void> = [];

    globalStabilizer = {
      isStabilizing: () => Date.now() < layoutStabilizationLockTime,
      isLayoutStabilizing: () => Date.now() < layoutStabilizationLockTime,
      isUserInteractionBlocked: () => Date.now() < userInteractionLockTime,
      startStabilization: (layoutDurationMs: number = 2000, userInteractionDurationMs: number = 500) => {
        layoutStabilizationLockTime = Date.now() + layoutDurationMs;
        userInteractionLockTime = Date.now() + userInteractionDurationMs;
        console.log(`🔒 Starting global scroll stabilization: layout=${layoutDurationMs}ms, interaction=${userInteractionDurationMs}ms`);
      },
      queueOperation: (operation: () => void) => {
        if (Date.now() < layoutStabilizationLockTime) {
          pendingOperations.push(operation);
          console.log(`📋 Queued global operation during stabilization (${pendingOperations.length} pending)`);
        } else {
          operation();
        }
      },
      executePendingOperations: () => {
        const operations = pendingOperations.splice(0);
        if (operations.length > 0) {
          console.log(`🚀 Executing ${operations.length} queued global operations`);
          operations.forEach(op => {
            try {
              op();
            } catch (error) {
              console.warn('Error executing queued global operation:', error);
            }
          });
        }
      },
      clearPendingOperations: () => {
        pendingOperations.length = 0;
      },
    };
  }

  return globalStabilizer;
}

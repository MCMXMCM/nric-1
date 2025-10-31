import React, { useRef, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import { nip19 } from "nostr-tools";
import type { Metadata } from "../../types/nostr/types";
import { useVirtualScrollRestoration } from "../../hooks/useVirtualScrollRestoration";
import { useBatchedMetadataLoading } from "../../hooks/useBatchedMetadataLoading";
import UserInfoCard from "../UserInfoCard";

interface VirtualizedContactsListProps {
  pubkeyHex: string;
  relayUrls: string[];
  mode: "followers" | "following";
  allPubkeys: string[];
  isLoading: boolean;
  error: string | null;
  getDisplayNameForPubkey: (pubkey: string) => string;
  addDisplayNamesFromMetadata: (metadata: Record<string, Metadata>) => void;
}

const BATCH_SIZE = 10; // Load metadata in smaller batches to avoid rate limiting
const OVERSCAN = 3; // Reduced overscan to minimize concurrent requests

export const VirtualizedContactsList: React.FC<
  VirtualizedContactsListProps
> = ({
  pubkeyHex,
  relayUrls,
  mode,
  allPubkeys,
  isLoading,
  error,
  getDisplayNameForPubkey,
  addDisplayNamesFromMetadata,
}) => {
  const navigate = useNavigate();
  const parentRef = useRef<HTMLDivElement>(null);

  // Track measured heights for dynamic sizing (by pubkey)
  const measuredHeights = useRef<Record<string, number>>({});

  // Create virtualizer with dynamic height support
  const virtualizer = useVirtualizer({
    count: allPubkeys.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(
      (index) => {
        // Check if we have a measured size for this contact
        const pubkey = allPubkeys[index];
        if (pubkey && measuredHeights.current[pubkey]) {
          return measuredHeights.current[pubkey];
        }
        // Default estimated height - increased to accommodate UserInfoCard and placeholder properly
        return 130;
      },
      [allPubkeys]
    ),
    overscan: OVERSCAN,
    getItemKey: (index) => allPubkeys[index] || `contact-${index}`,
  });

  // Guard: if the parent scroll element is not mounted yet, avoid rendering heavy content
  const parentReady = Boolean(parentRef.current);

  // Virtual scroll restoration with TanStack Router integration
  useVirtualScrollRestoration(
    virtualizer,
    parentRef.current,
    `profile-contacts:${mode}:${pubkeyHex || "unknown"}`,
    {
      enabled: true,
      saveDebounceMs: 100,
      maxAge: 30 * 60 * 1000, // 30 minutes
      minItemCount: 5, // Wait for at least 5 contacts before attempting restoration
      waitForStableData: true, // Wait for data to stabilize to prevent flash/jitter
      getCurrentNoteIds: () => allPubkeys,
    }
  );

  // Calculate visible range for batched metadata loading
  const visibleRange = useMemo(() => {
    const range = virtualizer.getVirtualItems();
    if (range.length === 0) return { start: 0, end: 0 };

    const start = Math.max(0, range[0].index - OVERSCAN);
    const end = Math.min(
      allPubkeys.length,
      range[range.length - 1].index + OVERSCAN + 1
    );

    return { start, end };
  }, [virtualizer, allPubkeys.length]);

  // Batched metadata loading DISABLED - UserInfoCard handles it with visibility detection
  // This prevents overwhelming relays with too many concurrent requests
  const { loadedMetadata } = useBatchedMetadataLoading({
    allPubkeys,
    relayUrls,
    batchSize: BATCH_SIZE,
    overscan: OVERSCAN,
    visibleRange,
    enabled: false, // Fully disabled - UserInfoCard loads on visibility
  });

  // Update display names when new metadata is loaded (from UserInfoCard)
  useEffect(() => {
    if (loadedMetadata && Object.keys(loadedMetadata).length > 0) {
      addDisplayNamesFromMetadata(loadedMetadata);
    }
  }, [loadedMetadata, addDisplayNamesFromMetadata]);

  // Batch calculations removed - not needed with visibility-based loading

  // Navigation handler
  const navigateToProfile = useCallback(
    (pubkey: string) => {
      try {
        const npub = nip19.npubEncode(pubkey);
        navigate({
          to: `/npub/${npub}`,
          state: true,
        });
      } catch (error) {
        console.error("Failed to encode pubkey to npub:", error);
      }
    },
    [navigate]
  );

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "200px",
        }}
      >
        <div>Loading {mode}...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "200px",
          color: "var(--error-color)",
        }}
      >
        <div>
          Error loading {mode}: {error}
        </div>
      </div>
    );
  }

  if (allPubkeys.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "200px",
          color: "var(--muted-color)",
        }}
      >
        <div>No {mode} found</div>
      </div>
    );
  }

  // ResizeObserver-enabled item wrapper for stable dynamic height measurement
  const VirtualizedContactItem: React.FC<{
    virtualItem: VirtualItem;
    pubkey: string;
    children: React.ReactNode;
  }> = ({ virtualItem, pubkey, children }) => {
    const itemRef = useRef<HTMLDivElement>(null);
    const lastMeasuredHeight = useRef<number>(0);

    useEffect(() => {
      if (!itemRef.current) return;

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const newHeight = entry.contentRect.height;
          const delta = Math.abs(newHeight - lastMeasuredHeight.current);
          if (delta > 10) {
            lastMeasuredHeight.current = newHeight;
            measuredHeights.current[pubkey] = newHeight;
            // Debounced remeasurement for stability
            setTimeout(() => {
              if (itemRef.current) {
                requestAnimationFrame(() => {
                  if (itemRef.current) {
                    virtualizer.measureElement(itemRef.current);
                  }
                });
              }
            }, 50);
          }
        }
      });

      resizeObserver.observe(itemRef.current);
      return () => resizeObserver.disconnect();
    }, [pubkey]);

    return (
      <div
        ref={itemRef}
        data-index={virtualItem.index}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          minHeight: virtualItem.size,
          transform: `translateY(${virtualItem.start}px)`,
        }}
      >
        {children}
      </div>
    );
  };

  return (
    <div
      ref={parentRef}
      style={{
        height: "100%",
        maxHeight: "100vh", // Ensure a viewport-bounded scroll container on mobile
        overflow: "auto",
        position: "relative",
      }}
    >
      {parentReady && (
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem: VirtualItem) => {
            const pubkey = allPubkeys[virtualItem.index];

            if (!pubkey) return null;

            const isLast = virtualItem.index === allPubkeys.length - 1;

            return (
              <VirtualizedContactItem
                key={pubkey}
                virtualItem={virtualItem}
                pubkey={pubkey}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "0.75rem",
                    borderBottom: isLast
                      ? "none"
                      : "1px solid var(--border-color)",
                    cursor: "pointer",
                  }}
                  onClick={() => navigateToProfile(pubkey)}
                  title="Click to view profile"
                >
                  <UserInfoCard
                    pubkeyHex={pubkey}
                    metadata={loadedMetadata}
                    getDisplayNameForPubkey={getDisplayNameForPubkey}
                    size={50}
                  />
                </div>
              </VirtualizedContactItem>
            );
          })}
        </div>
      )}

      {/* Debug info - simplified for visibility-based loading */}
      {import.meta.env.DEV && (
        <div
          style={{
            position: "fixed",
            bottom: "10px",
            right: "10px",
            background: "var(--bg-color)",
            border: "1px solid var(--border-color)",
            padding: "0.5rem",
            fontSize: "0.75rem",
            zIndex: 1000,
          }}
        >
          <div>Total: {allPubkeys.length}</div>
          <div>
            Visible: {parentReady ? virtualizer.getVirtualItems().length : 0}
          </div>
          <div>Mode: Visibility-based loading</div>
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useMemo, useCallback, useRef } from "react";
import { useParams } from "@tanstack/react-router";
import ProfileNotesFeed from "./ProfileNotesFeed";
import { useNostrifyFeed } from "../../hooks/useNostrifyFeed";
import { useNostrFeedState } from "../../hooks/useNostrFeedState";
import { useNostrifyMigration } from "../../contexts/NostrifyMigrationProvider";
import { DEFAULT_RELAY_URLS } from "../../utils/nostr/constants";
import { decodeRouteParam } from "../../utils/profileUtils";
import { useUniversalHashtagHandler } from "../../utils/hashtagNavigation";
import { useDisplayNames } from "../../hooks/useDisplayNames";
import { useUIStore } from "../lib/useUIStore";
import { trackProfileView } from "../../utils/outboxIntegration";

const ProfileNotesRoute: React.FC = () => {
  const state = useNostrFeedState();
  const { npub: routeParam } = useParams({ strict: false }) as { npub: string };
  const outboxModeEnabled = useUIStore((s) => s.outboxMode);
  const scrollToTopRef = useRef<(() => void) | null>(null);

  // Decode route parameter to get pubkeyHex
  const { hex: pubkeyHex } = decodeRouteParam(routeParam);

  // Get relay URLs from Nostrify migration context
  const { relayUrls: nostrifyRelayUrls } = useNostrifyMigration();

  // Use nostrifyRelayUrls directly (no complex blending)
  const relayUrls = useMemo(() => {
    return nostrifyRelayUrls && nostrifyRelayUrls.length > 0
      ? nostrifyRelayUrls
      : DEFAULT_RELAY_URLS;
  }, [nostrifyRelayUrls]);

  // Track profile view for background outbox discovery
  useEffect(() => {
    if (pubkeyHex) {
      trackProfileView(pubkeyHex, outboxModeEnabled);
    }
  }, [pubkeyHex, outboxModeEnabled]);

  // Display names resolver
  const { getDisplayNameForPubkey } = useDisplayNames(relayUrls);
  const displayName = pubkeyHex ? getDisplayNameForPubkey(pubkeyHex) : "";

  // Profile filter - prevent empty author array
  const profileFilter = useMemo(() => {
    if (!pubkeyHex) return null;
    return { kinds: [1, 6], authors: [pubkeyHex], limit: 20 };
  }, [pubkeyHex]);

  // Only enable query when we have BOTH pubkey and valid relays
  const queryEnabled = useMemo(() => {
    return Boolean(pubkeyHex && relayUrls.length > 0);
  }, [pubkeyHex, relayUrls]);

  const feed = useNostrifyFeed({
    relayUrls,
    filter: profileFilter || { kinds: [1, 6], authors: [], limit: 20 },
    enabled: queryEnabled,
    pageSize: 20,
    showReplies: true,
    showReposts: true,
  });

  // Debug logging - consolidated
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("🔍 ProfileNotesRoute state:", {
        pubkey: pubkeyHex?.slice(0, 8),
        relaysReady: relayUrls.length > 0,
        queryEnabled,
        feedLoading: feed.isLoading,
        feedDataLength: feed.data?.length || 0,
        feedError: feed.error?.message || null,
      });
    }
  }, [
    pubkeyHex,
    relayUrls,
    queryEnabled,
    feed.isLoading,
    feed.data,
    feed.error,
  ]);

  // Universal hashtag click handler
  const handleHashtagClick = useUniversalHashtagHandler();

  // Read UI toggles from global UI store
  const { useAscii: uiUseAscii, useColor: uiUseColor } = useUIStore((s) => ({
    useAscii: s.useAscii,
    useColor: s.useColor,
  }));

  // Generate unique storage key for scroll restoration
  const storageKey = useMemo(() => {
    return pubkeyHex
      ? `profile-notes-${pubkeyHex.slice(0, 16)}`
      : "profile-notes";
  }, [pubkeyHex]);

  // Handle pull-to-refresh - similar to main feed
  const handleRefresh = useCallback(async () => {
    console.log("🔄 Profile feed refresh: Refreshing profile notes");
    
    try {
      // Clear scroll restoration storage for this profile
      try {
        sessionStorage.removeItem(storageKey);
        sessionStorage.removeItem("virtualScrollRestorationLock");
        sessionStorage.removeItem("bufferRestorationActive");
      } catch {}

      // Refresh the feed data
      await feed.refresh();

      // Wait for the new data to arrive and render
      await new Promise((r) => setTimeout(r, 300));

      // Force scroll to top
      if (scrollToTopRef.current) {
        scrollToTopRef.current();
      }
      
      console.log("✅ Profile feed refresh completed");
    } catch (error) {
      console.error("❌ Profile feed refresh failed:", error);
    }
  }, [feed, storageKey]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <ProfileNotesFeed
        notes={feed.data || []}
        isLoadingNotes={feed.isLoading}
        profileDisplayName={displayName}
        metadata={state.metadata}
        asciiCache={state.asciiCache}
        setAsciiCache={state.setAsciiCache}
        isDarkMode={state.isDarkMode}
        useAscii={uiUseAscii}
        useColor={uiUseColor}
        copiedPubkeys={state.copiedPubkeys}
        setCopiedPubkeys={state.setCopiedPubkeys}
        setFullScreenImage={state.setFullScreenImage}
        onAsciiRendered={(id, ascii) =>
          state.setAsciiCache?.((prev) => ({
            ...prev,
            [id]: { ascii, timestamp: Date.now() },
          }))
        }
        onMediaLoadError={() => {}}
        getDisplayNameForPubkey={getDisplayNameForPubkey}
        imageMode={state.imageMode}
        readRelayUrls={relayUrls}
        writeRelayUrls={relayUrls}
        showZapModal={false}
        setShowZapModal={() => {}}
        updateZapModalState={() => {}}
        showRepostModal={false}
        setShowRepostModal={() => {}}
        updateRepostModalState={() => {}}
        onHashtagClick={handleHashtagClick}
        isAnyModalOpen={false}
        hasMore={feed.hasNextPage}
        isFetchingNextPage={feed.isFetchingNextPage}
        onLoadMore={() => feed.fetchNextPage()}
        onRefresh={handleRefresh}
        onScrollToTopRef={scrollToTopRef}
        storageKey={storageKey}
        debug={import.meta.env.DEV}
      />
    </div>
  );
};

export default ProfileNotesRoute;

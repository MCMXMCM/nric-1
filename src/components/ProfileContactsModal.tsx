import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { navigateBackOrHome } from "../utils/modalUrlState";
import { useDisplayNames } from "../hooks/useDisplayNames";
import { useNostrifyProfileContacts } from "../hooks/useNostrifyProfile";
import { useScrollRestoration } from "../hooks/useScrollRestoration";
import { useSessionState } from "../hooks/useSessionState";
import { VirtualizedContactsList } from "./profile/VirtualizedContactsList";
import { nip19 } from "nostr-tools";
import { useUnifiedBatchMetadata } from "../hooks/useUnifiedMetadata";
import { getGlobalRelayPool } from "../utils/nostr/relayConnectionPool";
import type { Event } from "nostr-tools";

interface ProfileContactsModalProps {
  pubkeyHex: string;
  relayUrls: string[];
  mode: "followers" | "following";
  mountWithinContainer?: boolean;
}

const ProfileContactsModal: React.FC<ProfileContactsModalProps> = ({
  pubkeyHex,
  relayUrls,
  mode,
  mountWithinContainer = false,
}) => {
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(() => {
    try {
      return window.innerWidth < 640;
    } catch {
      return false;
    }
  });
  const contentRef = useRef<HTMLDivElement>(null);
  const [allPubkeys, setAllPubkeys] = useState<string[]>([]);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [search, setSearch] = useSessionState<string>(
    `contacts:search:${mode}:${pubkeyHex}`,
    ""
  );
  const [relaySearchResults, setRelaySearchResults] = useState<string[]>([]);
  const [isRelaySearching, setIsRelaySearching] = useState(false);

  // Use the display names hook
  const { getDisplayNameForPubkey, addDisplayNamesFromMetadata } =
    useDisplayNames(relayUrls);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Decide whether to use NIP-50 relay search or client-side filtering
  const shouldUseRelaySearch = allPubkeys.length > 200; // Use relay search for larger lists

  // Proactively load metadata for small lists (client-side approach)
  const { metadata: batchMetadata } = useUnifiedBatchMetadata({
    pubkeys: shouldUseRelaySearch ? [] : allPubkeys,
    relayUrls,
    enabled: !shouldUseRelaySearch && allPubkeys.length > 0,
  });

  // When batch metadata loads, update the display names cache
  useEffect(() => {
    if (batchMetadata && Object.keys(batchMetadata).length > 0) {
      addDisplayNamesFromMetadata(batchMetadata);
    }
  }, [batchMetadata, addDisplayNamesFromMetadata]);

  // Perform search (either relay or client-side)
  const performSearch = useCallback(async () => {
    const searchQuery = search.trim();

    if (!searchQuery) {
      setRelaySearchResults([]);
      return;
    }

    // If using relay search, query the relay
    if (shouldUseRelaySearch) {
      setIsRelaySearching(true);
      try {
        const pool = getGlobalRelayPool();

        // NIP-50 'search' filter is only supported by select relays
        const searchRelays = [
          "wss://relay.nostr.band",
          "wss://search.nos.today",
        ];

        // Create filter with NIP-50 search within the followers/following list
        const filter: any = {
          kinds: [0],
          authors: allPubkeys, // Limit search to these authors
          search: searchQuery,
          limit: Math.min(allPubkeys.length, 500), // Cap results
        };

        const events: Event[] = await pool.querySync(searchRelays, filter);

        // Extract pubkeys from results and also update display names cache
        const resultPubkeys = Array.from(
          new Set(events.map((ev: any) => ev.pubkey).filter(Boolean))
        );

        setRelaySearchResults(resultPubkeys);

        // Cache metadata from relay search results
        const metadata: Record<string, any> = {};
        events.forEach((ev: any) => {
          try {
            const content = JSON.parse(ev.content || "{}");
            metadata[ev.pubkey] = {
              name: content.name || "",
              display_name: content.display_name || content.displayName || "",
              picture: content.picture || "",
              about: content.about || "",
              nip05: content.nip05 || "",
              website: content.website || content.lud16 || "",
            };
          } catch {
            // Ignore parse errors
          }
        });

        if (Object.keys(metadata).length > 0) {
          addDisplayNamesFromMetadata(metadata);
        }
      } catch (error) {
        console.warn(
          "NIP-50 relay search failed, falling back to client-side filtering:",
          error
        );
        // Fallback to empty results - will use client-side filtering below
        setRelaySearchResults([]);
      } finally {
        setIsRelaySearching(false);
      }
    }
  }, [search, allPubkeys, shouldUseRelaySearch, addDisplayNamesFromMetadata]);

  // Handle Enter key in search input
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        performSearch();
      }
    },
    [performSearch]
  );

  // Nostrify contacts query - use Nostrify transport for consistency
  const contactsQuery = useNostrifyProfileContacts({
    pubkeyHex,
    relayUrls,
    mode,
    enabled: Boolean(pubkeyHex && relayUrls.length > 0),
    realtimeEnabled: false,
  });

  // Scroll restoration for the scrollable content area
  useScrollRestoration(
    contentRef,
    `profile-contacts:${mode}:${pubkeyHex || "unknown"}`
  );

  // Sync query data into local state for filtering/pagination logic
  useEffect(() => {
    if (contactsQuery.contacts.length > 0) {
      setAllPubkeys(contactsQuery.contacts);
    }
  }, [contactsQuery.contacts]);

  // Reflect query error into local error state (used for display)
  useEffect(() => {
    if (contactsQuery.error) {
      const err = contactsQuery.error as any;
      setContactsError(err?.message || "Failed to load list");
    } else {
      setContactsError(null);
    }
  }, [contactsQuery.error]);

  // Filtered pubkeys by search (NIP-50 relay search for large lists, client-side for small lists)
  const filteredPubkeys = useMemo(() => {
    // If using relay search and we have results, use those
    if (shouldUseRelaySearch && search.trim()) {
      return relaySearchResults;
    }

    // Otherwise use client-side filtering
    if (!search) return allPubkeys;
    const query = search.toLowerCase().trim();
    return allPubkeys.filter((pk) => {
      // Get the display name (with empty string fallback)
      const name = (getDisplayNameForPubkey(pk) || "").toLowerCase();

      // Check if pubkey matches query
      if (pk.toLowerCase().includes(query)) {
        return true;
      }

      // Check if display name matches query
      if (name && name.includes(query)) {
        return true;
      }

      // Also search by npub encoding for flexibility
      try {
        const npub = nip19.npubEncode(pk);
        if (npub.toLowerCase().includes(query)) {
          return true;
        }
      } catch {
        // If encoding fails, just skip this check
      }

      return false;
    });
  }, [
    allPubkeys,
    search,
    shouldUseRelaySearch,
    relaySearchResults,
    getDisplayNameForPubkey,
  ]);

  // Unified back handling via helper to avoid native history on iOS
  const handleBack = useCallback(() => {
    try {
      navigateBackOrHome(navigate);
    } catch {
      navigate({
        to: "/",
        search: {
          hashtag: "",
          note: "",
          action: "",
          thread: "",
          reply: "",
          zap: "",
          repost: "",
          passphrasePrompt: false,
        },
        replace: false,
      });
    }
  }, [navigate]);

  const containerStyle: React.CSSProperties = mountWithinContainer
    ? {
        position: "relative",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "transparent",
        display: "flex",
        flexDirection: "column",
        zIndex: 1,
        paddingTop: 0,
        paddingBottom: 0,
        height: "100%",
        minHeight: 0,
      }
    : {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: isMobile
          ? "var(--app-bg-color )"
          : "rgba(0, 0, 0, 0.5)",
        display: "flex",
        flexDirection: "column",
        zIndex: 2000,
        // Push modal content below the main app header (mobile and desktop)
        paddingTop: isMobile
          ? "calc(50px + var(--safe-area-inset-top))"
          : "60px",
        paddingBottom: isMobile ? "var(--safe-area-inset-bottom)" : "24px",
      };

  return (
    <div
      style={containerStyle}
      onClick={mountWithinContainer ? undefined : handleBack}
    >
      <div
        style={{
          flex: 1,
          height: "100%", // Ensure fixed height for virtualization scroll container
          backgroundColor: "var(--app-bg-color)",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          width: "100%",
          maxWidth: mountWithinContainer ? "100%" : "1000px",
          margin: mountWithinContainer ? 0 : "0 auto",
        }}
        onClick={(e) =>
          mountWithinContainer ? undefined : e.stopPropagation()
        }
      >
        {/* Header: hide when embedded */}
        {!mountWithinContainer && (
          <div
            style={{
              width: "100%",
              height: "60px",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              backgroundColor: "var(--app-bg-color )",
              borderBottom: "1px dotted var(--border-color)",
              position: "relative",
              flexShrink: 0,
            }}
          >
            <button
              onClick={handleBack}
              style={{
                backgroundColor: "transparent",
                color: "var(--text-color)",
                border: "1px dotted var(--border-color)",
                padding: "0.25rem 0.5rem",
                cursor: "pointer",

                fontSize: "0.875rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                height: "2rem",
                justifyContent: "center",
                minHeight: "unset",
              }}
              title="Close"
            >
              {"< Back"}
            </button>
            <div
              style={{
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)",
                pointerEvents: "none",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  padding: 0,
                  color: "var(--text-color)",

                  fontSize: "1rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                {mode === "followers" ? "Followers" : "Following"} (
                {filteredPubkeys.length})
              </h3>
            </div>
          </div>
        )}

        {/* Centered content wrapper (styled like Notes list) */}
        <div
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "center",
            flex: 1,
            height: "100%", // Propagate explicit height to inner containers
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: mountWithinContainer ? "100%" : "1000px",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              height: "100%", // Ensure the list region has a bounded height
              borderBottom: "1px dotted var(--border-color)",
            }}
          >
            {/* Section title to match notes list heading */}
            <div
              style={{
                position: "relative",
                // margin: "0.5rem 0",
                // height: "1.5rem",
              }}
            >
              <div
                style={{
                  position: "relative",
                  left: "2rem",
                  transform: "translateX(-50%)",
                  color: "var(--text-color)",

                  fontSize: "0.75rem",
                  paddingBottom: "0.5rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                }}
              >
                {mode === "followers" ? "Followers" : "Following"}
              </div>
            </div>

            {/* Search */}
            <div style={{ padding: "0 0 1rem 0", flexShrink: 0 }}>
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center",
                }}
              >
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={
                    shouldUseRelaySearch
                      ? "Search (Enter to search)..."
                      : "Search (Enter to search)..."
                  }
                  disabled={isRelaySearching && shouldUseRelaySearch}
                  style={{
                    flex: 1,
                    height: "2rem",
                    backgroundColor: "transparent",
                    color: "var(--text-color)",
                    border: "1px dotted var(--border-color)",
                    padding: "0.75rem",
                    opacity: isRelaySearching ? 0.7 : 1,
                    fontSize: "0.875rem",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  onClick={performSearch}
                  disabled={
                    !search.trim() || (isRelaySearching && shouldUseRelaySearch)
                  }
                  style={{
                    height: "2rem",
                    minHeight: "2rem",
                    padding: "0 1rem",
                    backgroundColor:
                      !search.trim() ||
                      (isRelaySearching && shouldUseRelaySearch)
                        ? "var(--muted-color)"
                        : "var(--btn-primary-color)",
                    color: "var(--app-bg-color)",
                    border: "1px dotted var(--border-color)",
                    cursor:
                      !search.trim() ||
                      (isRelaySearching && shouldUseRelaySearch)
                        ? "default"
                        : "pointer",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    borderRadius: "2px",
                    transition: "opacity 0.2s",
                    opacity:
                      !search.trim() ||
                      (isRelaySearching && shouldUseRelaySearch)
                        ? 0.6
                        : 1,
                  }}
                  title={
                    isRelaySearching
                      ? "Searching..."
                      : "Search (or press Enter)"
                  }
                >
                  {isRelaySearching ? "🔄" : "🔍"}
                </button>
              </div>
              {/* Search mode indicator */}
              {shouldUseRelaySearch && (
                <div
                  style={{
                    fontSize: "0.7rem",
                    color: "var(--muted-color)",
                    marginTop: "0.25rem",
                    textAlign: "right",
                    paddingRight: "0.5rem",
                  }}
                >
                  📡 Relay search
                </div>
              )}
            </div>

            {/* Content */}
            <div
              style={{
                flex: 1,
                position: "relative",
                minHeight: 0,
              }}
            >
              <VirtualizedContactsList
                pubkeyHex={pubkeyHex}
                relayUrls={relayUrls}
                mode={mode}
                allPubkeys={filteredPubkeys}
                isLoading={
                  contactsQuery.isLoading ||
                  (shouldUseRelaySearch && isRelaySearching)
                }
                error={contactsError}
                getDisplayNameForPubkey={getDisplayNameForPubkey}
                addDisplayNamesFromMetadata={addDisplayNamesFromMetadata}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileContactsModal;

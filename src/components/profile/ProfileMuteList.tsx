import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { getGlobalRelayPool } from "../../utils/nostr/relayConnectionPool";
import { nip19 } from "nostr-tools";
import UserInfoCard from "../UserInfoCard";
import { useDisplayNames } from "../../hooks/useDisplayNames";
import { useQuery } from "@tanstack/react-query";
import LoadingSpinner from "../ui/LoadingSpinner";
import { fetchUserMuteList } from "../../utils/nostr/publish";

interface ProfileMuteListProps {
  pubkeyHex: string;
  relayUrls: string[];
}

const ProfileMuteList: React.FC<ProfileMuteListProps> = ({
  pubkeyHex,
  relayUrls,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");

  // Use the display names hook
  const { getDisplayNameForPubkey, fetchDisplayNames, getPubkeysNeedingFetch } =
    useDisplayNames(relayUrls);

  // Debounce search to prevent excessive filtering
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Stable relay key for query keys
  const relayKey = useMemo(() => {
    try {
      return JSON.stringify([...(relayUrls || [])].sort());
    } catch {
      return String(relayUrls.length);
    }
  }, [relayUrls]);

  // React Query: fetch muted pubkeys
  const muteListQuery = useQuery<string[]>({
    queryKey: ["profile-mute-list", pubkeyHex, relayKey],
    enabled: Boolean(pubkeyHex && relayUrls.length > 0),
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const pool = getGlobalRelayPool();
      const mutedPubkeys = await fetchUserMuteList({
        pool,
        relayUrls,
        userPubkey: pubkeyHex,
      });
      return mutedPubkeys;
    },
  });

  const mutedPubkeys = muteListQuery.data || [];
  const isLoading = muteListQuery.isPending;
  const error = muteListQuery.error;

  // Filter muted pubkeys based on search
  const filteredPubkeys = useMemo(() => {
    if (!debouncedSearch) return mutedPubkeys;

    return mutedPubkeys.filter((pubkey) => {
      const displayName = getDisplayNameForPubkey(pubkey);
      const npub = (() => {
        try {
          return nip19.npubEncode(pubkey);
        } catch {
          return pubkey;
        }
      })();

      const searchLower = debouncedSearch.toLowerCase();
      return (
        displayName.toLowerCase().includes(searchLower) ||
        npub.toLowerCase().includes(searchLower) ||
        pubkey.toLowerCase().includes(searchLower)
      );
    });
  }, [mutedPubkeys, debouncedSearch, getDisplayNameForPubkey]);

  // Fetch display names for muted users
  useEffect(() => {
    if (filteredPubkeys.length > 0) {
      const pubkeysNeedingFetch = getPubkeysNeedingFetch(filteredPubkeys);
      if (pubkeysNeedingFetch.length > 0) {
        fetchDisplayNames(pubkeysNeedingFetch);
      }
    }
  }, [filteredPubkeys, getPubkeysNeedingFetch, fetchDisplayNames]);

  const handleUserClick = useCallback(
    (pubkey: string) => {
      try {
        const npub = nip19.npubEncode(pubkey);
        // backToPath removed - unused variable
        navigate({
          to: `/npub/${npub}`,
          state: true,
        });
      } catch (error) {
        console.error("Failed to navigate to profile:", error);
      }
    },
    [navigate, location]
  );

  if (isLoading) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-color)",
          fontSize: "0.875rem",
        }}
      >
        Failed to load mute list
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--app-bg-color )",
      }}
    >
      {/* Centered content wrapper (styled like Notes list) */}
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          flex: 1,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "1000px",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            borderBottom: "1px dotted var(--border-color)",
          }}
        >
          {/* Section title to match notes list heading */}
          <div
            style={{
              position: "relative",
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
              Muted Users
            </div>
          </div>

          {/* Search */}
          <div style={{ padding: "0 0 1rem 0", flexShrink: 0 }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              style={{
                height: "2rem",
                backgroundColor: "transparent",
                color: "var(--text-color)",
                border: "1px dotted var(--border-color)",
                padding: "0.75rem",
                width: "100%",
                fontSize: "0.875rem",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Content */}
          <div
            style={{
              flex: 1,
              overflow: "auto",
              position: "relative",
              minHeight: 0,
              WebkitOverflowScrolling: "touch",
            }}
          >
            {isLoading ? (
              <div
                style={{
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "0.5rem",
                  height: "602px",
                  justifyContent: "center",
                }}
              >
                <LoadingSpinner size="small" />
                <span
                  style={{
                    color: "var(--text-color)",
                    fontSize: "0.875rem",
                  }}
                >
                  Loading muted users...
                </span>
              </div>
            ) : error ? (
              <div
                style={{
                  color: "var(--text-color)",
                  fontSize: "0.875rem",
                  textAlign: "center",
                  padding: "2rem",
                }}
              >
                Failed to load mute list
              </div>
            ) : filteredPubkeys.length === 0 ? (
              <div
                style={{
                  color: "var(--text-color)",
                  fontSize: "0.875rem",
                  textAlign: "center",
                  padding: "2rem",
                }}
              >
                {debouncedSearch ? "No muted users found" : "No muted users"}
              </div>
            ) : (
              <ul
                style={{
                  position: "relative",
                  marginLeft: "1.5rem",
                  paddingBottom: "8rem",
                  listStyleType: "none",
                }}
              >
                {filteredPubkeys.map((pubkey, idx) => {
                  const isLast = idx === filteredPubkeys.length - 1;
                  return (
                    <li
                      key={pubkey}
                      style={{
                        position: "relative",
                        paddingLeft: "1.5rem",
                        paddingTop: "0.5rem",
                        paddingBottom: "0.5rem",
                      }}
                    >
                      {/* Vertical line */}
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          bottom: isLast ? "calc(100% - 1.3rem)" : 0,
                          width: 1,
                          backgroundColor: "var(--border-color)",
                        }}
                      />
                      {/* Horizontal connector */}
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          top: "1.25rem",
                          width: "1rem",
                          height: 1,
                          backgroundColor: "var(--border-color)",
                        }}
                      />
                      <div
                        onClick={() => handleUserClick(pubkey)}
                        style={{ cursor: "pointer", width: "100%" }}
                        title="Click to view profile"
                      >
                        <UserInfoCard
                          pubkeyHex={pubkey}
                          getDisplayNameForPubkey={getDisplayNameForPubkey}
                          size={50}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileMuteList;

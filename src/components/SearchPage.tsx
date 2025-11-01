import React from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { parseSearchInput } from "../utils/search/parse";
import { searchPeopleCached, resolveNip05 } from "../utils/search/people";
import SearchPeopleList from "./SearchPeopleList";
import { NostrContext } from "../contexts/NostrContext";
import { useRelayManager } from "../hooks/useRelayManager";
import { DEFAULT_RELAY_URLS } from "../utils/nostr/constants";
// import { useUnifiedBatchMetadata } from "../hooks/useUnifiedMetadata"; // Removed - using original metadata system
import { useDisplayNames } from "../hooks/useDisplayNames";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CACHE_KEYS } from "../utils/cacheKeys";
import { extractImageUrls, extractVideoUrls } from "../utils/nostr/utils";
import type { Filter, Event } from "nostr-tools";
import { getGlobalRelayPool } from "../utils/nostr/relayConnectionPool";
import type { Note } from "../types/nostr/types";
import NoteItem from "./profile/NoteItem";
import LoadingText from "./ui/LoadingText";
import SearchHeader from "./SearchHeader";
import { useUniversalHashtagHandler } from "../utils/hashtagNavigation";
import { TreeList, TreeListItem } from "./settings/TreeListItem";
import { SectionHeader } from "./settings/SectionHeader";

const SearchPageComponent: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Universal hashtag click handler - navigates to main feed with hashtag filter
  const handleHashtagClick = useUniversalHashtagHandler();

  // Parse search parameters from URL (following the pattern used by NoteView and ProfileView)
  const searchParams = React.useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      q: params.get("q") || "",
      type: params.get("type") || "notes",
    };
  }, [location.search]);

  const queryFromUrl = searchParams.q;
  const [value, setValue] = React.useState<string>(queryFromUrl);
  const [isSearching, setIsSearching] = React.useState<boolean>(false);
  const [peopleResults, setPeopleResults] = React.useState<string[]>([]);
  const [isFetchingPeopleRemote, setIsFetchingPeopleRemote] =
    React.useState<boolean>(false);
  const [peopleCacheMiss, setPeopleCacheMiss] = React.useState<boolean>(false);
  const [resolving, setResolving] = React.useState<boolean>(false);
  const [peopleVisible, setPeopleVisible] = React.useState<number>(20);
  const [notesResults, setNotesResults] = React.useState<Note[]>([]);
  const [notesVisible, setNotesVisible] = React.useState<number>(10);
  const [isLoadingNotes, setIsLoadingNotes] = React.useState<boolean>(false);
  const [notesError, setNotesError] = React.useState<string | null>(null);
  const [expandedNotes, setExpandedNotes] = React.useState<
    Record<string, boolean>
  >({});
  const [showMoreForNote, setShowMoreForNote] = React.useState<
    Record<string, boolean>
  >({});
  const [isSearchingPeople, setIsSearchingPeople] =
    React.useState<boolean>(false);
  const [searchRelaysUsed, setSearchRelaysUsed] = React.useState<string[]>([]);

  // Relays and display names cache
  const { nostrClient, pubkey } = React.useContext(NostrContext) as any;
  const { relayUrls } = useRelayManager({
    nostrClient,
    initialRelays: DEFAULT_RELAY_URLS,
    pubkeyHex: pubkey,
  });
  const queryClient = useQueryClient();
  const { getDisplayNameForPubkey, addDisplayNamesFromMetadata } =
    useDisplayNames(relayUrls);

  // Sync local state when URL changes (e.g., back/forward)
  React.useEffect(() => {
    if (queryFromUrl !== value) {
      setValue(queryFromUrl);
    }
  }, [queryFromUrl]);

  // Helper to build augmented relays from nevent relay hints
  const buildAugmentedRelays = React.useCallback(
    (baseRelays: string[], relayHints?: string[]): string[] => {
      const hintedRelays: string[] = [];
      if (relayHints && Array.isArray(relayHints)) {
        hintedRelays.push(...relayHints);
      }
      return Array.from(new Set([...(baseRelays || []), ...hintedRelays]));
    },
    []
  );

  // Execute search (triggered by button or enter key)
  const executeSearch = React.useCallback(
    (searchQuery: string) => {
      const q = searchQuery.trim();

      // Update URL to reflect current search
      navigate({
        to: "/search",
        search: { q: q || "", type: searchParams.type || "notes" },
        replace: true,
      });

      // Prevent searches on empty query
      if (!q) {
        setPeopleResults([]);
        setNotesResults([]);
        setPeopleVisible(20);
        setNotesVisible(10);
        setPeopleCacheMiss(false);
        setIsSearchingPeople(false);
        setSearchRelaysUsed([]);
        setNotesError(null);
        return;
      }

      setIsSearching(true);
      const parsed = parseSearchInput(q);

      // Execute people search
      if (
        parsed.type === "nip05" ||
        parsed.type === "person" ||
        parsed.type === "ambiguous_hex" ||
        parsed.type === "unknown"
      ) {
        executePeopleSearch(q, parsed);
      }

      // Execute notes search
      if (parsed.type !== "person" && parsed.type !== "nip05") {
        executeNotesSearch(q, parsed);
      }

      setIsSearching(false);
    },
    [navigate, searchParams.type]
  );

  // People search logic
  const executePeopleSearch = React.useCallback((q: string, parsed: any) => {
    if (parsed.type === "nip05") {
      setIsSearchingPeople(true);
      const cachedMatches = searchPeopleCached(q, 20);
      setPeopleResults(cachedMatches);
      setPeopleVisible(20);
      // Always resolve NIP-05 in parallel
      setResolving(true);
      resolveNip05(q).then((res) => {
        setResolving(false);
        if (res.pubkeyHex) {
          const pk = res.pubkeyHex as string;
          setPeopleResults((prev) => {
            if (prev.includes(pk)) return prev;
            return [pk, ...prev];
          });
        }
      });
      return;
    }

    // For person/ambiguous_hex/unknown types
    if (
      parsed.type === "person" ||
      parsed.type === "ambiguous_hex" ||
      parsed.type === "unknown"
    ) {
      setIsSearchingPeople(true);
      const cachedMatches = searchPeopleCached(q, 100);
      setPeopleResults(cachedMatches);
      setPeopleVisible(20);
      setPeopleCacheMiss(cachedMatches.length === 0 && q.length >= 2);

      // Fallback: if nothing in cache, try NIP-50 search
      if (cachedMatches.length === 0 && q.length >= 2) {
        (async () => {
          try {
            setIsFetchingPeopleRemote(true);
            const pool = getGlobalRelayPool();
            const searchRelays = [
              "wss://relay.nostr.band",
              "wss://search.nos.today",
            ];
            const filter: any = { kinds: [0], search: q, limit: 50 };
            let events: Event[] = [];
            try {
              events = await pool.querySync(searchRelays, filter);
              setSearchRelaysUsed(searchRelays);
            } catch {}

            if (events && events.length > 0) {
              const uniquePubkeys = Array.from(
                new Set(
                  (events as any[])
                    .map((ev) => (ev as any).pubkey)
                    .filter(Boolean)
                )
              );
              setPeopleResults(uniquePubkeys);
              setPeopleCacheMiss(false);
            }
          } catch {
          } finally {
            setIsFetchingPeopleRemote(false);
          }
        })();
      }
    }
  }, []);

  // Notes search logic
  const executeNotesSearch = React.useCallback(
    (q: string, parsed: any) => {
      setNotesError(null);
      setNotesResults([]);
      setNotesVisible(10);
      setIsLoadingNotes(true);

      const pool = getGlobalRelayPool();
      (async () => {
        try {
          let hexId: string | null = null;
          let hintTags: any[] | undefined = undefined;

          try {
            if (parsed.subtype === "note" && parsed.noteIdHex) {
              hexId = parsed.noteIdHex;
            } else if (parsed.subtype === "nevent" && parsed.noteIdHex) {
              hexId = parsed.noteIdHex;
              hintTags = parsed.relayHints;
            } else if (parsed.subtype === "nevent" && !parsed.noteIdHex) {
              // Invalid nevent - show "Note not found" instead of text search
              setNotesResults([]);
              setNotesError("Invalid nevent format");
              return;
            } else if (
              parsed.type === "ambiguous_hex" &&
              parsed.input &&
              /^[0-9a-fA-F]{64}$/.test(parsed.input)
            ) {
              hexId = parsed.input;
            }
          } catch {}

          if (hexId) {
            // Direct ID-based lookup
            const augmented = buildAugmentedRelays(
              relayUrls,
              hintTags as string[] | undefined
            );
            const filter: Filter = {
              kinds: [1],
              ids: [hexId as string],
              limit: 1,
            } as any;
            const events: Event[] = await pool.querySync(augmented, filter);
            if (events && events.length > 0) {
              const ev = events[0] as any;
              const imageUrls = extractImageUrls(ev.content);
              const videoUrls = extractVideoUrls(ev.content);

              const mapped: Note = {
                id: ev.id,
                content: ev.content || "",
                pubkey: ev.pubkey,
                created_at: ev.created_at,
                kind: (ev as any).kind,
                tags: ev.tags || [],
                imageUrls,
                videoUrls,
                receivedAt: Date.now(),
              } as Note;

              queryClient.setQueryData(CACHE_KEYS.NOTE(mapped.id), mapped);
              setNotesResults([mapped]);
            } else {
              setNotesResults([]);
              setNotesError("Note not found");
            }
          } else {
            // Text search: fetch recent notes and filter
            const RECENT_LIMIT = 200;
            const filter: Filter = { kinds: [1], limit: RECENT_LIMIT } as any;
            const events: Event[] = await pool.querySync(relayUrls, filter);
            const qLower = q.toLowerCase();
            const uniqueById = new Map<string, any>();
            (events || []).forEach((ev: any) => {
              const content: string = ev?.content || "";
              if (content.toLowerCase().includes(qLower)) {
                if (!uniqueById.has(ev.id)) uniqueById.set(ev.id, ev);
              }
            });
            const mapped: Note[] = Array.from(uniqueById.values())
              .map((ev: any) => {
                const imageUrls = extractImageUrls(ev.content);
                const videoUrls = extractVideoUrls(ev.content);

                const note: Note = {
                  id: ev.id,
                  content: ev.content || "",
                  pubkey: ev.pubkey,
                  created_at: ev.created_at,
                  kind: (ev as any).kind,
                  tags: ev.tags || [],
                  imageUrls,
                  videoUrls,
                  receivedAt: Date.now(),
                };

                queryClient.setQueryData(CACHE_KEYS.NOTE(note.id), note);
                return note;
              })
              .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
              .slice(0, 50);
            setNotesResults(mapped);
            if (mapped.length === 0) setNotesError("No notes found");
          }
        } catch (e: any) {
          setNotesError(e?.message || "Failed to load notes");
        } finally {
          setIsLoadingNotes(false);
        }
      })();
    },
    [relayUrls, queryClient, buildAugmentedRelays]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      executeSearch(value);
    }
  };

  const handleSearchButtonClick = () => {
    executeSearch(value);
  };

  const handleClear = () => {
    setValue("");
    setPeopleResults([]);
    setNotesResults([]);
    setPeopleVisible(20);
    setNotesVisible(10);
    setPeopleCacheMiss(false);
    setIsSearchingPeople(false);
    setSearchRelaysUsed([]);
    setNotesError(null);
    setExpandedNotes({});
    setShowMoreForNote({});
    // Clear URL parameters
    navigate({
      to: "/search",
      search: { q: "", type: searchParams.type || "notes" },
      replace: true,
    });
  };

  // Page pubkeys and metadata loading
  const pagePubkeys = React.useMemo(
    () => peopleResults.slice(0, peopleVisible),
    [peopleResults, peopleVisible]
  );

  const relayKey = React.useMemo(
    () => JSON.stringify([...relayUrls, ...searchRelaysUsed].sort()),
    [relayUrls, searchRelaysUsed]
  );

  const metadataQuery = useQuery<Record<string, any>>({
    queryKey: CACHE_KEYS.PROFILE.CONTACTS_METADATA(pagePubkeys, relayKey),
    enabled: pagePubkeys.length > 0 && relayUrls.length > 0,
    placeholderData: (previousData: any) => previousData,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    queryFn: async () => {
      const pool = getGlobalRelayPool();
      const filter = {
        kinds: [0],
        authors: pagePubkeys,
        limit: pagePubkeys.length,
      };

      // Union user relays with search relays for better metadata coverage
      const allRelays = Array.from(
        new Set([...relayUrls, ...searchRelaysUsed])
      );
      const events = await pool.querySync(allRelays, filter);
      const newMd: Record<string, any> = {};
      events.forEach((ev: any) => {
        try {
          const content = JSON.parse(ev.content || "{}");
          newMd[ev.pubkey] = {
            name: content.name || "",
            display_name: content.display_name || content.displayName || "",
            picture: content.picture || "",
            about: content.about || "",
            nip05: content.nip05 || "",
            website: content.website || content.lud16 || "",
            banner: content.banner || "",
            lud16: content.lud16 || "",
          };
        } catch {}
      });
      return newMd;
    },
  });

  // Update display names when metadata is loaded
  React.useEffect(() => {
    const md = metadataQuery.data;
    if (md && Object.keys(md).length > 0) {
      addDisplayNamesFromMetadata(md);
    }
  }, [metadataQuery.data, addDisplayNamesFromMetadata]);

  const batchMetadata = metadataQuery.data || {};
  const isLoadingMetadata = metadataQuery.isFetching;

  const handleExpandNote = React.useCallback((noteId: string) => {
    setExpandedNotes((prev) => ({ ...prev, [noteId]: true }));
  }, []);

  const handleSetShowMore = React.useCallback(
    (noteId: string, shouldShow: boolean) => {
      setShowMoreForNote((prev) => ({ ...prev, [noteId]: shouldShow }));
    },
    []
  );

  const isMobile = window.innerWidth <= 768;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "1000px",
          }}
        >
          <SearchHeader isMobile={isMobile} />
        </div>
      </div>
      <div
        style={{
          width: "100%",
          maxWidth: "1000px",
          margin: "0 auto",
          padding: "0.75rem 1rem",
          flex: 1,
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
          }}
        >
          <div
            style={{
              position: "relative",
              flex: 1,
              display: "flex",
              alignItems: "center",
            }}
          >
            <input
              data-testid="search-input"
              type="text"
              autoFocus
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Search npubs, nprofiles, notes, nevents, NIP-05..."
              style={{
                height: "2rem",
                backgroundColor: "transparent",
                color: "var(--text-color)",
                border: "1px dotted var(--border-color)",
                padding: "0.75rem",
                paddingRight: "2.25rem",
                flex: 1,
                fontSize: "var(--font-size-sm)",
                boxSizing: "border-box",
              }}
            />
            <button
              data-testid="clear-button"
              onClick={handleClear}
              disabled={
                !value.trim() &&
                notesResults.length === 0 &&
                peopleResults.length === 0
              }
              title="Clear search"
              style={{
                position: "absolute",
                right: "0.5rem",
                height: "1.5rem",
                width: "1.5rem",
                minWidth: "1.5rem",
                minHeight: "1.5rem",
                padding: "0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "transparent",
                border: "none",
                color:
                  value.trim() ||
                  notesResults.length > 0 ||
                  peopleResults.length > 0
                    ? "var(--text-color)"
                    : "var(--border-color)",
                cursor:
                  value.trim() ||
                  notesResults.length > 0 ||
                  peopleResults.length > 0
                    ? "pointer"
                    : "default",
                opacity:
                  value.trim() ||
                  notesResults.length > 0 ||
                  peopleResults.length > 0
                    ? 1
                    : 0.6,
                transition: "opacity 0.2s, color 0.2s",
                fontSize: "0.9rem",
              }}
            >
              ✕
            </button>
          </div>
          <button
            data-testid="search-button"
            onClick={handleSearchButtonClick}
            disabled={!value.trim() || isSearching}
            title="Search (or press Enter)"
            style={{
              height: "2rem",
              width: "4rem",
              minWidth: "2rem",
              minHeight: "2rem",
              padding: "0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "transparent",
              border: "1px dotted var(--border-color)",
              color:
                value.trim() && !isSearching
                  ? "var(--text-color)"
                  : "var(--border-color)",
              cursor: value.trim() && !isSearching ? "pointer" : "default",
              opacity: value.trim() && !isSearching ? 1 : 0.6,
              transition: "opacity 0.2s, color 0.2s",
              fontSize: "1rem",
            }}
          >
            {isSearching ? <LoadingText length={6} speed="normal" /> : "Search"}
          </button>
        </div>
        {/* parsed preview removed for clean search/results view */}

        {/* Search Tips - Show only on initial state, no search performed yet */}
        {!queryFromUrl &&
          notesResults.length === 0 &&
          peopleResults.length === 0 &&
          !isSearching &&
          !resolving &&
          !isLoadingMetadata &&
          !isFetchingPeopleRemote && (
            <div
              style={{
                marginTop: "2rem",
                paddingLeft: "0.5rem",
                textAlign: "left",
              }}
            >
              <SectionHeader title="What can you search?" paddingTop="0" />

              <div style={{ marginTop: "1.5rem", lineHeight: "1.6" }}>
                {/* Profiles Section */}
                <div style={{ marginBottom: "1.5rem" }}>
                  <div
                    style={{
                      fontWeight: 600,
                      marginBottom: "0.75rem",
                      color: "var(--accent-color)",
                    }}
                  >
                    Profiles
                  </div>
                  <TreeList style={{ marginLeft: "0.25rem" }}>
                    <TreeListItem>
                      <strong>npub</strong> - Public keys (e.g.,{" "}
                      <code style={{ opacity: 0.7 }}>npub1...</code>)
                    </TreeListItem>
                    <TreeListItem>
                      <strong>nprofile</strong> - Profile links with relay hints
                    </TreeListItem>
                    <TreeListItem>
                      <strong>NIP-05</strong> - Email-style addresses (e.g.,{" "}
                      <code style={{ opacity: 0.7 }}>user@domain.com</code>)
                    </TreeListItem>
                    <TreeListItem>
                      <strong>Hex keys</strong> - 64-character hex strings
                    </TreeListItem>
                    <TreeListItem isLast>
                      <strong>Display names</strong> - Search local cache by
                      name
                    </TreeListItem>
                  </TreeList>
                </div>

                {/* Notes Section */}
                <div style={{ marginBottom: "1.5rem" }}>
                  <div
                    style={{
                      fontWeight: 600,
                      marginBottom: "0.75rem",
                      color: "var(--accent-color)",
                    }}
                  >
                    Notes & Events
                  </div>
                  <TreeList style={{ marginLeft: "0.25rem" }}>
                    <TreeListItem>
                      <strong>note</strong> - Specific notes (e.g.,{" "}
                      <code style={{ opacity: 0.7 }}>note1...</code>)
                    </TreeListItem>
                    <TreeListItem>
                      <strong>nevent</strong> - Notes with relay hints (e.g.,{" "}
                      <code style={{ opacity: 0.7 }}>nevent1...</code>)
                    </TreeListItem>
                    <TreeListItem>
                      <strong>Note ID</strong> - 64-character hex event IDs
                    </TreeListItem>
                    <TreeListItem isLast>
                      <strong>Text search</strong> - Search note content
                      (limited to recent notes on your relays)
                    </TreeListItem>
                  </TreeList>
                </div>

                {/* Tips Section */}
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      marginBottom: "0.75rem",
                      color: "var(--accent-color)",
                    }}
                  >
                    Tips for best results
                  </div>
                  <TreeList style={{ marginLeft: "0.25rem" }}>
                    <TreeListItem>
                      <strong>Profile search:</strong> Use exact npub/nprofile
                      links or full NIP-05 addresses for best results
                    </TreeListItem>
                    <TreeListItem>
                      <strong>Text search:</strong> Limited to recent notes from
                      your connected relays. Try searching by hashtags or
                      keywords
                    </TreeListItem>
                    <TreeListItem>
                      <strong>How to search:</strong> Press Enter or click 🔍
                      button to search
                    </TreeListItem>
                    <TreeListItem isLast>
                      <strong>Relay coverage:</strong> Results depend on which
                      relays you're connected to
                    </TreeListItem>
                  </TreeList>
                </div>
              </div>
            </div>
          )}

        {/* No Results Message - Show when search was performed but nothing found */}
        {queryFromUrl &&
          notesResults.length === 0 &&
          peopleResults.length === 0 &&
          !isSearching &&
          !resolving &&
          !isLoadingMetadata &&
          !isFetchingPeopleRemote &&
          !peopleCacheMiss && (
            <div
              style={{
                marginTop: "2rem",
                paddingLeft: "0.5rem",
                textAlign: "left",
              }}
            >
              <SectionHeader title="No results found" paddingTop="0" />

              <div style={{ marginTop: "1.5rem", lineHeight: "1.6" }}>
                <div
                  style={{
                    color: "var(--text-color)",
                    fontSize: "var(--font-size-sm)",
                    opacity: 0.8,
                    marginBottom: "1rem",
                  }}
                >
                  No results found for{" "}
                  <code
                    style={{
                      opacity: 0.9,
                      backgroundColor: "rgba(255, 255, 255, 0.05)",
                      padding: "0.25rem 0.5rem",
                      borderRadius: "0.25rem",
                    }}
                  >
                    {queryFromUrl}
                  </code>
                </div>

                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: "0.75rem",
                    color: "var(--accent-color)",
                  }}
                >
                  What to try next
                </div>
                <TreeList style={{ marginLeft: "0.25rem" }}>
                  <TreeListItem>
                    Check your spelling or try a different search term
                  </TreeListItem>
                  <TreeListItem>
                    For profiles, use a complete NIP-05 address (user@domain)
                  </TreeListItem>
                  <TreeListItem>
                    Try searching by pubkey (npub or nprofile link)
                  </TreeListItem>
                  <TreeListItem>
                    For notes, search by hashtags or keywords from recent notes
                  </TreeListItem>
                  <TreeListItem isLast>
                    Verify your relay connections in settings - results depend
                    on connected relays
                  </TreeListItem>
                </TreeList>
              </div>
            </div>
          )}

        {/* People results section */}
        {(isSearching ||
          resolving ||
          isLoadingMetadata ||
          isFetchingPeopleRemote) &&
          value.trim() && (
            <div
              style={{
                marginTop: "0.75rem",
                fontSize: "var(--font-size-sm)",
                opacity: 0.8,
              }}
            >
              Searching{" "}
              <LoadingText
                length={8}
                speed="normal"
                style={{ marginLeft: 8 }}
              />
            </div>
          )}

        {peopleCacheMiss && isFetchingPeopleRemote && value.trim() && (
          <div
            style={{
              width: "100%",
              fontSize: "var(--font-size-sm)",
              color: "var(--text-color)",
              opacity: 0.85,
              marginTop: "0.5rem",
            }}
          >
            No local matches. Searching relays
            <LoadingText length={6} speed="slow" style={{ marginLeft: 8 }} />
          </div>
        )}

        {peopleResults.length > 0 && !isSearching && (
          <div
            style={{
              width: "100%",
              marginTop: "0.5rem",
            }}
          >
            <div
              style={{
                width: "100%",
                borderBottom: "1px dotted var(--border-color)",
              }}
            >
              <div
                style={{
                  color: "var(--text-color)",
                  fontSize: "var(--font-size-base)",
                  paddingBottom: "0.5rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <span>People ({peopleResults.length})</span>
                {(resolving || isLoadingMetadata || isFetchingPeopleRemote) && (
                  <LoadingText
                    length={6}
                    speed="slow"
                    style={{ opacity: 0.7 }}
                  />
                )}
              </div>
              <SearchPeopleList
                pubkeys={peopleResults.slice(0, peopleVisible)}
                metadataByPubkey={batchMetadata}
                getDisplayNameForPubkey={getDisplayNameForPubkey}
                isLoading={isLoadingMetadata}
                onLoadMore={() => setPeopleVisible((c) => c + 20)}
                hasMore={peopleVisible < peopleResults.length}
                extraRelays={searchRelaysUsed}
              />
            </div>
          </div>
        )}

        {value.trim() &&
          !isSearching &&
          !resolving &&
          !isFetchingPeopleRemote &&
          peopleResults.length === 0 &&
          isSearchingPeople && (
            <div
              style={{
                width: "100%",
                marginTop: "1rem",
                color: "var(--text-color)",
                fontSize: "var(--font-size-sm)",
                textAlign: "center",
                padding: "1.5rem 0",
                borderBottom: "1px dotted var(--border-color)",
              }}
            >
              No people found on current relays
            </div>
          )}
        {resolving && (
          <div
            style={{
              marginTop: "0.25rem",
              fontSize: "var(--font-size-xs)",
              opacity: 0.7,
            }}
          >
            Resolving NIP-05{" "}
            <LoadingText length={8} speed="slow" style={{ marginLeft: 8 }} />
          </div>
        )}

        {/* Notes/Events results section */}
        {notesResults.length > 0 && !isSearching && (
          <div
            style={{
              width: "100%",
              marginTop: "1rem",
            }}
          >
            <div
              style={{
                width: "100%",
                borderBottom: "1px dotted var(--border-color)",
              }}
            >
              <div style={{ position: "relative" }}>
                <div
                  style={{
                    color: "var(--text-color)",
                    fontSize: "var(--font-size-base)",
                    paddingBottom: "0.5rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <span>Notes ({notesResults.length})</span>
                  {isLoadingNotes && (
                    <LoadingText
                      length={6}
                      speed="normal"
                      style={{ opacity: 0.7 }}
                    />
                  )}
                </div>
              </div>
              <ul
                style={{
                  position: "relative",
                  margin: "0 0 0 1.5rem",
                  padding: 0,
                  listStyleType: "none",
                }}
              >
                {notesResults.slice(0, notesVisible).map((note) => {
                  return (
                    <NoteItem
                      key={note.id}
                      note={note}
                      isExpanded={!!expandedNotes[note.id]}
                      showMoreForNote={!!showMoreForNote[note.id]}
                      onExpand={() => handleExpandNote(note.id)}
                      onSetShowMore={handleSetShowMore}
                      useAscii={false}
                      useColor={true}
                      getDisplayNameForPubkey={getDisplayNameForPubkey}
                      onHashtagClick={handleHashtagClick}
                      readRelays={relayUrls}
                    />
                  );
                })}
              </ul>
              {notesResults.length > notesVisible && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginTop: "1rem",
                    paddingBottom: "2rem",
                  }}
                >
                  <button
                    onClick={() => setNotesVisible((c) => c + 10)}
                    style={{
                      backgroundColor: "transparent",
                      color: "var(--text-color)",
                      border: "1px dotted var(--border-color)",
                      padding: "0.5rem 1rem",
                      cursor: "pointer",
                      fontSize: "var(--font-size-sm)",
                    }}
                  >
                    View more
                  </button>
                </div>
              )}
              {isLoadingNotes && notesResults.length === 0 && (
                <div
                  style={{
                    color: "var(--text-color)",
                    fontSize: "var(--font-size-sm)",
                    textAlign: "center",
                    padding: "2rem",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <span>Loading notes</span>
                  <LoadingText length={10} speed="normal" />
                </div>
              )}
              {notesError && notesResults.length === 0 && (
                <div
                  style={{
                    color: "var(--text-color)",
                    fontSize: "var(--font-size-sm)",
                    textAlign: "center",
                    padding: "2rem",
                  }}
                >
                  {notesError}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const SearchPage = React.memo(SearchPageComponent);
export default SearchPage;

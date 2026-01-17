import React from "react";
import { nip19 } from "nostr-tools";
import { Link, useLocation } from "@tanstack/react-router";
import { prefetchRoute } from "../utils/prefetch";
import { useNpubLinkMetadata } from "../hooks/useNpubLinkMetadata";

interface NostrLinkTextProps {
  text: string;
  getDisplayNameForPubkey: (pubkey: string) => string;
  onHashtagClick?: (hashtag: string) => void;
  renderNoteLinkAsThread?: boolean;
  noteLinkLabel?: string;
}

const NostrLinkText: React.FC<NostrLinkTextProps> = ({
  text,
  getDisplayNameForPubkey,
  onHashtagClick,
  renderNoteLinkAsThread = false,
  noteLinkLabel,
}) => {
  const location = useLocation();
  const isHomeFeed = location.pathname === "/";
  const isProfileFeed = location.pathname.startsWith("/profile");
  // Prefer explicit fromProfile on profile routes; fall back to fromFeed on home
  const navigationState: any = isProfileFeed
    ? { fromProfile: true }
    : isHomeFeed
      ? { fromFeed: true }
      : undefined;

  // Automatically fetch metadata for npub links in the text
  useNpubLinkMetadata(text);

  // Match nostr identifiers, hashtags, and http(s) URLs
  // Groups: 1 = optional 'nostr:' prefix, 2 = bech32 identifier, 3 = hashtag content (without #), OR match[0] is an http(s) URL
  const tokenRegex =
    /(nostr:)?(npub1[0-9a-z]+|nprofile1[0-9a-z]+|note1[0-9a-z]+|nevent1[0-9a-z]+|naddr1[0-9a-z]+)|#([a-zA-Z0-9_]+)|https?:\/\/[^\s]+/gi;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const bech32 = match[2];
    const hashtag = match[3];
    const matchIndex = match.index;

    // Push preceding plain text
    nodes.push(text.slice(lastIndex, matchIndex));

    // Handle hashtags
    if (hashtag) {
      nodes.push(
        <span
          key={`${matchIndex}-hashtag`}
          onClick={() => onHashtagClick?.(hashtag)}
          className="link-hashtag"
          style={{
            textDecoration: "underline",
            cursor: "pointer",
            userSelect: "none",
          }}
          title={`Filter by #${hashtag}`}
        >
          #{hashtag}
        </span>
      );
      lastIndex = matchIndex + fullMatch.length;
      continue;
    }

    // Handle http(s) URLs
    if (!bech32 && /^https?:\/\//i.test(fullMatch)) {
      // Show URL as a clickable link
      nodes.push(
        <a
          key={`${matchIndex}-url`}
          href={fullMatch}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--link-external)", textDecoration: "underline" }}
        >
          {fullMatch}
        </a>
      );
      lastIndex = matchIndex + fullMatch.length;
      continue;
    }

    try {
      const decoded = nip19.decode(bech32 as any) as any;
      switch (decoded.type) {
        case "npub": {
          const pubkeyHex: string = decoded.data as string;
          const display =
            getDisplayNameForPubkey(pubkeyHex) || bech32.slice(0, 12) + "…";
          nodes.push(
            <Link
              key={`${matchIndex}-npub`}
              to="/npub/$npubId"
              params={{ npubId: bech32 }}
              onMouseEnter={() => prefetchRoute(`/npub/${bech32}`)}
              state={navigationState}
              style={{
                color: "var(--link-color)",
                textDecoration: "underline",
                cursor: "pointer",
                wordBreak: "break-all",
                overflowWrap: "anywhere",
              }}
            >
              {display}
            </Link>
          );
          break;
        }
        case "nprofile": {
          const pubkeyHex: string | undefined = decoded?.data?.pubkey;
          const display =
            (pubkeyHex && getDisplayNameForPubkey(pubkeyHex)) ||
            bech32.slice(0, 12) + "…";
          nodes.push(
            <Link
              key={`${matchIndex}-nprofile`}
              to="/npub/$npubId"
              params={{ npubId: bech32 }}
              onMouseEnter={() => prefetchRoute(`/npub/${bech32}`)}
              state={navigationState}
              style={{
                color: "var(--link-color)",
                textDecoration: "underline",
                cursor: "pointer",
                wordBreak: "break-all",
                overflowWrap: "anywhere",
              }}
            >
              {display}
            </Link>
          );
          break;
        }
        case "note":
        case "nevent": {
          if (renderNoteLinkAsThread) {
            let hexId: string | null = null;
            try {
              if (decoded.type === "note") {
                hexId = decoded.data as string;
              } else if (decoded.type === "nevent") {
                hexId = (decoded.data as any)?.id || null;
              }
            } catch {}

            if (hexId) {
              nodes.push(
                <Link
                  key={`${matchIndex}-thread`}
                  to="/thread/$noteId"
                  params={{ noteId: hexId }}
                  onMouseEnter={() => prefetchRoute(`/thread/${hexId}`)}
                  state={navigationState}
                  style={{
                    color: "var(--link-color)",
                    textDecoration: "underline",
                    cursor: "pointer",
                  }}
                >
                  {noteLinkLabel || "View original thread"}
                </Link>
              );
            } else {
              // Fallback to default rendering if hex id unavailable
              nodes.push(
                <Link
                  key={`${matchIndex}-note`}
                  to="/note/$noteId"
                  params={{ noteId: bech32 }}
                  onMouseEnter={() => prefetchRoute(`/note/${bech32}`)}
                  state={navigationState}
                  style={{
                    color: "var(--link-color)",
                    textDecoration: "underline",
                    cursor: "pointer",
                  }}
                >
                  {bech32.length > 16
                    ? `${bech32.slice(0, 8)}...${bech32.slice(-6)}`
                    : bech32}
                </Link>
              );
            }
          } else {
            nodes.push(
              <Link
                key={`${matchIndex}-note`}
                to="/note/$noteId"
                params={{ noteId: bech32 }}
                onMouseEnter={() => prefetchRoute(`/note/${bech32}`)}
                state={navigationState}
                style={{
                  color: "var(--link-color)",
                  textDecoration: "underline",
                  cursor: "pointer",
                }}
              >
                {bech32.length > 16
                  ? `${bech32.slice(0, 8)}...${bech32.slice(-6)}`
                  : bech32}
              </Link>
            );
          }
          break;
        }
        case "naddr": {
          nodes.push(
            <Link
              key={`${matchIndex}-naddr`}
              to="/article/$addr"
              params={{ addr: bech32 }}
              onMouseEnter={() => prefetchRoute(`/article/${bech32}`)}
              style={{
                color: "var(--link-color)",
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              {bech32.length > 16
                ? `${bech32.slice(0, 8)}...${bech32.slice(-6)}`
                : bech32}
            </Link>
          );
          break;
        }
        default: {
          nodes.push(fullMatch);
        }
      }
    } catch {
      // If we fail to decode, keep original text
      nodes.push(fullMatch);
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  // Trailing text
  nodes.push(text.slice(lastIndex));

  return <>{nodes}</>;
};

export default NostrLinkText;

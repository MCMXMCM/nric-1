import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { nip19, type Filter, type Event } from "nostr-tools";
import { getGlobalRelayPool } from "../utils/nostr/relayConnectionPool";
import { useRelayManager } from "../hooks/useRelayManager";
import { useDisplayNames } from "../hooks/useDisplayNames";
import { NostrContext } from "../contexts/NostrContext";
import { useContext } from "react";
import { useNostrFeedState } from "../hooks/useNostrFeedState";
import StandardLoader from "./ui/StandardLoader";
import { useMetadataQuery } from "../hooks/useMetadataQuery";

// Minimal markdown rendering with support for common markdown syntax
export function BasicMarkdown({ content }: { content: string }) {
  const footnoteRefsMap = React.useRef<{ [key: string]: HTMLElement }>({});

  // Helper function to scroll to an element with proper offset
  const scrollToElement = (element: HTMLElement) => {
    const container = element.closest(".nostr-feed") as HTMLElement;
    if (!container) {
      // Fallback if container not found
      element.scrollIntoView({ behavior: "instant" });
      return;
    }

    // Get the container's scroll position
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    // Calculate the offset - we want some padding from the top
    const offset = 30; // pixels from top
    const scrollPosition =
      container.scrollTop + (elementRect.top - containerRect.top) - offset;

    // Scroll to the calculated position
    container.scrollTop = scrollPosition;
    element.focus({ preventScroll: true });
  };

  // Extract reference definitions like [title]: https://example.com
  const extractReferenceDefinitions = (
    text: string
  ): { [key: string]: string } => {
    const references: { [key: string]: string } = {};
    // Match patterns like [ref]: url or [ref]:url
    const refRegex = /^\s*\[([^\]]+)\]:\s*(.+?)(?:\s+["'].*["'])?$/gm;
    let match;
    while ((match = refRegex.exec(text)) !== null) {
      const key = match[1].trim().toLowerCase();
      const url = match[2].trim();
      references[key] = url;
    }
    return references;
  };

  // Extract footnote definitions like [^1]: footnote text
  const extractFootnoteDefinitions = (
    text: string
  ): { [key: string]: string } => {
    const footnotes: { [key: string]: string } = {};
    // Match patterns like [^key]: footnote text
    const footnoteRegex = /^\s*\[\^([^\]]+)\]:\s*(.+)$/gm;
    let match;
    while ((match = footnoteRegex.exec(text)) !== null) {
      const key = match[1].trim();
      let content = match[2].trim();
      // Clean escape characters from footnote text
      content = content.replace(/\\"/g, '"');
      content = content.replace(/\\'/g, "'");
      footnotes[key] = content;
    }
    return footnotes;
  };

  // Remove reference and footnote definitions from content
  const cleanContent = (text: string): string => {
    let cleaned = text;

    // Unescape common escape sequences
    // Convert \" to ", \' to ', etc.
    cleaned = cleaned.replace(/\\"/g, '"');
    cleaned = cleaned.replace(/\\'/g, "'");

    // Remove reference definitions - use $ to match end of line in multiline mode
    // Match lines like [ref]: url and remove the entire line
    cleaned = cleaned.replace(
      /^\s*\[([^\]]+)\]:\s*(.+)(?:\s+["'].*["'])?$/gm,
      ""
    );

    // Remove footnote definitions - use $ to match end of line in multiline mode
    // Match lines like [^key]: text and remove the entire line
    cleaned = cleaned.replace(/^\s*\[\^([^\]]+)\]:\s*(.+)$/gm, "");

    // Remove all lines that contain only whitespace (handles leftover empty lines)
    cleaned = cleaned.replace(/^\s*$/gm, "");

    // Collapse multiple consecutive blank lines (3+ newlines) into exactly 2 (one blank line)
    // This preserves intentional paragraph breaks while removing extras
    cleaned = cleaned.replace(/\n\n\n+/g, "\n\n");

    return cleaned;
  };

  const references = useMemo(
    () => extractReferenceDefinitions(content),
    [content]
  );
  const footnotes = useMemo(
    () => extractFootnoteDefinitions(content),
    [content]
  );
  const usedFootnotes = useMemo(() => new Set<string>(), []);
  const cleanedContent = useMemo(() => cleanContent(content), [content]);

  const parseInlineMarkdown = (text: string): React.ReactNode[] => {
    if (!text) return [];

    // Find all inline patterns and their positions
    const patterns = [
      // Image wrapped in link must come BEFORE plain image/link patterns
      { regex: /\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)/g, tag: "image-link" },
      {
        regex: /\[!\[([^\]]*)\]\[([^\]]+)\]\]\(([^)]+)\)/g,
        tag: "image-ref-link",
      },
      {
        regex: /\[!\[([^\]]*)\]\(([^)]+)\)\]\[([^\]]+)\]/g,
        tag: "image-link-ref",
      },
      { regex: /\*\*(.+?)\*\*/g, tag: "strong" },
      { regex: /__(.+?)__/g, tag: "strong" },
      { regex: /\*(.+?)\*/g, tag: "em" },
      { regex: /_(.+?)_/g, tag: "em" },
      { regex: /`([^`]+)`/g, tag: "code" },
      { regex: /!\[([^\]]*)\]\(([^)]+)\)/g, tag: "image" },
      { regex: /!\[([^\]]*)\]\[([^\]]+)\]/g, tag: "image-ref" },
      { regex: /\[([^\]]+)\]\(([^)]+)\)/g, tag: "link" },
      { regex: /\[([^\]]+)\]\[([^\]]+)\]/g, tag: "link-ref" },
      { regex: /\[\^([^\]]+)\]/g, tag: "footnote-ref" },
    ];

    const matches: Array<{
      start: number;
      end: number;
      tag: string;
      groups: RegExpExecArray;
    }> = [];

    // Collect all matches
    for (const { regex, tag } of patterns) {
      let match;
      // Reset regex global state
      regex.lastIndex = 0;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          tag,
          groups: match,
        });
      }
    }

    // If no matches, return text as-is
    if (matches.length === 0) {
      return [text];
    }

    // Sort by start position, then by end position (longest first for same start)
    matches.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return b.end - a.end;
    });

    // Remove overlapping matches (keep the first/longest one)
    const nonOverlapping: Array<{
      start: number;
      end: number;
      tag: string;
      groups: RegExpExecArray;
    }> = [];
    for (const match of matches) {
      const overlaps = nonOverlapping.some(
        (m) => !(match.end <= m.start || match.start >= m.end)
      );
      if (!overlaps) {
        nonOverlapping.push(match);
      }
    }

    // Build result
    const result: React.ReactNode[] = [];
    let lastEnd = 0;
    let uniqueKey = 0;

    for (const match of nonOverlapping) {
      // Add text before this match
      if (match.start > lastEnd) {
        result.push(text.slice(lastEnd, match.start));
      }

      // Add the formatted element
      const { tag, groups } = match;
      if (tag === "image-link") {
        // [![alt](imgSrc)](href)
        result.push(
          <a
            key={`img-link-${uniqueKey++}`}
            href={groups[3]}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              textDecoration: "none",
            }}
          >
            <img
              src={groups[2]}
              alt={groups[1]}
              style={{
                maxWidth: "100%",
                height: "auto",
                display: "block",
                borderRadius: "0.25rem",
              }}
            />
          </a>
        );
      } else if (tag === "image-ref-link") {
        // [![alt][imgRef]](href)
        const imgRef = groups[2].trim().toLowerCase();
        const imgSrc = references[imgRef];
        const href = groups[3];
        if (imgSrc) {
          result.push(
            <a
              key={`img-ref-link-${uniqueKey++}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "none" }}
            >
              <img
                src={imgSrc}
                alt={groups[1]}
                style={{
                  maxWidth: "100%",
                  height: "auto",
                  display: "block",
                  borderRadius: "0.25rem",
                }}
              />
            </a>
          );
        } else {
          result.push(groups[0]);
        }
      } else if (tag === "image-link-ref") {
        // [![alt](imgSrc)][hrefRef]
        const hrefRef = groups[3].trim().toLowerCase();
        const href = references[hrefRef];
        if (href) {
          result.push(
            <a
              key={`img-link-ref-${uniqueKey++}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "none" }}
            >
              <img
                src={groups[2]}
                alt={groups[1]}
                style={{
                  maxWidth: "100%",
                  height: "auto",
                  display: "block",
                  borderRadius: "0.25rem",
                }}
              />
            </a>
          );
        } else {
          result.push(groups[0]);
        }
      } else if (tag === "link") {
        result.push(
          <a
            key={`link-${uniqueKey++}`}
            href={groups[2]}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--accent-color, #0066cc)",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            {groups[1]}
          </a>
        );
      } else if (tag === "link-ref") {
        const refKey = groups[2].trim().toLowerCase();
        const url = references[refKey];
        if (url) {
          result.push(
            <a
              key={`link-ref-${uniqueKey++}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--accent-color, #0066cc)",
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              {groups[1]}
            </a>
          );
        } else {
          result.push(groups[0]); // If reference not found, show as-is
        }
      } else if (tag === "image") {
        result.push(
          <img
            key={`image-${uniqueKey++}`}
            src={groups[2]}
            alt={groups[1]}
            style={{
              maxWidth: "100%",
              height: "auto",
              display: "block",
              borderRadius: "0.25rem",
            }}
          />
        );
      } else if (tag === "image-ref") {
        const refKey = groups[2].trim().toLowerCase();
        const url = references[refKey];
        if (url) {
          result.push(
            <img
              key={`image-ref-${uniqueKey++}`}
              src={url}
              alt={groups[1]}
              style={{
                maxWidth: "100%",
                height: "auto",
                display: "block",
                borderRadius: "0.25rem",
              }}
            />
          );
        }
      } else if (tag === "code") {
        result.push(
          <code
            key={`code-${uniqueKey++}`}
            style={{
              backgroundColor: "rgba(0,0,0,0.1)",
              padding: "0.2em 0.4em",
              borderRadius: "0.3em",
              fontFamily: "monospace",
              fontSize: "0.9em",
            }}
          >
            {groups[1]}
          </code>
        );
      } else if (tag === "strong") {
        result.push(<strong key={`strong-${uniqueKey++}`}>{groups[1]}</strong>);
      } else if (tag === "em") {
        result.push(<em key={`em-${uniqueKey++}`}>{groups[1]}</em>);
      } else if (tag === "footnote-ref") {
        const footKey = groups[1].trim();
        if (footnotes[footKey]) {
          usedFootnotes.add(footKey);
          result.push(
            <a
              key={`footnote-${uniqueKey++}`}
              ref={(el) => {
                if (el) footnoteRefsMap.current[footKey] = el;
              }}
              href={`#footnote-${footKey}`}
              onClick={(e) => {
                e.preventDefault();
                const footnoteElement = document.getElementById(
                  `footnote-${footKey}`
                );
                if (footnoteElement) {
                  scrollToElement(footnoteElement);
                }
              }}
              style={{
                cursor: "pointer",
                color: "var(--accent-color, #0066cc)",
                textDecoration: "underline",
              }}
              title={footnotes[footKey]}
            >
              <sup>[{footKey}]</sup>
            </a>
          );
        } else {
          result.push(groups[0]); // If footnote not found, show as-is
        }
      }

      lastEnd = match.end;
    }

    // Add remaining text
    if (lastEnd < text.length) {
      result.push(text.slice(lastEnd));
    }

    return result;
  };

  const lines = cleanedContent.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let uniqueKey = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trimStart();

    // Skip empty lines
    if (trimmedLine.length === 0) {
      i++;
      continue;
    }

    // Headers (# ## ### etc)
    if (trimmedLine.startsWith("#")) {
      const match = trimmedLine.match(/^(#+)\s+(.*)$/);
      if (match) {
        const level = match[1].length;
        const headerContent = match[2];
        const sizes = {
          1: "2.2rem",
          2: "1.8rem",
          3: "1.5rem",
          4: "1.2rem",
          5: "1.1rem",
          6: "1rem",
        };
        elements.push(
          <h2
            key={`header-${uniqueKey++}`}
            style={{
              fontSize: sizes[level as keyof typeof sizes] || "1rem",
              fontWeight: 700,
              marginTop: "1.5rem",
              marginBottom: "0.75rem",
              color: "var(--text-color)",
            }}
          >
            {parseInlineMarkdown(headerContent)}
          </h2>
        );
        i++;
        continue;
      }
    }

    // Block quotes (lines starting with >)
    if (trimmedLine.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith(">")) {
        const quoteLine = lines[i].trimStart().slice(1).trim();
        quoteLines.push(quoteLine);
        i++;
      }
      elements.push(
        <blockquote
          key={`quote-${uniqueKey++}`}
          style={{
            borderLeft: "4px solid var(--accent-color, #0066cc)",
            paddingLeft: "1rem",
            marginLeft: 0,
            marginRight: 0,
            marginTop: "1rem",
            marginBottom: "1rem",
            color: "var(--muted-text-color)",
            fontStyle: "italic",
          }}
        >
          {quoteLines.map((quoteLine, idx) => (
            <p
              key={`quote-p-${uniqueKey++}`}
              style={{
                margin: idx < quoteLines.length - 1 ? "0 0 0.5rem 0" : 0,
              }}
            >
              {parseInlineMarkdown(quoteLine)}
            </p>
          ))}
        </blockquote>
      );
      continue;
    }

    // Unordered lists (-, *, +)
    if (/^[\s]*([-*+])\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^[\s]*([-*+])\s+/.test(lines[i])) {
        const itemContent = lines[i].replace(/^[\s]*([-*+])\s+/, "");
        listItems.push(itemContent);
        i++;
      }
      elements.push(
        <ul
          key={`ul-${uniqueKey++}`}
          style={{
            marginTop: "1rem",
            marginBottom: "1rem",
            paddingLeft: "2rem",
            color: "var(--text-color)",
          }}
        >
          {listItems.map((item, idx) => (
            <li key={`li-${idx}`} style={{ marginBottom: "0.5rem" }}>
              {parseInlineMarkdown(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered lists (1., 2., etc)
    if (/^[\s]*\d+\.\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^[\s]*\d+\.\s+/.test(lines[i])) {
        const itemContent = lines[i].replace(/^[\s]*\d+\.\s+/, "");
        listItems.push(itemContent);
        i++;
      }
      elements.push(
        <ol
          key={`ol-${uniqueKey++}`}
          style={{
            marginTop: "1rem",
            marginBottom: "1rem",
            paddingLeft: "2rem",
            color: "var(--text-color)",
          }}
        >
          {listItems.map((item, idx) => (
            <li key={`li-${idx}`} style={{ marginBottom: "0.5rem" }}>
              {parseInlineMarkdown(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Code blocks (``` or indented blocks)
    if (trimmedLine.startsWith("```")) {
      const codeLines: string[] = [];
      i++; // Skip opening ```
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // Skip closing ```

      elements.push(
        <pre
          key={`code-${uniqueKey++}`}
          style={{
            backgroundColor: "rgba(0,0,0,0.05)",
            border: "1px solid var(--border-color)",
            borderRadius: "0.4rem",
            padding: "1rem",
            overflowX: "auto",
            marginTop: "1rem",
            marginBottom: "1rem",
          }}
        >
          <code
            style={{
              fontFamily: "monospace",
              fontSize: "0.9rem",
              color: "var(--text-color)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {codeLines.join("\n")}
          </code>
        </pre>
      );
      continue;
    }

    // Horizontal rules (---, ***, ___)
    if (/^[\s]*(---+|===+|\*{3,}|_{3,})[\s]*$/.test(line)) {
      elements.push(
        <hr
          key={`hr-${uniqueKey++}`}
          style={{
            marginTop: "2rem",
            marginBottom: "2rem",
            border: "none",
            borderTop: "1px solid var(--border-color)",
            height: "1px",
            backgroundColor: "transparent",
          }}
        />
      );
      i++;
      continue;
    }

    // Regular paragraphs - collect consecutive non-empty lines
    if (trimmedLine.length > 0) {
      const paragraphLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().length > 0) {
        paragraphLines.push(lines[i]);
        i++;
      }
      const paragraphText = paragraphLines.join("\n").trim();
      elements.push(
        <p
          key={`para-${uniqueKey++}`}
          style={{
            margin: "0 0 1.25rem 0",
            color: "var(--text-color)",
            lineHeight: 1.6,
            fontSize: "1.05rem",
          }}
        >
          {parseInlineMarkdown(paragraphText)}
        </p>
      );
      continue;
    }

    i++;
  }

  // Add footnotes section if there are any used footnotes
  if (usedFootnotes.size > 0) {
    elements.push(
      <div
        key={`footnotes-section-${uniqueKey++}`}
        style={{
          marginTop: "2rem",
          paddingTop: "1rem",
          borderTop: "1px solid var(--border-color)",
          fontSize: "0.95rem",
          color: "var(--muted-text-color)",
        }}
      >
        <h3 style={{ marginBottom: "1rem", fontSize: "1rem" }}>Footnotes</h3>
        <div>
          {Array.from(usedFootnotes).map((key) => (
            <div
              key={`footnote-def-${key}`}
              id={`footnote-${key}`}
              tabIndex={0}
              style={{
                marginBottom: "1.5rem",
                paddingLeft: "1.5rem",
                textIndent: "-1.5rem",
                scrollMarginTop: "1rem",
              }}
            >
              <span style={{ fontWeight: 600 }}>[{key}]</span>{" "}
              {parseInlineMarkdown(footnotes[key])}
              <div
                style={{
                  marginTop: "0.5rem",
                  paddingLeft: "1.5rem",
                }}
              >
                <button
                  onClick={() => {
                    const refElement = footnoteRefsMap.current[key];
                    if (refElement) {
                      scrollToElement(refElement);
                    }
                  }}
                  style={{
                    backgroundColor: "var(--accent-color, #0066cc)",
                    color: "white",
                    border: "none",
                    padding: "0.4rem 0.8rem",
                    borderRadius: "0.25rem",
                    cursor: "pointer",
                    height: "1.5rem",
                    minHeight: "1.5rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.85rem",
                    fontWeight: 500,
                    transition: "opacity 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.opacity =
                      "0.8";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.opacity = "1";
                  }}
                >
                  ↑ Return
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        color: "var(--text-color)",
        lineHeight: 1.6,
        fontSize: "1.05rem",
      }}
    >
      {elements}
    </div>
  );
}

function parseAddr(addr: string): {
  kind: number;
  pubkey: string;
  identifier: string;
  relays?: string[];
} | null {
  try {
    if (addr.startsWith("naddr")) {
      const decoded = nip19.decode(addr) as any;
      const data = decoded?.data || {};
      return {
        kind: Number(data.kind || 30023),
        pubkey: String(data.pubkey || data.author || ""),
        identifier: String(data.identifier || data.d || ""),
        relays: Array.isArray(data.relays) ? data.relays : undefined,
      };
    }
    // Accept raw formats: "30023:pubkey:identifier" or prefixed with "a:"
    const raw = addr.startsWith("a:") ? addr.slice(2) : addr;
    const parts = raw.split(":");
    if (parts.length >= 3) {
      return {
        kind: Number(parts[0]),
        pubkey: parts[1],
        identifier: parts.slice(2).join(":"),
        relays: undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

const ArticlePage: React.FC = () => {
  const params = useParams({ strict: false });
  const addr = (params as any).addr as string | undefined;
  const navigate = useNavigate();
  const { nostrClient } = useContext(NostrContext) as any;
  const { relayUrls } = useRelayManager({ nostrClient, initialRelays: [] });
  const state = useNostrFeedState();
  const { getDisplayNameForPubkey } = useDisplayNames(relayUrls);

  const [event, setEvent] = useState<Event | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const parsed = useMemo(() => parseAddr(addr || ""), [addr]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!addr) {
          setError("No article address provided");
          setIsLoading(false);
          return;
        }
        if (!parsed) {
          setError("Invalid article address");
          setIsLoading(false);
          return;
        }
        const filter: Filter = {
          kinds: [30023],
          authors: [parsed.pubkey],
          "#d": [parsed.identifier],
          limit: 1,
        } as any;
        const pool = getGlobalRelayPool();
        const relays =
          parsed.relays && parsed.relays.length > 0
            ? Array.from(new Set([...parsed.relays, ...relayUrls]))
            : relayUrls;
        const events = await pool.querySync(relays, filter);
        if (cancelled) return;
        if (events && events.length > 0) {
          // Take the most recent by created_at
          const newest = events.sort(
            (a: any, b: any) => (b.created_at || 0) - (a.created_at || 0)
          )[0];
          setEvent(newest as any);
        } else {
          setError("Article not found");
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load article");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [parsed, relayUrls]);

  const title = useMemo(
    () => event?.tags?.find((t) => t[0] === "title")?.[1] || "",
    [event]
  );
  const imageUrl = useMemo(
    () => event?.tags?.find((t) => t[0] === "image")?.[1] || "",
    [event]
  );
  const summary = useMemo(
    () => event?.tags?.find((t) => t[0] === "summary")?.[1] || "",
    [event]
  );
  const publishedAt = useMemo(() => {
    const tag = event?.tags?.find((t) => t[0] === "published_at")?.[1];
    const ts = tag ? Number(tag) : event?.created_at;
    return ts ? new Date(ts * 1000) : null;
  }, [event]);

  // Fetch author metadata
  const { data: authorMetadataResult } = useMetadataQuery({
    pubkeyHex: event?.pubkey || null,
    relayUrls,
    enabled: Boolean(event?.pubkey),
  });

  // Get author display info similar to MainLayout's getUserDisplayInfo
  const getAuthorDisplayInfo = () => {
    if (!event?.pubkey) return null;

    const hexPubkey = event.pubkey;
    const metadata = authorMetadataResult?.metadata;

    // Get display name from metadata or fallback
    const displayName = metadata?.display_name || metadata?.name || "";
    const picture = metadata?.picture || "";

    // Convert to npub
    let npub: string = hexPubkey;
    try {
      if (/^[0-9a-fA-F]{64}$/.test(hexPubkey)) {
        npub = nip19.npubEncode(hexPubkey);
      }
    } catch {}

    return { displayName, picture, npub, pk: hexPubkey };
  };

  const authorInfo = getAuthorDisplayInfo();

  // Format author display name - use display name from metadata if available
  const formattedAuthorDisplayName = useMemo(() => {
    if (!authorInfo) return "";

    // If we have a display name from metadata, use it
    if (authorInfo.displayName && authorInfo.displayName.trim()) {
      return authorInfo.displayName;
    }

    // Otherwise, try the display names hook
    const fromHook = getDisplayNameForPubkey(event?.pubkey || "");
    if (fromHook && fromHook !== authorInfo.npub) {
      return fromHook;
    }

    // Fallback to truncated npub
    const npub = authorInfo.npub;
    if (npub.startsWith("npub1")) {
      return `${npub.substring(0, 20)}...`;
    }
    return npub;
  }, [authorInfo, event?.pubkey, getDisplayNameForPubkey]);

  // Navigate to author profile
  const handleAuthorClick = () => {
    if (authorInfo?.npub) {
      navigate({ to: `/npub/${authorInfo.npub}` });
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <StandardLoader message="Loading article..." alignWithSplash={true} />
    );
  }

  if (error || !event) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
          minHeight: "50vh",
          color: "var(--text-color)",
          fontSize: "var(--font-size-sm)",
          gap: "1rem",
        }}
      >
        <div>{error || "Article not found"}</div>
      </div>
    );
  }

  return (
    <div
      className="nostr-feed"
      style={{
        width: "100%",
        height: state.isMobile ? "100%" : "100vh",
        flex: state.isMobile ? 1 : "none",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--app-bg-color)",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      {/* Main Content Wrapper */}
      <div
        style={{
          width: "100%",
          maxWidth: state.isMobile ? "100%" : "1000px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          flex: state.isMobile ? 1 : 1,
          overflow: "visible",
        }}
      >
        {/* Article Content */}
        <div
          style={{
            width: "100%",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            flex: "none",
            minHeight: "auto",
            overflowY: "visible",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div
            className="article-container"
            style={{
              width: "100%",
              flex: "none",
              minHeight: "auto",
              paddingTop: state.isMobile ? "1rem" : "1rem",
              paddingBottom: state.isMobile
                ? "calc(2rem + var(--safe-area-inset-bottom))"
                : "6rem",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              boxSizing: "border-box",
              backgroundColor: "var(--app-bg-color)",
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: "880px",
                paddingLeft: state.isMobile ? "1rem" : 0,
                paddingRight: state.isMobile ? "1rem" : 0,
                display: "flex",
                justifyContent: "flex-start",
                textAlign: "left",
              }}
            >
              <div style={{ width: "100%" }}>
                {/* Desktop: Image on left, Title on right | Mobile: Stacked */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: state.isMobile ? "column" : "row",
                    gap: state.isMobile ? 0 : "2rem",
                    alignItems: state.isMobile ? "stretch" : "flex-start",
                    marginBottom: "2rem",
                  }}
                >
                  {/* Image Section - Left on desktop, Top on mobile */}
                  {imageUrl && !state.isMobile && (
                    <div
                      style={{
                        flex: "0 0 auto",
                        width: state.isMobile ? "100%" : "35%",
                        minWidth: 0,
                      }}
                    >
                      <img
                        src={imageUrl}
                        alt="article"
                        style={{
                          width: "100%",
                          height: "auto",
                          display: "block",
                          borderRadius: "0.25rem",
                        }}
                      />
                    </div>
                  )}

                  {/* Title Section - Right on desktop, Below image on mobile */}
                  <div
                    style={{
                      flex: state.isMobile ? 1 : "1 1 auto",
                      display: "flex",
                      alignItems: "flex-start",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        borderLeft: ".25rem solid var(--border-color)",
                        paddingLeft: "1rem",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "2.5rem",
                          lineHeight: 1.1,
                          // marginTop: "0.35rem",
                          // fontWeight: 800,
                          color: "var(--text-color)",
                        }}
                      >
                        {title || "Article"}
                      </div>
                      <div
                        style={{
                          marginTop: "0.35rem",
                          color: "var(--muted-text-color)",
                          fontSize: "0.95rem",
                        }}
                      >
                        {publishedAt
                          ? publishedAt.toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })
                          : ""}
                      </div>{" "}
                      <div
                        onClick={handleAuthorClick}
                        style={{
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          textAlign: "left",
                          // fontWeight: 700,
                          fontSize: "1.1rem",
                          color: "var(--accent-color)",
                          cursor: "pointer",
                          textDecoration: "none",
                        }}
                        onMouseEnter={(e) => {
                          if (!state.isMobile) {
                            e.currentTarget.style.textDecoration = "underline";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!state.isMobile) {
                            e.currentTarget.style.textDecoration = "none";
                          }
                        }}
                      >
                        {formattedAuthorDisplayName || "Article"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mobile: Image below title */}
                {imageUrl && state.isMobile && (
                  <div style={{ margin: "0 0 1.5rem 0" }}>
                    <img
                      src={imageUrl}
                      alt="article"
                      style={{
                        width: "100%",
                        height: "auto",
                        display: "block",
                      }}
                    />
                  </div>
                )}

                {summary && (
                  <div
                    style={{
                      margin: "0 0 1.5rem 0",
                      color: "var(--muted-text-color)",
                      fontSize: "1rem",
                    }}
                  >
                    {summary}
                  </div>
                )}

                {/* Article Content */}
                <BasicMarkdown content={event.content || ""} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArticlePage;

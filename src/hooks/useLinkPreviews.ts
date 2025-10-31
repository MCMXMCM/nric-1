import { useEffect, useState, useMemo } from "react";
import { extractNonMediaUrls } from "../utils/linkPreview";
import { getCachedLinkMetadata } from "../utils/cache/linkPreviewCache";
import type { LinkMetadata } from "../utils/linkPreview";

interface UseLinkPreviewsResult {
  linkPreviews: Map<string, LinkMetadata | null>;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to fetch and cache link previews from note content
 * Extracts non-media URLs and fetches metadata for each
 */
export function useLinkPreviews(
  content: string | null | undefined,
  enabled: boolean = true
): UseLinkPreviewsResult {
  const [linkPreviews, setLinkPreviews] = useState<Map<string, LinkMetadata | null>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Extract URLs only when content changes
  const urls = useMemo(() => {
    if (!content || !enabled) return [];
    return extractNonMediaUrls(content);
  }, [content, enabled]);

  useEffect(() => {
    if (urls.length === 0) {
      setLinkPreviews(new Map());
      setIsLoading(false);
      return;
    }

    let mounted = true;

    const fetchPreviews = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const results = new Map<string, LinkMetadata | null>();

        // Fetch each preview
        const promises = urls.map(async (url) => {
          const metadata = await getCachedLinkMetadata(url);
          results.set(url, metadata);
        });

        await Promise.all(promises);

        if (mounted) {
          setLinkPreviews(results);
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        }
      }
    };

    fetchPreviews();

    return () => {
      mounted = false;
    };
  }, [urls]);

  return {
    linkPreviews,
    isLoading,
    error,
  };
}

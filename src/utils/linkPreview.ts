/**
 * Link Preview Utility
 * Handles extraction and parsing of link metadata for non-media URLs
 */

export interface LinkMetadata {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  domain: string;
  faviconUrl?: string;
  timestamp: number;
}

/**
 * Extract non-media URLs from text
 * Excludes image and video URLs that are already handled by media gallery
 */
export function extractNonMediaUrls(text: string): string[] {
  if (!text) return [];

  // Match all HTTP(S) URLs
  const urlRegex = /https?:\/\/[^\s]+/gi;
  const allUrls = text.match(urlRegex) || [];

  // Media extensions that should be excluded
  const mediaExtensions = /\.(jpg|jpeg|gif|png|webp|mp4|webm|mov|avi|mkv|flv|wmv)$/i;

  // Filter out media URLs and remove duplicates
  const nonMediaUrls = allUrls.filter((url) => !mediaExtensions.test(url));

  // Return unique URLs
  return Array.from(new Set(nonMediaUrls));
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname || url;
  } catch {
    // If URL parsing fails, return original
    return url;
  }
}

/**
 * Check if URL is from X.com/Twitter
 */
function isTwitterUrl(url: string): boolean {
  try {
    const domain = extractDomain(url).toLowerCase();
    return domain.includes("twitter.com") || domain.includes("x.com");
  } catch {
    return false;
  }
}

/**
 * Extract tweet content from page HTML for X.com/Twitter links
 * Looks for tweet text in common locations when meta tags are unavailable
 */
function extractTwitterTweetContent(html: string): { title?: string; description?: string } {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    
    // Try to find tweet text in various possible locations
    // Look for text in common tweet containers
    const tweetSelectors = [
      'div[data-testid="tweet"]',
      'article[data-testid="tweet"]',
      'div[class*="tweet"]',
      'div[class*="Tweet"]',
    ];
    
    for (const selector of tweetSelectors) {
      const tweetEl = doc.querySelector(selector);
      if (tweetEl) {
        const text = tweetEl.textContent?.trim();
        if (text && text.length > 0) {
          // Split into title and description
          const lines = text.split('\n').filter(line => line.trim());
          if (lines.length > 0) {
            return {
              title: lines[0].substring(0, 200),
              description: lines.slice(1).join(' ').substring(0, 500) || lines[0],
            };
          }
        }
      }
    }
  } catch (error) {
    console.warn("Error extracting tweet content from HTML:", error);
  }
  
  return {};
}

/**
 * Parse Open Graph and Twitter Card metadata from HTML
 * Enhanced to better handle Twitter/X.com specific tags
 */
export function parseMetadataFromHtml(html: string, url: string): Partial<LinkMetadata> {
  const metadata: Partial<LinkMetadata> = {
    url,
    domain: extractDomain(url),
    timestamp: Date.now(),
  };

  // Create a parser for HTML
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Extract Open Graph tags
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");
    const ogDescription = doc.querySelector('meta[property="og:description"]')?.getAttribute("content");
    const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute("content");

    // Extract Twitter Card tags as fallback
    // Support both "name" and "property" attributes for twitter tags
    const twitterTitle = 
      doc.querySelector('meta[name="twitter:title"]')?.getAttribute("content") ||
      doc.querySelector('meta[property="twitter:title"]')?.getAttribute("content");
    const twitterDescription = 
      doc.querySelector('meta[name="twitter:description"]')?.getAttribute("content") ||
      doc.querySelector('meta[property="twitter:description"]')?.getAttribute("content");
    const twitterImage = 
      doc.querySelector('meta[name="twitter:image"]')?.getAttribute("content") ||
      doc.querySelector('meta[name="twitter:image:src"]')?.getAttribute("content") ||
      doc.querySelector('meta[property="twitter:image"]')?.getAttribute("content");

    // Extract regular meta tags
    const metaDescription = doc.querySelector('meta[name="description"]')?.getAttribute("content");

    // Extract title from <title> tag as last resort
    const pageTitle = doc.querySelector("title")?.textContent;

    // Set metadata with priority: OG tags > Twitter tags > regular meta tags
    metadata.title = ogTitle || twitterTitle || pageTitle || undefined;
    metadata.description = ogDescription || twitterDescription || metaDescription || undefined;
    metadata.image = ogImage || twitterImage || undefined;
    
    // If we couldn't extract title/description and this is a Twitter link,
    // try to extract tweet content from the page
    if (isTwitterUrl(url) && (!metadata.title || !metadata.description)) {
      const tweetContent = extractTwitterTweetContent(html);
      if (tweetContent.title && !metadata.title) {
        metadata.title = tweetContent.title;
      }
      if (tweetContent.description && !metadata.description) {
        metadata.description = tweetContent.description;
      }
    }
  } catch (error) {
    console.error("Error parsing metadata from HTML:", error);
  }

  return metadata;
}

/**
 * Fetch metadata for a URL with CORS handling
 * Uses a CORS proxy for cross-origin requests
 * Enhanced with User-Agent header for Twitter/X.com compatibility
 */
export async function fetchLinkMetadata(
  url: string,
  corsProxyUrl: string = "https://api.allorigins.win/raw"
): Promise<LinkMetadata | null> {
  try {
    // Validate URL
    new URL(url);

    // For Twitter/X.com links, try microlink.io first (better at rendering)
    if (isTwitterUrl(url)) {
      console.log(`[Twitter Link Preview] Trying microlink.io for ${url}`);
      const microlinkMetadata = await fetchFromMicrolink(url);
      if (microlinkMetadata && (microlinkMetadata.title || microlinkMetadata.description)) {
        console.log(`[Twitter Link Preview] Got content from microlink.io`);
        return microlinkMetadata;
      }
    }

    // Fall back to allorigins.win for non-Twitter or if microlink fails
    const proxiedUrl = `${corsProxyUrl}?url=${encodeURIComponent(url)}`;
    
    // Add User-Agent header to help with X.com/Twitter compatibility
    const headers: HeadersInit = {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };

    const response = await fetch(proxiedUrl, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      console.warn(`Failed to fetch ${url}: ${response.status}`);
      return null;
    }

    const html = await response.text();
    const metadata = parseMetadataFromHtml(html, url) as LinkMetadata;
    
    // Log metadata for Twitter links for debugging
    if (isTwitterUrl(url)) {
      console.log(`[Twitter Link Preview] URL: ${url}`, {
        title: metadata.title,
        description: metadata.description,
        image: metadata.image,
        hasContent: !!(metadata.title || metadata.description),
      });
      
      // If we couldn't extract content from HTML, try extracting from URL itself
      if (!metadata.title && !metadata.description) {
        console.log(`[Twitter Link Preview] No content in HTML, trying URL extraction...`);
        const urlExtracted = extractTwitterContentFromUrl(url);
        if (urlExtracted.title) {
          metadata.title = urlExtracted.title;
        }
        if (urlExtracted.description) {
          metadata.description = urlExtracted.description;
        }
      }
    }

    return metadata;
  } catch (error) {
    console.error(`Error fetching link metadata for ${url}:`, error);
    return null;
  }
}

/**
 * Fetch metadata from microlink.io API
 * Microlink is specialized in rendering and extracting metadata from web pages
 * Better at rendering JavaScript-heavy sites like Twitter/X.com
 */
async function fetchFromMicrolink(url: string): Promise<LinkMetadata | null> {
  try {
    const response = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`);
    
    if (!response.ok) {
      console.warn(`Microlink failed for ${url}: ${response.status}`);
      return null;
    }

    const data = await response.json() as any;
    
    if (!data.data) {
      console.warn(`No data from microlink for ${url}`);
      return null;
    }

    const { data: microlinkData } = data;
    
    return {
      url,
      domain: extractDomain(url),
      title: microlinkData.title || microlinkData.author?.name,
      description: microlinkData.description || microlinkData.provider?.name,
      image: microlinkData.image?.url,
      faviconUrl: microlinkData.logo?.url,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.warn(`Error fetching from microlink.io for ${url}:`, error);
    return null;
  }
}

/**
 * Extract tweet information from URL pattern as a fallback
 * X.com URLs follow pattern: https://x.com/username/status/tweetid
 * Returns a basic description based on URL structure
 */
function extractTwitterContentFromUrl(url: string): { title?: string; description?: string } {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(p => p);
    
    // Pattern: /username/status/tweetid or /username/statuses/tweetid
    if (pathParts.length >= 3 && (pathParts[1] === 'status' || pathParts[1] === 'statuses')) {
      const username = pathParts[0];
      const tweetId = pathParts[2];
      
      return {
        title: `Tweet by @${username}`,
        description: `View this tweet on X (ID: ${tweetId})`,
      };
    }
  } catch (error) {
    console.warn("Error extracting content from Twitter URL:", error);
  }
  
  return {};
}

/**
 * Get favicon URL for a domain
 */
export function getFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
}

/**
 * Build a link metadata with favicon
 */
export async function buildLinkMetadata(url: string): Promise<LinkMetadata | null> {
  const metadata = await fetchLinkMetadata(url);

  if (!metadata) {
    // Return minimal metadata on fetch failure
    return {
      url,
      domain: extractDomain(url),
      timestamp: Date.now(),
    };
  }

  // Add favicon
  metadata.faviconUrl = getFaviconUrl(metadata.domain);

  return metadata;
}

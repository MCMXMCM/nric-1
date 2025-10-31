interface MediaLoadResult {
  success: boolean;
  url: string;
  error?: string;
  method?: 'direct' | 'proxy' | 'cached' | 'direct-no-cors';
}

interface ProxyConfig {
  url: string;
  timeout: number;
  priority: number;
  domains?: string[]; // Specific domains this proxy works well with
}

class MediaLoader {
  private static instance: MediaLoader;
  private loadingCache: Map<string, Promise<MediaLoadResult>> = new Map();
  private loadedImages: Set<string> = new Set(); // Track successfully loaded images
  private resolvedUrls: Map<string, string> = new Map(); // Map original URL to resolved URL
  private failedUrls: Set<string> = new Set(); // Track permanently failed URLs
  private proxySuccessRates: Map<string, { success: number; total: number }> = new Map();

  private constructor() {}

  static getInstance(): MediaLoader {
    if (!MediaLoader.instance) {
      MediaLoader.instance = new MediaLoader();
    }
    return MediaLoader.instance;
  }

  private getProxyConfigs(): ProxyConfig[] {
    return [
      // Nostr-specific image proxies (higher priority)
      {
        url: 'https://imgproxy.nostr.build/insecure/plain/',
        timeout: 8000,
        priority: 1,
        domains: ['nostr.build', 'image.nostr.build']
      },
      // General-purpose proxies
      {
        url: 'https://images.weserv.nl/?url=',
        timeout: 8000,
        priority: 2
      },
      {
        url: 'https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/proxy/',
        timeout: 6000,
        priority: 3
      },
      // Fallback proxies (lower priority due to reliability issues)
      {
        url: 'https://corsproxy.io/?',
        timeout: 5000,
        priority: 4
      }
    ];
  }

  private async loadWithTimeout(url: string, timeout: number = 10000, isProxy: boolean = false, corsMode: 'anonymous' | 'none' = 'anonymous'): Promise<MediaLoadResult> {
    return new Promise((resolve) => {
      const img = new Image();
      
      // Set appropriate attributes for better CORS handling
      if (corsMode === 'anonymous') {
        img.crossOrigin = 'anonymous';
      }
      img.referrerPolicy = 'no-referrer';
      img.loading = 'lazy';
      img.decoding = 'async';

      const timeoutId = setTimeout(() => {
        img.src = ''; // Cancel the request
        resolve({ 
          success: false, 
          url, 
          error: 'Timeout',
          method: isProxy ? 'proxy' : 'direct'
        });
      }, timeout);

      img.onload = () => {
        clearTimeout(timeoutId);
        resolve({ 
          success: true, 
          url,
          method: isProxy ? 'proxy' : 'direct'
        });
      };

      img.onerror = (event) => {
        clearTimeout(timeoutId);
        img.src = ''; // Cancel the request
        
        // Determine error type for better handling
        let errorType = 'Load failed';
        if (event instanceof ErrorEvent) {
          if (event.message.includes('CORS')) {
            errorType = 'CORS error';
          } else if (event.message.includes('404')) {
            errorType = 'Not found';
          } else if (event.message.includes('403') || event.message.includes('401')) {
            errorType = 'Unauthorized';
          } else if (event.message.includes('certificate') || event.message.includes('SSL') || event.message.includes('TLS')) {
            errorType = 'SSL certificate error';
          } else if (event.message.includes('net::ERR_CERT')) {
            errorType = 'SSL certificate error';
          }
        }
        
        // Check if the error might be SSL-related based on URL scheme and common error patterns
        if (errorType === 'Load failed' && url.startsWith('https://')) {
          // For HTTPS URLs that fail without specific error messages, it's often SSL-related
          errorType = 'SSL/Network error';
        }
        
        resolve({ 
          success: false, 
          url, 
          error: errorType,
          method: isProxy ? 'proxy' : 'direct'
        });
      };

      img.src = url;
    });
  }

  private updateProxyStats(proxyBaseUrl: string, success: boolean) {
    const stats = this.proxySuccessRates.get(proxyBaseUrl) || { success: 0, total: 0 };
    stats.total += 1;
    if (success) {
      stats.success += 1;
    }
    this.proxySuccessRates.set(proxyBaseUrl, stats);
  }

  private getOptimalProxies(url: string): ProxyConfig[] {
    const domain = new URL(url).hostname;
    const configs = this.getProxyConfigs();
    
    return configs
      .filter(config => !config.domains || config.domains.some(d => domain.includes(d)))
      .sort((a, b) => {
        // Sort by success rate first, then by priority
        const aStats = this.proxySuccessRates.get(a.url) || { success: 0, total: 0 };
        const bStats = this.proxySuccessRates.get(b.url) || { success: 0, total: 0 };
        
        const aRate = aStats.total > 0 ? aStats.success / aStats.total : 0.5;
        const bRate = bStats.total > 0 ? bStats.success / bStats.total : 0.5;
        
        if (Math.abs(aRate - bRate) > 0.1) {
          return bRate - aRate; // Higher success rate first
        }
        
        return a.priority - b.priority; // Lower priority number = higher priority
      });
  }

  private constructProxyUrl(proxyConfig: ProxyConfig, originalUrl: string): string {
    const { url: proxyBase } = proxyConfig;
    
    if (proxyBase.includes('weserv.nl')) {
      return `${proxyBase}${encodeURIComponent(originalUrl)}`;
    } else if (proxyBase.includes('nostr.build')) {
      return `${proxyBase}${encodeURIComponent(originalUrl)}`;
    } else if (proxyBase.includes('imagedelivery.net')) {
      const encoded = encodeURIComponent(originalUrl);
      return `${proxyBase}${encoded}/public`;
    } else if (proxyBase.includes('corsproxy.io')) {
      return `${proxyBase}${encodeURIComponent(originalUrl)}`;
    }
    
    return `${proxyBase}${encodeURIComponent(originalUrl)}`;
  }

  async loadMedia(url: string): Promise<MediaLoadResult> {
    // Check if image is already successfully loaded
    if (this.loadedImages.has(url)) {
      const resolvedUrl = this.resolvedUrls.get(url) || url;
      return { success: true, url: resolvedUrl, method: 'cached' };
    }

    // Check if URL has permanently failed before
    if (this.failedUrls.has(url)) {
      return { success: false, url, error: 'Previously failed permanently' };
    }

    // Check if we're already loading this URL
    const existingLoad = this.loadingCache.get(url);
    if (existingLoad) {
      return existingLoad;
    }

    const loadPromise = this.performLoad(url);
    this.loadingCache.set(url, loadPromise);
    
    try {
      const result = await loadPromise;
      return result;
    } finally {
      // Clean up cache entry after a delay to prevent memory leaks
      setTimeout(() => {
        this.loadingCache.delete(url);
      }, 5000);
    }
  }

  private async performLoad(url: string): Promise<MediaLoadResult> {
    // Try direct load first with CORS
    const directResult = await this.loadWithTimeout(url, 6000, false, 'anonymous');
    if (directResult.success) {
      this.loadedImages.add(url);
      this.resolvedUrls.set(url, url);
      return directResult;
    }

    // Log SSL certificate errors for debugging
    if (directResult.error === 'SSL certificate error' || directResult.error === 'SSL/Network error') {
      console.warn(`[MediaLoader] SSL certificate issue detected for ${url.slice(0, 50)}..., will try proxies`);
    }

    // If CORS failed, try without CORS before trying proxies
    if (directResult.error === 'CORS error' || directResult.error === 'Load failed') {
      const noCorsResult = await this.loadWithTimeout(url, 6000, false, 'none');
      if (noCorsResult.success) {
        this.loadedImages.add(url);
        this.resolvedUrls.set(url, url);
        return { ...noCorsResult, method: 'direct-no-cors' as any };
      }
    }

    // If direct load fails with certain errors, try proxies
    if (directResult.error === 'CORS error' || directResult.error === 'Unauthorized' || directResult.error === 'Load failed' || directResult.error === 'SSL certificate error' || directResult.error === 'SSL/Network error') {
      const optimalProxies = this.getOptimalProxies(url);
      
      for (const proxyConfig of optimalProxies) {
        try {
          const proxyUrl = this.constructProxyUrl(proxyConfig, url);
          const proxyResult = await this.loadWithTimeout(proxyUrl, proxyConfig.timeout, true);
          
          // Update proxy statistics
          this.updateProxyStats(proxyConfig.url, proxyResult.success);
          
          if (proxyResult.success) {
            this.loadedImages.add(url);
            this.resolvedUrls.set(url, proxyUrl);
            return {
              ...proxyResult,
              url: proxyUrl,
              method: 'proxy'
            };
          }
        } catch (error) {
          // Update proxy statistics for failed attempts
          this.updateProxyStats(proxyConfig.url, false);
          continue;
        }
      }
    }

    // If all attempts failed, mark as permanently failed for a while
    this.failedUrls.add(url);
    // Remove from failed URLs after 5 minutes to allow retry
    setTimeout(() => {
      this.failedUrls.delete(url);
    }, 5 * 60 * 1000);

    return {
      success: false,
      url,
      error: 'All loading attempts failed including optimized proxies'
    };
  }

  // Preload multiple images in the background without blocking
  async preloadImages(urls: string[]): Promise<void> {
    // Disabled globally: batch prefetching removed to prevent idle CPU churn
    // and unnecessary network activity across all platforms.
    return;

    // Filter out URLs that are already loaded or failed
    const urlsToPreload = urls.filter(url => 
      !this.loadedImages.has(url) && 
      !this.failedUrls.has(url) && 
      !this.loadingCache.has(url)
    );

    if (urlsToPreload.length === 0) return;

    // Reduce batch size to be more gentle on servers
    const batchSize = 3;
    const batches: string[][] = [];
    
    for (let i = 0; i < urlsToPreload.length; i += batchSize) {
      batches.push(urlsToPreload.slice(i, i + batchSize));
    }
    
    // Process batches with longer delays between them
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      // Process batch in parallel with timeout
      const batchPromises = batch.map(async (url) => {
        try {
          // Add random delay to stagger requests
          await new Promise(resolve => setTimeout(resolve, Math.random() * 500));
          
          const result = await this.loadMedia(url);
          if (!result.success) {
            console.warn(`[MediaLoader] Failed to preload: ${url.slice(0, 50)}... (${result.error})`);
          }
          return result;
        } catch (error) {
          console.warn(`[MediaLoader] Preload error for ${url.slice(0, 50)}...:`, error);
          return { success: false, url, error: 'Preload failed' };
        }
      });
      
      // Wait for current batch to complete before starting next batch
      await Promise.allSettled(batchPromises);
      
      // Longer delay between batches to prevent server overload
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));
      }
    }
  }

  // Check if an image is already loaded
  isImageLoaded(url: string): boolean {
    return this.loadedImages.has(url);
  }

  // Get the resolved URL for a loaded image
  getResolvedUrl(url: string): string | null {
    return this.resolvedUrls.get(url) || null;
  }

  clearCache(url?: string) {
    if (url) {
      this.loadingCache.delete(url);
      this.loadedImages.delete(url);
      this.resolvedUrls.delete(url);
      this.failedUrls.delete(url);
    } else {
      this.loadingCache.clear();
      this.loadedImages.clear();
      this.resolvedUrls.clear();
      this.failedUrls.clear();
    }
  }

  // Get proxy statistics for debugging
  getProxyStats(): Record<string, { successRate: number; totalAttempts: number }> {
    const stats: Record<string, { successRate: number; totalAttempts: number }> = {};
    
    for (const [proxy, data] of this.proxySuccessRates) {
      stats[proxy] = {
        successRate: data.total > 0 ? data.success / data.total : 0,
        totalAttempts: data.total
      };
    }
    
    return stats;
  }

  // Clear failed URLs cache (for manual retry)
  clearFailedUrls() {
    this.failedUrls.clear();
  }
}

export const mediaLoader = MediaLoader.getInstance(); 
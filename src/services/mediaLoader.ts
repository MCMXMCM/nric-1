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
        timeout: 4000,
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
        timeout: 6000,
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
      // NOTE: Do NOT set loading='lazy' on programmatic Image() objects
      // Lazy loading is viewport-based and doesn't work for detached images
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
    const MAX_TOTAL_TIME = 15000; // 15 seconds to allow slow proxies time to respond
    const startTime = Date.now();
    
    // Helper to check remaining time
    const getRemainingTime = () => Math.max(0, MAX_TOTAL_TIME - (Date.now() - startTime));
    
    // Helper to create failure result
    const createFailureResult = (errorMsg: string): MediaLoadResult => ({
      success: false,
      url,
      error: errorMsg
    });

    // Try direct load first with CORS
    const directTimeout = Math.min(5000, getRemainingTime());
    if (directTimeout <= 0) {
      return createFailureResult('Timeout: No time remaining for direct load');
    }
    
    const directResult = await this.loadWithTimeout(url, directTimeout, false, 'anonymous');
    console.log(`[MediaLoader] Direct load result for ${url.slice(0, 50)}...:`, directResult.error || 'success');
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
      const noCorsTimeout = Math.min(2000, getRemainingTime()); // Reduced from 4000 to 2000
      if (noCorsTimeout > 0) {
        const noCorsResult = await this.loadWithTimeout(url, noCorsTimeout, false, 'none');
        if (noCorsResult.success) {
          this.loadedImages.add(url);
          this.resolvedUrls.set(url, url);
          return { ...noCorsResult, method: 'direct-no-cors' as any };
        }
      }
    }

    // If direct load fails with certain errors, try proxies in parallel (racing)
    // Include 'Timeout' to handle slow-loading images that might load faster through a proxy
    if (directResult.error === 'CORS error' || directResult.error === 'Unauthorized' || directResult.error === 'Load failed' || directResult.error === 'SSL certificate error' || directResult.error === 'SSL/Network error' || directResult.error === 'Timeout') {
      const optimalProxies = this.getOptimalProxies(url);
      const remaining = getRemainingTime();
      
      // Need at least 1000ms to attempt proxies in parallel
      if (remaining > 1000) {
        // Try top 3 proxies in parallel (racing)
        const topProxies = optimalProxies.slice(0, 3);
        console.log(`[MediaLoader] Trying ${topProxies.length} proxies for ${url.slice(0, 50)}..., remaining time: ${remaining}ms`);
        const proxyPromises = topProxies.map(async (proxyConfig) => {
          try {
            const proxyUrl = this.constructProxyUrl(proxyConfig, url);
            const proxyTimeout = Math.min(proxyConfig.timeout, remaining);
            console.log(`[MediaLoader] Trying proxy ${proxyConfig.url.slice(0, 30)}... timeout: ${proxyTimeout}ms`);
            const proxyResult = await this.loadWithTimeout(proxyUrl, proxyTimeout, true);
            console.log(`[MediaLoader] Proxy ${proxyConfig.url.slice(0, 30)}... result:`, proxyResult.error || 'success');
            
            // Update proxy statistics
            this.updateProxyStats(proxyConfig.url, proxyResult.success);
            
            return {
              success: proxyResult.success,
              result: proxyResult,
              proxyUrl,
              config: proxyConfig
            };
          } catch (error) {
            console.log(`[MediaLoader] Proxy ${proxyConfig.url.slice(0, 30)}... threw error:`, error);
            // Update proxy statistics for failed attempts
            this.updateProxyStats(proxyConfig.url, false);
            return {
              success: false,
              result: null,
              proxyUrl: null,
              config: proxyConfig
            };
          }
        });
        
        // Race the proxies - use first successful result
        try {
          const results = await Promise.allSettled(proxyPromises);
          
          // Find first successful result
          for (const settled of results) {
            if (settled.status === 'fulfilled' && settled.value.success) {
              const { result, proxyUrl } = settled.value;
              this.loadedImages.add(url);
              this.resolvedUrls.set(url, proxyUrl!);
              return {
                ...result!,
                url: proxyUrl!,
                method: 'proxy'
              };
            }
          }
        } catch (error) {
          // If Promise.allSettled fails (shouldn't happen), fall through to sequential fallback
        }
      }
      
      // Fallback: try remaining proxies sequentially if parallel racing failed
      const remainingProxies = optimalProxies.slice(3);
      for (const proxyConfig of remainingProxies) {
        const remainingTime = getRemainingTime();
        if (remainingTime <= 500) {
          break;
        }
        
        try {
          const proxyUrl = this.constructProxyUrl(proxyConfig, url);
          const proxyTimeout = Math.min(proxyConfig.timeout, remainingTime);
          const proxyResult = await this.loadWithTimeout(proxyUrl, proxyTimeout, true);
          
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
  // Re-enabled with viewport awareness and throttling to prevent CPU churn
  async preloadImages(urls: string[]): Promise<void> {
    // Filter out URLs that are already loaded or failed
    const urlsToPreload = urls.filter(url => 
      !this.loadedImages.has(url) && 
      !this.failedUrls.has(url) && 
      !this.loadingCache.has(url)
    );

    if (urlsToPreload.length === 0) return;

    // Limit concurrent preloads to 2 to prevent overwhelming the network
    const maxConcurrent = 2;
    const batchSize = maxConcurrent;
    
    // Use requestIdleCallback for background loading when available
    const schedulePreload = (callback: () => void) => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(callback, { timeout: 2000 });
      } else {
        // Fallback to setTimeout with small delay
        setTimeout(callback, 100);
      }
    };

    // Process in small batches with delays
    const processBatch = async (batch: string[]) => {
      const batchPromises = batch.map(async (url) => {
        try {
          const result = await this.loadMedia(url);
          if (!result.success) {
            // Silently fail for preloads - don't spam console
            return result;
          }
          return result;
        } catch (error) {
          // Silently fail for preloads
          return { success: false, url, error: 'Preload failed' };
        }
      });
      
      await Promise.allSettled(batchPromises);
    };

    // Schedule batches with delays between them
    for (let i = 0; i < urlsToPreload.length; i += batchSize) {
      const batch = urlsToPreload.slice(i, i + batchSize);
      
      if (i === 0) {
        // Process first batch immediately
        await processBatch(batch);
      } else {
        // Schedule subsequent batches with delay
        schedulePreload(async () => {
          await processBatch(batch);
        });
        
        // Small delay between scheduling batches
        await new Promise(resolve => setTimeout(resolve, 200));
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
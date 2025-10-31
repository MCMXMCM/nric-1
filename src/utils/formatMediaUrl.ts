/**
 * Formats a media URL into a more concise display format
 * @param url - The full media URL
 * @returns Formatted string like "nostr.build mp4 video link" or "blossom.primal.net png image link"
 */
export function formatMediaUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    
    // Get file extension from pathname
    const pathname = urlObj.pathname;
    const pathParts = pathname.split('.');
    const extension = pathParts.length > 1 ? pathParts.pop()?.toLowerCase() || '' : '';
    
    // Determine media type and format
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
    const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv'];
    
    let format = '';
    let mediaType = '';
    
    if (imageExtensions.includes(extension)) {
      format = extension.toUpperCase();
      mediaType = 'image';
    } else if (videoExtensions.includes(extension)) {
      format = extension.toUpperCase();
      mediaType = 'video';
    } else if (extension) {
      // Fallback for unknown extensions
      format = extension.toUpperCase();
      mediaType = 'media';
    } else {
      // No extension found
      format = '';
      mediaType = 'media';
    }
    
    return format ? `${domain} ${format} ${mediaType} link` : `${domain} ${mediaType} link`;
  } catch (error) {
    // If URL parsing fails, return a simplified version
    return `media link`;
  }
}

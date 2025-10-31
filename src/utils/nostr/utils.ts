export const extractImageUrls = (text: string): string[] => {
  const imageRegex = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|gif|png|webp))/gi;
  return text.match(imageRegex) || [];
};

export const extractVideoUrls = (text: string): string[] => {
  const videoRegex = /(https?:\/\/[^\s]+\.(?:mp4|webm|mov))/gi;
  return text.match(videoRegex) || [];
};

export const removeMediaUrls = (text: string): string => {
  const mediaRegex = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|gif|png|webp|mp4|webm|mov))/gi;
  return text.replace(mediaRegex, '');
};

export const formatRelativeTime = (timestamp: number): string => {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo`;
  return `${Math.floor(diff / 31536000)}y`;
};

export const debounce = (func: Function, wait: number) => {
  let timeout: number;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}; 
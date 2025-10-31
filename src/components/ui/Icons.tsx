import React from "react";

export interface IconProps {
  width?: string | number;
  height?: string | number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
  hasReplies?: boolean;
  filled?: boolean;
}

/**
 * Common SVG icons used throughout the application
 * Consolidates repeated SVG code into reusable components
 */

export const ReplyIcon: React.FC<IconProps> = ({
  width = 20,
  height = 20,
  color = "currentColor",
  ...props
}) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <polyline points="9 14 4 9 9 4" />
    <path d="M20 20v-6a4 4 0 0 0-4-4H4" />
  </svg>
);

export const RepostIcon: React.FC<IconProps> = ({
  width = 20,
  height = 20,
  color = "currentColor",
  ...props
}) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M17 1l4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="M7 23l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

export const LikeIcon: React.FC<IconProps> = ({
  width = 20,
  height = 20,
  color = "currentColor",
  ...props
}) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

export const LinkIcon: React.FC<IconProps> = ({
  width = 20,
  height = 20,
  color = "currentColor",
  ...props
}) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M10 13a5 5 0 0 0 7.07 0l1.83-1.83a5 5 0 1 0-7.07-7.07L9 5" />
    <path d="M14 11a5 5 0 0 0-7.07 0L5.1 12.83a5 5 0 1 0 7.07 7.07L15 19" />
  </svg>
);

export const RefreshIcon: React.FC<IconProps> = ({
  width = 20,
  height = 20,
  color = "currentColor",
  ...props
}) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M21 2v6h-6" />
    <path d="M3 12a9 9 0 0 1 15.54-6.36L21 8" />
    <path d="M3 12a9 9 0 0 0 15.54 6.36L21 16" />
  </svg>
);

export const CloseIcon: React.FC<IconProps> = ({
  width = 20,
  height = 20,
  color = "currentColor",
  ...props
}) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const ChevronDownIcon: React.FC<IconProps> = ({
  width = 20,
  height = 20,
  color = "currentColor",
  ...props
}) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export const ZapIcon: React.FC<IconProps> = ({
  width = 20,
  height = 20,
  color = "currentColor",
  ...props
}) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

export const ThreadIcon: React.FC<IconProps> = ({
  hasReplies = false,
  width = 20,
  height = 20,
  color = "currentColor",
  ...props
}) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill={hasReplies ? "var(--accent-color)" : "none"}
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export const SettingsIcon: React.FC<IconProps> = ({
  width = 20,
  height = 20,
  color = "currentColor",
  ...props
}) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const BookmarkIcon: React.FC<IconProps> = ({
  width = 20,
  height = 20,
  color = "currentColor",
  filled = false,
  ...props
}) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill={filled ? color : "none"}
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);

export default {
  Reply: ReplyIcon,
  Repost: RepostIcon,
  Like: LikeIcon,
  Link: LinkIcon,
  Refresh: RefreshIcon,
  Close: CloseIcon,
  ChevronDown: ChevronDownIcon,
  Zap: ZapIcon,
  Thread: ThreadIcon,
  Settings: SettingsIcon,
  Bookmark: BookmarkIcon,
};

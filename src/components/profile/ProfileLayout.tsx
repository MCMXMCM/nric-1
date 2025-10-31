import React from "react";
import {
  getMainContainerStyle,
  getContentAreaStyle,
  getProfileSectionStyle,
} from "./profileStyles";

interface ProfileLayoutProps {
  isMobile: boolean;
  children: React.ReactNode;
}

interface ProfileContentAreaProps {
  isMobile: boolean;
  children: React.ReactNode;
}

interface ProfileSectionContainerProps {
  isMobile: boolean;
  children: React.ReactNode;
}

/**
 * Main profile layout container
 */
export const ProfileContainer: React.FC<ProfileLayoutProps> = ({
  isMobile,
  children,
}) => {
  return (
    <div
      className="nostr-feed"
      style={{
        width: "100%",
        height: "100%",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--app-bg-color )",
        overflow: "hidden",
        borderBottom: "1px dotted var(--border-color)",
      }}
    >
      <div style={getMainContainerStyle(isMobile)}>{children}</div>
    </div>
  );
};

/**
 * Content area for profile sections
 */
export const ProfileContentArea = React.forwardRef<
  HTMLDivElement,
  ProfileContentAreaProps
>(({ isMobile, children }, ref) => {
  return (
    <div ref={ref} style={getContentAreaStyle(isMobile)}>
      {children}
    </div>
  );
});
ProfileContentArea.displayName = "ProfileContentArea";

/**
 * Profile section container (left side on desktop, top on mobile)
 */
export const ProfileSectionContainer: React.FC<
  ProfileSectionContainerProps
> = ({ isMobile, children }) => {
  return <div style={getProfileSectionStyle(isMobile)}>{children}</div>;
};

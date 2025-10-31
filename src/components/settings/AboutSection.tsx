import React, { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { SectionHeader } from "./SectionHeader";
import { TreeList, TreeListItem } from "./TreeListItem";
import { SettingsButton } from "./SettingsButton";

interface AboutSectionProps {
  isMobile?: boolean;
}

export const AboutSection: React.FC<AboutSectionProps> = () => {
  const navigate = useNavigate();
  const [isMobileView, setIsMobileView] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleAboutClick = () => {
    navigate({ to: "/about" });
  };

  const handleSearchClick = () => {
    navigate({ to: "/search" });
  };

  const handleBookmarksClick = () => {
    navigate({ to: "/bookmarks" });
  };

  const handleUserClick = () => {
    const userSection = document.getElementById("user-login-section");
    if (userSection) {
      userSection.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleZapsClick = () => {
    const zapsSection = document.getElementById("wallet-section");
    if (zapsSection) {
      zapsSection.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleRelaysClick = () => {
    const relaySection = document.getElementById("relay-management");
    if (relaySection) {
      relaySection.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleBlossomClick = () => {
    const blossomSection = document.getElementById("blossom-settings");
    if (blossomSection) {
      blossomSection.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <SectionHeader title="Quick Links" paddingTop="0" />
      <TreeList>
        {isMobileView ? (
          <>
            {/* Mobile: Row 1 with 4 items */}
            {/* Row 1: About | Search | Relays | Blossom */}
            <TreeListItem>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "0.15rem",
                  width: "100%",
                  minWidth: 0,
                  overflow: "hidden",
                }}
              >
                <SettingsButton
                  onClick={handleAboutClick}
                  textAlign="start"
                  style={{
                    width: "auto",
                    height: "25px",
                    padding: "0.25rem 0.5rem",
                    textDecoration: "underline",
                    minWidth: "fit-content",
                    color: "var(--link-color)",
                    flex: 1,
                  }}
                >
                  About
                </SettingsButton>
                <div
                  style={{
                    height: "1px",
                    backgroundColor: "var(--border-color)",
                    alignSelf: "center",
                    flex: "1",
                    margin: "0 0.2rem",
                    minWidth: 0,
                  }}
                />
                <SettingsButton
                  onClick={handleSearchClick}
                  textAlign="center"
                  style={{
                    width: "auto",
                    height: "25px",
                    padding: "0rem 0.5rem",
                    textDecoration: "underline",
                    minWidth: "fit-content",
                    color: "var(--link-color)",
                    flex: 1,
                  }}
                >
                  Search
                </SettingsButton>
                <div
                  style={{
                    height: "1px",
                    backgroundColor: "var(--border-color)",
                    alignSelf: "center",
                    flex: "1",
                    margin: "0 0.2rem",
                    minWidth: 0,
                  }}
                />
                <SettingsButton
                  onClick={handleRelaysClick}
                  textAlign="center"
                  style={{
                    width: "auto",
                    height: "25px",
                    padding: "0.25rem 0.5rem",
                    textDecoration: "underline",
                    minWidth: "fit-content",
                    color: "var(--link-color)",
                    flex: 1,
                  }}
                >
                  Relays
                </SettingsButton>
                <div
                  style={{
                    height: "1px",
                    backgroundColor: "var(--border-color)",
                    alignSelf: "center",
                    flex: "1",
                    margin: "0 0.2rem",
                    minWidth: 0,
                  }}
                />
                <SettingsButton
                  onClick={handleBlossomClick}
                  textAlign="center"
                  style={{
                    width: "auto",
                    height: "25px",
                    padding: "0.25rem 0.5rem",
                    textDecoration: "underline",
                    minWidth: "fit-content",
                    color: "var(--link-color)",
                    flex: 1,
                  }}
                >
                  Blossom
                </SettingsButton>
              </div>
            </TreeListItem>

            {/* Mobile: Row 2 with 3 items */}
            {/* Row 2: User | Bookmarks | Zaps */}
            <TreeListItem isLast>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "0.15rem",
                  width: "100%",
                  minWidth: 0,
                  overflow: "hidden",
                }}
              >
                <SettingsButton
                  onClick={handleUserClick}
                  textAlign="center"
                  style={{
                    width: "auto",
                    height: "25px",
                    padding: "0.25rem 0.5rem",
                    textDecoration: "underline",
                    minWidth: "fit-content",
                    color: "var(--link-color)",
                    flex: 1,
                  }}
                >
                  User
                </SettingsButton>
                <div
                  style={{
                    height: "1px",
                    backgroundColor: "var(--border-color)",
                    alignSelf: "center",
                    flex: "1",
                    margin: "0 0.2rem",
                    minWidth: 0,
                  }}
                />
                <SettingsButton
                  onClick={handleBookmarksClick}
                  textAlign="center"
                  style={{
                    width: "auto",
                    height: "25px",
                    padding: "0.25rem 0.5rem",
                    textDecoration: "underline",
                    minWidth: "fit-content",
                    color: "var(--link-color)",
                    flex: 1,
                  }}
                >
                  Bookmarks
                </SettingsButton>
                <div
                  style={{
                    height: "1px",
                    backgroundColor: "var(--border-color)",
                    alignSelf: "center",
                    flex: "1",
                    margin: "0 0.2rem",
                    minWidth: 0,
                  }}
                />
                <SettingsButton
                  onClick={handleZapsClick}
                  textAlign="center"
                  style={{
                    width: "auto",
                    height: "25px",
                    padding: "0.25rem 0.5rem",
                    textDecoration: "underline",
                    minWidth: "fit-content",
                    color: "var(--link-color)",
                    flex: 1,
                  }}
                >
                  Zaps
                </SettingsButton>
              </div>
            </TreeListItem>
          </>
        ) : (
          /* Desktop: Single Row with 7 items */
          <TreeListItem isLast>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "0.2rem",
                width: "100%",
                minWidth: 0,
                overflow: "hidden",
              }}
            >
              <SettingsButton
                onClick={handleAboutClick}
                textAlign="start"
                style={{
                  width: "auto",
                  height: "25px",
                  padding: "0.25rem 0.75rem",
                  textDecoration: "underline",
                  minWidth: "fit-content",
                  color: "var(--link-color)",
                }}
              >
                About
              </SettingsButton>
              <div
                style={{
                  height: "1px",
                  backgroundColor: "var(--border-color)",
                  alignSelf: "center",
                  flex: "1",
                  margin: "0 0.5rem",
                  minWidth: 0,
                }}
              />
              <SettingsButton
                onClick={handleSearchClick}
                textAlign="center"
                style={{
                  width: "auto",
                  height: "25px",
                  padding: "0rem 0.75rem",
                  textDecoration: "underline",
                  minWidth: "fit-content",
                  color: "var(--link-color)",
                }}
              >
                Search
              </SettingsButton>
              <div
                style={{
                  height: "1px",
                  backgroundColor: "var(--border-color)",
                  alignSelf: "center",
                  flex: "1",
                  margin: "0 0.5rem",
                  minWidth: 0,
                }}
              />
              <SettingsButton
                onClick={handleBookmarksClick}
                textAlign="center"
                style={{
                  width: "auto",
                  height: "25px",
                  padding: "0.25rem 0.75rem",
                  textDecoration: "underline",
                  minWidth: "fit-content",
                  color: "var(--link-color)",
                }}
              >
                Bookmarks
              </SettingsButton>
              <div
                style={{
                  height: "1px",
                  backgroundColor: "var(--border-color)",
                  alignSelf: "center",
                  flex: "1",
                  margin: "0 0.5rem",
                  minWidth: 0,
                }}
              />
              <SettingsButton
                onClick={handleUserClick}
                textAlign="center"
                style={{
                  width: "auto",
                  height: "25px",
                  padding: "0.25rem 0.75rem",
                  textDecoration: "underline",
                  color: "var(--link-color)",
                  minWidth: "fit-content",
                }}
              >
                User
              </SettingsButton>
              <div
                style={{
                  height: "1px",
                  backgroundColor: "var(--border-color)",
                  alignSelf: "center",
                  flex: "1",
                  margin: "0 0.5rem",
                  minWidth: 0,
                }}
              />
              <SettingsButton
                onClick={handleZapsClick}
                textAlign="center"
                style={{
                  width: "auto",
                  height: "25px",
                  padding: "0.25rem 0.75rem",
                  textDecoration: "underline",
                  color: "var(--link-color)",
                  minWidth: "fit-content",
                }}
              >
                Zaps
              </SettingsButton>
              <div
                style={{
                  height: "1px",
                  backgroundColor: "var(--border-color)",
                  alignSelf: "center",
                  flex: "1",
                  margin: "0 0.5rem",
                  minWidth: 0,
                }}
              />
              <SettingsButton
                onClick={handleRelaysClick}
                textAlign="center"
                style={{
                  width: "auto",
                  height: "25px",
                  padding: "0.25rem 0.75rem",
                  textDecoration: "underline",
                  color: "var(--link-color)",
                  minWidth: "fit-content",
                }}
              >
                Relays
              </SettingsButton>
              <div
                style={{
                  height: "1px",
                  backgroundColor: "var(--border-color)",
                  alignSelf: "center",
                  flex: "1",
                  margin: "0 0.5rem",
                  minWidth: 0,
                }}
              />
              <SettingsButton
                onClick={handleBlossomClick}
                textAlign="center"
                style={{
                  width: "auto",
                  height: "25px",
                  padding: "0.25rem 0.75rem",
                  textDecoration: "underline",
                  color: "var(--link-color)",
                  minWidth: "fit-content",
                }}
              >
                Blossom
              </SettingsButton>
            </div>
          </TreeListItem>
        )}
      </TreeList>
    </div>
  );
};

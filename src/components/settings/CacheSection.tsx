import React from "react";
import { formatBytes } from "../../utils/formatting";
import { SectionHeader } from "./SectionHeader";
import { TreeList, TreeListItem } from "./TreeListItem";
import { SettingsButton } from "./SettingsButton";

interface CacheSectionProps {
  cacheStats: {
    totalNotes: number;
    totalSize: number;
    filterStats: {
      [key: string]: {
        count: number;
        size: number;
      };
    };
  };
  // Additional cache statistics
  metadataCount?: number;
  contactsCount?: number;
  asciiCacheCount?: number;
  onClearAllCaches?: () => void;
  onClearSavedKeys: () => void;
  onClearStoredWallet?: () => void;
  onResetPreferences?: () => void;
}

// Helper function to estimate metadata cache size
const estimateMetadataSize = (count: number): number => {
  // Estimate average metadata size per contact (name, display_name, picture, about, etc.)
  const avgMetadataSize = 500; // bytes per metadata entry
  return count * avgMetadataSize;
};

// Helper function to estimate contacts cache size
const estimateContactsSize = (count: number): number => {
  // Estimate average contact size (pubkey + tags)
  const avgContactSize = 100; // bytes per contact
  return count * avgContactSize;
};

// Helper function to estimate ASCII cache size
const estimateAsciiCacheSize = (count: number): number => {
  // Estimate average ASCII cache entry size
  const avgAsciiSize = 2000; // bytes per ASCII cache entry
  return count * avgAsciiSize;
};

export const CacheSection: React.FC<CacheSectionProps> = ({
  cacheStats,
  metadataCount = 0,
  contactsCount = 0,
  asciiCacheCount = 0,
  onClearAllCaches,
  onClearSavedKeys,
  onClearStoredWallet,
  onResetPreferences,
}) => {
  // cacheStats now represents the TanStack Persist cache summary values mapped into the old shape
  const metadataSize = estimateMetadataSize(metadataCount);
  const contactsSize = estimateContactsSize(contactsCount);
  const asciiCacheSize = estimateAsciiCacheSize(asciiCacheCount);

  return (
    <>
      <SectionHeader title="Cache" />
      <TreeList>
        <TreeListItem style={{ display: "flex" }}>
          <SettingsButton
            onClick={onResetPreferences || (() => {})}
            disabled={!onResetPreferences}
          >
            Clear Preferences
          </SettingsButton>
        </TreeListItem>

        <TreeListItem style={{ display: "flex" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <SettingsButton onClick={onClearSavedKeys}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                }}
              >
                <span
                  style={{
                    color: "var(--text-color)",
                  }}
                >
                  Clear Saved Keys
                </span>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                  }}
                >
                  <span
                    style={{
                      color: "var(--text-color)",

                      fontSize: "0.75rem",
                      width: "100%",
                      textAlign: "right",
                    }}
                  >
                    Secure Storage
                  </span>

                  <span
                    style={{
                      color: "var(--text-color)",

                      fontSize: "0.75rem",
                      width: "100%",
                      textAlign: "right",
                    }}
                  >
                    N/A
                  </span>
                </div>
              </div>
            </SettingsButton>
          </div>
        </TreeListItem>

        <TreeListItem style={{ display: "flex" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <SettingsButton
              onClick={onClearStoredWallet || (() => {})}
              disabled={!onClearStoredWallet}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                }}
              >
                <span
                  style={{
                    color: "var(--text-color)",
                  }}
                >
                  Clear Stored Wallet
                </span>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                  }}
                >
                  <span
                    style={{
                      color: "var(--text-color)",

                      fontSize: "0.75rem",
                      width: "100%",
                      textAlign: "right",
                    }}
                  >
                    NWC Connection
                  </span>

                  <span
                    style={{
                      color: "var(--text-color)",

                      fontSize: "0.75rem",
                      width: "100%",
                      textAlign: "right",
                    }}
                  >
                    Secure Storage
                  </span>
                </div>
              </div>
            </SettingsButton>
          </div>
        </TreeListItem>

        <TreeListItem isLast style={{ display: "flex" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <SettingsButton
              onClick={onClearAllCaches || (() => {})}
              disabled={!onClearAllCaches}
              variant="danger"
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                }}
              >
                <span
                  style={{
                    color: "var(--text-color)",
                  }}
                >
                  Clear Everything
                </span>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                  }}
                >
                  <span
                    style={{
                      color: "var(--text-color)",

                      fontSize: "0.75rem",
                      width: "100%",
                      textAlign: "right",
                    }}
                  >
                    {`${
                      cacheStats.totalNotes +
                      metadataCount +
                      contactsCount +
                      asciiCacheCount
                    } total items`}
                  </span>

                  <span
                    style={{
                      color: "var(--text-color)",

                      fontSize: "0.75rem",
                      width: "100%",
                      textAlign: "right",
                    }}
                  >
                    {`${formatBytes(
                      cacheStats.totalSize +
                        metadataSize +
                        contactsSize +
                        asciiCacheSize
                    )}`}
                  </span>
                </div>
              </div>
            </SettingsButton>
          </div>
        </TreeListItem>
      </TreeList>
    </>
  );
};

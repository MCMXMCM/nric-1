import React, { useState } from "react";
import { SectionHeader } from "./SectionHeader";
import { TreeList, TreeListItem } from "./TreeListItem";
import { useUIStore } from "../lib/useUIStore";
import {
  addBlossomServerUrl,
  removeBlossomServerUrl,
  updateBlossomServerUrl,
  setBlossomServerUrls,
  setPrimaryBlossomServerUrl,
} from "../lib/uiStore";

interface BlossomSettingsSectionProps {
  isMobile?: boolean;
}

interface ServerItemProps {
  url: string;
  index: number;
  isPrimary: boolean;
  onUpdate: (index: number, url: string) => void;
  onRemove: (index: number) => void;
  onSetPrimary: (index: number) => void;
}

const ServerItem: React.FC<ServerItemProps> = ({
  url,
  index,
  isPrimary,
  onUpdate,
  onRemove,
  onSetPrimary,
}) => {
  const [inputValue, setInputValue] = useState(url);
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = () => {
    // Basic URL validation
    try {
      const url = new URL(inputValue);
      if (!url.protocol.startsWith("http")) {
        throw new Error("Invalid protocol");
      }
      onUpdate(index, inputValue);
      setIsEditing(false);
    } catch (error) {
      // Invalid URL, reset to current value
      setInputValue(url);
      alert("Please enter a valid URL (e.g., https://example.com/)");
    }
  };

  const handleCancel = () => {
    setInputValue(url);
    setIsEditing(false);
  };

  const handleRemove = () => {
    if (window.confirm("Are you sure you want to remove this server?")) {
      onRemove(index);
    }
  };

  return (
    <TreeListItem>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          // gap: "0.5rem",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            // gap: "1rem",
          }}
        >
          <span
            style={{
              fontSize: "0.875rem",
              fontWeight: "400",
              filter: "contrast(1)",
              color: "var(--text-color)",
            }}
          >
            Server {index + 1}{" "}
            <span style={{ fontSize: "0.75rem", color: "var(--accent-color)" }}>
              {isPrimary ? "(Primary)" : ""}
            </span>
          </span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  style={{
                    background: "none",
                    // border: "1px solid var(--accent-color)",
                    color: "var(--accent-color)",
                    fontSize: "0.75rem",
                    // padding: "0.25rem 0.5rem",
                    cursor: "pointer",
                    minWidth: "3rem",
                  }}
                >
                  SAVE
                </button>
                <button
                  onClick={handleCancel}
                  style={{
                    background: "none",
                    // border: "1px solid var(--border-color)",
                    color: "var(--text-color-secondary)",
                    fontSize: "0.75rem",
                    // padding: "0.25rem 0.5rem",
                    cursor: "pointer",
                    minWidth: "3rem",
                  }}
                >
                  CANCEL
                </button>
              </>
            ) : (
              <>
                {!isPrimary && (
                  <button
                    onClick={() => onSetPrimary(index)}
                    style={{
                      background: "none",
                      // border: "1px solid var(--accent-color)",
                      color: "var(--accent-color)",
                      fontSize: "0.75rem",
                      // padding: "0.25rem 0.5rem",
                      cursor: "pointer",
                      minWidth: "3rem",
                    }}
                  >
                    SET PRIMARY
                  </button>
                )}
                <button
                  onClick={() => setIsEditing(true)}
                  style={{
                    background: "none",
                    // border: "1px solid var(--border-color)",
                    color: "var(--text-color-secondary)",
                    fontSize: "0.75rem",
                    // padding: "0.25rem 0.5rem",
                    cursor: "pointer",
                    minWidth: "3rem",
                  }}
                >
                  EDIT
                </button>
                <button
                  onClick={handleRemove}
                  style={{
                    background: "none",
                    // border: "1px solid var(--error-color, #ff4444)",
                    color: "var(--error-color, #ff4444)",
                    fontSize: "0.75rem",
                    // padding: "0.25rem 0.5rem",
                    cursor: "pointer",
                    minWidth: "3rem",
                  }}
                >
                  REMOVE
                </button>
              </>
            )}
          </div>
        </div>

        {isEditing ? (
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="https://blossom.primal.net/"
            style={{
              width: "100%",
              padding: "0.5rem",
              border: "1px solid var(--border-color)",
              backgroundColor: "var(--background-color-secondary)",
              color: "var(--text-color)",
              fontSize: "0.875rem",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSave();
              } else if (e.key === "Escape") {
                handleCancel();
              }
            }}
            autoFocus
          />
        ) : (
          <div
            style={{
              // padding: "0.5rem",
              textAlign: "left",
              backgroundColor: "var(--background-color-secondary)",
              // border: "1px solid var(--border-color)",
              fontSize: "0.875rem",
              wordBreak: "break-all",
              color: isPrimary
                ? "var(--accent-color)"
                : "var(--text-color-secondary)",
            }}
          >
            {url}
          </div>
        )}
      </div>
    </TreeListItem>
  );
};

export const BlossomSettingsSection: React.FC<BlossomSettingsSectionProps> = ({
  isMobile = false,
}) => {
  const blossomServerUrls = useUIStore((s) => s.blossomServerUrls) || [
    "https://blossom.primal.net/",
  ];
  const primaryBlossomServerUrl =
    useUIStore((s) => s.primaryBlossomServerUrl) ||
    "https://blossom.primal.net/";

  const handleAddServer = () => {
    const newUrl = "https://blossom.primal.net/";
    addBlossomServerUrl(newUrl);
  };

  const handleRemoveServer = (index: number) => {
    removeBlossomServerUrl(index);
  };

  const handleUpdateServer = (index: number, url: string) => {
    updateBlossomServerUrl(index, url);
  };

  const handleSetPrimary = (index: number) => {
    const url = blossomServerUrls[index];
    if (url) {
      setPrimaryBlossomServerUrl(url);
    }
  };

  const handleReset = () => {
    const defaultUrls = [
      "https://blossom.primal.net/",
      "https://blossom.nostr.build/",
    ];
    setBlossomServerUrls(defaultUrls);
    setPrimaryBlossomServerUrl("https://blossom.primal.net/");
  };

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <SectionHeader
        title="Blossom Servers (File Upload)"
        paddingTop={isMobile ? "1rem" : "0"}
      />
      <TreeList>
        {/* Add button row */}
        <TreeListItem>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              width: "100%",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginTop: "0.25rem",
                width: "100%",
              }}
            >
              <button
                onClick={handleAddServer}
                style={{
                  background: "none",
                  border: "1px solid var(--accent-color)",
                  color: "var(--accent-color)",
                  fontSize: "0.75rem",
                  padding: "0.25rem 0.5rem",
                  cursor: "pointer",
                  minWidth: "3rem",
                  minHeight: "2rem",
                  height: "2rem",
                  width: "50%",
                }}
              >
                Add Server
              </button>
              <button
                onClick={handleReset}
                style={{
                  background: "none",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-color-secondary)",
                  fontSize: "0.75rem",
                  padding: "0.25rem 0.5rem",
                  cursor: "pointer",
                  minHeight: "2rem",
                  height: "2rem",
                  minWidth: "3rem",
                  width: "50%",
                  alignItems: "center",
                }}
              >
                Restore defaults
              </button>
            </div>
          </div>
        </TreeListItem>

        {/* Server items */}
        {blossomServerUrls.map((url, index) => (
          <ServerItem
            key={`${url}-${index}`}
            url={url}
            index={index}
            isPrimary={url === primaryBlossomServerUrl}
            onUpdate={handleUpdateServer}
            onRemove={handleRemoveServer}
            onSetPrimary={handleSetPrimary}
          />
        ))}

        {/* Description */}
        {blossomServerUrls.length > 0 && (
          <TreeListItem isLast>
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--text-color-muted)",
                lineHeight: "1.4",
                textAlign: "left",
                padding: "0.5rem 0",
              }}
            >
              Configure Blossom servers for file uploads. The primary server
              will be used for all uploads. You can add multiple servers and
              change which one is primary at any time.
            </div>
          </TreeListItem>
        )}
      </TreeList>
    </div>
  );
};

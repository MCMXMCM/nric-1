import React, { useState } from "react";
import { SettingRow } from "../SettingRow";
import { SectionHeader } from "./SectionHeader";
import { TreeList, TreeListItem } from "./TreeListItem";
import { useUIStore } from "../lib/useUIStore";
import {
  setShowReplies,
  setShowReposts,
  setCustomHashtags,
} from "../lib/uiStore";

interface FiltersSectionProps {
  isMobile: boolean;
}

export const FiltersSection: React.FC<FiltersSectionProps> = ({ isMobile }) => {
  // Read current values from UI store
  const showReplies = useUIStore((s) => s.showReplies);
  const showReposts = useUIStore((s) => s.showReposts);
  // const nsfwBlock = useUIStore((s) => s.nsfwBlock);
  const customHashtags = useUIStore((s) => s.customHashtags);

  const [customHashtagInput, setCustomHashtagInput] = useState("");

  // Note: Auto-enable logic moved to useNostrOperations where contacts are actually loaded

  const handleAddHashtag = () => {
    const cleaned = customHashtagInput.trim();
    if (cleaned.length === 0) return;
    const normalized = cleaned.replace(/^#+/, "");
    if (
      customHashtags
        .map((h) => h.toLowerCase())
        .includes(normalized.toLowerCase())
    )
      return;
    const next = [...customHashtags, normalized];
    setCustomHashtags(next);
    setCustomHashtagInput("");
  };

  const handleRemoveHashtag = (tag: string) => {
    const next = customHashtags.filter(
      (t) => t.toLowerCase() !== tag.toLowerCase()
    );
    setCustomHashtags(next);
  };

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <SectionHeader title="Filters" paddingTop="0" />
      <TreeList style={{ overflow: "hidden" }}>
        <TreeListItem>
          <SettingRow
            label="Show Replies"
            value={showReplies}
            onChange={() => {
              setShowReplies(!showReplies);
            }}
          />
        </TreeListItem>
        <TreeListItem>
          <SettingRow
            label="Show Reposts"
            value={showReposts}
            onChange={() => {
              setShowReposts(!showReposts);
            }}
          />
        </TreeListItem>

        <TreeListItem>
          <SettingRow
            label="NSFW Disrespector"
            value={true}
            onChange={() => {
              // setNsfwBlock(!nsfwBlock);
            }}
          />
        </TreeListItem>
        {/* Custom Filter parent item */}
        <TreeListItem paddingTop="1.5rem" isLast>
          <div
            style={{
              color: "var(--text-color)",

              fontSize: "var(--font-size-base)",
              textAlign: "start",
              fontWeight: "normal",
            }}
          >
            Custom Filter:
          </div>

          {/* Hashtag input item */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            <div
              style={{
                paddingTop: "0.5rem",
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
                width: "100%",
              }}
            >
              <span
                style={{
                  color: "var(--text-color)",

                  fontSize: "var(--font-size-base)",
                  opacity: 0.7,
                }}
              >
                #
              </span>
              <input
                type="text"
                value={customHashtagInput}
                onChange={(e) => {
                  const raw = e.currentTarget.value.replace(/^#+/, "");
                  setCustomHashtagInput(raw);
                }}
                placeholder="Add hashtag (e.g., memes)"
                style={{
                  backgroundColor: "transparent",
                  color: "var(--text-color)",
                  borderTop: "none",
                  borderLeft: "none",
                  borderRight: "none",
                  borderBottom: "1px dotted var(--border-color)",
                  padding: "0.25rem 0.5rem",

                  fontSize: "var(--font-size-base)",
                  width: "100%",
                  borderRadius: "0",
                  boxSizing: "border-box",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleAddHashtag();
                  }
                }}
                onFocus={(e) => {
                  if (isMobile) e.currentTarget.style.fontSize = "16px";
                }}
                onBlur={(e) => {
                  if (isMobile)
                    e.currentTarget.style.fontSize = "var(--font-size-sm)";
                }}
              />
            </div>
            {customHashtags.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.25rem",
                  width: "100%",
                }}
              >
                {customHashtags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      paddingLeft: "0.5rem",
                      gap: "0.25rem",
                      color: "var(--text-color)",
                      border: "1px dotted var(--border-color)",

                      fontSize: "var(--font-size-base)",
                      borderRadius: 0,
                      backgroundColor: "var(--app-bg-color)",
                    }}
                  >
                    #{tag}
                    <button
                      onClick={() => handleRemoveHashtag(tag)}
                      style={{
                        color: "var(--text-color)",
                        fontSize: "var(--font-size-base)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        textTransform: "uppercase",
                        transition: "all 0.3s ease",
                        borderRadius: "0",
                        whiteSpace: "nowrap",
                        height: "1.5rem",
                        minHeight: "1rem",
                        minWidth: "1rem",
                        background: "transparent",
                        cursor: "pointer",
                        border: "none",
                      }}
                      title="Remove hashtag"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div
              style={{ width: "100%", display: "flex", justifyContent: "end" }}
            >
              <button
                onClick={handleAddHashtag}
                style={{
                  backgroundColor: "transparent",
                  color: "var(--text-color)",
                  border: "1px dotted var(--border-color)",
                  padding: "0.25rem 0.5rem",
                  cursor: "pointer",

                  fontSize: "var(--font-size-base)",
                  transition: "all 0.3s ease",
                  width: "50%",
                  height: "30px",
                  textAlign: "center",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                Add Hashtag
              </button>
            </div>
          </div>
        </TreeListItem>
      </TreeList>
    </div>
  );
};

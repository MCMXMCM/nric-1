import React from "react";
import { SettingRow } from "../SettingRow";
import { SectionHeader } from "./SectionHeader";
import { TreeList, TreeListItem } from "./TreeListItem";
import { useUIStore } from "../lib/useUIStore";
import {
  setIsDarkMode,
  setUseAscii,
  setUseColor,
  setImageMode,
  setLongFormMode,
} from "../lib/uiStore";

interface ModesSectionProps {
  setAsciiCache: (value: any) => void;
}

export const ModesSection: React.FC<ModesSectionProps> = ({
  setAsciiCache,
}) => {
  // Read current values from UI store
  const isDarkMode = useUIStore((s) => s.isDarkMode);
  const useAscii = useUIStore((s) => s.useAscii);
  const useColor = useUIStore((s) => s.useColor);
  const imageMode = useUIStore((s) => s.imageMode);
  const longFormMode = useUIStore((s) => s.longFormMode || false);
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <SectionHeader title="Modes" paddingTop="0" />
      <TreeList>
        <TreeListItem>
          <SettingRow
            label="Dark Mode"
            value={isDarkMode}
            onChange={() => {
              setIsDarkMode(!isDarkMode);
            }}
          />
        </TreeListItem>
        <TreeListItem>
          <SettingRow
            label="Long Form Mode"
            value={longFormMode}
            onChange={() => {
              setLongFormMode(!longFormMode);
            }}
          />
        </TreeListItem>
        <TreeListItem>
          <SettingRow
            label="Media Mode"
            value={imageMode}
            onChange={() => {
              setImageMode(!imageMode);
            }}
          />
        </TreeListItem>
        <TreeListItem>
          <SettingRow
            label="ASCII Mode"
            value={useAscii}
            onChange={() => {
              setUseAscii(!useAscii);
            }}
          />
        </TreeListItem>
        <TreeListItem isLast>
          <SettingRow
            label="Color Mode"
            value={useColor}
            onChange={async () => {
              setUseColor(!useColor);
              // Clear ASCII cache to force rerender
              localStorage.removeItem("asciiCache");
              // Clear the asciiCache state by setting it to an empty object
              setAsciiCache({});
              // Also clear persistent ASCII cache
              try {
                // Note: clearAsciiCache removed - ASCII renderer now renders dynamically
              } catch (error) {
                console.error(
                  "Failed to clear ASCII cache from IndexedDB:",
                  error
                );
              }
            }}
            disabled={!useAscii}
          />
        </TreeListItem>
      </TreeList>
    </div>
  );
};

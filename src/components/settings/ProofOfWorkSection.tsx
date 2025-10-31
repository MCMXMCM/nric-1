import React, { useEffect, useState } from "react";
import { SectionHeader } from "./SectionHeader";
import { TreeList, TreeListItem } from "./TreeListItem";
import { SettingRow } from "../SettingRow";
import {
  readUserPowOverride,
  writeUserPowOverride,
  readPowEnabled,
  writePowEnabled,
} from "../../utils/nostr/powConfig";

interface ProofOfWorkSectionProps {
  isMobile?: boolean;
}

export const ProofOfWorkSection: React.FC<ProofOfWorkSectionProps> = ({
  isMobile,
}) => {
  const [value, setValue] = useState<string>("");
  const [enabled, setEnabled] = useState<boolean>(false);

  // Default to 24 if no override present; respect enabled toggle
  useEffect(() => {
    const existing = readUserPowOverride();
    const initialEnabled = readPowEnabled();
    setEnabled(initialEnabled);
    const initial = existing && existing > 0 ? existing : 24;
    setValue(String(initial));
  }, []);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setValue(raw);
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      writeUserPowOverride(Math.floor(n));
    } else if (raw === "") {
      // Allow clearing to remove override (relies on relay-derived bits)
      writeUserPowOverride(null);
    }
  };

  return (
    <div style={{ marginTop: isMobile ? "0.5rem" : "1rem" }}>
      <SectionHeader title="Proof of Work" />
      <TreeList>
        <TreeListItem>
          <SettingRow
            label="Custom POW"
            value={enabled}
            onChange={() => {
              const next = !enabled;
              setEnabled(next);
              writePowEnabled(next);
            }}
          />
        </TreeListItem>
        <TreeListItem>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <span
              style={{
                fontSize: "0.875rem",
                fontWeight: "400",
                color: "var(--text-color)",
              }}
            >
              Status
            </span>
            <span
              style={{
                color: "var(--text-color)",
                fontSize: "0.825rem",
                textAlign: "right",
              }}
            >
              {enabled
                ? value === "24"
                  ? "Difficulty is set to 24 bits (max)"
                  : `Difficulty is set to ${value} bits.`
                : `Auto-detected from relays.`}
            </span>
          </div>
        </TreeListItem>
        <TreeListItem isLast>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              opacity: enabled ? 1 : 0.5,
            }}
          >
            <span
              style={{
                fontSize: "0.875rem",
                fontWeight: "400",
                color: "var(--text-color)",
              }}
            >
              Difficulty (bits)
            </span>
            <input
              id="powBits"
              type="number"
              min={1}
              max={24}
              step={1}
              value={value}
              onChange={onChange}
              style={{
                width: 120,
                backgroundColor: "transparent",
                color: "var(--text-color)",
                border: "1px dotted var(--border-color)",
                padding: "0.25rem 0.5rem",
                borderRadius: "0rem",
                textAlign: "center",
              }}
              disabled={!enabled}
            />
          </div>
        </TreeListItem>
      </TreeList>
    </div>
  );
};

export default ProofOfWorkSection;

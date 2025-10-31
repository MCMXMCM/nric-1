import React from "react";
import { ToggleButton } from "./ToggleButton";
import { AlwaysOnToggleButton } from "./AlwaysOnToggle";

interface SettingRowProps {
  label: string;
  value: boolean;
  onChange: () => void;
  disabled?: boolean;
}

export const SettingRow: React.FC<SettingRowProps> = ({
  label,
  value,
  onChange,
  disabled,
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "1rem",
      opacity: disabled ? 0.5 : 1,
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
      {label}
    </span>
    {label === "NSFW Disrespector" ? (
      <AlwaysOnToggleButton
        value={true}
        onClick={onChange}
        disabled={disabled}
      />
    ) : (
      <ToggleButton value={value} onClick={onChange} disabled={disabled} />
    )}
  </div>
);

import React from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import LoadingSpinner from "../ui/LoadingSpinner";
import { DEFAULT_RELAY_URLS } from "../../utils/nostr/constants";
import {
  parseModalState,
  updateUrlWithModalState,
  type ModalState,
} from "../../utils/modalUrlState";

interface EmptyStateProps {
  relayUrls: string[];
  addRelay: (url: string) => void;
  fetchAfterConnectRef: React.MutableRefObject<boolean>;
  isMobile: boolean;
  state: any;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  relayUrls,
  addRelay,
  fetchAfterConnectRef,
  isMobile,
  state,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  if (relayUrls.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          alignItems: "center",
        }}
      >
        <div style={{ color: "#ef4444" }}>No relays configured</div>
        <div style={{ opacity: 0.75 }}>
          Add a relay or restore default relays to load new notes
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => {
              fetchAfterConnectRef.current = true;
              DEFAULT_RELAY_URLS.forEach((relay) => addRelay(relay));
            }}
            style={{
              color: "var(--text-color)",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              backgroundColor: "var(--app-bg-color)",
              border: "1px dotted var(--border-color)",
              padding: "0.25rem 0.5rem",
            }}
          >
            Restore Defaults
          </button>
          <button
            onClick={() => {
              const params = new URLSearchParams(location.search);
              // Ensure only modal params are affected via helper
              const newState: ModalState = {
                ...parseModalState(params),
                settings: true,
              } as ModalState;
              updateUrlWithModalState(newState, navigate, location);
              state.setShowOptions(true);
            }}
            style={{
              color: "var(--text-color)",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              backgroundColor: "var(--app-bg-color)",
              border: "1px dotted var(--border-color)",
              padding: "0.25rem 0.5rem",
            }}
          >
            Open Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        width: "100%",
        height: isMobile ? "70dvh" : 600,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <LoadingSpinner size="small" />
      <div
        style={{
          color: "var(--text-color)",
          fontFamily: '"IBM Plex Mono", monospace"',
          fontSize: "1rem",
          opacity: 0.8,
        }}
      >
        Loading notes...
      </div>
    </div>
  );
};

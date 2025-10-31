import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useNdkWallet } from "../../contexts/NdkWalletContext";
import { useNostr } from "../../contexts/NostrContext";
import WalletConnectModal from "../WalletConnectModal";
import SavedWalletsModal from "../SavedWalletsModal";
import { getStoredWalletConnection } from "../../utils/walletStorage";
import { SectionHeader } from "./SectionHeader";
import { TreeList, TreeListItem } from "./TreeListItem";
import { SettingsButton } from "./SettingsButton";
import {
  parseModalState,
  updateUrlWithModalState,
  type ModalState,
} from "../../utils/modalUrlState";
import type { StoredWalletConnection } from "../../utils/walletStorage";

interface WalletSectionProps {
  isMobile: boolean;
}

export const WalletSection: React.FC<WalletSectionProps> = ({ isMobile }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { walletInfo } = useNdkWallet();
  const { loginMethod, pubkey } = useNostr();
  const [storedConnection, setStoredConnection] =
    useState<StoredWalletConnection | null>(null);

  // Check if user can connect wallets (must be logged in with nsec or nip07)
  const canConnectWallet = loginMethod === "nsec" || loginMethod === "nip07";

  // Check for stored connection
  useEffect(() => {
    const loadStoredConnection = async () => {
      const connection = await getStoredWalletConnection(undefined, { pubkey });
      setStoredConnection(connection);
    };
    loadStoredConnection();
  }, [pubkey]);

  // Listen for wallet state changes (when wallets are cleared or NSEC is unlocked)
  useEffect(() => {
    const handleWalletCleared = () => {
      const loadStoredConnection = async () => {
        const connection = await getStoredWalletConnection(undefined, {
          pubkey,
        });
        setStoredConnection(connection);
      };
      loadStoredConnection();
    };

    const handleNsecUnlocked = () => {
      const loadStoredConnection = async () => {
        const connection = await getStoredWalletConnection(undefined, {
          pubkey,
        });
        setStoredConnection(connection);
      };
      loadStoredConnection();
    };

    window.addEventListener("walletConnectionCleared", handleWalletCleared);
    window.addEventListener("nsecUnlocked", handleNsecUnlocked);

    return () => {
      window.removeEventListener(
        "walletConnectionCleared",
        handleWalletCleared
      );
      window.removeEventListener("nsecUnlocked", handleNsecUnlocked);
    };
  }, [pubkey]);

  // Sync modal state with URL parameters
  const modalState = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return parseModalState(params);
  }, [location.search]);

  const openWalletConnectModal = () => {
    const params = new URLSearchParams(location.search);
    const currentState = parseModalState(params);
    const newState: ModalState = { ...currentState, walletConnect: true };
    updateUrlWithModalState(newState, navigate as any, location, false);
  };

  const openSavedWalletsModal = () => {
    const params = new URLSearchParams(location.search);
    const currentState = parseModalState(params);
    const newState: ModalState = { ...currentState, savedWallets: true };
    updateUrlWithModalState(newState, navigate as any, location, false);
  };

  const closeWalletConnectModal = () => {
    const params = new URLSearchParams(location.search);
    const currentState = parseModalState(params);
    const newState: ModalState = { ...currentState, walletConnect: false };
    updateUrlWithModalState(newState, navigate as any, location, false);
  };

  const closeSavedWalletsModal = () => {
    const params = new URLSearchParams(location.search);
    const currentState = parseModalState(params);
    const newState: ModalState = { ...currentState, savedWallets: false };
    updateUrlWithModalState(newState, navigate as any, location, false);
  };

  return (
    <>
      <SectionHeader title="Lightning Wallet ⚡" />
      <TreeList>
        <TreeListItem>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span style={{ color: "var(--text-color)" }}>Status:</span>{" "}
            <div
              style={{
                width: "12px",
                height: "12px",

                backgroundColor: walletInfo.connected
                  ? "var(--relay-connected)"
                  : "var(--relay-disconnected)",
              }}
            />{" "}
            {walletInfo.connected ? "Connected" : "Not Connected"}
          </div>

          {/* Login requirement message */}
          {!canConnectWallet && (
            <div
              style={{
                padding: "8px",
                fontSize: "var(--font-size-sm)",
                textAlign: "left",
              }}
            >
              <strong>Login Required:</strong> You must be logged in with an
              NSEC key or browser extension to connect a Lightning wallet.
            </div>
          )}

          {/* Show stored connection info */}
          {storedConnection && !walletInfo.connected ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  fontSize: "var(--font-size-sm)",
                  color: "var(--text-color)",
                  textAlign: "left",
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      textAlign: "left",
                      width: "100%",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <div>
                      <strong>Stored:</strong>{" "}
                      {storedConnection.walletType.toUpperCase()} wallet
                    </div>
                    {storedConnection.connectionString === "encrypted" && (
                      <div
                        style={{
                          fontSize: "var(--font-size-base)",
                          color: "var(--text-color)",
                          opacity: 0.7,
                          marginTop: "2px",
                        }}
                      >
                        🔐 Encrypted - requires passphrase to connect
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div
                style={{
                  fontSize: "var(--font-size-sm)",
                  color: "var(--text-color)",
                  textAlign: "left",
                }}
              >
                Last used:{" "}
                {new Date(storedConnection.lastUsed).toLocaleDateString()}
              </div>
            </div>
          ) : walletInfo.connected ? (
            <div
              style={{
                fontSize: "var(--font-size-sm)",
                color: "var(--text-color)",
                textAlign: "left",
              }}
            >
              {/* For NWC wallets, show wallet name */}
              {walletInfo.walletType === "nwc" && storedConnection && (
                <div>NWC Name: {storedConnection.name}</div>
              )}
              {/* For non-NWC wallets, show balance here */}
              {walletInfo.walletType !== "nwc" && walletInfo.balance && (
                <div>Balance: {walletInfo.balance} sats</div>
              )}
              {walletInfo.lud16 && (
                <div>Lightning Address: {walletInfo.lud16}</div>
              )}
            </div>
          ) : (
            <></>
          )}
        </TreeListItem>

        {walletInfo.connected && walletInfo.walletType === "nwc" && (
          <TreeListItem>
            <div
              style={{
                fontSize: "var(--font-size-sm)",
                color: "var(--text-color)",
                textAlign: "left",
              }}
            >
              {walletInfo.balance && (
                <div>Balance: {walletInfo.balance} sats</div>
              )}
            </div>
          </TreeListItem>
        )}

        <TreeListItem lineTop="20%" isLast>
          <div
            style={{
              display: "flex",
              gap: "1rem",
            }}
          >
            <SettingsButton
              onClick={openWalletConnectModal}
              disabled={!canConnectWallet}
              style={{
                backgroundColor: canConnectWallet
                  ? "var(--btn-accent)"
                  : "#ccc",
                color: "white",
                width: isMobile ? "fit-content" : "auto",
                minHeight: "30px",
                alignSelf: isMobile ? "stretch" : "flex-start",
                cursor: canConnectWallet ? "pointer" : "not-allowed",
                opacity: canConnectWallet ? 1 : 0.6,
              }}
            >
              {walletInfo.connected ? "Manage Wallet" : "New Wallet"}
            </SettingsButton>
            {/* Show saved wallet button if user is logged in and has stored connection */}
            {canConnectWallet && storedConnection && !walletInfo.connected && (
              <SettingsButton
                onClick={openSavedWalletsModal}
                style={{
                  width: isMobile ? "fit-content" : "auto",
                  minHeight: "16px",
                  backgroundColor: "var(--accent-color)",
                  textAlign: "right",
                  color: "white",
                  minWidth: isMobile ? "fit-content" : "auto",
                  alignSelf: isMobile ? "stretch" : "flex-start",
                }}
              >
                Use Saved Wallet
              </SettingsButton>
            )}
          </div>
          <div
            style={{
              fontSize: "var(--font-size-xs)",
              color: "var(--text-color)",
              opacity: 0.7,
              textAlign: "left",
            }}
          >
            {walletInfo.connected
              ? "You're connected to " +
                (storedConnection?.name || "your wallet")
              : "Connect your Lightning wallet to send and receive zaps"}
          </div>
        </TreeListItem>
      </TreeList>

      <WalletConnectModal
        isOpen={!!modalState.walletConnect}
        onClose={closeWalletConnectModal}
        onSuccess={() => {
          closeWalletConnectModal();
        }}
      />

      <SavedWalletsModal
        isOpen={!!modalState.savedWallets}
        onClose={closeSavedWalletsModal}
        onSuccess={() => {
          closeSavedWalletsModal();
          // Refresh stored connection info
          const refreshStoredConnection = async () => {
            const connection = await getStoredWalletConnection();
            setStoredConnection(connection);
          };
          refreshStoredConnection();
        }}
      />
    </>
  );
};

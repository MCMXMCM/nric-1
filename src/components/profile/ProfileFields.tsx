import React from "react";
import type { Metadata } from "../../types/nostr/types";
import LoadingTextPlaceholder from "../ui/LoadingTextPlaceholder";
import { useNip05Verification } from "../../hooks/useNip05Verification";

interface ProfileFieldsProps {
  metadata: Metadata | null;
  isLoadingMeta: boolean;
  pubkeyHex?: string | null;
}

interface FieldItem {
  label: string;
  value: string;
  isLink?: boolean;
  isNip05?: boolean;
  isVerified?: boolean;
  isVerifying?: boolean;
  verificationError?: string;
  onRetryVerification?: () => void;
}

const ProfileFields: React.FC<ProfileFieldsProps> = ({
  metadata,
  isLoadingMeta,
  pubkeyHex,
}) => {
  // NIP-05 verification hook
  const {
    isVerified: nip05Verified,
    isVerifying: isVerifyingNip05,
    verificationError,
    refetchVerification,
  } = useNip05Verification(metadata?.nip05, pubkeyHex || undefined);
  const items: FieldItem[] = [
    {
      label: "About",
      value: metadata?.about || (isLoadingMeta ? "__LOADING__" : "—"),
    },
    {
      label: "Website",
      value: metadata?.website || (isLoadingMeta ? "__LOADING__" : "—"),
      isLink: !!metadata?.website,
    },
    {
      label: "Lightning Addr.",
      value:
        metadata?.lud16 ||
        metadata?.lud06 ||
        (isLoadingMeta ? "__LOADING__" : "—"),
      isLink: !!(metadata?.lud16 || metadata?.lud06),
    },
    {
      label: "NIP-05",
      value: metadata?.nip05 || (isLoadingMeta ? "__LOADING__" : "—"),
      isNip05: !!metadata?.nip05,
      isVerified: nip05Verified,
      isVerifying: isVerifyingNip05,
      verificationError: verificationError,
      onRetryVerification: refetchVerification,
    },
  ];

  return (
    <ul
      style={{
        position: "relative",
        margin: "0 0 0 1.5rem",
        padding: 0,
        listStyleType: "none",
      }}
    >
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <li
            key={item.label}
            style={{
              position: "relative",
              paddingLeft: "1.5rem",
              paddingTop: "0.5rem",
              paddingBottom: "0.5rem",
              textAlign: "left",
            }}
          >
            {/* Horizontal line */}
            <div
              style={{
                position: "absolute",
                left: "0",
                top: "50%",
                width: "1rem",
                height: "1px",
                backgroundColor: "var(--border-color)",
              }}
            />
            {/* Vertical line */}
            <div
              style={{
                position: "absolute",
                left: "0",
                top: "0",
                bottom: isLast ? "50%" : "0",
                width: "1px",
                backgroundColor: "var(--border-color)",
              }}
            />
            {/* Content */}
            <div
              style={{
                color: "var(--text-color)",
                fontSize: "0.875rem",
                textAlign: "left",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                overflowWrap: "anywhere",
              }}
            >
              {/* Label */}
              <div
                style={{
                  color: "var(--text-color)",
                  fontSize: "0.75rem",
                  marginBottom: "0.25rem",
                  textAlign: "start",
                  fontWeight: "500",
                }}
              >
                {item.label}
              </div>
              {/* Value */}
              <div
                style={{
                  color: "var(--text-color)",
                  fontSize: "0.875rem",
                  textAlign: "left",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  overflowWrap: "anywhere",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                }}
              >
                {item.value === "__LOADING__" ? (
                  <LoadingTextPlaceholder
                    type="custom"
                    customLength={
                      item.label === "Website"
                        ? 20
                        : item.label === "Lightning Address"
                        ? 22
                        : item.label === "NIP-05"
                        ? 25
                        : 30
                    }
                  />
                ) : item.isLink ? (
                  <a
                    href={
                      item.label === "Lightning Address"
                        ? `lightning:${item.value}`
                        : item.value
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "var(--link-color)",
                      textDecoration: "underline",
                      wordBreak: "break-word",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {item.value}
                  </a>
                ) : (
                  item.value
                )}
                {/* NIP-05 verification checkmark */}
                {item.isNip05 &&
                  item.value !== "__LOADING__" &&
                  item.value !== "—" && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "1rem",
                        height: "1rem",
                        backgroundColor: item.isVerified
                          ? "var(--success-color,rgb(9, 96, 47))"
                          : item.isVerifying
                          ? "var(--warning-color, #f59e0b)"
                          : "var(--error-color, #ef4444)",
                        color: "white",
                        fontSize: "0.75rem",
                        fontWeight: "bold",
                        flexShrink: 0,
                        cursor:
                          !item.isVerified &&
                          !item.isVerifying &&
                          item.onRetryVerification
                            ? "pointer"
                            : "default",
                      }}
                      title={
                        item.isVerified
                          ? "NIP-05 verified"
                          : item.isVerifying
                          ? "Verifying NIP-05..."
                          : item.verificationError ||
                            "NIP-05 verification failed - click to retry"
                      }
                      onClick={
                        !item.isVerified &&
                        !item.isVerifying &&
                        item.onRetryVerification
                          ? item.onRetryVerification
                          : undefined
                      }
                    >
                      {item.isVerified ? "✓" : item.isVerifying ? "⋯" : "✗"}
                    </span>
                  )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default ProfileFields;

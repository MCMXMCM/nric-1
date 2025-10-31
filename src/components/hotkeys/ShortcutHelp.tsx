import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "../lib/useUIStore";

interface ShortcutHelpProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: {
    navigation: Array<{ key: string; description: string }>;
    actions: Array<{ key: string; description: string }>;
    global: Array<{ key: string; description: string }>;
  };
}

export const ShortcutHelp: React.FC<ShortcutHelpProps> = ({
  isOpen,
  onClose,
  shortcuts,
}) => {
  const isDarkMode = useUIStore((state) => state.isDarkMode);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  const formatKey = (key: string) => {
    return key
      .split("+")
      .map((k) => {
        switch (k) {
          case "ctrl":
            return "Ctrl";
          case "alt":
            return "Alt";
          case "shift":
            return "Shift";
          case "meta":
            return "Cmd";
          case "space":
            return "Space";
          case "up":
            return "↑";
          case "down":
            return "↓";
          case "left":
            return "←";
          case "right":
            return "→";
          case "pageup":
            return "Page Up";
          case "pagedown":
            return "Page Down";
          case "enter":
            return "Enter";
          case "escape":
            return "Esc";
          default:
            return k.toUpperCase();
        }
      })
      .join(" + ");
  };

  const KeyBadge: React.FC<{ keyText: string }> = ({ keyText }) => (
    <span
      style={{
        display: "inline-block",
        padding: "2px 6px",
        margin: "0 2px",
        backgroundColor: isDarkMode ? "#333" : "#f0f0f0",
        border: `1px solid ${isDarkMode ? "#555" : "#ccc"}`,
        borderRadius: "3px",
        fontSize: "0.75rem",
        fontFamily: "monospace",
        color: isDarkMode ? "#fff" : "#000",
      }}
    >
      {formatKey(keyText)}
    </span>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={onClose}
          onKeyDown={handleKeyDown}
          tabIndex={-1}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            style={{
              backgroundColor: isDarkMode ? "#1a1a1a" : "#ffffff",
              border: `1px solid ${isDarkMode ? "#333" : "#ccc"}`,
              borderRadius: "8px",
              padding: "24px",
              maxWidth: "600px",
              width: "100%",
              maxHeight: "80vh",
              overflow: "auto",
              fontFamily: "IBM Plex Mono, monospace",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
                borderBottom: `1px solid ${isDarkMode ? "#333" : "#eee"}`,
                paddingBottom: "12px",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: "1.25rem",
                  color: isDarkMode ? "#fff" : "#000",
                }}
              >
                Keyboard Shortcuts
              </h2>
              <button
                onClick={onClose}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  color: isDarkMode ? "#fff" : "#000",
                  padding: "4px",
                }}
                aria-label="Close help"
              >
                ×
              </button>
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "24px" }}
            >
              {/* Navigation Shortcuts */}
              <div>
                <h3
                  style={{
                    margin: "0 0 12px 0",
                    fontSize: "1rem",
                    color: isDarkMode ? "#fff" : "#000",
                    fontWeight: "600",
                  }}
                >
                  Navigation
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {shortcuts.navigation.map((shortcut, index) => (
                    <div
                      key={index}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 0",
                      }}
                    >
                      <span style={{ color: isDarkMode ? "#ccc" : "#666" }}>
                        {shortcut.description}
                      </span>
                      <KeyBadge keyText={shortcut.key} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Shortcuts */}
              <div>
                <h3
                  style={{
                    margin: "0 0 12px 0",
                    fontSize: "1rem",
                    color: isDarkMode ? "#fff" : "#000",
                    fontWeight: "600",
                  }}
                >
                  Actions (when note is focused)
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {shortcuts.actions.map((shortcut, index) => (
                    <div
                      key={index}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 0",
                      }}
                    >
                      <span style={{ color: isDarkMode ? "#ccc" : "#666" }}>
                        {shortcut.description}
                      </span>
                      <KeyBadge keyText={shortcut.key} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Global Shortcuts */}
              <div>
                <h3
                  style={{
                    margin: "0 0 12px 0",
                    fontSize: "1rem",
                    color: isDarkMode ? "#fff" : "#000",
                    fontWeight: "600",
                  }}
                >
                  Global
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {shortcuts.global.map((shortcut, index) => (
                    <div
                      key={index}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 0",
                      }}
                    >
                      <span style={{ color: isDarkMode ? "#ccc" : "#666" }}>
                        {shortcut.description}
                      </span>
                      <KeyBadge keyText={shortcut.key} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: "20px",
                paddingTop: "12px",
                borderTop: `1px solid ${isDarkMode ? "#333" : "#eee"}`,
                fontSize: "0.875rem",
                color: isDarkMode ? "#888" : "#666",
                textAlign: "center",
              }}
            >
              Press <KeyBadge keyText="escape" /> to close this help
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

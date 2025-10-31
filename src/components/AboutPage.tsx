import React from "react";
import { TreeList, TreeListItem } from "./settings/TreeListItem";
import { SectionHeader } from "./settings/SectionHeader";

const AboutPage: React.FC = () => {
  const isMobileLayout = window.innerWidth <= 768;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--app-bg-color)",
        overflow: "auto",
        padding: isMobileLayout ? "1rem 0.5rem" : "2rem",
        maxWidth: "1000px",
        margin: "0 auto",
      }}
    >
      <div
        style={{
          maxWidth: "800px",
          margin: "0 auto",
          width: "100%",
        }}
      >
        {/* Header */}
        <div
          style={{
            textAlign: "left",
            marginBottom: "1rem",
            padding: "0 0 1rem 0",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <h2
            style={{
              fontSize: "1.2rem",
              color: "var(--app-text-secondary)",
              margin: "0",
              fontWeight: "normal",
            }}
          >
            Note Relay Interlink Client
          </h2>
        </div>

        {/* What Makes This Client Unique */}
        <section
          style={{
            marginBottom: "3rem",
            paddingLeft: "0.5rem",
            textAlign: "left",
          }}
        >
          {/* <SectionHeader title="What Makes This Client Unique" paddingTop="0" /> */}
          <div style={{ marginTop: "1.5rem", lineHeight: "1.6" }}>
            <p
              style={{
                color: "var(--text-color)",
                textAlign: "left",
                marginBottom: "1rem",
              }}
            >
              Note Relay Interlink Client (pronounced: "en-rick") is a
              specialized Nostr client for the user who wants to be "on the
              road" not "in the car" when driving software. Inspired by the
              golden years of computing when less wasn't more and users wanted
              control.
            </p>

            <SectionHeader title="At a Glance" />
            <TreeList style={{ marginLeft: "0.5rem" }}>
              <TreeListItem lineTop="1rem">
                <strong style={{ color: "var(--accent-color)" }}>
                  Stay Focused:
                </strong>{" "}
                Media is tolerated, but not given primacy. Don't let media
                highjack your monkey brain. Ascii and no-color mode help keep
                you focused and in the drivers seat.
              </TreeListItem>
              <TreeListItem lineTop="1rem">
                <strong style={{ color: "var(--accent-color)" }}>
                  More Text, Less Scroll:
                </strong>{" "}
                Nested threads and anchor links makes navigating threads great
                again.
              </TreeListItem>

              <TreeListItem lineTop="1rem">
                <strong style={{ color: "var(--accent-color)" }}>
                  Peak Aesthetics:
                </strong>{" "}
                See for yourself. Don't listen to the big bubble-button UX cult.
              </TreeListItem>
              <TreeListItem isLast={true} lineTop="1rem">
                <strong style={{ color: "var(--accent-color)" }}>
                  Cross-Platform (PWA Support):
                </strong>{" "}
                Works on desktop, mobile, and tablets.
              </TreeListItem>
            </TreeList>
          </div>
        </section>

        {/* Usage Guide */}
        <section style={{ marginBottom: "3rem", textAlign: "left" }}>
          <SectionHeader title="How to Use NRIC-1" />

          <div style={{ marginTop: "1.5rem" }}>
            <strong style={{ color: "var(--accent-color)" }}>
              Getting Started
            </strong>
            <TreeList style={{ marginLeft: "0.25rem", marginBottom: "1rem" }}>
              <TreeListItem
                style={{ marginLeft: "0.5rem" }}
                hasSubItems={true}
                lineTop="1rem"
              >
                <strong>First Time?</strong> If you don't have a login key
                already or just want to take this client for a test drive with
                an ephemeral key, create your own secure Nostr identity by
                generating a new public/private key pair. This creates a unique
                cryptographic identity that you can use to sign into Nostr. Your
                private key (nsec) is encrypted locally with AES-GCM encryption
                and can be stored persistently or kept only for the current
                session. The public key (npub) is your identity that others see
                and can be shared freely.
                <TreeList style={{ marginLeft: "0.5rem" }}>
                  <TreeListItem
                    isLast={true}
                    lineTop="1rem"
                    style={{ paddingBottom: "1rem" }}
                  >
                    <strong>Key Generation:</strong> Uses cryptographically
                    secure randomness (WebCrypto API) to generate a 32-byte
                    secret key, then derives the corresponding public key using
                    the Schnorr signature algorithm over the secp256k1 elliptic
                    curve - the same cryptography used by Bitcoin.
                  </TreeListItem>
                </TreeList>
              </TreeListItem>
              <TreeListItem
                style={{ marginLeft: "0.5rem" }}
                hasSubItems={true}
                lineTop="1rem"
              >
                <strong>Login Options:</strong> Click the user icon in the
                top-right or visit the login section of the settings.
                <TreeList style={{ marginLeft: "0.5rem" }}>
                  <TreeListItem
                    lineTop="1rem"
                    style={{ paddingBottom: "1rem" }}
                  >
                    <strong>NIP-07 Extension:</strong> Browser* extension that
                    securely manages your keys without exposing them to
                    websites.
                    <a
                      href="https://chromewebstore.google.com/detail/kpgefcfmnafjgpblomihpgmejjdanjjp?utm_source=item-share-cb"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--link-color)" }}
                    >
                      nos2x for Chrome
                    </a>{" "}
                    and{" "}
                    <a
                      href="https://apps.apple.com/us/app/nostash/id6744309333"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--link-color)" }}
                    >
                      Nostash for Safari
                    </a>{" "}
                    are popular options. <br />
                    <span
                      style={{
                        opacity: 0.7,
                        fontSize: "0.875rem",
                        fontWeight: "normal",
                      }}
                    >
                      *Not available on some platforms when used as a
                      progressive web app.
                    </span>
                  </TreeListItem>
                  <TreeListItem hasSubItems={true} lineTop="1rem">
                    <strong>NSEC Keys:</strong> Private keys are encrypted using
                    industry-standard AES-GCM (preferred) or XChaCha20-Poly1305
                    (fallback for iOS Safari) encryption. The encryption uses
                    PBKDF2 key derivation with 250,000 iterations and a
                    cryptographically secure 16-byte random salt for each key
                    <TreeList style={{ marginLeft: "0.5rem" }}>
                      <TreeListItem lineTop="1rem">
                        <strong>Session-only storage:</strong> Key stays in
                        memory and is cleared when you close/reload the browser
                      </TreeListItem>
                      <TreeListItem
                        isLast={true}
                        lineTop="1rem"
                        style={{ paddingBottom: "1rem" }}
                      >
                        <strong>Persistent storage:</strong> Optionally save
                        encrypted keys to IndexedDB - requires unlock with
                        passphrase on each new session
                      </TreeListItem>
                    </TreeList>
                  </TreeListItem>
                  <TreeListItem
                    isLast
                    lineTop="1rem"
                    style={{ paddingBottom: "2rem" }}
                  >
                    <strong>NPUB Login:</strong> Read-only mode for lurking or
                    browsing as someone else. You can view content and interact
                    with the interface, but cannot perform any write actions
                    that require signing. Access this option in the settings
                    menu, under the "User Login & Keys" section.
                  </TreeListItem>
                </TreeList>
              </TreeListItem>
              <TreeListItem
                style={{ marginLeft: "0.5rem" }}
                hasSubItems={true}
                lineTop="1rem"
              >
                <strong>Configure Relays:</strong> Use the settings gear to
                add/remove relay servers
                <TreeList style={{ marginLeft: "0.5rem" }}>
                  <TreeListItem lineTop="1rem">
                    <strong>Not signed in:</strong> You get default relays but
                    can change them and your changes will persist locally
                  </TreeListItem>
                  <TreeListItem lineTop="1rem">
                    <strong>On sign in:</strong> An attempt will be made to
                    fetch your relay preferences from the default and hint
                    relays. If they are available, the default relays will be
                    overwritten with your preferred relays
                  </TreeListItem>
                  <TreeListItem isLast={true} lineTop="1rem">
                    <strong>Npub login:</strong> Will attempt to fetch the
                    npub's relay preferences but will set all the relays to read
                    only
                  </TreeListItem>
                </TreeList>
              </TreeListItem>
              <TreeListItem
                style={{ marginLeft: "0.5rem" }}
                lineTop="1rem"
                isLast={true}
              >
                <strong>Filter Content:</strong> Adjust follow filters and
                content preferences in settings
              </TreeListItem>
            </TreeList>
            <strong style={{ color: "var(--accent-color)" }}>Hotkeys</strong>

            <TreeList style={{ marginLeft: "0.5rem", marginBottom: "1rem" }}>
              <TreeListItem isLast={true} hasSubItems={true} lineTop="1rem">
                <strong>Feed Hotkeys:</strong> Vim-style keyboard navigation for
                power users
                <TreeList style={{ marginLeft: "0.5rem" }}>
                  <TreeListItem hasSubItems={true} lineTop="1rem">
                    <strong>Navigation:</strong> Move through the feed without
                    touching the mouse
                    <TreeList style={{ marginLeft: "0.5rem" }}>
                      <TreeListItem lineTop="1rem">
                        <strong>j / ↓:</strong> Next note
                      </TreeListItem>
                      <TreeListItem lineTop="1rem">
                        <strong>k / ↑:</strong> Previous note
                      </TreeListItem>
                      <TreeListItem lineTop="1rem">
                        <strong>g g:</strong> Jump to top
                      </TreeListItem>
                      <TreeListItem lineTop="1rem">
                        <strong>Home / End:</strong> First / Last note
                      </TreeListItem>
                      <TreeListItem isLast={true} lineTop="1rem">
                        <strong>Page Up / Down:</strong> Scroll by page
                      </TreeListItem>
                    </TreeList>
                  </TreeListItem>
                  <TreeListItem hasSubItems={true} lineTop="1rem">
                    <strong>Actions:</strong> Interact with the focused note
                    <TreeList style={{ marginLeft: "0.5rem" }}>
                      <TreeListItem lineTop="1rem">
                        <strong>t:</strong> View thread
                      </TreeListItem>
                      <TreeListItem lineTop="1rem">
                        <strong>Enter:</strong> Open note detail
                      </TreeListItem>
                      <TreeListItem lineTop="1rem">
                        <strong>r:</strong> Repost note
                      </TreeListItem>
                      <TreeListItem lineTop="1rem">
                        <strong>Shift+R:</strong> Reply to note
                      </TreeListItem>
                      <TreeListItem lineTop="1rem">
                        <strong>Shift+L:</strong> Like note
                      </TreeListItem>
                      <TreeListItem lineTop="1rem">
                        <strong>Shift+B:</strong> Bookmark note
                      </TreeListItem>
                      <TreeListItem lineTop="1rem">
                        <strong>z:</strong> Zap note
                      </TreeListItem>
                      <TreeListItem lineTop="1rem">
                        <strong>l:</strong> Copy note link
                      </TreeListItem>
                      <TreeListItem lineTop="1rem">
                        <strong>p:</strong> Go to parent thread
                      </TreeListItem>
                      <TreeListItem lineTop="1rem">
                        <strong>Shift+T:</strong> Go to root thread
                      </TreeListItem>
                      <TreeListItem isLast={true} lineTop="1rem">
                        <strong>Space:</strong> Toggle media expansion
                      </TreeListItem>
                    </TreeList>
                  </TreeListItem>
                  <TreeListItem isLast={true} lineTop="1rem">
                    <strong>Shift+?:</strong> Show hotkey help menu
                  </TreeListItem>
                </TreeList>
              </TreeListItem>
            </TreeList>

            <strong style={{ color: "var(--accent-color)" }}>Navigation</strong>

            <TreeList style={{ marginLeft: "0.5rem", marginBottom: "1rem" }}>
              <TreeListItem hasSubItems={true} lineTop="1rem">
                <strong>Navigation Bar:</strong> Three-section grid layout with
                responsive design
                <TreeList style={{ marginLeft: "0.5rem" }}>
                  <TreeListItem hasSubItems={true} lineTop="1rem">
                    <strong>Left Section:</strong> Logo and connection status
                    <TreeList style={{ marginLeft: "0.5rem" }}>
                      <TreeListItem lineTop="1rem">
                        <strong>NRIC-1 Logo:</strong> Clickable striped logo
                        that navigates to home feed
                      </TreeListItem>
                      <TreeListItem isLast={true} lineTop="1rem">
                        <strong>Relay Status Lights:</strong> Visual indicators
                        showing connection status (green = connected, red =
                        disconnected) - desktop only
                      </TreeListItem>
                    </TreeList>
                  </TreeListItem>
                  <TreeListItem hasSubItems={true} lineTop="1rem">
                    <strong>Center Section:</strong> About link and mobile
                    status
                    <TreeList style={{ marginLeft: "0.5rem" }}>
                      <TreeListItem lineTop="1rem">
                        <strong>Desktop:</strong> "Note Relay Interlink Client"
                        text - click to view this About page
                      </TreeListItem>
                      <TreeListItem isLast={true} lineTop="1rem">
                        <strong>Mobile:</strong> Relay status lights appear here
                        when on mobile devices
                      </TreeListItem>
                    </TreeList>
                  </TreeListItem>
                  <TreeListItem isLast hasSubItems={true} lineTop="1rem">
                    <strong>Right Section:</strong> Notifications, profile, and
                    settings
                    <TreeList style={{ marginLeft: "0.5rem" }}>
                      <TreeListItem lineTop="1rem">
                        <strong>Amber Notification Button:</strong> Square
                        indicator that glows brighter with more notifications -
                        only visible when logged in
                      </TreeListItem>
                      <TreeListItem lineTop="1rem">
                        <strong>Profile Avatar:</strong> Your profile picture
                        (if logged in) or login icon (if not logged in) - click
                        to view your profile or sign in
                      </TreeListItem>
                      <TreeListItem isLast={true} lineTop="1rem">
                        <strong>Settings Button:</strong> Hamburger menu icon
                        (three horizontal lines) to access configuration options
                        and preferences
                      </TreeListItem>
                    </TreeList>
                  </TreeListItem>
                </TreeList>
              </TreeListItem>
              <TreeListItem isLast={true} hasSubItems={true} lineTop="1rem">
                <strong>Link Colors:</strong> Color-coded links indicate
                different types of content and actions
                <TreeList style={{ marginLeft: "0.5rem" }}>
                  <TreeListItem lineTop="1rem">
                    <strong>External Links:</strong> External web links that
                    open in a new tab when clicked
                    <br />
                    <span style={{ fontSize: "0.9em" }}>
                      <span style={{ color: "var(--ibm705-teal)" }}>
                        Dark mode: Teal
                      </span>{" "}
                      •{" "}
                      <span style={{ color: "var(--ibm-dark-teal)" }}>
                        Light mode: Dark teal
                      </span>
                    </span>
                  </TreeListItem>

                  <TreeListItem lineTop="1rem">
                    <strong>Media Links:</strong> Image and video links (JPG,
                    PNG, GIF, WebP, MP4, WebM, MOV, etc.) that open media in the
                    app
                    <br />
                    <span style={{ fontSize: "0.9em" }}>
                      <span style={{ color: "var(--ibm-slate-blue)" }}>
                        Dark mode: Slate blue
                      </span>{" "}
                      •{" "}
                      <span style={{ color: "var(--ibm705-orange)" }}>
                        Light mode: Orange
                      </span>
                    </span>
                  </TreeListItem>
                  <TreeListItem lineTop="1rem">
                    <strong>Hashtag Links:</strong> Hashtag links (#tag) that
                    filter the feed to show only notes containing that hashtag
                    <br />
                    <span style={{ fontSize: "0.9em" }}>
                      <span style={{ color: "var(--ibm-slate-blue)" }}>
                        Both modes: Slate blue
                      </span>
                    </span>
                  </TreeListItem>
                  <TreeListItem isLast={true} lineTop="1rem">
                    <strong>Default Links:</strong> General internal links and
                    navigation within the app. i.e. nostr: npub, nprofile,
                    nevent, etc.
                    <br />
                    <span style={{ fontSize: "0.9em" }}>
                      <span style={{ color: "var(--ibm-slate-blue)" }}>
                        Both modes: Slate blue
                      </span>
                    </span>
                  </TreeListItem>
                </TreeList>
              </TreeListItem>
            </TreeList>

            <strong style={{ color: "var(--accent-color)" }}>
              Button Icons
            </strong>
            <TreeList style={{ marginBottom: "1rem" }}>
              <TreeListItem hasSubItems={true} lineTop="1rem">
                <strong>Navigation Bar Buttons:</strong> Main interface controls
                <TreeList style={{ marginLeft: "0.5rem" }}>
                  <TreeListItem lineTop="1rem">
                    <strong>Notifications:</strong> Square amber indicator -
                    glows brighter with more notifications, only visible when
                    logged in
                  </TreeListItem>
                  <TreeListItem isLast={true} lineTop="1rem">
                    <strong>Settings Button:</strong> Hamburger menu icon with
                    three horizontal lines to access configuration options
                  </TreeListItem>
                </TreeList>
              </TreeListItem>
              <TreeListItem hasSubItems={true} lineTop="1rem">
                <strong>Note Action Buttons:</strong> Interact with notes
                <TreeList style={{ marginLeft: "0.5rem" }}>
                  <TreeListItem lineTop="1rem">
                    <strong>Reply:</strong>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ margin: "0 0.5rem", verticalAlign: "middle" }}
                    >
                      <polyline points="9 14 4 9 9 4" />
                      <path d="M20 20v-6a4 4 0 0 0-4-4H4" />
                    </svg>
                    Respond to a note
                  </TreeListItem>
                  <TreeListItem lineTop="1rem">
                    <strong>Repost:</strong>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ margin: "0 0.5rem", verticalAlign: "middle" }}
                    >
                      <path d="M17 1l4 4-4 4" />
                      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                      <path d="M7 23l-4-4 4-4" />
                      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                    </svg>
                    Share notes with your followers
                  </TreeListItem>
                  <TreeListItem lineTop="1rem">
                    <strong>Like:</strong>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ margin: "0 0.5rem", verticalAlign: "middle" }}
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="16" />
                      <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                    Add a "like" reaction
                  </TreeListItem>
                  <TreeListItem lineTop="1rem">
                    <strong>Zap:</strong>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ margin: "0 0.5rem", verticalAlign: "middle" }}
                    >
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    Send Lightning payments
                  </TreeListItem>
                  <TreeListItem isLast={true} lineTop="1rem">
                    <strong>Thread:</strong>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ margin: "0 0.5rem", verticalAlign: "middle" }}
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    View conversation thread
                  </TreeListItem>
                </TreeList>
              </TreeListItem>
              <TreeListItem isLast={true} hasSubItems={true} lineTop="1rem">
                <strong>Radial Menu:</strong> Central navigation hub
                <TreeList style={{ marginLeft: "0.5rem" }}>
                  <TreeListItem lineTop="1rem">
                    <strong>Center Button:</strong>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ margin: "0 0.5rem", verticalAlign: "middle" }}
                    >
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1" />
                    </svg>
                    Tap to open radial menu with additional options
                  </TreeListItem>
                  <TreeListItem lineTop="1rem">
                    <strong>Menu Options:</strong> Context-sensitive actions
                    appear around the center button
                  </TreeListItem>
                  <TreeListItem lineTop="1rem">
                    <strong>Navigation:</strong> Jump to parent, root, or repost
                    target notes
                  </TreeListItem>
                  <TreeListItem lineTop="1rem">
                    <strong>Share:</strong> Copy note links or share content
                  </TreeListItem>
                  <TreeListItem isLast={true} lineTop="1rem">
                    <strong>Thread Info:</strong> View reply counts and
                    conversation structure
                  </TreeListItem>
                </TreeList>
              </TreeListItem>
            </TreeList>
            <strong style={{ color: "var(--accent-color)" }}>
              Settings & Configuration
            </strong>

            <TreeList>
              <TreeListItem lineTop="1rem">
                <strong>Modes:</strong> Customize your viewing experience with
                dark mode, ASCII mode, color mode, and image-only filtering
              </TreeListItem>
              <TreeListItem lineTop="1rem">
                <strong>Filters:</strong> Control content visibility with reply
                and repost toggles, follow-only filtering, NSFW disrespect, and
                custom hashtag filters
              </TreeListItem>
              <TreeListItem lineTop="1rem">
                <strong>Login & Keys:</strong> Manage authentication with NIP-07
                extension support, NSEC key encryption, saved accounts, and
                read-only npub browsing
              </TreeListItem>
              <TreeListItem lineTop="1rem">
                <strong>Cache:</strong> Monitor and clear cached data including
                notes, metadata, contacts, and preferences for optimal
                performance
              </TreeListItem>
              <TreeListItem lineTop="1rem">
                <strong>Bookmarks:</strong> Save and organize your favorite
                notes for easy access later. Bookmark any note to create a
                personal collection, view all bookmarks in a dedicated page, and
                quickly navigate to your saved content from settings or the
                quick links menu. Bookmarks are stored locally in the browser's
                local storage and are not synced to any remote servers. The
                nostr booking nip was intentionally not implemented at this
                time.
              </TreeListItem>
              <TreeListItem hasSubItems={true} lineTop="1rem">
                <strong>Relay Management:</strong> Add, remove, and configure
                relay servers with granular read/write permissions and
                connection monitoring
                <TreeList style={{ marginLeft: "0.5rem", marginTop: "0.5rem" }}>
                  <TreeListItem lineTop="1rem">
                    <strong>Read (R):</strong> Subscribe to events and receive
                    content from the relay
                  </TreeListItem>
                  <TreeListItem lineTop="1rem">
                    <strong>Write (W):</strong> Publish events and send content
                    to the relay
                  </TreeListItem>
                  <TreeListItem lineTop="1rem">
                    <strong>ReadWrite (RW):</strong> Full bidirectional access
                    for both reading and writing
                  </TreeListItem>
                  <TreeListItem
                    isLast={true}
                    lineTop="1rem"
                    style={{ paddingBottom: "1rem" }}
                  >
                    <strong>Indexer (I):</strong> Specialized access for search
                    and indexing operations
                  </TreeListItem>
                </TreeList>
              </TreeListItem>
              <TreeListItem lineTop="1rem">
                <strong>Proof of Work:</strong> Set custom difficulty levels for
                note publishing or use relay-detected automatic settings
              </TreeListItem>
              <TreeListItem isLast={true} lineTop="1rem">
                <strong>Auxiliary Relay Stats:</strong> Monitor relay health
                metrics including success rates, response times, and connection
                attempts based on event relay-hints.
              </TreeListItem>
            </TreeList>
          </div>
        </section>

        {/* Experimental Features */}
        <section style={{ marginBottom: "3rem", textAlign: "left" }}>
          <SectionHeader title="Experimental Features" />

          <div style={{ marginTop: "1.5rem" }}>
            <h3
              style={{
                fontSize: "1rem",
                color: "var(--app-text-secondary)",
                margin: "0 0 1rem 0",
                fontWeight: "normal",
              }}
            >
              🧪 Outbox Relay Mode (Experimental)
            </h3>

            <TreeList>
              <TreeListItem lineTop="1rem">
                <strong>⚠️ Experimental Feature:</strong> Outbox relay mode is
                currently in experimental phase and is disabled by default
              </TreeListItem>
              <TreeListItem lineTop="1rem">
                <strong>What it does:</strong> Automatically discovers and uses
                NIP-65 relay lists from followed users to optimize relay routing
              </TreeListItem>
              <TreeListItem lineTop="1rem">
                <strong>Current Status:</strong> This feature is disabled by
                default due to performance and reliability issues
              </TreeListItem>
              <TreeListItem lineTop="1rem">
                <strong>How to enable:</strong> Go to Settings → Enhanced Relay
                Management → Outbox toggle (not recommended)
              </TreeListItem>
              <TreeListItem isLast={true} lineTop="1rem">
                <strong>Note:</strong> This feature may cause slower loading
                times and inconsistent behavior. Use at your own risk.
              </TreeListItem>
            </TreeList>
          </div>
        </section>

        {/* NIP Support */}
        <section style={{ marginBottom: "3rem", textAlign: "left" }}>
          <SectionHeader title="Nostr Support" />

          <div style={{ marginTop: "1.5rem" }}>
            <h3
              style={{
                color: "var(--text-color)",
                fontSize: ".875rem",
                marginBottom: "1rem",
                textAlign: "left",
              }}
            >
              These nostr improvement proposals are fully supported in this
              client.
            </h3>

            <TreeList style={{ marginLeft: "0.5rem" }}>
              <TreeListItem lineTop="1rem">
                <strong>NIP-01:</strong> Note and metadata
              </TreeListItem>
              <TreeListItem lineTop="1rem">
                <strong>NIP-02:</strong> Contact list and petnames
              </TreeListItem>
              <TreeListItem lineTop="1rem">
                <strong>NIP-05:</strong> DNS-based identifiers
              </TreeListItem>
              <TreeListItem lineTop="1rem">
                <strong>NIP-07:</strong> Browser extension key-store and signer
              </TreeListItem>
              <TreeListItem lineTop="1rem">
                <strong>NIP-10:</strong> Threads, replies, and tag conventions
              </TreeListItem>
              <TreeListItem lineTop="1rem">
                <strong>NIP-13:</strong> Proof-of-Work
              </TreeListItem>
              <TreeListItem lineTop="1rem">
                <strong>NIP-18:</strong> Reposts
              </TreeListItem>
              <TreeListItem lineTop="1rem">
                <strong>NIP-19:</strong> Bech32-encoded entities
              </TreeListItem>
              <TreeListItem lineTop="1rem">
                <strong>NIP-25:</strong> Reactions *considers all "likes"*
              </TreeListItem>
              <TreeListItem lineTop="1rem">
                <strong>NIP-56:</strong> Reporting
              </TreeListItem>
              <TreeListItem lineTop="1rem">
                <strong>NIP-57:</strong> Lightning Zaps
              </TreeListItem>
              <TreeListItem lineTop="1rem">
                <strong>NIP-65:</strong> Relay list metadata
              </TreeListItem>
              <TreeListItem isLast lineTop="1rem">
                <strong>NIP-94:</strong> File metadata and uploads
              </TreeListItem>
            </TreeList>
          </div>
        </section>

        {/* File Uploads & Media */}
        <section style={{ marginBottom: "3rem", textAlign: "left" }}>
          <SectionHeader title="File Uploads & Media" />

          <div style={{ marginTop: "1.5rem" }}>
            <p
              style={{
                color: "var(--text-color)",
                textAlign: "left",
                marginBottom: "1rem",
              }}
            >
              NRIC-1 supports secure file uploads through decentralized Blossom
              servers, allowing you to share images and videos in your notes
              while maintaining the decentralized nature of Nostr.
            </p>

            <TreeList style={{ marginLeft: "0.5rem" }}>
              <TreeListItem hasSubItems={true} lineTop="1rem">
                <strong style={{ color: "var(--accent-color)" }}>
                  Supported Media Types:
                </strong>{" "}
                Images (JPG, PNG, GIF, WebP) and videos (MP4, WebM, MOV, AVI,
                MKV)
                <TreeList style={{ marginLeft: "0.5rem" }}>
                  <TreeListItem lineTop="1rem">
                    <strong>File Size Limits:</strong> Up to 10MB per file by
                    default, with server-specific limits (some servers support
                    up to 50MB)
                  </TreeListItem>
                  <TreeListItem lineTop="1rem">
                    <strong>Drag & Drop:</strong> Simply drag files onto the
                    compose area or click the upload button
                  </TreeListItem>
                  <TreeListItem
                    isLast={true}
                    lineTop="1rem"
                    style={{ paddingBottom: "1rem" }}
                  >
                    <strong>Preview:</strong> Images show previews before
                    upload, videos display file information
                  </TreeListItem>
                </TreeList>
              </TreeListItem>

              <TreeListItem hasSubItems={true} lineTop="1rem">
                <strong style={{ color: "var(--accent-color)" }}>
                  Blossom Servers:
                </strong>{" "}
                Decentralized file hosting infrastructure for Nostr
                <TreeList style={{ marginLeft: "0.5rem" }}>
                  <TreeListItem lineTop="1rem">
                    <strong>Primary Server:</strong> Files are uploaded to your
                    selected primary server for optimal performance
                  </TreeListItem>
                  <TreeListItem lineTop="1rem">
                    <strong>Authentication:</strong> Uses your Nostr identity to
                    authenticate uploads securely
                  </TreeListItem>
                  <TreeListItem lineTop="1rem">
                    <strong>NIP-94 Compliance:</strong> Follows the Nostr File
                    Metadata standard for proper file tagging
                  </TreeListItem>
                  <TreeListItem
                    isLast={true}
                    lineTop="1rem"
                    style={{ paddingBottom: "1rem" }}
                  >
                    <strong>Configuration:</strong> Add, remove, or modify
                    Blossom servers and set your primary server in Settings →
                    File Upload
                  </TreeListItem>
                </TreeList>
              </TreeListItem>

              <TreeListItem lineTop="1rem">
                <strong style={{ color: "var(--accent-color)" }}>
                  Privacy & Security:
                </strong>{" "}
                Files are uploaded using your Nostr identity, ensuring only you
                can manage your uploads. No central authority controls your
                media.
              </TreeListItem>

              <TreeListItem isLast={true} lineTop="1rem">
                <strong style={{ color: "var(--accent-color)" }}>
                  Default Servers:
                </strong>{" "}
                Comes pre-configured with reliable Blossom servers including
                blossom.primal.net and blossom.nostr.build
              </TreeListItem>
            </TreeList>
          </div>
        </section>

        {/* Footer */}
        <div
          style={{
            textAlign: "left",
            marginTop: "4rem",
            padding: "2rem 0",
            borderTop: "1px solid var(--border-color)",
            color: "var(--app-text-secondary)",
            fontSize: "0.875rem",
          }}
        >
          <p>
            © {new Date().getFullYear()} NRIC-1. All rights reserved.
            <br />
            NRIC-1 is built with modern web technologies and follows Nostr
            protocol specifications.
            <br />
            For the latest updates and source code, visit the{" "}
            <a
              href="https://github.com/MCMXMCM/nric-1"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--link-color)" }}
            >
              project repository
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;

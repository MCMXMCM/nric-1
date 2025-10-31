# NRIC-1 - Note Relay Interlink Client

**Note Relay Interlink Client** (pronounced: "en-rick") is a specialized Nostr client for the user who wants to be "on the road" not "in the car" when driving software. Inspired by the golden years of computing when less wasn't more and users wanted control.

## At a Glance

- **Stay Focused:** Media is tolerated, but not given primacy. Don't let media highjack your monkey brain. ASCII and no-color mode help keep you focused and in the driver's seat.
- **More Text, Less Scroll:** Nested threads and anchor links makes navigating threads great again.
- **Peak Aesthetics:** See for yourself. Don't listen to the big bubble-button UX cult.
- **Cross-Platform (PWA Support):** Works on desktop, mobile, and tablets.

## What You Can Do

### Getting Started

#### First Time?

If you don't have a login key already or just want to take this client for a test drive with an ephemeral key, create your own secure Nostr identity by generating a new public/private key pair. This creates a unique cryptographic identity that you can use to sign into Nostr. Your private key (nsec) is encrypted locally with AES-GCM encryption and can be stored persistently or kept only for the current session. The public key (npub) is your identity that others see and can be shared freely.

**Key Generation:** Uses cryptographically secure randomness (WebCrypto API) to generate a 32-byte secret key, then derives the corresponding public key using the Schnorr signature algorithm over the secp256k1 elliptic curve - the same cryptography used by Bitcoin.

#### Login Options

Click the user icon in the top-right or visit the login section of the settings.

- **NIP-07 Extension:** Browser\* extension that securely manages your keys without exposing them to websites. [nos2x for Chrome](https://chromewebstore.google.com/detail/kpgefcfmnafjgpblomihpgmejjdanjjp?utm_source=item-share-cb) and [Nostash for Safari](https://apps.apple.com/us/app/nostash/id6744309333) are popular options.
  - \*Not available on some platforms when used as a progressive web app.

- **NSEC Keys:** Private keys are encrypted using industry-standard AES-GCM (preferred) or XChaCha20-Poly1305 (fallback for iOS Safari) encryption. The encryption uses PBKDF2 key derivation with 250,000 iterations and a cryptographically secure 16-byte random salt for each key.
  - **Session-only storage:** Key stays in memory and is cleared when you close/reload the browser
  - **Persistent storage:** Optionally save encrypted keys to IndexedDB - requires unlock with passphrase on each new session

- **NPUB Login:** Read-only mode for lurking or browsing as someone else. You can view content and interact with the interface, but cannot perform any write actions that require signing. Access this option in the settings menu, under the "User Login & Keys" section.

#### Configure Relays

Use the settings gear to add/remove relay servers.

- **Not signed in:** You get default relays but can change them and your changes will persist locally
- **On sign in:** An attempt will be made to fetch your relay preferences from the default and hint relays. If they are available, the default relays will be overwritten with your preferred relays
- **Npub login:** Will attempt to fetch the npub's relay preferences but will set all the relays to read only

#### Filter Content

Adjust follow filters and content preferences in settings.

### Keyboard Shortcuts (Hotkeys)

**Feed Hotkeys:** Vim-style keyboard navigation for power users

**Navigation:**

- `j` / `↓`: Next note
- `k` / `↑`: Previous note
- `g g`: Jump to top
- `Home` / `End`: First / Last note
- `Page Up` / `Down`: Scroll by page

**Actions:**

- `t`: View thread
- `Enter`: Open note detail
- `r`: Repost note
- `Shift+R`: Reply to note
- `Shift+L`: Like note
- `Shift+B`: Bookmark note
- `z`: Zap note
- `l`: Copy note link
- `p`: Go to parent thread
- `Shift+T`: Go to root thread
- `Space`: Toggle media expansion

**Help:**

- `Shift+?`: Show hotkey help menu

### Settings & Configuration

- **Modes:** Customize your viewing experience with dark mode, ASCII mode, color mode, and image-only filtering
- **Filters:** Control content visibility with reply and repost toggles, follow-only filtering, NSFW disrespect, and custom hashtag filters
- **Login & Keys:** Manage authentication with NIP-07 extension support, NSEC key encryption, saved accounts, and read-only npub browsing
- **Cache:** Monitor and clear cached data including notes, metadata, contacts, and preferences for optimal performance
- **Bookmarks:** Save and organize your favorite notes for easy access later. Bookmark any note to create a personal collection, view all bookmarks in a dedicated page, and quickly navigate to your saved content from settings or the quick links menu. Bookmarks are stored locally in the browser's local storage and are not synced to any remote servers.
- **Relay Management:** Add, remove, and configure relay servers with granular read/write permissions and connection monitoring
  - **Read (R):** Subscribe to events and receive content from the relay
  - **Write (W):** Publish events and send content to the relay
  - **ReadWrite (RW):** Full bidirectional access for both reading and writing
  - **Indexer (I):** Specialized access for search and indexing operations
- **Proof of Work:** Set custom difficulty levels for note publishing or use relay-detected automatic settings
- **Auxiliary Relay Stats:** Monitor relay health metrics including success rates, response times, and connection attempts based on event relay-hints

### File Uploads & Media

NRIC-1 supports secure file uploads through decentralized Blossom servers, allowing you to share images and videos in your notes while maintaining the decentralized nature of Nostr.

**Supported Media Types:** Images (JPG, PNG, GIF, WebP) and videos (MP4, WebM, MOV, AVI, MKV)

- **File Size Limits:** Up to 10MB per file by default, with server-specific limits (some servers support up to 50MB)
- **Drag & Drop:** Simply drag files onto the compose area or click the upload button
- **Preview:** Images show previews before upload, videos display file information

**Blossom Servers:** Decentralized file hosting infrastructure for Nostr

- **Primary Server:** Files are uploaded to your selected primary server for optimal performance
- **Authentication:** Uses your Nostr identity to authenticate uploads securely
- **NIP-94 Compliance:** Follows the Nostr File Metadata standard for proper file tagging
- **Configuration:** Add, remove, or modify Blossom servers and set your primary server in Settings → File Upload

**Privacy & Security:** Files are uploaded using your Nostr identity, ensuring only you can manage your uploads. No central authority controls your media.

**Default Servers:** Comes pre-configured with reliable Blossom servers including blossom.primal.net and blossom.nostr.build

## Nostr Protocol Support

These Nostr Improvement Proposals (NIPs) are fully supported in this client:

- **NIP-01:** Note and metadata
- **NIP-02:** Contact list and petnames
- **NIP-05:** DNS-based identifiers
- **NIP-07:** Browser extension key-store and signer
- **NIP-10:** Threads, replies, and tag conventions
- **NIP-13:** Proof-of-Work
- **NIP-18:** Reposts
- **NIP-19:** Bech32-encoded entities
- **NIP-25:** Reactions _considers all "likes"_
- **NIP-56:** Reporting
- **NIP-57:** Lightning Zaps
- **NIP-65:** Relay list metadata
- **NIP-94:** File metadata and uploads

## Experimental Features

### 🧪 Outbox Relay Mode (Experimental)

**⚠️ Experimental Feature:** Outbox relay mode is currently in experimental phase and is disabled by default.

**What it does:** Automatically discovers and uses NIP-65 relay lists from followed users to optimize relay routing.

**Current Status:** This feature is disabled by default due to performance and reliability issues.

**How to enable:** Go to Settings → Enhanced Relay Management → Outbox toggle (not recommended)

**Note:** This feature may cause slower loading times and inconsistent behavior. Use at your own risk.

---

## Developer Setup

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Development Server

Start the development server:

```bash
npm run dev
```

The app will be available at `https://localhost:5173` (note: **HTTPS**, not HTTP).

#### HTTPS Development Server

**Important:** The development server runs on HTTPS by default using self-signed certificates via the `@vitejs/plugin-basic-ssl` plugin. This is **required** for iOS Safari WebSocket compatibility, as iOS Safari requires secure WebSocket connections (`wss://`) which only work over HTTPS.

**What this means:**

- First time accessing `https://localhost:5173`, your browser will show a security warning
- You need to accept/trust the self-signed certificate to proceed
- The certificate is generated automatically on first run
- This is normal behavior for local development with self-signed certificates

**Network Access:**
The dev server is configured with `host: true`, which means it's accessible from your local network at `https://[your-ip]:5173`. This allows you to test on mobile devices or other computers on your network.

### Build Scripts

The project includes several build-time scripts that generate assets:

- **Icons:** `npm run generate-icons` - Generates app icons in various sizes
- **Share Image:** `npm run generate-share-image` - Generates the social media share preview image
- **Splash Images:** `npm run generate-splash` - Generates iOS splash screen images for various device sizes

These scripts run automatically during the build process (`npm run build`), but can be run independently if needed.

### Production Build

Build for production:

```bash
npm run build
```

This will:

1. Run all asset generation scripts (icons, share image, splash images)
2. Compile TypeScript
3. Build and optimize the application with Vite
4. Generate service worker files for PWA support
5. Pre-compress assets (gzip and brotli)

The output will be in the `dist/` directory.

### Testing

Run the test suite:

```bash
# Run tests in watch mode
npm test

# Run tests once
npm run test:run

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage

# Run critical tests only
npm run test:critical
```

## Non-Standard Vite/React Configuration

This project uses several non-standard configurations that developers should be aware of:

### Progressive Web App (PWA)

The project uses `vite-plugin-pwa` for full PWA support:

- Service worker generation with Workbox
- Offline support with runtime caching strategies
- Automatic updates via service worker
- App manifest with icons and shortcuts
- Custom caching strategies for images and fonts

### Asset Compression

The build process includes automatic compression of assets:

- **Brotli compression** (`.br` files) for maximum compression
- **Gzip compression** (`.gz` files) for broader compatibility
- Pre-compressed assets are served by the hosting provider (configured in `amplify.yml`)

### Self-Signed SSL Certificates

The development server uses `@vitejs/plugin-basic-ssl` to automatically generate and serve self-signed SSL certificates. This is necessary because:

- iOS Safari requires `wss://` (secure WebSocket) connections
- Secure WebSockets only work over HTTPS
- Self-signed certificates are sufficient for local development

### Router

This project uses **TanStack Router** (not React Router) for routing. TanStack Router provides:

- Type-safe routing
- File-based route generation
- Advanced loading and data fetching patterns

### Build-Time Constants

The Vite config defines custom build-time constants:

- `__BUILD_TIME__`: ISO timestamp of when the build was created
- `__GIT_HASH__`: Version hash based on build timestamp (for cache busting)

### Code Splitting

Custom manual chunks are configured for optimal bundle splitting:

- `react`: React, React DOM, and TanStack Router
- `motion`: Framer Motion animations
- `nostr`: Nostr tools library

### Development Network Access

The dev server is configured with `host: true`, making it accessible on your local network. This is useful for:

- Testing on mobile devices
- Testing PWA features
- Cross-device development

### TypeScript Configuration

The project uses multiple TypeScript config files:

- `tsconfig.json`: Base configuration
- `tsconfig.app.json`: Application-specific configuration
- `tsconfig.node.json`: Node.js/build tool configuration

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **TanStack Router** - Type-safe routing
- **TanStack Query** - Data fetching and caching
- **Nostr Tools** - Nostr protocol implementation
- **Nostrify** - Nostr client library
- **Framer Motion** - Animations
- **Workbox** - Service worker and PWA support
- **IndexedDB** - Client-side database storage
- **Vitest** - Testing framework

## Project Structure

```
nric-1/
├── src/
│   ├── components/     # React components
│   ├── contexts/       # React contexts (Nostr, Modal, etc.)
│   ├── hooks/          # Custom React hooks
│   ├── stores/         # State management stores
│   ├── utils/          # Utility functions
│   ├── services/       # Service layer (media loading, etc.)
│   ├── types/          # TypeScript type definitions
│   ├── workers/        # Web Workers (PoW, thread tree, ASCII)
│   └── test/           # Test utilities and setup
├── scripts/            # Build-time scripts (icon generation, etc.)
├── public/             # Static assets
└── dist/               # Production build output
```

## License

MIT License

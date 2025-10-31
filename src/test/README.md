# Nostree Regression Test Suite

This comprehensive test suite is designed to lock in the current functionality of critical operations in the Nostree application, ensuring that future enhancements don't break existing working functions.

## Overview

The test suite covers essential logical operations across several categories:

### 🔐 Authentication & Key Management
- **NIP-07 Extension Authentication** - Browser extension login/logout flows
- **NSEC Key Authentication** - Private key login with persistence options
- **Saved Account Management** - Encrypted key storage and retrieval
- **Session Management** - Login state persistence across browser sessions
- **Crypto Key Operations** - Key derivation, encryption, and validation

### 📝 Core Nostr Operations
- **Event Signing** - Both NIP-07 extension and fallback signing methods
- **Note Publishing** - Complete note creation and relay publishing
- **Feed Loading** - Event fetching with filters and pagination
- **Profile Operations** - User metadata fetching and caching

### 💾 Database Operations
- **Note Caching** - IndexedDB storage and retrieval of notes
- **Metadata Caching** - User profile information persistence
- **Contacts Management** - Follow list storage and synchronization
- **Encrypted Storage** - Secure key persistence with encryption

## Test Structure

```
src/test/
├── README.md                           # This documentation
├── setup.ts                           # Global test configuration
├── mocks/
│   └── nostr.ts                       # Mock utilities for Nostr operations
├── contexts/
│   └── __tests__/
│       └── NostrContext.test.tsx      # Authentication context tests
├── utils/nostr/
│   └── __tests__/
│       ├── nip07.test.ts              # NIP-07 and crypto operations
│       ├── publish.test.ts            # Note publishing tests
│       └── db.test.ts                 # Database operations tests
└── hooks/
    └── __tests__/
        └── useNostrOperations.test.ts # Feed operations and hooks tests
```

## Key Test Scenarios

### Authentication Flow Testing
- ✅ NIP-07 extension detection and usage
- ✅ NSEC private key validation and derivation
- ✅ Passphrase-protected key persistence
- ✅ Saved account login with incorrect passwords
- ✅ Session cleanup on logout
- ✅ Error handling for invalid keys/extensions

### Crypto Operations Testing
- ✅ Secret key format validation (hex, nsec)
- ✅ Public key derivation from private keys
- ✅ AES-GCM and XChaCha20-Poly1305 encryption
- ✅ PBKDF2 key derivation with 250,000 iterations
- ✅ WebCrypto API fallback handling
- ✅ Base64 encoding/decoding operations

### Database Integrity Testing
- ✅ IndexedDB schema creation and upgrades
- ✅ Note storage with filter hash indexing
- ✅ Metadata persistence and retrieval
- ✅ Cache cleanup and management
- ✅ Encrypted secret storage operations
- ✅ Data migration and version handling

### Feed Operations Testing
- ✅ Note fetching with various filters (Bitcoin, News, Nostr)
- ✅ Pagination with timestamp-based cursors
- ✅ Follow-only filtering with contact lists
- ✅ Image-only note filtering
- ✅ Rate limiting and duplicate prevention
- ✅ Network error handling and retries

## Running Tests

```bash
# Run all tests once (57/57 tests)
npm run test:run

# Run tests in watch mode during development
npm test

# Run critical core tests (same as test:run)
npm run test:critical

# Run tests with UI dashboard
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

## Test Data and Mocks

### Mock Keys (Testing Only)
The test suite uses predetermined cryptographic keys that are **safe for testing only**:
- Private Key: `1234567890abcdef...` (64 hex chars)
- Public Key: Derived from private key
- NSEC: bech32-encoded private key
- NPUB: bech32-encoded public key

⚠️ **These keys are publicly known and should never be used in production.**

### Mock Services
- **MockSimplePool**: Simulates nostr-tools SimplePool for relay operations
- **Mock IndexedDB**: Uses fake-indexeddb for browser storage simulation
- **Mock WebCrypto**: Provides cryptographic operation mocking
- **Mock NIP-07**: Simulates browser extension behavior

## Critical Regression Areas

### 🚨 High-Risk Operations
These operations are critical and any failures could break core functionality:

1. **User Login/Logout** - Users must be able to authenticate
2. **Key Storage Security** - Private keys must be encrypted properly
3. **Note Publishing** - Users must be able to create posts
4. **Feed Loading** - Users must see notes from the network
5. **Session Persistence** - Login state must survive browser refreshes

### 🔍 Edge Cases Tested
- Empty/malformed content handling
- Network timeouts and errors
- Storage quota exceeded scenarios
- Corrupt database recovery
- Extension unavailability fallbacks
- Rate limiting enforcement

## Maintenance Guidelines

### Adding New Tests
When adding new functionality:

1. **Identify Critical Paths** - What could break existing functionality?
2. **Add Regression Tests** - Test both happy path and edge cases
3. **Mock External Dependencies** - Keep tests fast and reliable
4. **Document Test Purpose** - Explain why the test exists

### Updating Existing Tests
When modifying tests:

1. **Preserve Regression Coverage** - Don't remove safety nets
2. **Update Documentation** - Keep this README current
3. **Test Migration** - Ensure database/storage changes work
4. **Verify Backwards Compatibility** - Old data should still work

### Test Debugging
Common issues and solutions:

```bash
# IndexedDB issues
# Clear browser data or restart test environment

# Async timing issues
# Use waitFor() or increase timeouts appropriately

# Mock not working
# Verify vi.mock() is called before imports

# Crypto operations failing
# Check WebCrypto mock setup in test/setup.ts
```

## Security Considerations

### What These Tests Validate
- ✅ Encryption parameters (AES-GCM, iterations, key sizes)
- ✅ Key derivation algorithms (PBKDF2 with proper salts)
- ✅ Secure random number generation
- ✅ Proper key format validation
- ✅ Memory cleanup on logout

### What These Tests Don't Cover
- ❌ Side-channel attacks
- ❌ Timing attacks on crypto operations
- ❌ Browser security vulnerabilities
- ❌ Network protocol security
- ❌ Relay server security

## Performance Benchmarks

The test suite establishes performance baselines for:
- Database operations (< 100ms for typical operations)
- Key derivation (PBKDF2 with 250k iterations)
- Feed loading (pagination within 2s timeout)
- Note publishing (relay submission)

These benchmarks help detect performance regressions in future changes.

## Contributing

When contributing to this test suite:

1. **Follow Existing Patterns** - Use similar structure and naming
2. **Write Clear Descriptions** - Test names should explain purpose
3. **Test Edge Cases** - Don't just test the happy path
4. **Keep Tests Isolated** - Each test should be independent
5. **Mock External Dependencies** - Tests should be fast and reliable

This test suite is a safety net for the Nostree application. Treat it as critical infrastructure that enables confident development and deployment of new features.

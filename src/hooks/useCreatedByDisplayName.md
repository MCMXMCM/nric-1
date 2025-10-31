# useCreatedByDisplayName Hook

A reusable hook for displaying user names in Nostr applications with automatic metadata fetching and caching.

## Features

- **Smart caching**: Uses existing display names when available
- **Automatic metadata fetching**: Fetches user metadata when display names aren't cached
- **Mobile optimization**: Truncates npub on mobile devices
- **Loading states**: Provides loading indicators during metadata fetch
- **Fallback handling**: Gracefully falls back to npub when metadata is unavailable

## Usage

### Basic Usage

```tsx
import { useCreatedByDisplayName } from "../hooks/useCreatedByDisplayName";

const NoteAuthor = ({
  pubkey,
  relayUrls,
  isMobile,
  getDisplayNameForPubkey,
}) => {
  const { displayText, isLoading, npub, hasDisplayName } =
    useCreatedByDisplayName({
      pubkey,
      relayUrls,
      isMobile,
      getDisplayNameForPubkey,
    });

  if (isLoading) {
    return <LoadingTextPlaceholder type="npub" speed="normal" />;
  }

  return <span className="author-name">{displayText}</span>;
};
```

### With Navigation

```tsx
const AuthorLink = ({
  pubkey,
  relayUrls,
  isMobile,
  getDisplayNameForPubkey,
  onNavigate,
}) => {
  const { displayText, isLoading, npub } = useCreatedByDisplayName({
    pubkey,
    relayUrls,
    isMobile,
    getDisplayNameForPubkey,
  });

  const handleClick = (e) => {
    e.preventDefault();
    onNavigate(pubkey);
  };

  if (isLoading) {
    return <LoadingTextPlaceholder type="npub" speed="normal" />;
  }

  return (
    <a href={`/npub/${npub}`} onClick={handleClick}>
      {displayText}
    </a>
  );
};
```

### In Note Cards

```tsx
const NoteCard = ({ note, relayUrls, isMobile, getDisplayNameForPubkey }) => {
  const { displayText, isLoading, npub } = useCreatedByDisplayName({
    pubkey: note.pubkey,
    relayUrls,
    isMobile,
    getDisplayNameForPubkey,
  });

  return (
    <div className="note-card">
      <div className="note-header">
        {isLoading ? (
          <LoadingTextPlaceholder type="npub" speed="normal" />
        ) : (
          <span className="author">{displayText}</span>
        )}
        <span className="timestamp">{formatTime(note.created_at)}</span>
      </div>
      <div className="note-content">{note.content}</div>
    </div>
  );
};
```

## API Reference

### Parameters

```typescript
interface UseCreatedByDisplayNameOptions {
  pubkey: string; // The public key in hex format
  relayUrls: string[]; // Array of relay URLs to fetch metadata from
  isMobile?: boolean; // Whether the app is in mobile mode (default: false)
  getDisplayNameForPubkey: (pubkey: string) => string; // Function to get existing display names
}
```

### Return Value

```typescript
interface UseCreatedByDisplayNameResult {
  displayText: string | null; // The display text to show (or null if loading)
  isLoading: boolean; // Whether metadata is currently being fetched
  npub: string; // The npub format of the public key
  hasDisplayName: boolean; // Whether a display name was already cached
}
```

## Behavior

1. **Cached Display Names**: If `getDisplayNameForPubkey` returns a name different from the npub, it uses that immediately
2. **Metadata Fetching**: Only fetches metadata if no display name is cached
3. **Display Priority**: Uses `display_name` first, then `name`, then falls back to npub
4. **Mobile Truncation**: On mobile, npub is truncated to `npub1xxxx...xxxxx` format
5. **Loading States**: Returns `null` for `displayText` and `true` for `isLoading` during fetch

## Integration with Existing Code

This hook is designed to work seamlessly with the existing display name system:

- Uses the same `getDisplayNameForPubkey` function that's already used throughout the app
- Integrates with the existing `useMetadataQuery` hook for data fetching
- Compatible with the existing `LoadingTextPlaceholder` component
- Follows the same patterns as other hooks in the codebase

## Migration from Inline Logic

Before (inline logic in components):

```tsx
const currentDisplayName = getDisplayNameForPubkey(pubkey);
const npub = nip19.npubEncode(pubkey);
const hasDisplayName = currentDisplayName !== npub;

const { data: metadataResult, isPending: isLoadingMetadata } = useMetadataQuery(
  {
    pubkeyHex: hasDisplayName ? null : pubkey,
    relayUrls,
    enabled: !hasDisplayName && relayUrls.length > 0,
  }
);

// Complex display logic...
```

After (using the hook):

```tsx
const { displayText, isLoading, npub } = useCreatedByDisplayName({
  pubkey,
  relayUrls,
  isMobile,
  getDisplayNameForPubkey,
});
```

## Testing

The hook includes comprehensive tests covering:

- Existing display name usage
- Metadata fetching behavior
- Loading states
- Fallback scenarios
- Mobile truncation
- Error handling

Run tests with:

```bash
npm test -- src/hooks/__tests__/useCreatedByDisplayName.test.tsx --run
```

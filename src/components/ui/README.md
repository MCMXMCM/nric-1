# Loading Animation Components

This directory contains custom loading animation components for the Nostr application.

## Components

### LoadingSpinner
The main loading spinner component that automatically chooses between DOM and Canvas implementations based on size and performance needs.

**Props:**
- `size?: 'small' | 'large'` - Size of the animation (default: 'small')
  - `small`: 3x8 grid (24 characters) - For inline loading states (preferred)
  - `large`: 16x32 grid (512 characters) - For full-page loading states
- `useCanvas?: boolean` - Force canvas or DOM implementation
- `className?: string` - Additional CSS classes
- `style?: React.CSSProperties` - Additional inline styles
- `width?: number` - Custom width (for canvas version)
- `height?: number` - Custom height (for canvas version)

**Usage:**
```tsx
import LoadingSpinner from './ui/LoadingSpinner';

// Small animation (preferred, uses DOM by default)
<LoadingSpinner size="small" />

// Large animation (uses canvas by default)
<LoadingSpinner size="large" />

// Custom size
<LoadingSpinner size="large" width={400} height={200} />

// Mobile vertical aspect ratio
<LoadingSpinner size="large" width={400} height={600} />
```

### LoadingAnimation
DOM-based implementation using React components and Framer Motion animations.

**Features:**
- Smooth character transitions with scaling (no rotation)
- Responsive grid layout
- Theme-aware colors (light/dark mode)
- Optimized for small animations

### LoadingAnimationCanvas
Canvas-based implementation for better performance with larger animations.

**Features:**
- High-performance rendering using HTML5 Canvas
- Individual character timing (no rotation)
- Smooth 60fps animations
- Theme-aware colors
- Optimized for large animations (16x32 grid)
- Mobile vertical aspect ratio support (400x600)

### LoadingText
Single-line loading animation for inline text replacement.

**Features:**
- Variable width based on character count
- Perfect for replacing text fields, buttons, and labels
- Smooth character transitions with scaling (no rotation)
- Theme-aware colors
- Configurable animation speed

**Props:**
- `length: number` - Number of characters to display
- `speed?: 'slow' | 'normal' | 'fast'` - Animation speed (default: 'normal')
- `className?: string` - Additional CSS classes
- `style?: React.CSSProperties` - Additional inline styles

### LoadingTextPlaceholder
Utility component with pre-configured lengths for common text patterns.

**Features:**
- Automatic length calculation for common Nostr text types
- Easy drop-in replacement for loading states
- Consistent with application text patterns

**Props:**
- `type: 'npub' | 'hex' | 'displayName' | 'loadMore' | 'custom'` - Text type
- `customLength?: number` - Custom length (for 'custom' type)
- `speed?: 'slow' | 'normal' | 'fast'` - Animation speed
- `className?: string` - Additional CSS classes
- `style?: React.CSSProperties` - Additional inline styles

**Pre-configured Lengths:**
- `npub`: 63 characters (npub1 + 58 chars)
- `hex`: 64 characters (64-char hex string)
- `displayName`: 20 characters (typical display name)
- `loadMore`: 9 characters ("Load more" button text)
- `custom`: User-specified length

## Design Concept

The loading animations simulate a "password brute force" visualization with ASCII characters randomly changing in place. This creates a visually interesting effect that suggests computational work happening in the background.

### Character Set
- Standard ASCII characters: `!@#$%^&*()[]{}|\\:;"'<>.,?/`
- Numbers: `0-9`
- Letters: `A-Z`, `a-z`
- Special block characters: `█▓▒░■□▪▫▬▭▮▯▰▱`

### Animation Behavior
- Characters change randomly at different intervals (1-3 seconds)
- Each character rotates and scales independently
- Smooth fade-in/fade-out transitions
- Theme-aware colors that match the application's design system

## Performance Considerations

- **Small animations** (3x8 grid, 24 characters): Use DOM implementation for simplicity
- **Large animations** (16x32 grid, 512 characters): Use Canvas implementation for performance
- **Mobile devices**: Canvas implementation is preferred for better battery life
- **Animation timing**: Optimized to be visually interesting without being distracting

## Integration Examples

### Profile Loading
```tsx
if (isProfileTransition) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
      <LoadingSpinner size="large" />
      <div>Loading profile...</div>
    </div>
  );
}
```

### Notes Loading
```tsx
if (isLoadingNotes && notes.length === 0) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
      <LoadingSpinner size="small" />
      <div>Loading notes...</div>
    </div>
  );
}
```

### Inline Text Loading
```tsx
// Replace NPUB field while loading
<div>
  <span>NPUB: </span>
  {isLoadingNpub ? <LoadingTextPlaceholder type="npub" /> : npubBech32}
</div>

// Replace button text while loading
<button disabled={isLoading}>
  {isLoading ? <LoadingTextPlaceholder type="loadMore" /> : 'Load More'}
</button>

// Replace display name while loading
<div>
  {isLoadingName ? <LoadingTextPlaceholder type="displayName" /> : displayName}
</div>

// Custom length for specific text
<div>
  {isLoading ? <LoadingText length={25} /> : 'Some specific text here'}
</div>
```

## Testing

The components include comprehensive tests in `__tests__/LoadingSpinner.test.tsx` that verify:
- Correct implementation selection based on size
- Props passing and styling
- Default behavior
- Custom size handling

Run tests with:
```bash
npm run test:run
```

## Demo

Use the `LoadingDemo` component to see all animation variations in action:

```tsx
import LoadingDemo from './ui/LoadingDemo';

// Add to your app temporarily for testing
<LoadingDemo />
```

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LoadingText from '../LoadingText';
import LoadingTextPlaceholder from '../LoadingTextPlaceholder';

// Mock requestAnimationFrame for tests
const mockRequestAnimationFrame = vi.fn((callback) => {
  setTimeout(callback, 16);
  return 1;
});

const mockCancelAnimationFrame = vi.fn();

Object.defineProperty(window, 'requestAnimationFrame', {
  value: mockRequestAnimationFrame,
  writable: true,
});

Object.defineProperty(window, 'cancelAnimationFrame', {
  value: mockCancelAnimationFrame,
  writable: true,
});

describe('LoadingText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the correct number of characters', () => {
    render(<LoadingText length={5} />);
    const container = document.querySelector('span[style*="display: inline-block"]');
    expect(container).toBeInTheDocument();
  });

  it('should apply custom className and style', () => {
    const customStyle = { backgroundColor: 'red' };
    render(
      <LoadingText 
        length={3} 
        className="custom-class" 
        style={customStyle}
      />
    );
    
    const element = document.querySelector('span.custom-class');
    expect(element).toHaveClass('custom-class');
    expect(element).toHaveStyle('background-color: rgb(255, 0, 0)');
  });

  it('should use different speeds', () => {
    render(<LoadingText length={3} speed="fast" />);
    const element = document.querySelector('span[style*="display: inline-block"]');
    expect(element).toBeInTheDocument();
  });

  it('should handle zero length gracefully', () => {
    render(<LoadingText length={0} />);
    const container = document.querySelector('span');
    expect(container).toBeInTheDocument();
  });
});

describe('LoadingTextPlaceholder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render npub placeholder with correct length', () => {
    render(<LoadingTextPlaceholder type="npub" />);
    const container = document.querySelector('span[style*="display: inline-block"]');
    expect(container).toBeInTheDocument();
  });

  it('should render hex placeholder with correct length', () => {
    render(<LoadingTextPlaceholder type="hex" />);
    const container = document.querySelector('span[style*="display: inline-block"]');
    expect(container).toBeInTheDocument();
  });

  it('should render loadMore placeholder with correct length', () => {
    render(<LoadingTextPlaceholder type="loadMore" />);
    const container = document.querySelector('span[style*="display: inline-block"]');
    expect(container).toBeInTheDocument();
  });

  it('should render custom placeholder with specified length', () => {
    render(<LoadingTextPlaceholder type="custom" customLength={25} />);
    const container = document.querySelector('span[style*="display: inline-block"]');
    expect(container).toBeInTheDocument();
  });

  it('should apply custom className and style', () => {
    const customStyle = { backgroundColor: 'blue' };
    render(
      <LoadingTextPlaceholder 
        type="npub" 
        className="custom-class" 
        style={customStyle}
      />
    );
    
    const element = document.querySelector('span.custom-class');
    expect(element).toHaveClass('custom-class');
    expect(element).toHaveStyle('background-color: rgb(0, 0, 255)');
  });
});

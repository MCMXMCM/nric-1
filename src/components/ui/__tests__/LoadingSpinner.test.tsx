import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LoadingSpinner from '../LoadingSpinner';

// Mock the canvas component to avoid canvas-related issues in tests
vi.mock('../LoadingAnimationCanvas', () => ({
  default: ({ size, className, style }: any) => (
    <div data-testid="canvas-loading" className={className} style={style}>
      Canvas Loading Animation ({size})
    </div>
  )
}));

// Mock the DOM component
vi.mock('../LoadingAnimation', () => ({
  default: ({ size, className, style }: any) => (
    <div data-testid="dom-loading" className={className} style={style}>
      DOM Loading Animation ({size})
    </div>
  )
}));

describe('LoadingSpinner', () => {
  it('should render canvas version for large size when explicitly requested', () => {
    render(<LoadingSpinner size="large" useCanvas={true} />);
    expect(screen.getByTestId('canvas-loading')).toBeInTheDocument();
    expect(screen.getByText('Canvas Loading Animation (large)')).toBeInTheDocument();
  });

  it('should render DOM version for small size by default', () => {
    render(<LoadingSpinner size="small" />);
    expect(screen.getByTestId('dom-loading')).toBeInTheDocument();
    expect(screen.getByText('DOM Loading Animation (small)')).toBeInTheDocument();
  });

  it('should respect useCanvas prop when provided', () => {
    render(<LoadingSpinner size="small" useCanvas={true} />);
    expect(screen.getByTestId('canvas-loading')).toBeInTheDocument();
    expect(screen.getByText('Canvas Loading Animation (small)')).toBeInTheDocument();
  });

  it('should apply custom className and style', () => {
    const customStyle = { backgroundColor: 'red' };
    render(
      <LoadingSpinner 
        size="large" 
        useCanvas={true}
        className="custom-class" 
        style={customStyle}
      />
    );
    
    const element = screen.getByTestId('canvas-loading');
    expect(element).toHaveClass('custom-class');
    expect(element).toHaveStyle('background-color: rgb(255, 0, 0)');
  });

  it('should use small size as default', () => {
    render(<LoadingSpinner />);
    expect(screen.getByTestId('dom-loading')).toBeInTheDocument();
    expect(screen.getByText('DOM Loading Animation (small)')).toBeInTheDocument();
  });
});

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useNip05Verification } from '../useNip05Verification';
import { verifyNip05 } from '../../utils/nostr/nip05';

// Mock the nip05 utility
vi.mock('../../utils/nostr/nip05', () => ({
  verifyNip05: vi.fn()
}));

const mockVerifyNip05 = vi.mocked(verifyNip05);

describe('useNip05Verification', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  it('should return verified state when NIP-05 is valid', async () => {
    const nip05Identifier = 'bob@example.com';
    const pubkeyHex = 'b0635d6a9851d3aed0cd6c495b282167acf761729078d975fc341b22650b07b9';
    const mockResult = {
      isVerified: true,
      relays: ['wss://relay.example.com'],
    };

    mockVerifyNip05.mockResolvedValue(mockResult);

    const { result } = renderHook(
      () => useNip05Verification(nip05Identifier, pubkeyHex),
      { wrapper }
    );

    expect(result.current.isVerified).toBe(false);
    expect(result.current.isVerifying).toBe(true);

    await waitFor(() => {
      expect(result.current.isVerified).toBe(true);
      expect(result.current.isVerifying).toBe(false);
      expect(result.current.relays).toEqual(['wss://relay.example.com']);
      expect(result.current.verificationError).toBeUndefined();
    });

    expect(mockVerifyNip05).toHaveBeenCalledWith(nip05Identifier, pubkeyHex);
  });

  it('should return error state when NIP-05 verification fails', async () => {
    const nip05Identifier = 'bob@example.com';
    const pubkeyHex = 'b0635d6a9851d3aed0cd6c495b282167acf761729078d975fc341b22650b07b9';
    const mockResult = {
      isVerified: false,
      error: 'Name not found in .well-known/nostr.json',
    };

    mockVerifyNip05.mockResolvedValue(mockResult);

    const { result } = renderHook(
      () => useNip05Verification(nip05Identifier, pubkeyHex),
      { wrapper }
    );

    expect(result.current.isVerified).toBe(false);
    expect(result.current.isVerifying).toBe(true);

    await waitFor(() => {
      expect(result.current.isVerified).toBe(false);
      expect(result.current.isVerifying).toBe(false);
      expect(result.current.verificationError).toBe('Name not found in .well-known/nostr.json');
    });
  });

  it('should handle network errors', async () => {
    const nip05Identifier = 'bob@example.com';
    const pubkeyHex = 'b0635d6a9851d3aed0cd6c495b282167acf761729078d975fc341b22650b07b9';

    mockVerifyNip05.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(
      () => useNip05Verification(nip05Identifier, pubkeyHex),
      { wrapper }
    );

    expect(result.current.isVerified).toBe(false);
    expect(result.current.isVerifying).toBe(true);

    await waitFor(() => {
      expect(result.current.isVerified).toBe(false);
      expect(result.current.isVerifying).toBe(false);
      expect(result.current.verificationError).toBe('Network error');
    });
  });

  it('should not call verifyNip05 when nip05Identifier is empty', async () => {
    const { result } = renderHook(
      () => useNip05Verification('', 'pubkey'),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isVerifying).toBe(false);
    });

    expect(mockVerifyNip05).not.toHaveBeenCalled();
  });

  it('should not call verifyNip05 when pubkeyHex is empty', async () => {
    const { result } = renderHook(
      () => useNip05Verification('bob@example.com', ''),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isVerifying).toBe(false);
    });

    expect(mockVerifyNip05).not.toHaveBeenCalled();
  });

  it('should not call verifyNip05 when nip05Identifier is undefined', async () => {
    const { result } = renderHook(
      () => useNip05Verification(undefined, 'pubkey'),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isVerifying).toBe(false);
    });

    expect(mockVerifyNip05).not.toHaveBeenCalled();
  });

  it('should not call verifyNip05 when pubkeyHex is undefined', async () => {
    const { result } = renderHook(
      () => useNip05Verification('bob@example.com', undefined),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isVerifying).toBe(false);
    });

    expect(mockVerifyNip05).not.toHaveBeenCalled();
  });

  it('should allow refetching verification', async () => {
    const nip05Identifier = 'bob@example.com';
    const pubkeyHex = 'b0635d6a9851d3aed0cd6c495b282167acf761729078d975fc341b22650b07b9';

    mockVerifyNip05
      .mockResolvedValueOnce({ isVerified: false, error: 'First error' })
      .mockResolvedValueOnce({ isVerified: true, relays: ['wss://relay.example.com'] });

    const { result } = renderHook(
      () => useNip05Verification(nip05Identifier, pubkeyHex),
      { wrapper }
    );

    // Wait for first verification to complete
    await waitFor(() => {
      expect(result.current.verificationError).toBe('First error');
    });

    // Trigger refetch
    result.current.refetchVerification();

    // Wait for second verification to complete
    await waitFor(() => {
      expect(result.current.isVerified).toBe(true);
      expect(result.current.verificationError).toBeUndefined();
    });

    expect(mockVerifyNip05).toHaveBeenCalledTimes(2);
  });

  it('should cache verification results', async () => {
    const nip05Identifier = 'bob@example.com';
    const pubkeyHex = 'b0635d6a9851d3aed0cd6c495b282167acf761729078d975fc341b22650b07b9';
    const mockResult = { isVerified: true };

    mockVerifyNip05.mockResolvedValue(mockResult);

    // First hook
    const { result: result1 } = renderHook(
      () => useNip05Verification(nip05Identifier, pubkeyHex),
      { wrapper }
    );

    // Second hook with same parameters
    const { result: result2 } = renderHook(
      () => useNip05Verification(nip05Identifier, pubkeyHex),
      { wrapper }
    );

    // Both should eventually get the cached result
    await waitFor(() => {
      expect(result1.current.isVerified).toBe(true);
      expect(result2.current.isVerified).toBe(true);
    });

    // verifyNip05 should only be called once due to caching
    expect(mockVerifyNip05).toHaveBeenCalledTimes(1);
  });
});

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
// import type { SimplePool } from 'nostr-tools';
import { CACHE_KEYS } from '../utils/cacheKeys';
import type { ReactionCountsData } from './useReactionCountsQuery';

export interface PublishReactionParams {
  pool: any; // Using any to match the publish function signature
  relayUrls: string[];
  target: {
    id: string;
    pubkey: string;
    kind: number;
    tags: string[][];
  };
  content: string;
  relayHint?: string;
  relayPermissions?: Map<string, any>;
}

export interface UseReactionMutationResult {
  publishReaction: (params: PublishReactionParams) => Promise<void>;
  isPending: boolean;
  error: string | null;
}

export function useReactionMutation(myPubkey?: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (params: PublishReactionParams) => {
      const { publishReaction } = await import('../utils/nostr/publish');
      await publishReaction(params);
    },
    onMutate: async (params) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: CACHE_KEYS.REACTION_COUNTS(params.target.id),
      });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<ReactionCountsData>(
        CACHE_KEYS.REACTION_COUNTS(params.target.id)
      );

      // Optimistically update to the new value
      if (previousData && myPubkey) {
        const updatedData: ReactionCountsData = { ...previousData };
        const isLike = params.content === '+' || params.content === '';
        const isDislike = params.content === '-';

        if (isLike) {
          // Add like
          updatedData.likes += 1;
          updatedData.total += 1;
          updatedData.hasLikedByMe = true;
          // Remove dislike if user had disliked
          if (updatedData.hasDislikedByMe) {
            updatedData.dislikes = Math.max(0, updatedData.dislikes - 1);
            updatedData.hasDislikedByMe = false;
          }
        } else if (isDislike) {
          // Add dislike
          updatedData.dislikes += 1;
          updatedData.hasDislikedByMe = true;
          // Remove like if user had liked
          if (updatedData.hasLikedByMe) {
            updatedData.likes = Math.max(0, updatedData.likes - 1);
            updatedData.total = Math.max(0, updatedData.total - 1);
            updatedData.hasLikedByMe = false;
          }
        }

        queryClient.setQueryData(
          CACHE_KEYS.REACTION_COUNTS(params.target.id),
          updatedData
        );
      }

      // Return a context object with the snapshotted value
      return { previousData };
    },
    onError: (_err, params, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousData) {
        queryClient.setQueryData(
          CACHE_KEYS.REACTION_COUNTS(params.target.id),
          context.previousData
        );
      }
    },
    onSuccess: (_data, params) => {
      console.log("🎉 Reaction mutation successful for note:", params.target.id.substring(0, 10) + "...");
      // Haptic feedback is now triggered immediately in the user gesture context
    },
    onSettled: (_data, _error, params) => {
      // Always refetch after error or success to ensure we have the latest data
      queryClient.invalidateQueries({
        queryKey: CACHE_KEYS.REACTION_COUNTS(params.target.id),
      });
    },
  });

  const publishReaction = useCallback(async (params: PublishReactionParams) => {
    await mutation.mutateAsync(params);
  }, [mutation]);

  return {
    publishReaction,
    isPending: mutation.isPending,
    error: mutation.error ? (mutation.error as Error).message : null,
  };
}

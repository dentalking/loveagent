import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function useMatching() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Edge Function을 호출하여 새로운 매칭 생성
   */
  async function findMatches(userId: string) {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('match-users', {
        body: { user_id: userId },
      });

      if (fnError) {
        throw fnError;
      }

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to find matches';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  /**
   * DB 함수를 직접 호출하여 매칭 생성 (Edge Function 대안)
   */
  async function createMatchesDirectly(userId: string) {
    setLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await (supabase as any)
        .rpc('create_matches_for_user', { target_user_id: userId });

      if (rpcError) {
        throw rpcError;
      }

      return { matchCount: data };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create matches';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  /**
   * 매칭 수락
   */
  async function acceptMatch(matchId: string, isUserA: boolean) {
    const updateField = isUserA ? 'user_a_status' : 'user_b_status';

    const { error: updateError } = await supabase
      .from('matches')
      .update({ [updateField]: 'accepted' })
      .eq('id', matchId);

    if (updateError) {
      throw updateError;
    }
  }

  /**
   * 매칭 거절
   */
  async function rejectMatch(matchId: string, isUserA: boolean) {
    const updateField = isUserA ? 'user_a_status' : 'user_b_status';

    const { error: updateError } = await supabase
      .from('matches')
      .update({ [updateField]: 'rejected' })
      .eq('id', matchId);

    if (updateError) {
      throw updateError;
    }
  }

  return {
    loading,
    error,
    findMatches,
    createMatchesDirectly,
    acceptMatch,
    rejectMatch,
  };
}

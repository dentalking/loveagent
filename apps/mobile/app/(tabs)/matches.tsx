import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useUnreadCounts } from '../../hooks/useChat';
import { RealtimeChannel } from '@supabase/supabase-js';

type Match = {
  id: string;
  compatibility_score: number;
  match_reason: string | null;
  is_matched: boolean;
  matched_at: string | null;
  created_at: string;
  other_user: {
    id: string;
    nickname: string;
    birth_year: number;
    location: string;
    profile_image_url: string | null;
  };
  my_status: string;
  their_status: string;
  isUserA: boolean;
};

export default function MatchesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const unreadCounts = useUnreadCounts(user?.id || '');

  const fetchMatches = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('matches')
        .select(`
          id,
          compatibility_score,
          match_reason,
          is_matched,
          matched_at,
          created_at,
          user_a_id,
          user_b_id,
          user_a_status,
          user_b_status,
          user_a:users!matches_user_a_id_fkey(id, nickname, birth_year, location, profile_image_url),
          user_b:users!matches_user_b_id_fkey(id, nickname, birth_year, location, profile_image_url)
        `)
        .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) {
        return;
      }

      const formattedMatches: Match[] = (data || []).map((match) => {
        const isUserA = match.user_a_id === user.id;
        return {
          id: match.id,
          compatibility_score: match.compatibility_score,
          match_reason: match.match_reason,
          is_matched: match.is_matched,
          matched_at: match.matched_at,
          created_at: match.created_at,
          other_user: isUserA ? match.user_b : match.user_a,
          my_status: isUserA ? match.user_a_status : match.user_b_status,
          their_status: isUserA ? match.user_b_status : match.user_a_status,
          isUserA,
        } as Match;
      });

      setMatches(formattedMatches);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Realtime 구독
  useEffect(() => {
    if (!user) return;

    fetchMatches();

    const channel: RealtimeChannel = supabase
      .channel('matches-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
        },
        (payload) => {
          const record = payload.new as { user_a_id?: string; user_b_id?: string };
          if (record.user_a_id === user.id || record.user_b_id === user.id) {
            fetchMatches();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchMatches]);

  async function handleAccept(matchId: string, isUserA: boolean) {
    if (processingIds.has(matchId)) return;

    setProcessingIds((prev) => new Set(prev).add(matchId));
    const updateField = isUserA ? 'user_a_status' : 'user_b_status';

    const { error } = await supabase
      .from('matches')
      .update({ [updateField]: 'accepted' })
      .eq('id', matchId);

    setProcessingIds((prev) => {
      const next = new Set(prev);
      next.delete(matchId);
      return next;
    });

    if (error) {
      Alert.alert('오류', '수락 처리 중 문제가 발생했습니다.');
      return;
    }

    fetchMatches();
  }

  async function handleReject(matchId: string, isUserA: boolean) {
    if (processingIds.has(matchId)) return;

    setProcessingIds((prev) => new Set(prev).add(matchId));
    const updateField = isUserA ? 'user_a_status' : 'user_b_status';

    const { error } = await supabase
      .from('matches')
      .update({ [updateField]: 'rejected' })
      .eq('id', matchId);

    setProcessingIds((prev) => {
      const next = new Set(prev);
      next.delete(matchId);
      return next;
    });

    if (error) {
      Alert.alert('오류', '거절 처리 중 문제가 발생했습니다.');
      return;
    }

    fetchMatches();
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMatches();
    setRefreshing(false);
  }, [fetchMatches]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  if (matches.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyEmoji}>💝</Text>
        <Text style={styles.emptyTitle}>아직 매칭이 없어요</Text>
        <Text style={styles.emptyText}>
          가치관 테스트를 완료하면{'\n'}맞춤 매칭이 시작됩니다!
        </Text>
      </View>
    );
  }

  function handleChat(match: Match) {
    router.push({
      pathname: '/chat/[matchId]',
      params: {
        matchId: match.id,
        partnerName: match.other_user.nickname,
        partnerImage: match.other_user.profile_image_url || '',
      },
    });
  }

  function handleViewProfile(match: Match) {
    router.push({
      pathname: '/profile/[userId]',
      params: {
        userId: match.other_user.id,
        matchId: match.id,
      },
    });
  }

  return (
    <FlatList
      data={matches}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      renderItem={({ item }) => (
        <MatchCard
          match={item}
          onAccept={handleAccept}
          onReject={handleReject}
          onChat={handleChat}
          onViewProfile={handleViewProfile}
          isProcessing={processingIds.has(item.id)}
          unreadCount={unreadCounts[item.id] || 0}
        />
      )}
    />
  );
}

function MatchCard({
  match,
  onAccept,
  onReject,
  onChat,
  onViewProfile,
  isProcessing,
  unreadCount,
}: {
  match: Match;
  onAccept: (id: string, isUserA: boolean) => void;
  onReject: (id: string, isUserA: boolean) => void;
  onChat: (match: Match) => void;
  onViewProfile: (match: Match) => void;
  isProcessing: boolean;
  unreadCount: number;
}) {
  const age = new Date().getFullYear() - match.other_user.birth_year;

  const getStatusBadge = () => {
    if (match.is_matched) {
      return { text: '매칭 성사!', color: '#4CAF50' };
    }
    if (match.my_status === 'rejected' || match.their_status === 'rejected') {
      return { text: '매칭 실패', color: '#999' };
    }
    if (match.my_status === 'accepted' && match.their_status === 'pending') {
      return { text: '상대방 응답 대기', color: '#FF9800' };
    }
    if (match.my_status === 'pending') {
      return { text: '응답 대기 중', color: '#2196F3' };
    }
    return null;
  };

  const statusBadge = getStatusBadge();

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.cardHeader} onPress={() => onViewProfile(match)}>
        {match.other_user.profile_image_url ? (
          <Image
            source={{ uri: match.other_user.profile_image_url }}
            style={styles.avatarImage}
          />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {match.other_user.nickname.charAt(0)}
            </Text>
          </View>
        )}
        <View style={styles.userInfo}>
          <Text style={styles.nickname}>{match.other_user.nickname}</Text>
          <Text style={styles.details}>
            {age}세 · {match.other_user.location}
          </Text>
          <Text style={styles.viewProfileHint}>프로필 보기 ›</Text>
        </View>
        <View style={styles.scoreContainer}>
          <Text style={styles.scoreValue}>{Math.round(match.compatibility_score)}%</Text>
          <Text style={styles.scoreLabel}>호환</Text>
        </View>
      </TouchableOpacity>

      {match.match_reason && (
        <Text style={styles.reason}>{match.match_reason}</Text>
      )}

      {statusBadge && (
        <View style={[styles.statusBadge, { backgroundColor: statusBadge.color }]}>
          <Text style={styles.statusText}>{statusBadge.text}</Text>
        </View>
      )}

      {match.my_status === 'pending' && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.rejectButton, isProcessing && styles.buttonDisabled]}
            onPress={() => onReject(match.id, match.isUserA)}
            disabled={isProcessing}
          >
            <Text style={styles.rejectText}>{isProcessing ? '...' : '거절'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.acceptButton, isProcessing && styles.buttonDisabled]}
            onPress={() => onAccept(match.id, match.isUserA)}
            disabled={isProcessing}
          >
            <Text style={styles.acceptText}>{isProcessing ? '...' : '수락'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {match.is_matched && (
        <TouchableOpacity style={styles.chatButton} onPress={() => onChat(match)}>
          <Text style={styles.chatText}>💬 대화하기</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    padding: 24,
  },
  list: {
    padding: 16,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  nickname: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  details: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  viewProfileHint: {
    fontSize: 12,
    color: '#FF6B6B',
    marginTop: 4,
  },
  scoreContainer: {
    alignItems: 'center',
  },
  scoreValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FF6B6B',
  },
  scoreLabel: {
    fontSize: 12,
    color: '#999',
  },
  reason: {
    fontSize: 14,
    color: '#666',
    marginTop: 12,
    lineHeight: 20,
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  rejectButton: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  acceptButton: {
    flex: 1,
    height: 44,
    backgroundColor: '#FF6B6B',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  acceptText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  chatButton: {
    marginTop: 16,
    height: 44,
    backgroundColor: '#4CAF50',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    position: 'relative',
  },
  chatText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  unreadBadge: {
    position: 'absolute',
    top: -6,
    right: 12,
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

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

  const fetchMatches = useCallback(async () => {
    if (!user) return;

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
        user_a:users!matches_user_a_id_fkey(id, nickname, birth_year, location),
        user_b:users!matches_user_b_id_fkey(id, nickname, birth_year, location)
      `)
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    const formattedMatches: Match[] = data.map((match: any) => {
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
      };
    });

    setMatches(formattedMatches);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  async function handleAccept(matchId: string, isUserA: boolean) {
    const updateField = isUserA ? 'user_a_status' : 'user_b_status';

    const { error } = await supabase
      .from('matches')
      .update({ [updateField]: 'accepted' })
      .eq('id', matchId);

    if (!error) {
      fetchMatches();
    }
  }

  async function handleReject(matchId: string, isUserA: boolean) {
    const updateField = isUserA ? 'user_a_status' : 'user_b_status';

    const { error } = await supabase
      .from('matches')
      .update({ [updateField]: 'rejected' })
      .eq('id', matchId);

    if (!error) {
      fetchMatches();
    }
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
}: {
  match: Match;
  onAccept: (id: string, isUserA: boolean) => void;
  onReject: (id: string, isUserA: boolean) => void;
  onChat: (match: Match) => void;
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
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {match.other_user.nickname.charAt(0)}
          </Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.nickname}>{match.other_user.nickname}</Text>
          <Text style={styles.details}>
            {age}세 · {match.other_user.location}
          </Text>
        </View>
        <View style={styles.scoreContainer}>
          <Text style={styles.scoreValue}>{Math.round(match.compatibility_score)}%</Text>
          <Text style={styles.scoreLabel}>호환</Text>
        </View>
      </View>

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
            style={styles.rejectButton}
            onPress={() => onReject(match.id, match.isUserA)}
          >
            <Text style={styles.rejectText}>거절</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={() => onAccept(match.id, match.isUserA)}
          >
            <Text style={styles.acceptText}>수락</Text>
          </TouchableOpacity>
        </View>
      )}

      {match.is_matched && (
        <TouchableOpacity style={styles.chatButton} onPress={() => onChat(match)}>
          <Text style={styles.chatText}>💬 대화하기</Text>
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
  },
  chatText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

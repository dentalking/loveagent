import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

type UserProfile = {
  id: string;
  nickname: string;
  gender: string;
  birth_year: number;
  location: string;
  bio: string | null;
  profile_image_url: string | null;
  is_profile_complete: boolean | null;
};

type ResponseWithScenario = {
  scenario: { title: string; category: string; description: string };
  option: { option_text: string; option_code: string };
};

type MatchInfo = {
  id: string;
  compatibility_score: number;
  match_reason: string | null;
  is_matched: boolean | null;
};

export default function UserProfileScreen() {
  const { userId, matchId } = useLocalSearchParams<{ userId: string; matchId?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [responses, setResponses] = useState<ResponseWithScenario[]>([]);
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      fetchUserProfile();
    }
  }, [userId]);

  async function fetchUserProfile() {
    if (!userId || !user) return;

    try {
      // Fetch user profile
      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;
      setProfile(profileData);

      // Fetch user's scenario responses
      const { data: responsesData } = await supabase
        .from('user_scenario_responses')
        .select(`
          scenario:scenarios(title, category, description),
          option:scenario_options(option_text, option_code)
        `)
        .eq('user_id', userId);

      if (responsesData) {
        setResponses(responsesData as unknown as ResponseWithScenario[]);
      }

      // Fetch match info if matchId is provided or find existing match
      if (matchId) {
        const { data: matchData } = await supabase
          .from('matches')
          .select('id, compatibility_score, match_reason, is_matched')
          .eq('id', matchId)
          .single();

        if (matchData) {
          setMatchInfo(matchData);
        }
      } else {
        // Try to find existing match between users
        const { data: matchData } = await supabase
          .from('matches')
          .select('id, compatibility_score, match_reason, is_matched')
          .or(`and(user_a_id.eq.${user.id},user_b_id.eq.${userId}),and(user_a_id.eq.${userId},user_b_id.eq.${user.id})`)
          .single();

        if (matchData) {
          setMatchInfo(matchData);
        }
      }
    } catch (error) {
      // Error handling silently
    } finally {
      setLoading(false);
    }
  }

  function handleChat() {
    if (!matchInfo || !profile) return;

    router.push({
      pathname: '/chat/[matchId]',
      params: {
        matchId: matchInfo.id,
        partnerName: profile.nickname,
        partnerImage: profile.profile_image_url || '',
      },
    });
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>프로필을 찾을 수 없습니다.</Text>
      </View>
    );
  }

  const age = new Date().getFullYear() - profile.birth_year;

  return (
    <>
      <Stack.Screen
        options={{
          title: profile.nickname,
          headerStyle: { backgroundColor: '#FF6B6B' },
          headerTintColor: '#fff',
          headerBackTitle: '뒤로',
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          {profile.profile_image_url ? (
            <Image
              source={{ uri: profile.profile_image_url }}
              style={styles.avatarImage}
            />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{profile.nickname.charAt(0)}</Text>
            </View>
          )}
          <Text style={styles.nickname}>{profile.nickname}</Text>
          <Text style={styles.details}>
            {age}세 · {profile.gender === 'male' ? '남성' : '여성'} · {profile.location}
          </Text>
          {profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
        </View>

        {/* Match Info */}
        {matchInfo && (
          <View style={styles.matchInfoCard}>
            <View style={styles.compatibilityRow}>
              <Text style={styles.compatibilityLabel}>호환도</Text>
              <Text style={styles.compatibilityScore}>
                {Math.round(matchInfo.compatibility_score)}%
              </Text>
            </View>
            {matchInfo.match_reason && (
              <Text style={styles.matchReason}>{matchInfo.match_reason}</Text>
            )}
          </View>
        )}

        {/* Value Responses */}
        {responses.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>가치관 응답</Text>
            {responses.map((response, index) => (
              <View key={index} style={styles.responseCard}>
                <Text style={styles.responseCategory}>
                  {getCategoryLabel(response.scenario?.category || '')}
                </Text>
                <Text style={styles.responseTitle}>{response.scenario?.title}</Text>
                <View style={styles.responseAnswerContainer}>
                  <View style={styles.optionBadge}>
                    <Text style={styles.optionBadgeText}>
                      {response.option?.option_code}
                    </Text>
                  </View>
                  <Text style={styles.responseAnswer}>{response.option?.option_text}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Chat Button */}
        {matchInfo?.is_matched && (
          <TouchableOpacity style={styles.chatButton} onPress={handleChat}>
            <Text style={styles.chatButtonText}>대화하기</Text>
          </TouchableOpacity>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </>
  );
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    conflict: '갈등 해결',
    values: '가치관',
    lifestyle: '라이프스타일',
    future: '미래 계획',
    trust: '신뢰',
  };
  return labels[category] || category;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
  },
  profileHeader: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 16,
  },
  avatarText: {
    color: '#fff',
    fontSize: 48,
    fontWeight: 'bold',
  },
  nickname: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  details: {
    fontSize: 16,
    color: '#666',
    marginBottom: 12,
  },
  bio: {
    fontSize: 15,
    color: '#555',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  matchInfoCard: {
    backgroundColor: '#FFF0F0',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFD0D0',
  },
  compatibilityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  compatibilityLabel: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  compatibilityScore: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FF6B6B',
  },
  matchReason: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  responseCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  responseCategory: {
    fontSize: 12,
    color: '#FF6B6B',
    fontWeight: '600',
    marginBottom: 4,
  },
  responseTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  responseAnswerContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 12,
  },
  optionBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  optionBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  responseAnswer: {
    flex: 1,
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  chatButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 25,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  chatButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 32,
  },
});

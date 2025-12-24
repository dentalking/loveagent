import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useScenarios, ScenarioWithOptions } from '../../hooks/useScenarios';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

export default function ScenariosScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { scenarios, loading, error } = useScenarios();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);

  // Check if user already completed scenarios
  useEffect(() => {
    if (user) {
      checkExistingResponses();
    }
  }, [user]);

  async function checkExistingResponses() {
    if (!user) return;

    const { data: profile } = await supabase
      .from('users')
      .select('is_profile_complete')
      .eq('id', user.id)
      .single();

    if (profile?.is_profile_complete) {
      setAlreadyCompleted(true);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (alreadyCompleted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.completedEmoji}>✅</Text>
        <Text style={styles.completedTitle}>테스트 완료됨</Text>
        <Text style={styles.completedText}>
          이미 가치관 테스트를 완료했어요.{'\n'}
          매칭 탭에서 결과를 확인하세요!
        </Text>
        <TouchableOpacity
          style={styles.goToMatchesButton}
          onPress={() => router.push('/(tabs)/matches')}
        >
          <Text style={styles.goToMatchesText}>매칭 확인하기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (completed) {
    return (
      <View style={styles.centered}>
        <Text style={styles.completedEmoji}>🎉</Text>
        <Text style={styles.completedTitle}>테스트 완료!</Text>
        <Text style={styles.completedText}>
          {matchCount > 0
            ? `${matchCount}명의 매칭을 찾았어요!`
            : '당신의 가치관을 분석하고 있어요.'}{'\n'}
          매칭 탭에서 확인해보세요.
        </Text>
        <TouchableOpacity
          style={styles.goToMatchesButton}
          onPress={() => router.push('/(tabs)/matches')}
        >
          <Text style={styles.goToMatchesText}>매칭 보러가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentScenario = scenarios[currentIndex];

  async function handleSelect(optionId: number) {
    const newResponses = { ...responses, [currentScenario.id]: optionId };
    setResponses(newResponses);

    if (currentIndex < scenarios.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      await submitResponses(newResponses);
    }
  }

  async function submitResponses(allResponses: Record<number, number>) {
    if (!user) return;

    setSubmitting(true);

    const records = Object.entries(allResponses).map(([scenarioId, optionId]) => ({
      user_id: user.id,
      scenario_id: parseInt(scenarioId),
      selected_option_id: optionId,
    }));

    const { error } = await supabase
      .from('user_scenario_responses')
      .upsert(records, { onConflict: 'user_id,scenario_id' });

    if (error) {
      Alert.alert('오류', '응답 저장에 실패했습니다.');
      console.error(error);
      setSubmitting(false);
      return;
    }

    // Mark profile as complete (this triggers auto-matching via DB trigger)
    await supabase
      .from('users')
      .update({ is_profile_complete: true })
      .eq('id', user.id);

    // Wait a moment for trigger to complete, then count matches
    await new Promise(resolve => setTimeout(resolve, 1000));

    const { count } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`);

    setMatchCount(count || 0);
    setCompleted(true);
    setSubmitting(false);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.progress}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${((currentIndex + 1) / scenarios.length) * 100}%` },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {currentIndex + 1} / {scenarios.length}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.category}>{getCategoryLabel(currentScenario.category)}</Text>
        <Text style={styles.title}>{currentScenario.title}</Text>
        <Text style={styles.description}>{currentScenario.description}</Text>

        <View style={styles.options}>
          {currentScenario.options.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.optionButton,
                responses[currentScenario.id] === option.id && styles.optionSelected,
              ]}
              onPress={() => handleSelect(option.id)}
              disabled={submitting}
            >
              <Text style={styles.optionCode}>{option.option_code}</Text>
              <Text style={styles.optionText}>{option.option_text}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {submitting && (
        <View style={styles.submitting}>
          <ActivityIndicator color="#FF6B6B" />
          <Text style={styles.submittingText}>저장 중...</Text>
        </View>
      )}
    </ScrollView>
  );
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    conflict: '🔥 갈등 해결',
    values: '💎 가치관',
    lifestyle: '🏠 라이프스타일',
    future: '🔮 미래 계획',
    trust: '🤝 신뢰',
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
    backgroundColor: '#fff',
    padding: 24,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 16,
    textAlign: 'center',
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FF6B6B',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  category: {
    fontSize: 14,
    color: '#FF6B6B',
    fontWeight: '600',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    marginBottom: 24,
  },
  options: {
    gap: 12,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
    gap: 12,
  },
  optionSelected: {
    borderColor: '#FF6B6B',
    backgroundColor: '#FFF0F0',
  },
  optionCode: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FF6B6B',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 28,
    fontWeight: 'bold',
    fontSize: 14,
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  submitting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    gap: 8,
  },
  submittingText: {
    color: '#666',
    fontSize: 14,
  },
  completedEmoji: {
    fontSize: 64,
    marginBottom: 24,
  },
  completedTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  completedText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  goToMatchesButton: {
    marginTop: 24,
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
  },
  goToMatchesText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

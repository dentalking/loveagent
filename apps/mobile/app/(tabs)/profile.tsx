import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { useProfileImage } from '../../hooks/useProfileImage';

type UserProfile = {
  nickname: string;
  gender: string;
  birth_year: number;
  location: string;
  bio: string | null;
  is_profile_complete: boolean | null;
  profile_image_url: string | null;
};

type ResponseSummary = {
  category: string;
  title: string;
  selected_option: string;
};

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [responses, setResponses] = useState<ResponseSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const { uploading, error: uploadError, pickAndUpload, takeAndUpload, deleteImage } = useProfileImage(user?.id);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data: profileData } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
      }

      const { data: responsesData } = await supabase
        .from('user_scenario_responses')
        .select(`
          scenario:scenarios(title, category),
          option:scenario_options(option_text)
        `)
        .eq('user_id', user.id);

      if (responsesData) {
        const formattedResponses: ResponseSummary[] = responsesData.map((r) => ({
          category: (r.scenario as { category?: string })?.category || '',
          title: (r.scenario as { title?: string })?.title || '',
          selected_option: (r.option as { option_text?: string })?.option_text || '',
        }));
        setResponses(formattedResponses);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  // 화면에 포커스될 때마다 프로필 새로고침
  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, [fetchProfile])
  );

  useEffect(() => {
    if (uploadError) {
      Alert.alert('오류', uploadError);
    }
  }, [uploadError]);

  function handlePhotoPress() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['취소', '사진 찍기', '앨범에서 선택', ...(profile?.profile_image_url ? ['사진 삭제'] : [])],
          cancelButtonIndex: 0,
          destructiveButtonIndex: profile?.profile_image_url ? 3 : undefined,
        },
        async (buttonIndex) => {
          if (buttonIndex === 1) {
            const url = await takeAndUpload();
            if (url) fetchProfile();
          } else if (buttonIndex === 2) {
            const url = await pickAndUpload();
            if (url) fetchProfile();
          } else if (buttonIndex === 3 && profile?.profile_image_url) {
            const success = await deleteImage();
            if (success) fetchProfile();
          }
        }
      );
    } else {
      Alert.alert(
        '프로필 사진',
        '사진을 어떻게 변경하시겠어요?',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '사진 찍기',
            onPress: async () => {
              const url = await takeAndUpload();
              if (url) fetchProfile();
            },
          },
          {
            text: '앨범에서 선택',
            onPress: async () => {
              const url = await pickAndUpload();
              if (url) fetchProfile();
            },
          },
          ...(profile?.profile_image_url
            ? [
                {
                  text: '사진 삭제',
                  style: 'destructive' as const,
                  onPress: async () => {
                    const success = await deleteImage();
                    if (success) fetchProfile();
                  },
                },
              ]
            : []),
        ]
      );
    }
  }

  async function handleSignOut() {
    Alert.alert('로그아웃', '정말 로그아웃하시겠어요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: signOut,
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  const age = profile ? new Date().getFullYear() - profile.birth_year : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.profileHeader}>
        <TouchableOpacity onPress={handlePhotoPress} disabled={uploading}>
          <View style={styles.avatarContainer}>
            {profile?.profile_image_url ? (
              <Image
                source={{ uri: profile.profile_image_url }}
                style={styles.avatarImage}
              />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {profile?.nickname.charAt(0) || '?'}
                </Text>
              </View>
            )}
            {uploading ? (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : (
              <View style={styles.editBadge}>
                <Text style={styles.editBadgeText}>📷</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        <Text style={styles.photoHint}>탭하여 사진 변경</Text>
        <Text style={styles.nickname}>{profile?.nickname}</Text>
        <Text style={styles.details}>
          {age}세 · {profile?.gender === 'male' ? '남성' : '여성'} · {profile?.location}
        </Text>
        {profile?.is_profile_complete && (
          <View style={styles.completeBadge}>
            <Text style={styles.completeBadgeText}>✓ 프로필 완성</Text>
          </View>
        )}
      </View>

      {responses.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>내 가치관 응답</Text>
          {responses.map((response, index) => (
            <View key={index} style={styles.responseCard}>
              <Text style={styles.responseCategory}>
                {getCategoryLabel(response.category)}
              </Text>
              <Text style={styles.responseTitle}>{response.title}</Text>
              <Text style={styles.responseOption}>{response.selected_option}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>계정</Text>
        <View style={styles.menuCard}>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/profile/edit')}>
            <Text style={styles.menuText}>프로필 수정</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(tabs)')}>
            <Text style={styles.menuText}>가치관 응답 수정</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/settings/notifications')}>
            <Text style={styles.menuText}>알림 설정</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert('준비 중', '이용약관은 곧 제공될 예정입니다.')}>
            <Text style={styles.menuText}>이용약관</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={handleSignOut}>
            <Text style={[styles.menuText, styles.logoutText]}>로그아웃</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.version}>LoveAgent v1.0.0</Text>
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
  },
  profileHeader: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 8,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarText: {
    color: '#fff',
    fontSize: 40,
    fontWeight: 'bold',
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  editBadgeText: {
    fontSize: 14,
  },
  photoHint: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  },
  nickname: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  details: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  completeBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 12,
  },
  completeBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
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
    marginBottom: 8,
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
    marginBottom: 8,
  },
  responseOption: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  menuText: {
    fontSize: 16,
    color: '#333',
  },
  menuArrow: {
    fontSize: 20,
    color: '#999',
  },
  logoutText: {
    color: '#FF6B6B',
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
    marginTop: 24,
    marginBottom: 32,
  },
});

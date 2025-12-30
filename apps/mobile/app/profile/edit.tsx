import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
  ActionSheetIOS,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { useProfileImage } from '../../hooks/useProfileImage';

type UserProfile = {
  nickname: string;
  location: string;
  bio: string;
  profile_image_url: string | null;
};

export default function EditProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile>({
    nickname: '',
    location: '',
    bio: '',
    profile_image_url: null,
  });
  const [originalProfile, setOriginalProfile] = useState<UserProfile>({
    nickname: '',
    location: '',
    bio: '',
    profile_image_url: null,
  });
  const [nicknameStatus, setNicknameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  const { uploading, error: uploadError, pickAndUpload, takeAndUpload, deleteImage } = useProfileImage(user?.id);

  // 닉네임 중복 체크 (자신 제외)
  const checkNickname = useCallback(async (name: string) => {
    if (!user || name.length < 2) {
      setNicknameStatus('idle');
      return;
    }

    // 원래 닉네임과 같으면 체크 불필요
    if (name === originalProfile.nickname) {
      setNicknameStatus('idle');
      return;
    }

    setNicknameStatus('checking');

    // Using 'as any' because check_nickname_available is not in generated types yet
    const { data, error } = await (supabase as any).rpc('check_nickname_available', {
      check_nickname: name,
      exclude_user_id: user.id,
    });

    if (error) {
      setNicknameStatus('idle');
      return;
    }

    setNicknameStatus(data ? 'available' : 'taken');
  }, [user, originalProfile.nickname]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (profile.nickname.length >= 2 && profile.nickname !== originalProfile.nickname) {
        checkNickname(profile.nickname);
      } else {
        setNicknameStatus('idle');
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [profile.nickname, originalProfile.nickname, checkNickname]);

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    if (!user) return;

    const { data, error } = await supabase
      .from('users')
      .select('nickname, location, bio, profile_image_url')
      .eq('id', user.id)
      .single();

    if (data && !error) {
      const profileData = {
        nickname: data.nickname || '',
        location: data.location || '',
        bio: data.bio || '',
        profile_image_url: data.profile_image_url || null,
      };
      setProfile(profileData);
      setOriginalProfile(profileData);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (uploadError) {
      Alert.alert('오류', uploadError);
    }
  }, [uploadError]);

  async function handlePhotoPress() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['취소', '사진 찍기', '앨범에서 선택', ...(profile.profile_image_url ? ['사진 삭제'] : [])],
          cancelButtonIndex: 0,
          destructiveButtonIndex: profile.profile_image_url ? 3 : undefined,
        },
        async (buttonIndex) => {
          if (buttonIndex === 1) {
            const url = await takeAndUpload();
            if (url) setProfile({ ...profile, profile_image_url: url });
          } else if (buttonIndex === 2) {
            const url = await pickAndUpload();
            if (url) setProfile({ ...profile, profile_image_url: url });
          } else if (buttonIndex === 3 && profile.profile_image_url) {
            const success = await deleteImage();
            if (success) setProfile({ ...profile, profile_image_url: null });
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
              if (url) setProfile({ ...profile, profile_image_url: url });
            },
          },
          {
            text: '앨범에서 선택',
            onPress: async () => {
              const url = await pickAndUpload();
              if (url) setProfile({ ...profile, profile_image_url: url });
            },
          },
          ...(profile.profile_image_url
            ? [
                {
                  text: '사진 삭제',
                  style: 'destructive' as const,
                  onPress: async () => {
                    const success = await deleteImage();
                    if (success) setProfile({ ...profile, profile_image_url: null });
                  },
                },
              ]
            : []),
        ]
      );
    }
  }

  function validateForm(): string | null {
    if (!profile.nickname.trim()) {
      return '닉네임을 입력해주세요.';
    }
    if (profile.nickname.length < 2 || profile.nickname.length > 20) {
      return '닉네임은 2~20자 사이여야 합니다.';
    }
    if (nicknameStatus === 'taken') {
      return '이미 사용 중인 닉네임입니다.';
    }
    if (nicknameStatus === 'checking') {
      return '닉네임 확인 중입니다. 잠시만 기다려주세요.';
    }
    if (!profile.location.trim()) {
      return '지역을 입력해주세요.';
    }
    if (profile.location.length < 2) {
      return '지역을 정확히 입력해주세요.';
    }
    if (profile.bio && profile.bio.length > 200) {
      return '자기소개는 200자 이내로 입력해주세요.';
    }
    return null;
  }

  function hasChanges(): boolean {
    return (
      profile.nickname !== originalProfile.nickname ||
      profile.location !== originalProfile.location ||
      profile.bio !== originalProfile.bio
    );
  }

  async function handleSave() {
    if (!user) return;

    const validationError = validateForm();
    if (validationError) {
      Alert.alert('입력 오류', validationError);
      return;
    }

    if (!hasChanges()) {
      router.back();
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from('users')
      .update({
        nickname: profile.nickname.trim(),
        location: profile.location.trim(),
        bio: profile.bio.trim() || null,
      })
      .eq('id', user.id);

    setSaving(false);

    if (error) {
      Alert.alert('오류', '프로필 저장 중 문제가 발생했습니다.');
      return;
    }

    Alert.alert('완료', '프로필이 수정되었습니다.', [
      { text: '확인', onPress: () => router.back() },
    ]);
  }

  function handleCancel() {
    if (hasChanges()) {
      Alert.alert('변경사항 취소', '수정한 내용이 저장되지 않습니다.', [
        { text: '계속 수정', style: 'cancel' },
        { text: '취소', style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: '프로필 수정',
          headerStyle: { backgroundColor: '#FF6B6B' },
          headerTintColor: '#fff',
          headerBackTitle: '취소',
          headerLeft: () => (
            <TouchableOpacity onPress={handleCancel}>
              <Text style={styles.headerButton}>취소</Text>
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              <Text style={[styles.headerButton, saving && styles.headerButtonDisabled]}>
                {saving ? '저장 중...' : '저장'}
              </Text>
            </TouchableOpacity>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.photoSection}>
            <TouchableOpacity onPress={handlePhotoPress} disabled={uploading}>
              <View style={styles.avatarContainer}>
                {profile.profile_image_url ? (
                  <Image
                    source={{ uri: profile.profile_image_url }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {profile.nickname.charAt(0) || '?'}
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
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>닉네임 *</Text>
            <TextInput
              style={[
                styles.input,
                nicknameStatus === 'available' && styles.inputValid,
                nicknameStatus === 'taken' && styles.inputError,
              ]}
              value={profile.nickname}
              onChangeText={(text) => setProfile({ ...profile, nickname: text })}
              placeholder="닉네임을 입력하세요"
              placeholderTextColor="#999"
              maxLength={20}
            />
            <View style={styles.nicknameHintRow}>
              <View style={styles.nicknameStatus}>
                {nicknameStatus === 'checking' && (
                  <>
                    <ActivityIndicator size="small" color="#999" />
                    <Text style={styles.statusChecking}>확인 중...</Text>
                  </>
                )}
                {nicknameStatus === 'available' && (
                  <Text style={styles.statusAvailable}>사용 가능</Text>
                )}
                {nicknameStatus === 'taken' && (
                  <Text style={styles.statusTaken}>사용 불가</Text>
                )}
              </View>
              <Text style={styles.hint}>{profile.nickname.length}/20자</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>지역 *</Text>
            <TextInput
              style={styles.input}
              value={profile.location}
              onChangeText={(text) => setProfile({ ...profile, location: text })}
              placeholder="지역을 입력하세요 (예: 서울)"
              placeholderTextColor="#999"
              maxLength={20}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>자기소개</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={profile.bio}
              onChangeText={(text) => setProfile({ ...profile, bio: text })}
              placeholder="자신을 소개해주세요 (선택사항)"
              placeholderTextColor="#999"
              multiline
              numberOfLines={4}
              maxLength={200}
              textAlignVertical="top"
            />
            <Text style={styles.hint}>{profile.bio.length}/200자</Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>수정할 수 없는 정보</Text>
            <Text style={styles.infoText}>
              성별과 출생년도는 가입 시 설정한 정보로,{'\n'}
              수정이 필요하시면 고객센터로 문의해주세요.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  content: {
    padding: 16,
  },
  photoSection: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
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
  },
  headerButton: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 8,
  },
  headerButtonDisabled: {
    opacity: 0.5,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
  },
  inputValid: {
    borderColor: '#4CAF50',
  },
  inputError: {
    borderColor: '#FF6B6B',
  },
  nicknameHintRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  nicknameStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusChecking: {
    fontSize: 12,
    color: '#999',
  },
  statusAvailable: {
    fontSize: 12,
    color: '#4CAF50',
  },
  statusTaken: {
    fontSize: 12,
    color: '#FF6B6B',
  },
  textArea: {
    height: 120,
    paddingTop: 14,
  },
  hint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 4,
  },
  infoBox: {
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B8860B',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },
});

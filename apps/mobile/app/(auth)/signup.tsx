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
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [birthYear, setBirthYear] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [nicknameStatus, setNicknameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  // 닉네임 중복 체크 (debounce)
  const checkNickname = useCallback(async (name: string) => {
    if (name.length < 2) {
      setNicknameStatus('idle');
      return;
    }

    setNicknameStatus('checking');

    // Using 'as any' because check_nickname_available is not in generated types yet
    const { data, error } = await (supabase as any).rpc('check_nickname_available', {
      check_nickname: name,
    });

    if (error) {
      setNicknameStatus('idle');
      return;
    }

    setNicknameStatus(data ? 'available' : 'taken');
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (nickname.length >= 2) {
        checkNickname(nickname);
      } else {
        setNicknameStatus('idle');
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [nickname, checkNickname]);

  function validateForm(): string | null {
    if (!email || !password || !nickname || !gender || !birthYear || !location) {
      return '모든 필드를 입력해주세요.';
    }

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return '올바른 이메일 형식을 입력해주세요.';
    }

    // 비밀번호 길이 검증
    if (password.length < 6) {
      return '비밀번호는 6자 이상이어야 합니다.';
    }

    // 닉네임 길이 검증
    if (nickname.length < 2 || nickname.length > 20) {
      return '닉네임은 2~20자 사이여야 합니다.';
    }

    // 닉네임 중복 검증
    if (nicknameStatus === 'taken') {
      return '이미 사용 중인 닉네임입니다.';
    }

    if (nicknameStatus === 'checking') {
      return '닉네임 확인 중입니다. 잠시만 기다려주세요.';
    }

    // 출생년도 검증
    const year = parseInt(birthYear);
    if (isNaN(year) || year < 1960 || year > 2010) {
      return '출생년도는 1960~2010년 사이여야 합니다.';
    }

    // 지역 길이 검증
    if (location.length < 2) {
      return '지역을 정확히 입력해주세요.';
    }

    return null;
  }

  async function handleSignup() {
    const validationError = validateForm();
    if (validationError) {
      Alert.alert('입력 오류', validationError);
      return;
    }

    setLoading(true);

    try {
      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        Alert.alert('회원가입 실패', authError.message);
        setLoading(false);
        return;
      }

      if (authData.user && authData.user.id && gender) {
        // 2. Create user profile
        const userId = authData.user.id;
        const { error: profileError } = await supabase.from('users').insert({
          id: userId,
          nickname,
          gender: gender as 'male' | 'female',
          birth_year: parseInt(birthYear),
          location,
        }).select();

        if (profileError) {
          Alert.alert('프로필 생성 실패', profileError.message);
          setLoading(false);
          return;
        }
      }

      Alert.alert('가입 완료', '이메일 인증 후 로그인해주세요.', [
        { text: '확인', onPress: () => router.replace('/(auth)/login') }
      ]);
    } catch (error) {
      Alert.alert('오류', '예상치 못한 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>회원가입</Text>
        <Text style={styles.subtitle}>가치관으로 인연을 만나보세요</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="이메일"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholderTextColor="#999"
          />
          <TextInput
            style={styles.input}
            placeholder="비밀번호 (6자 이상)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholderTextColor="#999"
          />
          <View>
            <TextInput
              style={[
                styles.input,
                nicknameStatus === 'available' && styles.inputValid,
                nicknameStatus === 'taken' && styles.inputError,
              ]}
              placeholder="닉네임"
              value={nickname}
              onChangeText={setNickname}
              placeholderTextColor="#999"
              maxLength={20}
            />
            <View style={styles.nicknameStatus}>
              {nicknameStatus === 'checking' && (
                <>
                  <ActivityIndicator size="small" color="#999" />
                  <Text style={styles.statusChecking}>확인 중...</Text>
                </>
              )}
              {nicknameStatus === 'available' && (
                <Text style={styles.statusAvailable}>사용 가능한 닉네임입니다</Text>
              )}
              {nicknameStatus === 'taken' && (
                <Text style={styles.statusTaken}>이미 사용 중인 닉네임입니다</Text>
              )}
            </View>
          </View>

          <View style={styles.genderContainer}>
            <TouchableOpacity
              style={[styles.genderButton, gender === 'male' && styles.genderSelected]}
              onPress={() => setGender('male')}
            >
              <Text style={[styles.genderText, gender === 'male' && styles.genderTextSelected]}>
                남성
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.genderButton, gender === 'female' && styles.genderSelected]}
              onPress={() => setGender('female')}
            >
              <Text style={[styles.genderText, gender === 'female' && styles.genderTextSelected]}>
                여성
              </Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            placeholder="출생년도 (예: 1995)"
            value={birthYear}
            onChangeText={setBirthYear}
            keyboardType="number-pad"
            maxLength={4}
            placeholderTextColor="#999"
          />
          <TextInput
            style={styles.input}
            placeholder="지역 (예: 서울)"
            value={location}
            onChangeText={setLocation}
            placeholderTextColor="#999"
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? '가입 중...' : '가입하기'}
            </Text>
          </TouchableOpacity>
        </View>

        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={styles.linkButton}>
            <Text style={styles.linkText}>
              이미 계정이 있으신가요? <Text style={styles.linkTextBold}>로그인</Text>
            </Text>
          </TouchableOpacity>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  form: {
    gap: 16,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#FAFAFA',
  },
  inputValid: {
    borderColor: '#4CAF50',
  },
  inputError: {
    borderColor: '#FF6B6B',
  },
  nicknameStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    height: 20,
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
  genderContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  genderButton: {
    flex: 1,
    height: 52,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
  },
  genderSelected: {
    borderColor: '#FF6B6B',
    backgroundColor: '#FFF0F0',
  },
  genderText: {
    fontSize: 16,
    color: '#666',
  },
  genderTextSelected: {
    color: '#FF6B6B',
    fontWeight: '600',
  },
  button: {
    height: 52,
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#FFB5B5',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  linkText: {
    color: '#666',
    fontSize: 14,
  },
  linkTextBold: {
    color: '#FF6B6B',
    fontWeight: '600',
  },
});

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';

const NOTIFICATION_SETTINGS_KEY = '@notification_settings';

type NotificationSettings = {
  pushEnabled: boolean;
  matchNotifications: boolean;
  messageNotifications: boolean;
  matchAcceptedNotifications: boolean;
};

const defaultSettings: NotificationSettings = {
  pushEnabled: true,
  matchNotifications: true,
  messageNotifications: true,
  matchAcceptedNotifications: true,
};

export default function NotificationSettingsScreen() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [systemPermission, setSystemPermission] = useState<boolean | null>(null);

  useEffect(() => {
    loadSettings();
    checkSystemPermission();
  }, []);

  async function checkSystemPermission() {
    const { status } = await Notifications.getPermissionsAsync();
    setSystemPermission(status === 'granted');
  }

  async function loadSettings() {
    try {
      const stored = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
      if (stored) {
        setSettings(JSON.parse(stored));
      }
    } catch (error) {
      // Use default settings on error
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(newSettings: NotificationSettings) {
    setSaving(true);
    try {
      await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(newSettings));
      setSettings(newSettings);

      // Update push token status in database
      if (user) {
        await (supabase as any)
          .from('push_tokens')
          .update({ is_active: newSettings.pushEnabled })
          .eq('user_id', user.id);
      }
    } catch (error) {
      Alert.alert('오류', '설정 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(key: keyof NotificationSettings, value: boolean) {
    // If trying to enable push but system permission is denied
    if (key === 'pushEnabled' && value && !systemPermission) {
      Alert.alert(
        '알림 권한 필요',
        '알림을 받으려면 시스템 설정에서 알림 권한을 허용해주세요.',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '설정으로 이동',
            onPress: () => {
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            },
          },
        ]
      );
      return;
    }

    const newSettings = { ...settings, [key]: value };

    // If disabling push, disable all sub-settings
    if (key === 'pushEnabled' && !value) {
      newSettings.matchNotifications = false;
      newSettings.messageNotifications = false;
      newSettings.matchAcceptedNotifications = false;
    }

    // If enabling any sub-setting, ensure push is enabled
    if (key !== 'pushEnabled' && value && !settings.pushEnabled) {
      newSettings.pushEnabled = true;
    }

    await saveSettings(newSettings);
  }

  async function handleRequestPermission() {
    const { status } = await Notifications.requestPermissionsAsync();
    setSystemPermission(status === 'granted');

    if (status === 'granted') {
      await saveSettings({ ...settings, pushEnabled: true });
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
          title: '알림 설정',
          headerStyle: { backgroundColor: '#FF6B6B' },
          headerTintColor: '#fff',
          headerBackTitle: '뒤로',
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* System Permission Warning */}
        {systemPermission === false && (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>알림이 꺼져 있어요</Text>
            <Text style={styles.warningText}>
              기기 설정에서 LoveAgent 알림 권한이 거부되어 있습니다.
              알림을 받으려면 권한을 허용해주세요.
            </Text>
            <Text style={styles.warningButton} onPress={handleRequestPermission}>
              권한 요청하기
            </Text>
          </View>
        )}

        {/* Main Push Toggle */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>푸시 알림</Text>
          <View style={styles.settingCard}>
            <SettingRow
              title="푸시 알림 받기"
              description="모든 푸시 알림을 켜거나 끕니다"
              value={settings.pushEnabled}
              onToggle={(value) => handleToggle('pushEnabled', value)}
              disabled={saving}
            />
          </View>
        </View>

        {/* Notification Types */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>알림 종류</Text>
          <View style={styles.settingCard}>
            <SettingRow
              title="새 매칭 알림"
              description="새로운 매칭이 생성되면 알림을 받습니다"
              value={settings.matchNotifications}
              onToggle={(value) => handleToggle('matchNotifications', value)}
              disabled={saving || !settings.pushEnabled}
            />
            <View style={styles.divider} />
            <SettingRow
              title="매칭 성사 알림"
              description="상대방이 매칭을 수락하면 알림을 받습니다"
              value={settings.matchAcceptedNotifications}
              onToggle={(value) => handleToggle('matchAcceptedNotifications', value)}
              disabled={saving || !settings.pushEnabled}
            />
            <View style={styles.divider} />
            <SettingRow
              title="메시지 알림"
              description="새 메시지가 도착하면 알림을 받습니다"
              value={settings.messageNotifications}
              onToggle={(value) => handleToggle('messageNotifications', value)}
              disabled={saving || !settings.pushEnabled}
            />
          </View>
        </View>

        {/* Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>알림 설정 안내</Text>
          <Text style={styles.infoText}>
            알림 설정은 이 기기에만 적용됩니다.{'\n'}
            다른 기기에서는 별도로 설정해주세요.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

function SettingRow({
  title,
  description,
  value,
  onToggle,
  disabled,
}: {
  title: string;
  description: string;
  value: boolean;
  onToggle: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <View style={[styles.settingRow, disabled && styles.settingRowDisabled]}>
      <View style={styles.settingInfo}>
        <Text style={[styles.settingTitle, disabled && styles.settingTitleDisabled]}>
          {title}
        </Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: '#E0E0E0', true: '#FFB5B5' }}
        thumbColor={value ? '#FF6B6B' : '#f4f3f4'}
        ios_backgroundColor="#E0E0E0"
      />
    </View>
  );
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
  warningCard: {
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E65100',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  warningButton: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  settingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  settingRowDisabled: {
    opacity: 0.5,
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  settingTitleDisabled: {
    color: '#999',
  },
  settingDescription: {
    fontSize: 13,
    color: '#999',
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginLeft: 16,
  },
  infoBox: {
    backgroundColor: '#F0F8FF',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },
});

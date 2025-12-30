import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

const NOTIFICATION_SETTINGS_KEY = '@notification_settings';

type NotificationSettings = {
  pushEnabled: boolean;
  matchNotifications: boolean;
  messageNotifications: boolean;
  matchAcceptedNotifications: boolean;
};

// Get notification settings from AsyncStorage
async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    const stored = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Return defaults on error
  }
  return {
    pushEnabled: true,
    matchNotifications: true,
    messageNotifications: true,
    matchAcceptedNotifications: true,
  };
}

// Configure how notifications are displayed when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const settings = await getNotificationSettings();
    const data = notification.request.content.data;
    const type = data?.type as string;

    const baseResponse = {
      shouldShowAlert: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: false,
    };

    // Check if notifications are enabled
    if (!settings.pushEnabled) {
      return baseResponse;
    }

    // Check specific notification type settings
    if (type === 'new_match' && !settings.matchNotifications) {
      return { ...baseResponse, shouldSetBadge: true };
    }

    if (type === 'match_accepted' && !settings.matchAcceptedNotifications) {
      return { ...baseResponse, shouldSetBadge: true };
    }

    if (type === 'new_message' && !settings.messageNotifications) {
      return { ...baseResponse, shouldSetBadge: true };
    }

    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

export type NotificationType = 'new_match' | 'match_accepted' | 'new_message';

type Subscription = { remove: () => void };

export function useNotifications(userId: string | undefined) {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<boolean>(false);
  const notificationListener = useRef<Subscription | null>(null);
  const responseListener = useRef<Subscription | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!userId) return;

    // Register for push notifications
    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        setExpoPushToken(token);
        setPermission(true);
        // Save token to database
        savePushToken(userId, token);
      }
    });

    // Listen for incoming notifications (foreground)
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (_notification) => {
        // Notification received in foreground
      }
    );

    // Listen for notification interactions (tap)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        handleNotificationTap(data);
      }
    );

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [userId]);

  // Handle notification tap navigation
  function handleNotificationTap(data: any) {
    if (!data) return;

    switch (data.type) {
      case 'new_match':
      case 'match_accepted':
        router.push('/(tabs)/matches');
        break;
      case 'new_message':
        if (data.matchId) {
          router.push({
            pathname: '/chat/[matchId]',
            params: {
              matchId: data.matchId,
              partnerName: data.partnerName || '채팅',
            },
          });
        } else {
          router.push('/(tabs)/matches');
        }
        break;
      default:
        router.push('/(tabs)/matches');
    }
  }

  // Save push token to database
  async function savePushToken(userId: string, token: string) {
    const deviceType = Platform.OS === 'ios' ? 'ios' : 'android';

    // Using 'as any' because push_tokens table is not in generated types yet
    const { error } = await (supabase as any).from('push_tokens').upsert(
      {
        user_id: userId,
        token,
        device_type: deviceType,
        is_active: true,
      },
      { onConflict: 'user_id,token' }
    );

    if (error) {
      // Failed to save push token
    }
  }

  // Remove push token (on logout)
  async function removePushToken() {
    if (!expoPushToken || !userId) return;

    await (supabase as any)
      .from('push_tokens')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('token', expoPushToken);
  }

  return {
    expoPushToken,
    permission,
    removePushToken,
  };
}

// Register for push notifications and get token
async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  // Must be physical device
  if (!Device.isDevice) {
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permissions if not granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  // Get Expo push token
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    token = tokenResponse.data;
  } catch {
    // Failed to get push token
  }

  // Android-specific channel setup
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: '기본',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF6B6B',
    });
    await Notifications.setNotificationChannelAsync('matches', {
      name: '매칭 알림',
      description: '새로운 매칭과 매칭 성사 알림',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF6B6B',
    });
    await Notifications.setNotificationChannelAsync('messages', {
      name: '메시지 알림',
      description: '새로운 메시지 알림',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF6B6B',
    });
  }

  return token;
}

// Hook for managing notification badge count
export function useNotificationBadge(userId: string | undefined) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId) return;

    fetchUnreadCount();

    // Subscribe to notification changes
    const channel = supabase
      .channel('notification-badge')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notification_logs',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  async function fetchUnreadCount() {
    if (!userId) return;

    const { count } = await (supabase as any)
      .from('notification_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    const newCount = count || 0;
    setUnreadCount(newCount);
    await Notifications.setBadgeCountAsync(newCount);
  }

  async function markAllRead() {
    if (!userId) return;

    await (supabase as any)
      .from('notification_logs')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    setUnreadCount(0);
    await Notifications.setBadgeCountAsync(0);
  }

  return { unreadCount, markAllRead };
}

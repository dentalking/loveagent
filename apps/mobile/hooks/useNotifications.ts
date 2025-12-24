import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

// Configure how notifications are displayed when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
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
      (notification) => {
        console.log('Notification received:', notification);
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
      console.error('Failed to save push token:', error);
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
    console.log('Push notifications require a physical device');
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
    console.log('Push notification permission not granted');
    return null;
  }

  // Get Expo push token
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    token = tokenResponse.data;
  } catch (error) {
    console.error('Failed to get push token:', error);
  }

  // Android-specific channel setup
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
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

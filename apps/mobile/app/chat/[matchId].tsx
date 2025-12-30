import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useAuth } from '../../lib/AuthContext';
import { useChat, Message } from '../../hooks/useChat';
import { supabase } from '../../lib/supabase';

export default function ChatScreen() {
  const { matchId, partnerName, partnerImage } = useLocalSearchParams<{
    matchId: string;
    partnerName: string;
    partnerImage: string;
  }>();
  const { user } = useAuth();
  const router = useRouter();
  const { messages, loading, sending, sendMessage } = useChat(
    matchId || '',
    user?.id || ''
  );
  const [inputText, setInputText] = useState('');
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // Fetch partner ID from match
  useEffect(() => {
    async function fetchPartnerId() {
      if (!matchId || !user) return;

      const { data } = await supabase
        .from('matches')
        .select('user_a_id, user_b_id')
        .eq('id', matchId)
        .single();

      if (data) {
        const id = data.user_a_id === user.id ? data.user_b_id : data.user_a_id;
        setPartnerId(id);
      }
    }
    fetchPartnerId();
  }, [matchId, user]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  function handleViewProfile() {
    if (!partnerId || !matchId) return;
    router.push({
      pathname: '/profile/[userId]',
      params: { userId: partnerId, matchId },
    });
  }

  async function handleSend() {
    if (!inputText.trim()) return;

    const text = inputText;
    setInputText('');
    await sendMessage(text);
  }

  if (!matchId || !user) {
    return (
      <View style={styles.centered}>
        <Text>잘못된 접근입니다.</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: '#FF6B6B' },
          headerTintColor: '#fff',
          headerBackTitle: '뒤로',
          headerTitle: () => (
            <TouchableOpacity style={styles.headerTitle} onPress={handleViewProfile}>
              {partnerImage ? (
                <Image
                  source={{ uri: partnerImage }}
                  style={styles.headerAvatar}
                />
              ) : (
                <View style={styles.headerAvatarPlaceholder}>
                  <Text style={styles.headerAvatarText}>
                    {partnerName?.charAt(0) || '?'}
                  </Text>
                </View>
              )}
              <View>
                <Text style={styles.headerName}>{partnerName || '채팅'}</Text>
                <Text style={styles.headerHint}>프로필 보기</Text>
              </View>
            </TouchableOpacity>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#FF6B6B" />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>👋</Text>
            <Text style={styles.emptyTitle}>첫 메시지를 보내보세요!</Text>
            <Text style={styles.emptyText}>
              매칭된 상대에게 먼저 인사해보는 건 어떨까요?
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MessageBubble message={item} isMe={item.sender_id === user.id} />
            )}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
          />
        )}

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="메시지를 입력하세요..."
            placeholderTextColor="#999"
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() || sending) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            <Text style={styles.sendButtonText}>
              {sending ? '...' : '전송'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

function MessageBubble({ message, isMe }: { message: Message; isMe: boolean }) {
  const time = message.created_at
    ? new Date(message.created_at).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <View style={[styles.bubbleContainer, isMe && styles.bubbleContainerMe]}>
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
        <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
          {message.content}
        </Text>
      </View>
      <View style={[styles.messageFooter, isMe && styles.messageFooterMe]}>
        <Text style={[styles.timeText, isMe && styles.timeTextMe]}>{time}</Text>
        {isMe && (
          <Text style={[styles.readStatus, message.is_read && styles.readStatusRead]}>
            {message.is_read ? '✓✓' : '✓'}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  headerAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  headerAvatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  headerName: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  headerHint: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    marginTop: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
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
  },
  messageList: {
    padding: 16,
    paddingBottom: 8,
  },
  bubbleContainer: {
    marginBottom: 12,
    maxWidth: '80%',
    alignSelf: 'flex-start',
  },
  bubbleContainerMe: {
    alignSelf: 'flex-end',
  },
  bubble: {
    padding: 12,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
  },
  bubbleMe: {
    backgroundColor: '#FF6B6B',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 22,
  },
  bubbleTextMe: {
    color: '#fff',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginLeft: 4,
    gap: 4,
  },
  messageFooterMe: {
    justifyContent: 'flex-end',
    marginRight: 4,
    marginLeft: 0,
  },
  timeText: {
    fontSize: 11,
    color: '#999',
  },
  timeTextMe: {
    textAlign: 'right',
  },
  readStatus: {
    fontSize: 11,
    color: '#999',
    fontWeight: '600',
  },
  readStatusRead: {
    color: '#4FC3F7',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#FAFAFA',
  },
  sendButton: {
    marginLeft: 8,
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#FFB5B5',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export type Message = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  is_read: boolean | null;
  created_at: string | null;
};

export function useChat(matchId: string, userId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Fetch initial messages
  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('match_id', matchId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessages(data);
    }
    setLoading(false);
  }, [matchId]);

  // Subscribe to new messages
  useEffect(() => {
    fetchMessages();

    // Set up realtime subscription
    const channel: RealtimeChannel = supabase
      .channel(`messages:${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const newMessage = payload.new as Message;
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === newMessage.id)) {
              return prev;
            }
            return [...prev, newMessage];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const updatedMessage = payload.new as Message;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updatedMessage.id ? updatedMessage : m
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, fetchMessages]);

  // Mark messages as read
  useEffect(() => {
    const unreadMessages = messages.filter(
      (m) => m.sender_id !== userId && !m.is_read
    );

    if (unreadMessages.length > 0) {
      const unreadIds = unreadMessages.map((m) => m.id);
      supabase
        .from('messages')
        .update({ is_read: true })
        .in('id', unreadIds)
        .then(({ error }) => {
          if (!error) {
            setMessages((prev) =>
              prev.map((m) =>
                unreadIds.includes(m.id) ? { ...m, is_read: true } : m
              )
            );
          }
        });
    }
  }, [messages, userId]);

  // Send a message
  const sendMessage = async (content: string) => {
    if (!content.trim() || sending) return false;

    setSending(true);

    const { error } = await supabase.from('messages').insert({
      match_id: matchId,
      sender_id: userId,
      content: content.trim(),
    });

    setSending(false);

    if (error) {
      return false;
    }

    return true;
  };

  return {
    messages,
    loading,
    sending,
    sendMessage,
    refetch: fetchMessages,
  };
}

// Hook for getting unread message counts
export function useUnreadCounts(userId: string) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!userId) return;

    async function fetchCounts() {
      const { data } = await supabase
        .from('messages')
        .select('match_id')
        .neq('sender_id', userId)
        .eq('is_read', false);

      if (data) {
        const countMap: Record<string, number> = {};
        data.forEach((msg) => {
          countMap[msg.match_id] = (countMap[msg.match_id] || 0) + 1;
        });
        setCounts(countMap);
      }
    }

    fetchCounts();

    // Subscribe to new messages for unread counts
    const channel = supabase
      .channel('unread-counts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        () => {
          fetchCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return counts;
}

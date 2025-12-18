/**
 * ChatScreen Component
 *
 * Main chat interface for AI interactions.
 * Displays message history and handles user input.
 *
 * Article V Compliance:
 * - V.1: No authorization logic - backend handles all access control
 */

import React, { useRef, useEffect } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useChatStore } from '../stores/chatStore';
import { ChatMessage } from '../types';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';

// KeyboardAvoidingView doesn't work well on Windows/macOS - use plain View
const Container = Platform.OS === 'ios' || Platform.OS === 'android'
  ? KeyboardAvoidingView
  : View;

interface ChatScreenProps {
  isDarkMode: boolean;
}

export function ChatScreen({ isDarkMode }: ChatScreenProps) {
  const { messages, isStreaming, error, sendMessage } = useChatStore();
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const handleSend = async (text: string) => {
    await sendMessage(text);
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <MessageBubble message={item} isDarkMode={isDarkMode} />
  );

  const backgroundColor = isDarkMode ? '#1a1a2e' : '#f5f5f5';

  // Props for KeyboardAvoidingView (only on mobile)
  const containerProps = Platform.OS === 'ios' || Platform.OS === 'android'
    ? {
        behavior: Platform.OS === 'ios' ? 'padding' as const : 'height' as const,
        keyboardVerticalOffset: Platform.OS === 'ios' ? 90 : 0,
      }
    : {};

  return (
    <Container
      style={[styles.container, { backgroundColor }]}
      {...containerProps}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
      />
      <MessageInput
        onSend={handleSend}
        isLoading={isStreaming}
        isDarkMode={isDarkMode}
        error={error}
      />
    </Container>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  messageList: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexGrow: 1,
  },
});

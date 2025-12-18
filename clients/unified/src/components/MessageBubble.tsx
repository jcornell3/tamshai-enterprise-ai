/**
 * MessageBubble Component
 *
 * Renders a single chat message with styling based on role.
 * Supports markdown rendering, citations, and approval cards.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { ChatMessage } from '../types';
import { ApprovalCard } from './ApprovalCard';

interface MessageBubbleProps {
  message: ChatMessage;
  isDarkMode: boolean;
}

export function MessageBubble({ message, isDarkMode }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isStreaming = message.isStreaming;

  // Colors based on role and theme
  const bubbleColor = isUser
    ? '#007AFF'
    : isDarkMode
    ? '#2d2d44'
    : '#e8e8e8';
  const textColor = isUser ? '#ffffff' : isDarkMode ? '#ffffff' : '#1a1a2e';

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      <View style={[styles.bubble, { backgroundColor: bubbleColor }]}>
        {/* Message content */}
        <Text style={[styles.messageText, { color: textColor }]}>
          {message.content || (isStreaming ? '' : '...')}
        </Text>

        {/* Streaming indicator */}
        {isStreaming && (
          <View style={styles.streamingIndicator}>
            <ActivityIndicator size="small" color={textColor} />
            <Text style={[styles.streamingText, { color: textColor }]}>
              Thinking...
            </Text>
          </View>
        )}

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <View style={styles.citations}>
            {message.citations.map((citation, index) => (
              <Text
                key={index}
                style={[styles.citationText, { color: textColor, opacity: 0.7 }]}
              >
                Source: {citation.source}
              </Text>
            ))}
          </View>
        )}
      </View>

      {/* Approval Card for pending confirmations */}
      {message.pendingConfirmation && !message.pendingConfirmation.approved && (
        <ApprovalCard
          confirmationId={message.pendingConfirmation.confirmationId}
          message={message.pendingConfirmation.message}
          action={message.pendingConfirmation.action}
          isDarkMode={isDarkMode}
        />
      )}

      {/* Timestamp */}
      <Text style={[styles.timestamp, { color: isDarkMode ? '#888' : '#666' }]}>
        {formatTime(message.timestamp)}
      </Text>
    </View>
  );
}

function formatTime(date: Date | string): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    maxWidth: '80%',
  },
  userContainer: {
    alignSelf: 'flex-end',
  },
  assistantContainer: {
    alignSelf: 'flex-start',
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  streamingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  streamingText: {
    marginLeft: 8,
    fontSize: 14,
    fontStyle: 'italic',
  },
  citations: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  citationText: {
    fontSize: 12,
  },
  timestamp: {
    fontSize: 11,
    marginTop: 4,
    marginHorizontal: 4,
  },
});

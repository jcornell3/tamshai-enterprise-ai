/**
 * MessageInput Component
 *
 * Text input for sending messages to the AI assistant.
 */

// This log should appear when the bundle loads - confirms fresh code
console.log('[MessageInput] ====== MODULE LOADED ======');

import React, { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';

interface MessageInputProps {
  onSend: (text: string) => void;
  isLoading: boolean;
  isDarkMode: boolean;
  error: string | null;
}

export function MessageInput({ onSend, isLoading, isDarkMode, error }: MessageInputProps) {
  const [text, setText] = useState('');

  const handleSend = () => {
    console.log('[MessageInput] ====== handleSend ENTRY ======');
    const trimmed = text.trim();
    console.log('[MessageInput] trimmed:', trimmed);
    console.log('[MessageInput] isLoading:', isLoading);
    if (trimmed && !isLoading) {
      console.log('[MessageInput] Calling onSend...');
      onSend(trimmed);
      console.log('[MessageInput] onSend returned');
      setText('');
      console.log('[MessageInput] setText done');
    }
    console.log('[MessageInput] handleSend EXIT');
  };

  const handleKeyPress = (e: { nativeEvent: { key: string } }) => {
    // Send on Enter key (desktop)
    if (e.nativeEvent.key === 'Enter' && !isLoading) {
      handleSend();
    }
  };

  const backgroundColor = isDarkMode ? '#2d2d44' : '#ffffff';
  const textColor = isDarkMode ? '#ffffff' : '#1a1a2e';
  const borderColor = isDarkMode ? '#3d3d54' : '#e0e0e0';
  const placeholderColor = isDarkMode ? '#888' : '#999';

  // DEBUG: Temporarily remove TextInput to test if it's causing the Hermes crash
  // The crash happens when TextInput component initializes on Windows (msftedit.dll loads)
  return (
    <View style={[styles.container, { borderTopColor: borderColor }]}>
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      <View style={[styles.inputRow, { backgroundColor }]}>
        {/* TextInput temporarily replaced with Text to test crash */}
        <View style={[styles.input, { backgroundColor }]}>
          <Text style={{ color: textColor }}>
            [TextInput disabled for crash testing]
          </Text>
        </View>
        <Pressable
          style={[
            styles.sendButton,
            (!text.trim() || isLoading) && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!text.trim() || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.sendButtonText}>Send</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  errorContainer: {
    backgroundColor: '#FFE4E4',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    maxHeight: 120,
    paddingVertical: 8,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginLeft: 8,
  },
  sendButtonDisabled: {
    backgroundColor: '#B0B0B0',
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

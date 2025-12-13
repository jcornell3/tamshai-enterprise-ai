/**
 * Tamshai AI Desktop - Complete Chat Window
 *
 * Main chat interface with SSE streaming, approval cards, and truncation warnings
 * Phases 3-6 complete implementation
 */

import { useState, useRef, useEffect } from 'react';
import { Tokens, Message, TextMessage, StreamingMessage as StreamingMessageType } from '../types';
import { decodeToken, getAccessLevel } from '../utils/auth';
import { useChatStore } from '../stores/chatStore';
import { StreamingMessage } from './StreamingMessage';
import { ApprovalCard } from './ApprovalCard';
import { TruncationWarning } from './TruncationWarning';
import { getAccessToken } from '../services/sse.service';

interface ChatWindowProps {
  tokens: Tokens;
  onLogout: () => void;
}

export function ChatWindow({ tokens, onLogout }: ChatWindowProps) {
  const [query, setQuery] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages = useChatStore(state => state.messages);
  const addMessage = useChatStore(state => state.addMessage);
  const approveConfirmation = useChatStore(state => state.approveConfirmation);
  const rejectConfirmation = useChatStore(state => state.rejectConfirmation);

  // Decode user info from token
  const user = decodeToken(tokens.accessToken) || {
    userId: 'unknown',
    username: 'User',
    roles: [],
  };

  const accessLevel = getAccessLevel(user);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!query.trim() || isSending) return;

    setIsSending(true);

    try {
      // Add user message
      const userMessage: TextMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        type: 'text',
        content: query,
        timestamp: Date.now(),
      };

      addMessage(userMessage);

      // Add streaming message
      const streamingMessage: StreamingMessageType = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        type: 'streaming',
        query: query,
        content: '',
        isComplete: false,
        timestamp: Date.now(),
      };

      addMessage(streamingMessage);

      // Clear input
      setQuery('');
    } catch (error) {
      console.error('[ChatWindow] Send error:', error);

      // Add error message
      const errorMessage: TextMessage = {
        id: `error-${Date.now()}`,
        role: 'system',
        type: 'text',
        content: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      };

      addMessage(errorMessage);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleApprove = async (confirmationId: string) => {
    const token = await getAccessToken();
    await approveConfirmation(confirmationId, token);
  };

  const handleReject = async (confirmationId: string) => {
    const token = await getAccessToken();
    await rejectConfirmation(confirmationId, token);
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Tamshai AI Assistant</h1>
          <p style={styles.subtitle}>
            {user.username} • {accessLevel}
          </p>
        </div>
        <button onClick={onLogout} style={styles.logoutButton}>
          Logout
        </button>
      </header>

      {/* Messages */}
      <div style={styles.messagesContainer}>
        <div style={styles.messagesList}>
          {messages.length === 0 && (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>💬</div>
              <h2 style={styles.emptyTitle}>Ready to assist</h2>
              <p style={styles.emptyText}>
                Ask me anything about employees, finances, sales, or support tickets.
              </p>
            </div>
          )}

          {messages.map((message) => {
            if (message.type === 'text') {
              return (
                <div
                  key={message.id}
                  style={{
                    ...styles.message,
                    ...(message.role === 'user' ? styles.userMessage : styles.assistantMessage),
                  }}
                >
                  <div style={styles.messageContent}>
                    {message.content}
                  </div>
                </div>
              );
            }

            if (message.type === 'streaming') {
              return (
                <div key={message.id} style={styles.message}>
                  <StreamingMessage
                    messageId={message.id}
                    query={message.query}
                  />
                </div>
              );
            }

            if (message.type === 'approval') {
              return (
                <div key={message.id} style={styles.message}>
                  <ApprovalCard
                    confirmationId={message.confirmationId}
                    message={message.message}
                    confirmationData={message.confirmationData as any}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                </div>
              );
            }

            if (message.type === 'truncation') {
              return (
                <div key={message.id} style={styles.message}>
                  <TruncationWarning
                    message={message.message}
                    returnedCount={message.returnedCount}
                    totalEstimate={message.totalEstimate}
                  />
                </div>
              );
            }

            return null;
          })}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div style={styles.inputContainer}>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask a question..."
          style={styles.textarea}
          rows={3}
          disabled={isSending}
        />
        <button
          onClick={handleSend}
          disabled={!query.trim() || isSending}
          style={{
            ...styles.sendButton,
            ...((!query.trim() || isSending) ? styles.sendButtonDisabled : {}),
          }}
        >
          {isSending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    background: '#ffffff',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  title: {
    fontSize: '20px',
    fontWeight: 600,
    margin: '0 0 4px 0',
  },
  subtitle: {
    fontSize: '14px',
    opacity: 0.9,
    margin: 0,
  },
  logoutButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: 'white',
    background: 'rgba(255,255,255,0.2)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto' as const,
    background: '#f9fafb',
  },
  messagesList: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '24px',
  },
  emptyState: {
    textAlign: 'center' as const,
    paddingTop: '80px',
  },
  emptyIcon: {
    fontSize: '64px',
    marginBottom: '16px',
  },
  emptyTitle: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#1f2937',
    marginBottom: '8px',
  },
  emptyText: {
    fontSize: '16px',
    color: '#6b7280',
    marginBottom: '24px',
  },
  message: {
    marginBottom: '16px',
  },
  userMessage: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  assistantMessage: {
    display: 'flex',
    justifyContent: 'flex-start',
  },
  messageContent: {
    maxWidth: '80%',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    lineHeight: '1.6',
  },
  inputContainer: {
    padding: '16px 24px',
    background: 'white',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-end',
  },
  textarea: {
    flex: 1,
    padding: '12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    resize: 'none' as const,
    fontFamily: 'inherit',
    outline: 'none',
  },
  sendButton: {
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 600,
    color: 'white',
    background: '#2563eb',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background 0.2s',
    whiteSpace: 'nowrap' as const,
  },
  sendButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
};

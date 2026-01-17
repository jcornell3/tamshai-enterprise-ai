import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth, apiConfig } from '@tamshai/auth';
import { TruncationWarning, ApprovalCard } from '@tamshai/ui';
import type { AIQueryMessage, AIQueryResponse } from '../types';

/**
 * AI Query Page for Finance
 *
 * Natural language queries to finance data using SSE streaming (Architecture v1.4)
 *
 * Features:
 * - Server-Sent Events (SSE) for streaming responses
 * - Real-time chunk-by-chunk rendering
 * - Prevents 30-60 second timeout during Claude reasoning
 * - Truncation warnings for large datasets
 * - v1.4 Human-in-the-loop confirmations for write operations
 * - Message history within session
 * - Markdown rendering for AI responses
 * - Suggested queries
 */

interface PendingConfirmation {
  confirmationId: string;
  message: string;
  action: string;
  expiresAt: number;
}

export function AIQueryPage() {
  const { userContext, getAccessToken } = useAuth();
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<AIQueryMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncationWarning, setTruncationWarning] = useState<{ message: string; count: string } | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [sessionId] = useState(() => `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const currentMessageIdRef = useRef<string | null>(null);

  // Suggested queries for finance
  const suggestedQueries = [
    'Show Q1 budget summary by department',
    'List pending invoices over $10,000',
    'What is our current budget utilization?',
    'Show expense reports awaiting approval',
    'Compare spending vs budget for Engineering',
    'List all overdue invoices',
  ];

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuery(e.target.value);
    // Auto-resize
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  // Cancel streaming
  const cancelStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);

    // Mark current message as cancelled
    if (currentMessageIdRef.current) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === currentMessageIdRef.current
            ? { ...msg, content: msg.content + '\n\n[Response cancelled]', isStreaming: false }
            : msg
        )
      );
      currentMessageIdRef.current = null;
    }
  }, []);

  // Submit query
  const handleSubmit = async (e?: React.FormEvent, queryOverride?: string) => {
    if (e) e.preventDefault();

    const queryText = queryOverride || query;
    if (!queryText.trim() || isStreaming) return;

    // Clear previous error/warning
    setError(null);
    setTruncationWarning(null);

    // Add user message
    const userMessageId = `user-${Date.now()}`;
    const userMessage: AIQueryMessage = {
      id: userMessageId,
      role: 'user',
      content: queryText,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Clear input
    setQuery('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Add placeholder for assistant message
    const assistantMessageId = `assistant-${Date.now()}`;
    currentMessageIdRef.current = assistantMessageId;
    const assistantMessage: AIQueryMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    };
    setMessages((prev) => [...prev, assistantMessage]);
    setIsStreaming(true);

    // Create EventSource for SSE
    try {
      const token = getAccessToken();
      if (!token) {
        setError('Authentication required. Please log in again.');
        setIsStreaming(false);
        return;
      }

      const params = new URLSearchParams({
        q: queryText,  // Gateway streaming endpoint expects 'q' parameter
        sessionId,
        token,  // DEPRECATED: Token in URL for EventSource compatibility (can't send custom headers)
      });

      // Use absolute URL for GCP production (MCP Gateway on different domain)
      // Falls back to relative path for dev/stage where proxy handles routing
      const sseUrl = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/query?${params}`
        : `/api/query?${params}`;
      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('SSE connection opened');
      };

      eventSource.onmessage = (event) => {
        if (event.data === '[DONE]') {
          eventSource.close();
          eventSourceRef.current = null;
          setIsStreaming(false);

          // Mark message as complete
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId ? { ...msg, isStreaming: false } : msg
            )
          );
          currentMessageIdRef.current = null;
          return;
        }

        try {
          const chunk = JSON.parse(event.data);

          // Handle different chunk types from gateway
          if (chunk.type === 'text' && chunk.text) {
            // Standard text chunk from streaming.routes.ts line 347
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: msg.content + chunk.text }
                  : msg
              )
            );
          } else if (chunk.type === 'error') {
            // Error chunk
            setError(chunk.message || 'An error occurred');
            eventSource.close();
            eventSourceRef.current = null;
            setIsStreaming(false);
            return;
          } else if (chunk.type === 'pagination') {
            // Pagination metadata - could display to user
            console.log('Pagination available:', chunk);
          } else if (chunk.type === 'service_unavailable') {
            // Service unavailability warning
            console.warn('Some services unavailable:', chunk);
          } else if (chunk.status === 'pending_confirmation') {
            // Handle confirmation requests (v1.4)
            setPendingConfirmation({
              confirmationId: chunk.confirmationId,
              message: chunk.message,
              action: chunk.action || 'perform action',
              expiresAt: Date.now() + 5 * 60 * 1000, // 5 minute timeout
            });
          } else if (chunk.metadata?.truncated) {
            // Handle truncation warnings (v1.4)
            setTruncationWarning({
              message: chunk.metadata.warning || 'Results truncated',
              count: '50+',
            });
          }
        } catch (parseError) {
          // If not JSON, treat as plain text chunk
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: msg.content + event.data }
                : msg
            )
          );
        }
      };

      eventSource.onerror = (event) => {
        console.error('SSE error:', event);
        eventSource.close();
        eventSourceRef.current = null;
        setIsStreaming(false);

        // Preserve partial response if any
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content: msg.content || 'Connection error. Please try again.',
                  isStreaming: false,
                }
              : msg
          )
        );

        setError('Connection error. Please try again.');
        currentMessageIdRef.current = null;
      };
    } catch (err) {
      setError(String(err));
      setIsStreaming(false);
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Handle suggested query click
  const handleSuggestedClick = (suggestion: string) => {
    setQuery(suggestion);
    handleSubmit(undefined, suggestion);
  };

  // Handle confirmation response
  const handleConfirmationComplete = (success: boolean) => {
    setPendingConfirmation(null);
    if (success) {
      // Add confirmation result to messages
      const resultMessage: AIQueryMessage = {
        id: `system-${Date.now()}`,
        role: 'assistant',
        content: 'Action confirmed and executed successfully.',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, resultMessage]);
    } else {
      const cancelMessage: AIQueryMessage = {
        id: `system-${Date.now()}`,
        role: 'assistant',
        content: 'Action cancelled.',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, cancelMessage]);
    }
  };

  // Start new chat
  const handleNewChat = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setMessages([]);
    setError(null);
    setTruncationWarning(null);
    setPendingConfirmation(null);
    setIsStreaming(false);
    setQuery('');
  };

  // Retry last query
  const handleRetry = () => {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMessage) {
      setError(null);
      handleSubmit(undefined, lastUserMessage.content);
    }
  };

  // Format timestamp
  const formatTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Simple markdown renderer (for basic formatting)
  const renderMarkdown = (content: string): string => {
    return content
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Code blocks
      .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-secondary-100 p-3 rounded mt-2 mb-2 overflow-x-auto"><code>$2</code></pre>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code class="bg-secondary-100 px-1 rounded">$1</code>')
      // Lists
      .replace(/^- (.*$)/gim, '<li class="ml-4">$1</li>')
      // Line breaks
      .replace(/\n/g, '<br />');
  };

  return (
    <div className="page-container flex flex-col h-[calc(100vh-200px)]">
      <div className="page-header flex justify-between items-start">
        <div>
          <h2 className="page-title">AI-Powered Finance Query</h2>
          <p className="page-subtitle">
            Ask natural language questions about budgets, invoices, and expenses
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-secondary-500" data-testid="session-id">
            Session: {sessionId.slice(-8)}
          </span>
          <button
            onClick={handleNewChat}
            className="btn-secondary text-sm"
            data-testid="new-chat-button"
          >
            New Chat
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="alert-info mb-4">
        <h4 className="font-semibold mb-1">Architecture v1.4: SSE Streaming</h4>
        <p className="text-sm">
          This page uses Server-Sent Events (SSE) to stream AI responses in
          real-time, preventing timeouts during Claude's 30-60 second reasoning
          process.
        </p>
      </div>

      {/* Truncation Warning */}
      {truncationWarning && (
        <div className="mb-4" data-testid="truncation-warning">
          <TruncationWarning
            message={truncationWarning.message}
            returnedCount={50}
            totalEstimate={truncationWarning.count}
          />
        </div>
      )}

      {/* Pending Confirmation */}
      {pendingConfirmation && (
        <div className="mb-4" data-testid="confirmation-prompt">
          <ApprovalCard
            confirmationId={pendingConfirmation.confirmationId}
            message={pendingConfirmation.message}
            confirmationData={{
              action: pendingConfirmation.action,
              expiresIn: Math.max(0, Math.floor((pendingConfirmation.expiresAt - Date.now()) / 1000)),
            }}
            onComplete={handleConfirmationComplete}
          />
        </div>
      )}

      {/* Input Area - MOVED TO TOP for consistent UX */}
      <div className="bg-white rounded-lg border border-secondary-200 p-4 mb-4">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <textarea
            ref={textareaRef}
            value={query}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask about budgets, invoices, expense reports..."
            className="input flex-1 resize-none min-h-[44px] max-h-[200px]"
            rows={1}
            disabled={isStreaming}
            aria-label="Enter your finance query"
            data-testid="query-input"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={cancelStreaming}
              className="btn-danger"
              data-testid="cancel-button"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Cancel
            </button>
          ) : (
            <button
              type="submit"
              disabled={!query.trim()}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="send-button"
            >
              <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Send
            </button>
          )}
        </form>
        <p className="text-xs text-secondary-500 mt-2">
          Press Enter to send, Shift+Enter for new line. Results based on your{' '}
          {userContext?.roles?.includes('finance-write') ? 'finance-write' : 'finance-read'} role.
        </p>
      </div>

      {/* Messages Area - MOVED BELOW INPUT */}
      <div
        className="flex-1 overflow-y-auto bg-white rounded-lg border border-secondary-200 mb-4 p-4"
        data-testid="messages-area"
        role="log"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center" data-testid="empty-state">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-secondary-900 mb-2">
                Finance AI Assistant
              </h3>
              <p className="text-secondary-600 max-w-md">
                Ask questions about budgets, invoices, and expense reports. Your access
                level determines what data you can query.
              </p>
            </div>

            {/* Suggested Queries */}
            <div className="w-full max-w-2xl" data-testid="suggested-queries">
              <p className="text-sm font-medium text-secondary-700 mb-3 text-center">
                Try these example queries:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {suggestedQueries.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSuggestedClick(suggestion)}
                    className="text-left text-sm px-4 py-2 bg-secondary-50 hover:bg-secondary-100 rounded-lg transition-colors"
                    data-testid="suggested-query"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                data-testid={`message-${message.role}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-primary-600 text-white'
                      : 'bg-secondary-100 text-secondary-900'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <div
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                    />
                  ) : (
                    <p>{message.content}</p>
                  )}
                  {message.isStreaming && (
                    <span className="inline-block w-2 h-4 bg-secondary-400 animate-pulse ml-1" data-testid="streaming-indicator"></span>
                  )}
                  <p className={`text-xs mt-2 ${message.role === 'user' ? 'text-primary-200' : 'text-secondary-500'}`} data-testid="message-timestamp">
                    {formatTime(message.timestamp)}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-4 p-4 bg-danger-50 border border-danger-200 rounded-lg" data-testid="error-state">
          <p className="text-danger-700">{error}</p>
          <button
            onClick={handleRetry}
            className="btn-primary text-sm mt-2"
            data-testid="retry-button"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

export default AIQueryPage;

/**
 * AI Tax Assistant Page with Generative UI Support
 *
 * Natural language queries to tax data using streaming (Architecture v1.5)
 *
 * Features:
 * - Streaming responses via ReadableStream
 * - Display directive detection (display:tax:*)
 * - Generative UI rendering via ComponentRenderer
 * - Voice input (Speech-to-Text) and output (Text-to-Speech)
 * - Human-in-the-loop confirmations for write operations
 */
import { useState, useRef, useEffect } from 'react';
import { useAuth, apiConfig } from '@tamshai/auth';
import { ApprovalCard, ComponentRenderer, useVoiceInput, useVoiceOutput } from '@tamshai/ui';
import type { ComponentResponse } from '@tamshai/ui/dist/components/generative/types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface PendingConfirmation {
  confirmationId: string;
  message: string;
}

const EXAMPLE_QUERIES = [
  'What is my quarterly estimate for Q1?',
  'Show me the sales tax rate for California',
  'When are my next tax deadlines?',
  'What filings are pending for 2025?',
];

export function AIQueryPage() {
  const { getAccessToken } = useAuth();
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [componentResponse, setComponentResponse] = useState<ComponentResponse | null>(null);
  const [directiveError, setDirectiveError] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentMessageContentRef = useRef<string>('');

  // Voice input hook - captures speech and updates query
  const { isListening, transcript, error: voiceInputError, startListening, stopListening } = useVoiceInput({
    language: 'en-US',
    interimResults: false,
    onResult: (recognizedText) => {
      setQuery(recognizedText);
    },
  });

  // Voice output hook - speaks component narration
  const { speak, stop: stopSpeaking, isSpeaking } = useVoiceOutput({
    language: 'en-US',
    rate: 1.0,
    pitch: 1.0,
  });

  // Update query input when transcript changes
  useEffect(() => {
    if (transcript) {
      setQuery(transcript);
    }
  }, [transcript]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /**
   * Detect display directives in AI response
   * Format: display:<domain>:<component>:<params>
   * Example: display:tax:quarterly_estimate:quarter=Q1,year=2025
   */
  const detectDirective = (text: string): string | null => {
    const directiveRegex = /display:tax:(\w+):([^\s]*)/;
    const match = text.match(directiveRegex);
    return match ? match[0] : null;
  };

  /**
   * Call MCP UI Service to render directive
   */
  const fetchComponentResponse = async (directive: string): Promise<void> => {
    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Construct MCP UI Service URL
      let mcpUiUrl: string;
      if (apiConfig.mcpUiUrl) {
        mcpUiUrl = `${apiConfig.mcpUiUrl}/api/display`;
      } else {
        mcpUiUrl = '/api/mcp-ui/display';
      }

      const response = await fetch(mcpUiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ directive }),
      });

      if (!response.ok) {
        throw new Error(`MCP UI Service error: ${response.status}`);
      }

      const componentData: ComponentResponse = await response.json();
      setComponentResponse(componentData);
      setDirectiveError(null);
    } catch (error) {
      console.error('Failed to fetch component response:', error);
      setDirectiveError(error instanceof Error ? error.message : 'Unknown error');
      setComponentResponse(null);
    }
  };

  /**
   * Handle component actions (navigate, drilldown, etc.)
   */
  const handleComponentAction = (action: any) => {
    console.log('Component action:', action);
    // TODO: Implement action handling (navigation, drilldowns)
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: query.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuery('');
    setIsLoading(true);
    setError(null);
    setComponentResponse(null);
    setDirectiveError(null);

    try {
      const token = getAccessToken();
      const response = await fetch(`${apiConfig.mcpGatewayUrl}/api/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: userMessage.content, domain: 'tax' }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
      };
      setMessages((prev) => [...prev, assistantMessage]);
      currentMessageContentRef.current = '';

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);

              // Check for pending confirmation
              if (parsed.type === 'pending_confirmation') {
                setPendingConfirmation({
                  confirmationId: parsed.confirmationId,
                  message: parsed.message,
                });
                continue;
              }

              // Handle content delta
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                currentMessageContentRef.current += parsed.delta.text;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessage.id
                      ? { ...msg, content: msg.content + parsed.delta.text }
                      : msg
                  )
                );
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      // Check for directives in complete message
      const completeMessage = currentMessageContentRef.current;
      const directive = detectDirective(completeMessage);
      if (directive) {
        console.log('Detected directive:', directive);
        await fetchComponentResponse(directive);
      }
      currentMessageContentRef.current = '';
    } catch (err) {
      setError((err as Error).message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmation = async (approved: boolean) => {
    if (!pendingConfirmation) return;

    try {
      const token = getAccessToken();
      await fetch(`${apiConfig.mcpGatewayUrl}/api/confirm/${pendingConfirmation.confirmationId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ approved }),
      });

      const resultMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: approved ? 'Action confirmed and executed.' : 'Action cancelled.',
      };
      setMessages((prev) => [...prev, resultMessage]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPendingConfirmation(null);
    }
  };

  const handleExampleClick = (example: string) => {
    setQuery(example);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Tax Assistant</h1>
          <p className="text-gray-500 mt-1">Ask questions about your tax data</p>
        </div>
        {/* Voice Output Toggle */}
        <div className="flex items-center gap-2">
          <label htmlFor="voice-toggle" className="text-sm font-medium text-gray-700">
            Voice
          </label>
          <button
            id="voice-toggle"
            type="button"
            onClick={() => {
              const newVoiceEnabled = !voiceEnabled;
              setVoiceEnabled(newVoiceEnabled);
              if (!newVoiceEnabled) {
                stopSpeaking();
              }
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              voiceEnabled ? 'bg-primary-600' : 'bg-gray-300'
            }`}
            data-testid="voice-toggle"
            aria-label="Toggle voice output"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                voiceEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          {isSpeaking && (
            <svg
              className="w-5 h-5 text-primary-600 animate-pulse"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
          )}
        </div>
      </div>

      {/* Component Renderer - Display generative UI components */}
      {componentResponse && (
        <div className="mb-4" data-testid="generative-ui-container">
          <div className="bg-white rounded-lg border border-primary-200 p-4">
            <div className="flex items-center gap-2 mb-4">
              <svg
                className="w-5 h-5 text-primary-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <h3 className="text-lg font-semibold text-primary-900">
                Generative UI Component
              </h3>
            </div>
            <ComponentRenderer
              component={componentResponse}
              onAction={handleComponentAction}
              voiceEnabled={voiceEnabled}
            />
          </div>
        </div>
      )}

      {/* Directive Error */}
      {directiveError && (
        <div className="mb-4" data-testid="directive-error">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="font-medium text-red-700">Failed to render component</p>
            <p className="text-sm text-red-600 mt-1">{directiveError}</p>
          </div>
        </div>
      )}

      {/* Example Queries */}
      {messages.length === 0 && (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Try asking about:</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUERIES.map((example, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleExampleClick(example)}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
              >
                {example.includes('quarterly estimate') ? 'Quarterly estimate' : example.split(' ').slice(0, 4).join(' ')}...
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-2">
              <div className="spinner"></div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {pendingConfirmation && (
          <ApprovalCard
            message={pendingConfirmation.message}
            onComplete={handleConfirmation}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask about tax rates, estimates, filings..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          disabled={isLoading}
          data-testid="query-input"
        />
        {/* Voice Input Button */}
        <button
          type="button"
          onClick={isListening ? stopListening : startListening}
          className={`px-4 py-2 rounded-lg border transition-colors ${
            isListening
              ? 'bg-red-100 border-red-300 text-red-700'
              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
          title={isListening ? 'Stop listening' : 'Start voice input'}
          data-testid="voice-input"
          disabled={isLoading}
        >
          <svg
            className={`w-5 h-5 ${isListening ? 'animate-pulse' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        </button>
        <button
          type="submit"
          disabled={!query.trim() || isLoading}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          data-testid="send-button"
        >
          Send
        </button>
      </form>

      {/* Voice Status */}
      {isListening && (
        <div className="mt-2 text-sm text-primary-600 flex items-center gap-2" data-testid="listening-indicator">
          <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
          Listening... Speak your query
        </div>
      )}
      {voiceInputError && (
        <div className="mt-2 text-sm text-red-600">
          Voice input error: {voiceInputError}
        </div>
      )}
    </div>
  );
}

export default AIQueryPage;

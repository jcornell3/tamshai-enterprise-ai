import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth, apiConfig } from '@tamshai/auth';
import { ApprovalCard, ComponentRenderer, useVoiceInput, useVoiceOutput } from '@tamshai/ui';
import type { ComponentResponse } from '@tamshai/ui/dist/components/generative/types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  confirmationId?: string;
  confirmationData?: Record<string, unknown>;
}

/**
 * AI Query Page for Payroll with Generative UI Support
 *
 * Natural language queries to payroll data using streaming (Architecture v1.5)
 *
 * Features:
 * - Streaming responses via ReadableStream
 * - Display directive detection (display:payroll:*)
 * - Generative UI rendering via ComponentRenderer
 * - Voice input (Speech-to-Text) and output (Text-to-Speech)
 * - Human-in-the-loop confirmations for write operations
 */
export default function AIQueryPage() {
  const { getAccessToken } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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
      setInput(recognizedText);
    },
  });

  // Voice output hook - speaks component narration
  const { speak, stop: stopSpeaking, isSpeaking } = useVoiceOutput({
    language: 'en-US',
    rate: 1.0,
    pitch: 1.0,
  });

  // Update input when transcript changes
  useEffect(() => {
    if (transcript) {
      setInput(transcript);
    }
  }, [transcript]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /**
   * Detect display directives in AI response
   * Format: display:<domain>:<component>:<params>
   * Example: display:payroll:pay_stub:employeeId=me,period=current
   */
  const detectDirective = (text: string): string | null => {
    const directiveRegex = /display:payroll:(\w+):([^\s]*)/;
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
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setComponentResponse(null);
    setDirectiveError(null);

    try {
      const token = getAccessToken();
      const response = await fetch(`${apiConfig.mcpGatewayUrl}/api/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query: userMessage.content }),
      });

      if (!response.ok) {
        throw new Error('Failed to send query');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
      };

      setMessages((prev) => [...prev, assistantMessage]);
      currentMessageContentRef.current = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                assistantContent += parsed.delta.text;
                currentMessageContentRef.current += parsed.delta.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, content: assistantContent }
                      : m
                  )
                );
              } else if (parsed.status === 'pending_confirmation') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? {
                          ...m,
                          content: parsed.message,
                          confirmationId: parsed.confirmationId,
                          confirmationData: parsed.confirmationData,
                        }
                      : m
                  )
                );
              }
            } catch {
              // Ignore parse errors for partial chunks
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
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Sorry, I encountered an error processing your request. Please try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmation = async (messageId: string, approved: boolean) => {
    const message = messages.find((m) => m.id === messageId);
    if (!message?.confirmationId) return;

    try {
      const token = getAccessToken();
      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/confirm/${message.confirmationId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ approved }),
        }
      );

      const result = await response.json();

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                content: approved
                  ? `${m.content}\n\n✅ Action approved and completed.`
                  : `${m.content}\n\n❌ Action cancelled.`,
                confirmationId: undefined,
              }
            : m
        )
      );
    } catch (error) {
      console.error('Confirmation error:', error);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      {/* Page Header */}
      <div className="mb-4 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Query</h1>
          <p className="text-gray-500 mt-1">Ask questions about payroll data</p>
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 py-8">
            <p>Ask me about payroll, pay stubs, tax withholdings, or 1099 contractors.</p>
            <p className="text-sm mt-2">Examples:</p>
            <ul className="text-sm mt-1 space-y-1">
              <li>"Show my last pay stub"</li>
              <li>"What's our total payroll this month?"</li>
              <li>"List employees in California"</li>
            </ul>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-4 ${
                message.role === 'user'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.confirmationId && (
                <div className="mt-4">
                  <ApprovalCard
                    message=""
                    onComplete={(approved) => handleConfirmation(message.id, approved)}
                  />
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.1s]" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about payroll..."
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
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
          disabled={isLoading || !input.trim()}
          className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
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

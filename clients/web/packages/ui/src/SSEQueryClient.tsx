import React, { useState, useEffect, useRef } from 'react';
import { useAuth, apiConfig } from '@tamshai/auth';

/**
 * SSE Query Client Component (Architecture v1.4 - Section 6.1)
 *
 * Server-Sent Events client for streaming AI responses from MCP Gateway
 *
 * Features:
 * - EventSource API for GET /api/query?q=...
 * - Real-time chunk-by-chunk rendering
 * - Prevents 30-60 second timeout during Claude reasoning
 * - Loading spinner during AI processing
 * - Error recovery with retry button
 * - Handles [DONE] marker for completion
 *
 * Usage:
 * ```tsx
 * <SSEQueryClient
 *   query="List all employees in Engineering department"
 *   onComplete={(response) => console.log('Done:', response)}
 * />
 * ```
 */

interface SSEQueryClientProps {
  query: string;
  onComplete?: (response: string) => void;
  onError?: (error: string) => void;
  autoStart?: boolean;  // Start query automatically on mount
}

export function SSEQueryClient({
  query,
  onComplete,
  onError,
  autoStart = true,
}: SSEQueryClientProps) {
  const { getAccessToken } = useAuth();
  const [response, setResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const startQuery = () => {
    // Clean up existing EventSource
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setResponse('');
    setError(null);
    setIsStreaming(true);

    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Construct SSE URL - handle both absolute and relative URLs
      let sseUrl: string;
      if (apiConfig.mcpGatewayUrl) {
        // Absolute URL (for desktop app or direct access)
        const url = new URL(`${apiConfig.mcpGatewayUrl}/api/query`);
        url.searchParams.append('q', query);
        url.searchParams.append('token', token);
        sseUrl = url.toString();
      } else {
        // Relative URL (for web app, proxied through Nginx)
        const params = new URLSearchParams();
        params.append('q', query);
        params.append('token', token);
        sseUrl = `/api/query?${params.toString()}`;
      }

      // Create EventSource
      // Note: EventSource doesn't support custom headers natively
      // Gateway accepts token via query param for SSE
      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;

      // Handle incoming messages
      eventSource.onmessage = (event) => {
        if (event.data === '[DONE]') {
          // Stream complete
          eventSource.close();
          setIsStreaming(false);
          if (onComplete) {
            onComplete(response);
          }
          return;
        }

        try {
          const chunk = JSON.parse(event.data);

          // Append text chunk to response
          if (chunk.text) {
            setResponse((prev) => prev + chunk.text);
          }
        } catch (parseError) {
          console.error('Failed to parse SSE chunk:', parseError);
        }
      };

      // Handle errors
      eventSource.onerror = (err) => {
        console.error('SSE connection error:', err);
        eventSource.close();
        setIsStreaming(false);

        const errorMessage = 'Connection lost. Please retry.';
        setError(errorMessage);

        if (onError) {
          onError(errorMessage);
        }
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setIsStreaming(false);

      if (onError) {
        onError(errorMessage);
      }
    }
  };

  const stopQuery = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);
  };

  const retryQuery = () => {
    startQuery();
  };

  // Auto-start on mount if enabled
  useEffect(() => {
    if (autoStart && query) {
      startQuery();
    }

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [autoStart, query]);

  return (
    <div className="sse-query-client">
      {/* Query Input */}
      <div className="mb-4">
        <div className="flex items-center gap-2 text-sm text-secondary-600">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
          <span className="font-medium">Query:</span>
          <span className="text-secondary-900">{query}</span>
        </div>
      </div>

      {/* Response Container */}
      <div className="card min-h-[200px] relative">
        {isStreaming && !response && (
          // Loading state (before first chunk)
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="spinner mb-4"></div>
              <p className="text-secondary-600">
                AI is reasoning... this may take 30-60 seconds
              </p>
            </div>
          </div>
        )}

        {response && (
          // Streaming response
          <div className="prose prose-sm max-w-none">
            <div className="whitespace-pre-wrap text-secondary-900">
              {response}
            </div>
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-primary-600 animate-pulse ml-1"></span>
            )}
          </div>
        )}

        {error && (
          // Error state
          <div className="alert-danger">
            <p className="font-medium">Error: {error}</p>
            <button
              onClick={retryQuery}
              className="btn-primary mt-3"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-4 flex gap-2">
        {!isStreaming && !error && response && (
          <button onClick={startQuery} className="btn-primary">
            Run Again
          </button>
        )}
        {isStreaming && (
          <button onClick={stopQuery} className="btn-secondary">
            Stop Streaming
          </button>
        )}
      </div>

      {/* Status Indicator */}
      <div className="mt-2 text-xs text-secondary-500">
        {isStreaming && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            Streaming active (SSE connection open)
          </span>
        )}
        {!isStreaming && response && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 bg-secondary-400 rounded-full"></span>
            Stream complete
          </span>
        )}
      </div>
    </div>
  );
}

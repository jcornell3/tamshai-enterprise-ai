/**
 * SSE Streaming Service
 *
 * Handles Server-Sent Events streaming from MCP Gateway
 * for real-time AI query responses.
 *
 * Architecture v1.4 - Section 6.1: SSE Transport Protocol
 */

import { SSEChunk } from '../types';

export interface SSECallbacks {
  onChunk: (text: string) => void;
  onPagination?: (data: { hasMore: boolean; cursors?: any[]; hint?: string }) => void;
  onError: (error: string) => void;
  onComplete: () => void;
}

/**
 * Stream query to MCP Gateway using EventSource
 *
 * Note: EventSource doesn't support custom headers, so we pass the token
 * as a query parameter (same pattern as web client).
 *
 * @param query - Natural language query
 * @param token - JWT access token
 * @param callbacks - Event callbacks
 * @returns Cleanup function to abort stream
 */
export function streamQuery(
  query: string,
  token: string,
  callbacks: SSECallbacks
): () => void {
  const gatewayUrl = process.env.MCP_GATEWAY_URL || 'http://localhost:3100';

  // Construct SSE URL with query params
  const url = new URL(`${gatewayUrl}/api/query`);
  url.searchParams.set('q', query);
  url.searchParams.set('token', token);

  console.log('[SSE] Starting stream:', query);

  // Create EventSource
  const eventSource = new EventSource(url.toString());

  eventSource.onmessage = (event) => {
    try {
      // Check for completion signal
      if (event.data === '[DONE]') {
        console.log('[SSE] Stream complete');
        eventSource.close();
        callbacks.onComplete();
        return;
      }

      // Parse JSON chunk
      const chunk: SSEChunk = JSON.parse(event.data);

      // Handle different chunk types
      if (chunk.type === 'text') {
        callbacks.onChunk(chunk.text);
      } else if (chunk.type === 'pagination') {
        if (callbacks.onPagination) {
          callbacks.onPagination({
            hasMore: chunk.hasMore,
            cursors: chunk.cursors,
            hint: chunk.hint,
          });
        }
      } else if (chunk.type === 'error') {
        console.error('[SSE] Error chunk:', chunk.error);
        eventSource.close();
        callbacks.onError(chunk.error);
      }
    } catch (error) {
      console.error('[SSE] Parse error:', error);
      eventSource.close();
      callbacks.onError(`Failed to parse response: ${(error as Error).message}`);
    }
  };

  eventSource.onerror = (event) => {
    console.error('[SSE] Connection error:', event);
    eventSource.close();

    // EventSource errors are generic, provide helpful message
    callbacks.onError(
      'Connection to AI service lost. Please check your network and try again.'
    );
  };

  // Return cleanup function
  return () => {
    console.log('[SSE] Aborting stream');
    eventSource.close();
  };
}

/**
 * Get current access token from Electron API
 */
export async function getAccessToken(): Promise<string> {
  const result = await window.electronAPI.getAccessToken();

  if (!result.success || !result.token) {
    throw new Error('Failed to get access token. Please log in again.');
  }

  return result.token;
}

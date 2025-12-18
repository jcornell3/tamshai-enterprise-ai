/**
 * API Service
 *
 * Handles communication with MCP Gateway, including:
 * - SSE streaming for AI responses (v1.4)
 * - Human-in-the-loop confirmations (v1.4)
 * - Token injection for authenticated requests
 *
 * Article V Compliance:
 * - V.1: No authorization logic - backend handles all access control
 */

import { QueryRequest, SSEEvent, ChatMessage, PendingConfirmation } from '../types';

// Simple UUID generator (crypto.randomUUID not available in all RN environments)
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// API configuration
const API_CONFIG = {
  baseUrl: 'http://localhost:3100', // MCP Gateway
  timeout: 60000, // 60s timeout for AI responses
};

/**
 * Send a query to MCP Gateway with SSE streaming
 *
 * v1.4 Pattern: Server-Sent Events for streaming AI responses.
 * This prevents HTTP timeout issues during Claude's 30-60s reasoning.
 */
export async function streamQuery(
  query: string,
  accessToken: string,
  onChunk: (text: string) => void,
  onComplete: (message: ChatMessage) => void,
  onError: (error: Error) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  const url = `${API_CONFIG.baseUrl}/api/query`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({ query } as QueryRequest),
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    // Check if response is SSE stream
    const contentType = response.headers.get('Content-Type');
    if (!contentType?.includes('text/event-stream')) {
      // Fallback: Non-streaming response
      const data = await response.json();
      onComplete({
        id: generateId(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        citations: data.citations,
        pendingConfirmation: data.pendingConfirmation,
      });
      return;
    }

    // Process SSE stream
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let citations: ChatMessage['citations'] = [];
    let pendingConfirmation: PendingConfirmation | undefined;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events in buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);

          if (data === '[DONE]') {
            // Stream complete
            onComplete({
              id: generateId(),
              role: 'assistant',
              content: fullContent,
              timestamp: new Date(),
              citations,
              pendingConfirmation,
            });
            return;
          }

          try {
            const event: SSEEvent = JSON.parse(data);

            if (event.type === 'content_block_delta' && event.delta?.text) {
              fullContent += event.delta.text;
              onChunk(event.delta.text);
            } else if (event.type === 'error') {
              throw new Error(event.error?.message || 'Stream error');
            }
          } catch (parseError) {
            console.warn('[API] Failed to parse SSE event:', data);
          }
        }
      }
    }

    // If we get here without [DONE], complete with what we have
    onComplete({
      id: generateId(),
      role: 'assistant',
      content: fullContent,
      timestamp: new Date(),
      citations,
      pendingConfirmation,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('[API] Request aborted');
      return;
    }
    onError(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Confirm or reject a pending action (v1.4 Human-in-the-Loop)
 *
 * When AI attempts a write operation (update, delete), the gateway returns
 * a pending_confirmation response. The user must approve via this endpoint.
 */
export async function confirmAction(
  confirmationId: string,
  approved: boolean,
  accessToken: string
): Promise<{ status: 'success' | 'cancelled'; result?: unknown }> {
  const url = `${API_CONFIG.baseUrl}/api/confirm/${confirmationId}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ approved }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Simple health check for MCP Gateway
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}/health`, {
      method: 'GET',
      timeout: 5000,
    } as RequestInit);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Set API base URL (for configuration)
 */
export function setApiBaseUrl(url: string): void {
  API_CONFIG.baseUrl = url;
}

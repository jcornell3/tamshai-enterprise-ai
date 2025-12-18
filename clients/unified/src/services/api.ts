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
  _abortSignal?: AbortSignal
): Promise<void> {
  const url = `${API_CONFIG.baseUrl}/api/query`;

  console.log('[API] Starting streamQuery to:', url);

  // Use XMLHttpRequest for better Windows compatibility
  // React Native Windows fetch can crash on network errors
  return new Promise<void>((resolve) => {
    const xhr = new XMLHttpRequest();
    let fullContent = '';
    let lastProcessedIndex = 0;

    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('Accept', 'text/event-stream');

    xhr.onreadystatechange = () => {
      // Process partial response as it arrives (streaming)
      if (xhr.readyState >= 3 && xhr.status === 200) {
        const newData = xhr.responseText.substring(lastProcessedIndex);
        lastProcessedIndex = xhr.responseText.length;

        // Process SSE events in the new data
        const lines = newData.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();

            if (data === '[DONE]') {
              console.log('[API] Stream complete');
              onComplete({
                id: generateId(),
                role: 'assistant',
                content: fullContent,
                timestamp: new Date(),
              });
              resolve();
              return;
            }

            if (data) {
              try {
                const event: SSEEvent = JSON.parse(data);

                if (event.type === 'text' && event.text) {
                  fullContent += event.text;
                  onChunk(event.text);
                } else if (event.type === 'error') {
                  console.error('[API] SSE error:', event.message);
                  onError(new Error(event.message || 'Stream error'));
                  resolve();
                  return;
                } else if (event.type === 'pagination') {
                  console.log('[API] Pagination available:', event.hint);
                }
              } catch (parseError) {
                // Ignore parse errors for partial data
                if (data.length > 2) {
                  console.warn('[API] Failed to parse SSE event:', data);
                }
              }
            }
          }
        }
      }
    };

    xhr.onload = () => {
      console.log('[API] XHR onload, status:', xhr.status);
      if (xhr.status !== 200) {
        let errorMessage = `HTTP ${xhr.status}`;
        try {
          const errorData = JSON.parse(xhr.responseText);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          // Use default error message
        }
        onError(new Error(errorMessage));
      } else if (!fullContent) {
        // Non-streaming response
        try {
          const data = JSON.parse(xhr.responseText);
          onComplete({
            id: generateId(),
            role: 'assistant',
            content: data.response || 'No response received',
            timestamp: new Date(),
          });
        } catch {
          onComplete({
            id: generateId(),
            role: 'assistant',
            content: fullContent || 'Response received',
            timestamp: new Date(),
          });
        }
      }
      resolve();
    };

    xhr.onerror = () => {
      console.error('[API] XHR network error');
      onError(new Error('Network error - could not connect to AI service'));
      resolve();
    };

    xhr.ontimeout = () => {
      console.error('[API] XHR timeout');
      onError(new Error('Request timed out'));
      resolve();
    };

    xhr.timeout = API_CONFIG.timeout;

    try {
      xhr.send(JSON.stringify({ query } as QueryRequest));
      console.log('[API] XHR request sent');
    } catch (sendError) {
      console.error('[API] XHR send error:', sendError);
      onError(new Error('Failed to send request'));
      resolve();
    }
  });
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

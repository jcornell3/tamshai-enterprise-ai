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
 *
 * Note: Uses non-streaming fetch on Windows to avoid Hermes crashes.
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

  // On Windows, use non-streaming POST to avoid Hermes/XMLHttpRequest crashes
  // The response will come back as complete JSON instead of SSE stream
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);

    console.log('[API] Sending fetch request...');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        // Don't request SSE - get buffered response instead
      },
      body: JSON.stringify({ query } as QueryRequest),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log('[API] Response status:', response.status);

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        // Use status code as error
      }
      onError(new Error(errorMessage));
      return;
    }

    // Read the full response body as text
    const responseText = await response.text();
    console.log('[API] Response length:', responseText.length);

    // Parse SSE events from the buffered response
    let fullContent = '';
    const lines = responseText.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();

        if (data === '[DONE]') {
          continue; // End marker
        }

        if (data) {
          try {
            const event: SSEEvent = JSON.parse(data);

            if (event.type === 'text' && event.text) {
              fullContent += event.text;
              // Send chunks to UI for progressive display
              onChunk(event.text);
            } else if (event.type === 'error') {
              console.error('[API] SSE error event:', event.message);
              onError(new Error(event.message || 'Stream error'));
              return;
            } else if (event.type === 'pagination') {
              console.log('[API] Pagination available:', event.hint);
            }
          } catch (parseError) {
            // Ignore parse errors for partial/malformed data
            if (data.length > 2) {
              console.warn('[API] Failed to parse SSE event:', data.substring(0, 100));
            }
          }
        }
      }
    }

    // If we got content from SSE parsing, use it
    if (fullContent) {
      console.log('[API] Parsed SSE content, length:', fullContent.length);
      onComplete({
        id: generateId(),
        role: 'assistant',
        content: fullContent,
        timestamp: new Date(),
      });
      return;
    }

    // Fallback: try to parse as JSON response
    try {
      const jsonData = JSON.parse(responseText);
      const content = jsonData.response || jsonData.content || responseText;
      onComplete({
        id: generateId(),
        role: 'assistant',
        content,
        timestamp: new Date(),
      });
    } catch {
      // Last resort: use raw text
      onComplete({
        id: generateId(),
        role: 'assistant',
        content: responseText || 'No response received',
        timestamp: new Date(),
      });
    }
  } catch (error) {
    console.error('[API] Fetch error:', error);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        onError(new Error('Request timed out'));
      } else {
        onError(new Error(error.message || 'Network error'));
      }
    } else {
      onError(new Error('Failed to connect to AI service'));
    }
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

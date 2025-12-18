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
// Note: For Windows UWP apps, localhost may not work due to network isolation.
// When MCP Gateway runs in WSL/Docker, Windows apps need the WSL IP address.
// The WSL IP can be found with: wsl hostname -I
const API_CONFIG = {
  // For Windows UWP development with WSL backend, use the WSL IP
  // TODO: Make this configurable via environment or settings
  baseUrl: 'http://172.28.131.70:3100', // MCP Gateway (WSL IP)
  timeout: 60000, // 60s timeout for AI responses
};

/**
 * Send a query to MCP Gateway
 *
 * Note: Uses simple fetch without AbortController to avoid Hermes crashes on Windows.
 */
export async function streamQuery(
  query: string,
  accessToken: string,
  onChunk: (text: string) => void,
  onComplete: (message: ChatMessage) => void,
  onError: (error: Error) => void,
  _abortSignal?: AbortSignal
): Promise<void> {
  const url = API_CONFIG.baseUrl + '/api/query';

  console.log('[API] streamQuery called, url:', url);
  console.log('[API] query:', query);
  console.log('[API] token length:', accessToken ? accessToken.length : 0);

  // Build request body
  const bodyObj = { query: query };
  const bodyStr = JSON.stringify(bodyObj);
  console.log('[API] body:', bodyStr);

  // Build headers object
  const headersObj: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + accessToken,
  };
  console.log('[API] headers prepared');

  let response: Response;
  try {
    console.log('[API] calling fetch...');
    response = await fetch(url, {
      method: 'POST',
      headers: headersObj,
      body: bodyStr,
    });
    console.log('[API] fetch returned, status:', response.status);
  } catch (fetchError: unknown) {
    // Network errors on Windows can crash Hermes if not handled carefully
    // Log minimal info and return gracefully
    console.log('[API] fetch failed - network error');
    try {
      // Create error message safely without accessing potentially null properties
      const errMsg = fetchError instanceof Error
        ? fetchError.message
        : 'Could not connect to server';
      console.log('[API] error message:', errMsg);
      onError(new Error('Cannot connect to AI service. Is the server running?'));
    } catch (innerError) {
      // If even creating the error fails, just call onError with a simple message
      onError(new Error('Connection failed'));
    }
    return;
  }

  if (!response.ok) {
    console.log('[API] response not ok:', response.status);
    onError(new Error('HTTP ' + response.status));
    return;
  }

  let responseText: string;
  try {
    console.log('[API] reading response text...');
    responseText = await response.text();
    console.log('[API] response text length:', responseText.length);
  } catch (textError) {
    console.error('[API] text() threw:', textError);
    onError(new Error('Failed to read response'));
    return;
  }

  // Parse SSE events from response
  let fullContent = '';
  const lines = responseText.split('\n');
  console.log('[API] parsing', lines.length, 'lines');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.indexOf('data: ') === 0) {
      const data = line.substring(6).trim();
      if (data === '[DONE]') {
        continue;
      }
      if (data.length > 0) {
        try {
          const event = JSON.parse(data) as SSEEvent;
          if (event.type === 'text' && event.text) {
            fullContent = fullContent + event.text;
            onChunk(event.text);
          } else if (event.type === 'error') {
            onError(new Error(event.message || 'Stream error'));
            return;
          }
        } catch (parseErr) {
          // Ignore parse errors
        }
      }
    }
  }

  console.log('[API] parsed content length:', fullContent.length);

  if (fullContent.length > 0) {
    onComplete({
      id: generateId(),
      role: 'assistant',
      content: fullContent,
      timestamp: new Date(),
    });
  } else {
    // Try JSON fallback
    try {
      const jsonData = JSON.parse(responseText);
      onComplete({
        id: generateId(),
        role: 'assistant',
        content: jsonData.response || jsonData.content || responseText,
        timestamp: new Date(),
      });
    } catch {
      onComplete({
        id: generateId(),
        role: 'assistant',
        content: responseText || 'No response',
        timestamp: new Date(),
      });
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

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
 * Make HTTP request using XMLHttpRequest
 * This avoids Hermes crashes on Windows that occur with fetch() network errors.
 * XMLHttpRequest has more reliable error handling in React Native Windows.
 */
function makeRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string | null
): Promise<{ status: number; responseText: string }> {
  return new Promise((resolve, reject) => {
    console.log('[API] XMLHttpRequest starting:', method, url);

    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);

    // Set headers
    Object.keys(headers).forEach((key) => {
      xhr.setRequestHeader(key, headers[key]);
    });

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        console.log('[API] XMLHttpRequest complete, status:', xhr.status);
        resolve({
          status: xhr.status,
          responseText: xhr.responseText,
        });
      }
    };

    xhr.onerror = function () {
      console.log('[API] XMLHttpRequest error event');
      reject(new Error('Network request failed'));
    };

    xhr.ontimeout = function () {
      console.log('[API] XMLHttpRequest timeout');
      reject(new Error('Request timeout'));
    };

    xhr.timeout = API_CONFIG.timeout;

    console.log('[API] XMLHttpRequest sending...');
    xhr.send(body);
  });
}

/**
 * Send a query to MCP Gateway
 *
 * Note: Uses XMLHttpRequest instead of fetch to avoid Hermes crashes on Windows.
 * The Hermes JS engine crashes when fetch() throws network errors on Windows UWP.
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

  let response: { status: number; responseText: string };
  try {
    response = await makeRequest('POST', url, headersObj, bodyStr);
    console.log('[API] request returned, status:', response.status);
  } catch (reqError: unknown) {
    console.log('[API] request failed');
    const errMsg = reqError instanceof Error ? reqError.message : 'Connection failed';
    console.log('[API] error:', errMsg);
    onError(new Error('Cannot connect to AI service. Is the server running?'));
    return;
  }

  if (response.status < 200 || response.status >= 300) {
    console.log('[API] response not ok:', response.status);
    onError(new Error('HTTP ' + response.status));
    return;
  }

  // responseText is already available from XMLHttpRequest
  const responseText = response.responseText;
  console.log('[API] response text length:', responseText.length);

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

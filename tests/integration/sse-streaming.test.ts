/**
 * Tamshai Corp - SSE Streaming Integration Tests
 *
 * These tests simulate the TamshaiAI Windows app behavior by:
 * 1. Authenticating via Keycloak (like the PKCE flow)
 * 2. Calling POST /api/query with JWT token
 * 3. Processing SSE streaming responses
 * 4. Verifying error handling for connection failures
 *
 * Run with: npm run test:integration
 * Requires: MCP Gateway, Keycloak, and MCP servers running
 */

import axios from 'axios';
import http from 'http';
import { fail } from 'assert';

// Test configuration
// Uses mcp-gateway client which has directAccessGrantsEnabled=true
// Use 127.0.0.1 instead of localhost for Windows compatibility
const CONFIG = {
  keycloakUrl: process.env.KEYCLOAK_URL || 'http://127.0.0.1:8180',
  keycloakRealm: process.env.KEYCLOAK_REALM || 'tamshai-corp',
  gatewayUrl: process.env.GATEWAY_URL || 'http://127.0.0.1:3100',
  clientId: 'mcp-gateway',
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || 'test-client-secret',
};

// Test user password from environment variable
const TEST_PASSWORD = process.env.DEV_USER_PASSWORD || '';
if (!TEST_PASSWORD) {
  console.warn('WARNING: DEV_USER_PASSWORD not set - tests may fail');
}

// Test users
const TEST_USERS = {
  executive: { username: 'eve.thompson', password: TEST_PASSWORD },
  hrUser: { username: 'alice.chen', password: TEST_PASSWORD },
  intern: { username: 'frank.davis', password: TEST_PASSWORD },
};

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface SSEEvent {
  type: 'text' | 'error' | 'pagination';
  text?: string;
  message?: string;
  hasMore?: boolean;
  cursors?: Array<{ server: string; cursor: string }>;
  hint?: string;
}

/**
 * Get access token from Keycloak using Resource Owner Password Grant
 * Note: This is only for testing - real apps use Authorization Code + PKCE
 */
async function getAccessToken(username: string, password: string): Promise<string> {
  const tokenUrl = `${CONFIG.keycloakUrl}/realms/${CONFIG.keycloakRealm}/protocol/openid-connect/token`;

  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: CONFIG.clientId,
    client_secret: CONFIG.clientSecret,
    username,
    password,
    scope: 'openid profile email',  // Removed "roles" - Keycloak includes roles in resource_access by default
  });

  const response = await axios.post<TokenResponse>(tokenUrl, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return response.data.access_token;
}

/**
 * Stream SSE response using raw HTTP request (simulates XMLHttpRequest behavior)
 * This closely matches what the TamshaiAI Windows app does
 */
function streamSSEQuery(
  query: string,
  accessToken: string
): Promise<{
  chunks: string[];
  fullContent: string;
  events: SSEEvent[];
  error?: string;
}> {
  return new Promise((resolve) => {
    const url = new URL(`${CONFIG.gatewayUrl}/api/query`);
    const chunks: string[] = [];
    const events: SSEEvent[] = [];
    let fullContent = '';
    let rawData = '';

    const postData = JSON.stringify({ query });

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        Accept: 'text/event-stream',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      res.setEncoding('utf8');

      res.on('data', (chunk: string) => {
        rawData += chunk;

        // Process SSE events in the raw data
        const lines = rawData.split('\n');
        rawData = lines.pop() || ''; // Keep incomplete line

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();

            if (data === '[DONE]') {
              // Stream complete
              resolve({ chunks, fullContent, events });
              return;
            }

            if (data) {
              try {
                const event: SSEEvent = JSON.parse(data);
                events.push(event);

                if (event.type === 'text' && event.text) {
                  chunks.push(event.text);
                  fullContent += event.text;
                } else if (event.type === 'error') {
                  resolve({
                    chunks,
                    fullContent,
                    events,
                    error: event.message || 'Stream error',
                  });
                  return;
                }
              } catch {
                // Ignore parse errors for partial data
              }
            }
          }
        }
      });

      res.on('end', () => {
        resolve({ chunks, fullContent, events });
      });

      res.on('error', (err) => {
        resolve({ chunks, fullContent, events, error: err.message });
      });
    });

    req.on('error', (err) => {
      resolve({ chunks: [], fullContent: '', events: [], error: err.message });
    });

    req.setTimeout(60000, () => {
      req.destroy();
      resolve({ chunks, fullContent, events, error: 'Request timed out' });
    });

    req.write(postData);
    req.end();
  });
}

// Check if we have a real Claude API key (not a dummy/test key)
const hasRealClaudeApiKey = (): boolean => {
  const key = process.env.CLAUDE_API_KEY || '';
  return key.startsWith('sk-ant-api') && !key.includes('dummy') && !key.includes('test');
};

describe('SSE Streaming Tests - Simulating TamshaiAI App', () => {
  // Skip tests that require Claude to generate responses
  const testOrSkip = hasRealClaudeApiKey() ? test : test.skip;

  describe('POST /api/query Endpoint', () => {
    testOrSkip('Executive user can stream AI query about reports', async () => {
      const token = await getAccessToken(
        TEST_USERS.executive.username,
        TEST_USERS.executive.password
      );

      const result = await streamSSEQuery(
        'How many people report to me?',
        token
      );

      expect(result.error).toBeUndefined();
      expect(result.fullContent.length).toBeGreaterThan(0);
      expect(result.events.length).toBeGreaterThan(0);

      // Verify we received text chunks
      const textEvents = result.events.filter((e) => e.type === 'text');
      expect(textEvents.length).toBeGreaterThan(0);
    }, 90000); // 90 second timeout for Claude response

    testOrSkip('HR user can query employee data via SSE', async () => {
      const token = await getAccessToken(
        TEST_USERS.hrUser.username,
        TEST_USERS.hrUser.password
      );

      const result = await streamSSEQuery(
        'List the departments in the company',
        token
      );

      expect(result.error).toBeUndefined();
      expect(result.fullContent.length).toBeGreaterThan(0);
    }, 90000);

    testOrSkip('Intern receives response but with limited data access', async () => {
      const token = await getAccessToken(
        TEST_USERS.intern.username,
        TEST_USERS.intern.password
      );

      const result = await streamSSEQuery(
        'What data can I access?',
        token
      );

      expect(result.error).toBeUndefined();
      // Intern should still get a response, but with no data access
      expect(result.fullContent.length).toBeGreaterThan(0);
    }, 90000);

    test('Invalid token returns 401 error', async () => {
      const invalidToken = 'invalid.jwt.token';

      // Use axios directly to check HTTP response
      try {
        await axios.post(
          `${CONFIG.gatewayUrl}/api/query`,
          { query: 'Test query' },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${invalidToken}`,
            },
          }
        );
        fail('Should have thrown an error');
      } catch (error: any) {
        if (error.response) {
          expect(error.response.status).toBe(401);
          expect(error.response.data.error).toContain('Invalid');
        } else {
          console.error('Unexpected error (no response):', error.code, error.message);
          throw error;
        }
      }
    });

    testOrSkip('Chunks are received progressively during streaming', async () => {
      const token = await getAccessToken(
        TEST_USERS.executive.username,
        TEST_USERS.executive.password
      );

      const result = await streamSSEQuery(
        'Write a short paragraph about enterprise AI.',
        token
      );

      expect(result.error).toBeUndefined();
      // Should receive multiple text chunks
      expect(result.chunks.length).toBeGreaterThan(1);

      // Full content should be the concatenation of all chunks
      const reconstructed = result.chunks.join('');
      expect(reconstructed).toBe(result.fullContent);
    }, 90000);
  });

  describe('Error Handling', () => {
    test('Connection to non-existent server returns error gracefully', async () => {
      // Temporarily use a bad gateway URL
      const badUrl = 'http://localhost:9999';

      const result = await new Promise<{ error?: string }>((resolve) => {
        const postData = JSON.stringify({ query: 'test' });

        const req = http.request(
          {
            hostname: 'localhost',
            port: 9999,
            path: '/api/query',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer test',
            },
          },
          () => {
            resolve({});
          }
        );

        req.on('error', (err: NodeJS.ErrnoException) => {
          // On Linux, err.message can be empty but err.code has 'ECONNREFUSED'
          resolve({ error: err.message || err.code || 'connection_failed' });
        });

        req.write(postData);
        req.end();
      });

      // Should get a connection error, not a crash
      expect(result.error).toBeDefined();
      // Error message/code format varies by platform:
      // - Windows: "connect ECONNREFUSED 127.0.0.1:9999"
      // - Linux: err.message empty, err.code = "ECONNREFUSED"
      // Just verify we got a connection-related error
      expect(result.error).toMatch(/ECONNREFUSED|connect|connection|refused|connection_failed/i);
    });

    test('Request with missing query returns 400', async () => {
      const token = await getAccessToken(
        TEST_USERS.executive.username,
        TEST_USERS.executive.password
      );

      try {
        await axios.post(
          `${CONFIG.gatewayUrl}/api/query`,
          {}, // Missing query field
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        fail('Should have thrown an error');
      } catch (error: any) {
        if (error.response) {
          expect(error.response.status).toBe(400);
          expect(error.response.data.error).toContain('query');
        } else {
          console.error('Unexpected error (no response):', error.code, error.message);
          throw error;
        }
      }
    });
  });

  describe('GET /api/query Endpoint (EventSource compatible)', () => {
    testOrSkip('GET endpoint works with query parameter', async () => {
      const token = await getAccessToken(
        TEST_USERS.executive.username,
        TEST_USERS.executive.password
      );

      const result = await new Promise<{ fullContent: string; error?: string }>(
        (resolve) => {
          let fullContent = '';
          let rawData = '';
          let resolved = false;

          const url = new URL(`${CONFIG.gatewayUrl}/api/query`);
          url.searchParams.set('q', 'Hello');
          url.searchParams.set('token', token);

          const req = http.request(
            {
              hostname: url.hostname,
              port: url.port,
              path: `${url.pathname}${url.search}`,
              method: 'GET',
              headers: {
                Accept: 'text/event-stream',
              },
            },
            (res) => {
              res.setEncoding('utf8');

              res.on('data', (chunk: string) => {
                rawData += chunk;

                const lines = rawData.split('\n');
                rawData = lines.pop() || '';

                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') {
                      if (!resolved) {
                        resolved = true;
                        resolve({ fullContent });
                      }
                      return;
                    }
                    try {
                      const event = JSON.parse(data);
                      if (event.type === 'text' && event.text) {
                        fullContent += event.text;
                      }
                    } catch {
                      // Ignore parse errors
                    }
                  }
                }
              });

              res.on('end', () => {
                if (!resolved) {
                  resolved = true;
                  resolve({ fullContent });
                }
              });

              res.on('error', (err) => {
                if (!resolved) {
                  resolved = true;
                  resolve({ fullContent: '', error: err.message });
                }
              });
            }
          );

          req.on('error', (err) => {
            if (!resolved) {
              resolved = true;
              resolve({ fullContent: '', error: err.message });
            }
          });

          // Add timeout to prevent hanging
          req.setTimeout(60000, () => {
            if (!resolved) {
              resolved = true;
              req.destroy();
              resolve({ fullContent, error: 'Request timed out' });
            }
          });

          req.end();
        }
      );

      expect(result.error).toBeUndefined();
      expect(result.fullContent.length).toBeGreaterThan(0);
    }, 90000);
  });
});

describe('Health Check', () => {
  test('Gateway health endpoint is accessible', async () => {
    const response = await axios.get(`${CONFIG.gatewayUrl}/health`);
    expect(response.status).toBe(200);
    expect(response.data.status).toBe('healthy');
  });

  test('Keycloak is accessible', async () => {
    const response = await axios.get(
      `${CONFIG.keycloakUrl}/realms/${CONFIG.keycloakRealm}/.well-known/openid-configuration`
    );
    expect(response.status).toBe(200);
    expect(response.data.issuer).toContain(CONFIG.keycloakRealm);
  });
});

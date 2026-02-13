#!/usr/bin/env node
/**
 * Token Pre-Generation Script for k6 Performance Tests
 *
 * Generates user tokens via OAuth 2.0 token exchange and writes them to a JSON file.
 * k6 scenarios can load these pre-generated tokens via the TOKENS_FILE env var.
 *
 * Usage:
 *   node lib/generate-tokens.mjs                          # Default users
 *   node lib/generate-tokens.mjs --output tokens.json     # Custom output
 *   node lib/generate-tokens.mjs --users alice.chen,bob.martinez
 *
 * Then run k6 with:
 *   TOKENS_FILE=tokens.json k6 run scenarios/load.js
 *
 * Token Refresh Strategy:
 *   Tokens expire after ~5 minutes (Keycloak default).
 *   - For smoke/load tests (< 10 min): Generate once, tokens last the whole test
 *   - For stress tests (15 min): Generate once, k6 auth.js handles re-exchange
 *   - For soak tests (4+ hours): Use inline token exchange (don't set TOKENS_FILE)
 *
 * @see .claude/plans/test-auth-refactoring.md - Phase 3
 */

import { writeFileSync } from 'fs';
import { parseArgs } from 'util';

// Parse command line arguments
const { values } = parseArgs({
  options: {
    output: { type: 'string', default: 'tokens.json' },
    users: { type: 'string', default: '' },
    help: { type: 'boolean', default: false },
  },
});

if (values.help) {
  console.log(`
Usage: node lib/generate-tokens.mjs [options]

Options:
  --output <file>     Output JSON file (default: tokens.json)
  --users <list>      Comma-separated usernames (default: standard test users)
  --help              Show this help message

Environment Variables (required):
  KEYCLOAK_URL                      Keycloak base URL (e.g., http://localhost:8190/auth)
  MCP_INTEGRATION_RUNNER_SECRET     Service account client secret

Environment Variables (optional):
  KEYCLOAK_REALM                    Realm name (default: tamshai-corp)
  MCP_INTEGRATION_RUNNER_CLIENT_ID  Client ID (default: mcp-integration-runner)
`);
  process.exit(0);
}

// Configuration from environment
const KEYCLOAK_URL = process.env.KEYCLOAK_URL;
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'tamshai-corp';
const CLIENT_ID = process.env.MCP_INTEGRATION_RUNNER_CLIENT_ID || 'mcp-integration-runner';
const CLIENT_SECRET = process.env.MCP_INTEGRATION_RUNNER_SECRET;

if (!KEYCLOAK_URL || !CLIENT_SECRET) {
  console.error('ERROR: KEYCLOAK_URL and MCP_INTEGRATION_RUNNER_SECRET environment variables are required.');
  process.exit(1);
}

// Default test users (matching k6 scenario needs)
const DEFAULT_USERS = [
  'alice.chen',      // HR - used by all scenarios
  'bob.martinez',    // Finance
  'carol.johnson',   // Sales
  'dan.williams',    // Support
  'eve.thompson',    // Executive
];

const usernames = values.users
  ? values.users.split(',').map(u => u.trim())
  : DEFAULT_USERS;

/**
 * Get service account token via client credentials
 */
async function getServiceToken() {
  const tokenUrl = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Service token request failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Exchange service token for user token
 */
async function getUserToken(serviceToken, username) {
  const tokenUrl = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      subject_token: serviceToken,
      requested_subject: username,
      audience: 'mcp-gateway',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token exchange failed for ${username} (${response.status}): ${body}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function main() {
  console.log('Generating tokens via OAuth 2.0 token exchange...\n');
  console.log(`  Keycloak: ${KEYCLOAK_URL}`);
  console.log(`  Realm: ${KEYCLOAK_REALM}`);
  console.log(`  Client: ${CLIENT_ID}`);
  console.log(`  Users: ${usernames.join(', ')}`);
  console.log(`  Output: ${values.output}\n`);

  // Step 1: Get service account token
  const serviceToken = await getServiceToken();
  console.log('  ✅ Service account token acquired');

  // Step 2: Exchange for each user
  const tokens = {};
  for (const username of usernames) {
    try {
      tokens[username] = await getUserToken(serviceToken, username);
      console.log(`  ✅ ${username}`);
    } catch (error) {
      console.error(`  ❌ ${username}: ${error.message}`);
    }
  }

  // Step 3: Write to file
  writeFileSync(values.output, JSON.stringify(tokens, null, 2));
  console.log(`\n✅ Generated ${Object.keys(tokens).length} tokens → ${values.output}`);
  console.log('   Tokens expire in ~5 minutes. Use TOKENS_FILE env var with k6.');
  console.log(`\n   Example: TOKENS_FILE=${values.output} k6 run scenarios/load.js`);
}

main().catch((error) => {
  console.error(`\n❌ Fatal error: ${error.message}`);
  process.exit(1);
});

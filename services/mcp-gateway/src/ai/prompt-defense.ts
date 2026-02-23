/**
 * Prompt Injection Defense Utility
 *
 * Implements a 5-layer defense strategy to mitigate prompt injection risks:
 * - Layer 1: Input Validation (length, character patterns)
 * - Layer 2: Keyword Blocking (suspicious phrases)
 * - Layer 3: Dynamic Delimiters (randomized XML tags per session)
 * - Layer 4: System Reinforcement (done in system prompt)
 * - Layer 5: Output Validation (detect leaked prompts, PII, internal tags)
 */

import crypto from 'crypto';

const MAX_QUERY_LENGTH = 2048;

// Layer 2: Keyword Blocking
const BLOCKED_KEYWORDS = [
  'ignore previous instructions',
  'ignore all previous instructions',
  'ignore the above',
  'disregard previous',
  'forget your instructions',
  'act as',
  'pretend to be',
  'you are now',
  'system prompt',
  'your system prompt is',
  'your instructions are',
  'confidential',
  'release the confidential',
  'reveal your prompt',
  'show me your prompt',
  'what are your instructions',
  'print your system',
  'output your system',
  'jailbreak',
  'DAN mode',
  'developer mode',
];
const blockedKeywordsRegex = new RegExp(BLOCKED_KEYWORDS.join('|'), 'i');

// Layer 5: Output scanning patterns
const SYSTEM_PROMPT_FRAGMENTS = [
  'tamshai system prompt',
  'tamshai corp system',
  'you are an ai assistant for tamshai',
  'your role is to assist tamshai',
  'as the tamshai ai',
  'tamshai enterprise ai system',
  'mcp-gateway system',
  'internal system instructions',
  'confidential instructions',
  'do not reveal these instructions',
];

// Internal XML tags that should never appear in output
const INTERNAL_TAGS = [
  '<user_query>',
  '</user_query>',
  '<system_context>',
  '</system_context>',
  '<tool_response>',
  '</tool_response>',
  '<internal>',
  '</internal>',
  '<confidential>',
  '</confidential>',
];

// PII patterns for redaction
// IMPORTANT: Order matters - more specific patterns (with keyword prefixes) must come BEFORE generic patterns
const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string; name: string }> = [
  // Routing numbers (9 digits with routing keyword - must come BEFORE SSN to match first)
  { pattern: /\brouting\s*(?:number|#|no\.?)?:?\s*\d{9}\b/gi, replacement: '[ROUTING-REDACTED]', name: 'Routing Number' },
  // Bank account numbers (8-17 digits with account keyword)
  { pattern: /\b(?:account\s*(?:number|#|no\.?)?:?\s*)(\d{8,17})\b/gi, replacement: '[ACCOUNT-REDACTED]', name: 'Bank Account' },
  // Social Security Numbers (various formats - after routing to avoid false positives)
  { pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, replacement: '[SSN-REDACTED]', name: 'SSN' },
  // Credit Card Numbers (basic pattern)
  { pattern: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g, replacement: '[CC-REDACTED]', name: 'Credit Card' },
  // Email addresses (be careful not to redact legitimate business context)
  { pattern: /\b[A-Za-z0-9._%+-]+@(?!tamshai\.com)[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL-REDACTED]', name: 'External Email' },
  // Phone numbers (US format)
  { pattern: /\b(?:\+1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g, replacement: '[PHONE-REDACTED]', name: 'Phone' },
];

// Session delimiter cache
const sessionDelimiters = new Map<string, { open: string; close: string }>();
const sessionTimeouts = new Map<string, NodeJS.Timeout>();
const DELIMITER_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Generate cryptographically random delimiter tags for a session
 */
function generateDelimiters(): { open: string; close: string } {
  const randomId = crypto.randomBytes(8).toString('hex');
  return {
    open: `<query_${randomId}>`,
    close: `</query_${randomId}>`,
  };
}

/**
 * Get or create delimiters for a session
 */
function getSessionDelimiters(sessionId: string): { open: string; close: string } {
  let delimiters = sessionDelimiters.get(sessionId);
  if (!delimiters) {
    delimiters = generateDelimiters();
    sessionDelimiters.set(sessionId, delimiters);
    // Clean up after TTL
    const timeout = setTimeout(() => {
      sessionDelimiters.delete(sessionId);
      sessionTimeouts.delete(sessionId);
    }, DELIMITER_TTL_MS);
    sessionTimeouts.set(sessionId, timeout);
  }
  return delimiters;
}

/**
 * Clear all session delimiters and their cleanup timeouts.
 * Used for testing to prevent open handles.
 */
function clearAllSessions(): void {
  for (const timeout of sessionTimeouts.values()) {
    clearTimeout(timeout);
  }
  sessionDelimiters.clear();
  sessionTimeouts.clear();
}

/**
 * Layer 1: Input Validation
 * Checks for excessive length or unusual character patterns.
 */
function validateInput(query: string): string {
  if (query.length > MAX_QUERY_LENGTH) {
    throw new Error('Query exceeds maximum length.');
  }

  // Check for excessive special characters (potential injection attempt)
  const specialCharRatio = (query.match(/[<>{}[\]\\|`]/g) || []).length / query.length;
  if (specialCharRatio > 0.1) {
    throw new Error('Query contains suspicious character patterns.');
  }

  // Check for null bytes or control characters
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(query)) {
    throw new Error('Query contains invalid control characters.');
  }

  return query;
}

/**
 * Layer 2: Keyword Blocking
 * Rejects queries containing suspicious keywords.
 */
function blockKeywords(query: string): string {
  if (blockedKeywordsRegex.test(query)) {
    throw new Error('Query contains blocked keywords.');
  }
  return query;
}

/**
 * Layer 3: Dynamic Delimiters
 * Wraps the user query in randomized XML tags per session.
 */
function delimitQuery(query: string, sessionId?: string): string {
  if (sessionId) {
    const { open, close } = getSessionDelimiters(sessionId);
    return `${open}${query}${close}`;
  }
  // Fallback to static delimiters if no session (backwards compatibility)
  return `<user_query>${query}</user_query>`;
}

/**
 * Layer 5a: Detect system prompt leakage
 */
function detectSystemPromptLeak(text: string): boolean {
  const lowerText = text.toLowerCase();
  return SYSTEM_PROMPT_FRAGMENTS.some(fragment => lowerText.includes(fragment));
}

/**
 * Layer 5b: Detect internal tag leakage
 */
function detectInternalTags(text: string): string[] {
  const lowerText = text.toLowerCase();
  return INTERNAL_TAGS.filter(tag => lowerText.includes(tag.toLowerCase()));
}

/**
 * Layer 5c: Redact PII from output
 */
function redactPII(text: string): { text: string; redactions: string[] } {
  const redactions: string[] = [];
  let result = text;

  for (const { pattern, replacement, name } of PII_PATTERNS) {
    const matches = result.match(pattern);
    if (matches) {
      redactions.push(`${name}: ${matches.length} instance(s)`);
      result = result.replace(pattern, replacement);
    }
  }

  return { text: result, redactions };
}

/**
 * Layer 5: Output Validation (comprehensive)
 * Scans AI output for:
 * - Leaked system prompt fragments
 * - Internal XML tags
 * - PII that should be redacted
 */
function scanOutput(chunk: string, options?: { redactPII?: boolean; strict?: boolean }): string {
  const { redactPII: shouldRedactPII = true, strict = false } = options || {};

  // Check for system prompt leakage
  if (detectSystemPromptLeak(chunk)) {
    if (strict) {
      throw new Error('Output contains potential system prompt leakage.');
    }
    // In non-strict mode, redact the fragment
    let result = chunk;
    for (const fragment of SYSTEM_PROMPT_FRAGMENTS) {
      const regex = new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      result = result.replace(regex, '[SYSTEM-REDACTED]');
    }
    chunk = result;
  }

  // Check for internal tag leakage
  const leakedTags = detectInternalTags(chunk);
  if (leakedTags.length > 0) {
    if (strict) {
      throw new Error(`Output contains internal tags: ${leakedTags.join(', ')}`);
    }
    // Remove internal tags
    let result = chunk;
    for (const tag of INTERNAL_TAGS) {
      result = result.replace(new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
    }
    chunk = result;
  }

  // Redact PII if enabled
  if (shouldRedactPII) {
    const { text } = redactPII(chunk);
    chunk = text;
  }

  return chunk;
}

/**
 * Scan input before sending to LLM (pre-LLM PII redaction)
 * This prevents PII from being sent to external LLM providers.
 */
function sanitizeForLLM(text: string): { text: string; redactions: string[] } {
  return redactPII(text);
}

export const promptDefense = {
  /**
   * Applies layers 1, 2, and 3 of the prompt defense.
   * @param query - User query to sanitize
   * @param sessionId - Optional session ID for dynamic delimiters
   */
  sanitize: (query: string, sessionId?: string): string => {
    const validated = validateInput(query);
    const keywordSafe = blockKeywords(validated);
    return delimitQuery(keywordSafe, sessionId);
  },

  /**
   * Applies layer 5 of the prompt defense.
   * Scans output for leaked prompts, internal tags, and PII.
   */
  scanOutput,

  /**
   * Pre-LLM PII redaction.
   * Use this before sending user input to external LLM providers.
   */
  sanitizeForLLM,

  /**
   * Generate new session delimiters.
   * Call this at the start of a new conversation session.
   */
  getSessionDelimiters,

  /**
   * Utility functions for testing/monitoring
   */
  utils: {
    detectSystemPromptLeak,
    detectInternalTags,
    redactPII,
    validateInput,
    blockKeywords,
    clearAllSessions,
  },
};

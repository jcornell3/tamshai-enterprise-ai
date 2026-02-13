/**
 * Prompt Injection Defense Utility
 *
 * Implements a 5-layer defense strategy to mitigate prompt injection risks.
 */

const MAX_QUERY_LENGTH = 2048;

// Layer 2: Keyword Blocking
const BLOCKED_KEYWORDS = [
  'ignore previous instructions',
  'ignore all previous instructions',
  'act as',
  'system prompt',
  'your system prompt is',
  'confidential',
  'release the confidential instructions',
];
const blockedKeywordsRegex = new RegExp(BLOCKED_KEYWORDS.join('|'), 'i');

/**
 * Layer 1: Input Validation
 * Checks for excessive length or unusual character patterns.
 */
function validateInput(query: string): string {
  if (query.length > MAX_QUERY_LENGTH) {
    throw new Error('Query exceeds maximum length.');
  }
  // Add more validation logic here if needed (e.g., character whitelisting)
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
 * Layer 3: Embedding Delimiters
 * Wraps the user query in XML tags to separate it from the system prompt.
 */
function delimitQuery(query: string): string {
  return `<user_query>${query}</user_query>`;
}

/**
 * Layer 5: Output Validation
 * Scans AI output for leaked system prompt fragments.
 */
function scanOutput(chunk: string): string {
  // This is a placeholder. A real implementation would need to be more robust,
  // potentially checking for fragments of the system prompt.
  if (chunk.toLowerCase().includes('tamshai corp')) {
    return chunk.replace(/tamshai corp/gi, '[REDACTED]');
  }
  return chunk;
}


export const promptDefense = {
  /**
   * Applies layers 1, 2, and 3 of the prompt defense.
   */
  sanitize: (query: string): string => {
    const validated = validateInput(query);
    const keywordSafe = blockKeywords(validated);
    return delimitQuery(keywordSafe);
  },

  /**
   * Applies layer 5 of the prompt defense.
   */
  scanOutput,
};

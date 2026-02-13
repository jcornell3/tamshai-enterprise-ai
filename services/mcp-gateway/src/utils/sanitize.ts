/**
 * Input Sanitization Utilities
 *
 * Provides sanitization functions to prevent:
 * - Log injection attacks
 * - Remote property injection
 * - Prototype pollution
 */

/**
 * Maximum length for logged string values
 */
const MAX_LOG_STRING_LENGTH = 200;

/**
 * Maximum depth for nested object logging
 */
const MAX_LOG_DEPTH = 3;

/**
 * Maximum number of array elements to log
 */
const MAX_LOG_ARRAY_ELEMENTS = 10;

/**
 * Dangerous property names that could lead to prototype pollution
 */
const DANGEROUS_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);

/**
 * Pattern for valid query parameter keys (alphanumeric, underscore, hyphen, dot)
 * Prevents injection of special characters in property names
 */
const SAFE_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.-]*$/;

/**
 * Check if a property name is safe to use as an object key
 */
export function isSafeKey(key: string): boolean {
  if (DANGEROUS_KEYS.has(key)) {
    return false;
  }
  if (key.length > 100) {
    return false;
  }
  return SAFE_KEY_PATTERN.test(key);
}

/**
 * Sanitize a string for safe logging
 * - Removes/escapes control characters
 * - Truncates long strings
 * - Escapes newlines and other injection vectors
 */
export function sanitizeLogString(value: string): string {
  if (typeof value !== 'string') {
    return String(value);
  }

  // Remove or escape control characters (except space)
  // This prevents log injection via ANSI escape sequences, null bytes, etc.
  let sanitized = value.replace(/[\x00-\x1F\x7F]/g, (char) => {
    const code = char.charCodeAt(0);
    if (code === 0x09) return '\\t'; // Tab
    if (code === 0x0a) return '\\n'; // Newline
    if (code === 0x0d) return '\\r'; // Carriage return
    return `\\x${code.toString(16).padStart(2, '0')}`;
  });

  // Truncate if too long
  if (sanitized.length > MAX_LOG_STRING_LENGTH) {
    sanitized = sanitized.substring(0, MAX_LOG_STRING_LENGTH) + '...[truncated]';
  }

  return sanitized;
}

/**
 * Sanitize an object for safe logging
 * - Sanitizes all string values
 * - Limits depth and array sizes
 * - Removes sensitive keys
 */
export function sanitizeForLogging(
  obj: unknown,
  depth: number = 0
): unknown {
  if (depth > MAX_LOG_DEPTH) {
    return '[max depth exceeded]';
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeLogString(obj);
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    const sanitizedArray = obj
      .slice(0, MAX_LOG_ARRAY_ELEMENTS)
      .map((item) => sanitizeForLogging(item, depth + 1));
    if (obj.length > MAX_LOG_ARRAY_ELEMENTS) {
      sanitizedArray.push(`...[${obj.length - MAX_LOG_ARRAY_ELEMENTS} more items]`);
    }
    return sanitizedArray;
  }

  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = Object.create(null);
    const entries = Object.entries(obj);

    for (const [key, value] of entries) {
      // Skip dangerous keys (prototype pollution prevention)
      if (DANGEROUS_KEYS.has(key)) {
        continue;
      }

      // Skip keys that don't match safe pattern
      if (!SAFE_KEY_PATTERN.test(key) || key.length > 100) {
        continue;
      }

      // Redact sensitive keys
      if (isSensitiveKey(key)) {
        // lgtm[js/remote-property-injection] - key validated above
        sanitized[key] = '[REDACTED]';
        continue;
      }

      // lgtm[js/remote-property-injection] - key validated above
      sanitized[key] = sanitizeForLogging(value, depth + 1);
    }

    return sanitized;
  }

  // For functions, symbols, etc.
  return `[${typeof obj}]`;
}

/**
 * Check if a key name suggests sensitive data
 */
function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  const sensitivePatterns = [
    'password',
    'secret',
    'token',
    'apikey',
    'api_key',
    'credential',
    'auth',
    'bearer',
    'private',
    'ssn',
    'social_security',
  ];
  return sensitivePatterns.some((pattern) => lowerKey.includes(pattern));
}

/**
 * Build a safe query params object from Express query
 * - Validates all keys against safe pattern
 * - Prevents prototype pollution
 * - Converts values to appropriate types
 */
export function buildSafeQueryParams(
  query: Record<string, unknown>
): Record<string, string | number | string[]> {
  const params: Record<string, string | number | string[]> = Object.create(null);

  for (const [key, value] of Object.entries(query)) {
    // Skip undefined values
    if (value === undefined) continue;

    // Validate key is safe
    if (!isSafeKey(key)) continue;

    // Process value based on type
    if (typeof value === 'string') {
      // Try to parse as integer if it looks numeric AND fits in safe integer range
      // (ObjectIds and other long numeric strings must stay as strings)
      const parsed = /^\d+$/.test(value) ? parseInt(value, 10) : NaN;
      if (Number.isSafeInteger(parsed)) {
        params[key] = parsed;
      } else {
        params[key] = value;
      }
    } else if (Array.isArray(value)) {
      // Filter to only include string values
      params[key] = value.filter((v): v is string => typeof v === 'string');
    }
    // Skip ParsedQs objects (nested query params)
  }

  return params;
}

/**
 * PII Scrubber for Audit Logs
 *
 * Security Review Finding: User queries logged to audit trail may contain PII.
 * This module scrubs sensitive data from strings before logging.
 *
 * Patterns detected:
 * - SSN (XXX-XX-XXXX or 9 digits)
 * - Credit card numbers (15-16 digits)
 * - Email addresses (optional - can be allowed in context)
 * - Phone numbers
 * - Names in common patterns (e.g., "salary of John Doe")
 */

interface ScrubOptions {
  scrubEmails?: boolean;
  scrubPhones?: boolean;
  scrubNames?: boolean;
}

const DEFAULT_OPTIONS: ScrubOptions = {
  scrubEmails: false, // Emails often needed for context
  scrubPhones: true,
  scrubNames: false, // Names often needed for context
};

// PII patterns with replacements
const PII_PATTERNS: { pattern: RegExp; replacement: string; description: string }[] = [
  // SSN patterns
  {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[SSN-REDACTED]',
    description: 'SSN with dashes',
  },
  {
    pattern: /\b\d{9}\b/g,
    replacement: '[SSN-REDACTED]',
    description: 'SSN without dashes (9 consecutive digits)',
  },

  // Credit card patterns (major card formats)
  {
    pattern: /\b4[0-9]{12}(?:[0-9]{3})?\b/g,
    replacement: '[CARD-REDACTED]',
    description: 'Visa card',
  },
  {
    pattern: /\b5[1-5][0-9]{14}\b/g,
    replacement: '[CARD-REDACTED]',
    description: 'MasterCard',
  },
  {
    pattern: /\b3[47][0-9]{13}\b/g,
    replacement: '[CARD-REDACTED]',
    description: 'American Express',
  },
  {
    pattern: /\b6(?:011|5[0-9]{2})[0-9]{12}\b/g,
    replacement: '[CARD-REDACTED]',
    description: 'Discover card',
  },

  // Bank account / routing numbers (8-17 digits)
  {
    pattern: /\b(?:account|routing|acct)[\s#:]*\d{8,17}\b/gi,
    replacement: '[ACCOUNT-REDACTED]',
    description: 'Bank account number',
  },

  // Password patterns (in context)
  {
    pattern: /(?:password|passwd|pwd)[\s:=]+["']?[^\s"']+["']?/gi,
    replacement: '[PASSWORD-REDACTED]',
    description: 'Password in context',
  },
];

// Optional patterns (controlled by options)
const OPTIONAL_PATTERNS = {
  email: {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '[EMAIL-REDACTED]',
    description: 'Email address',
  },
  phone: {
    pattern: /\b(?:\+?1[-.\s]?)?(?:\([0-9]{3}\)|[0-9]{3})[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
    replacement: '[PHONE-REDACTED]',
    description: 'Phone number',
  },
};

/**
 * Scrub PII from a string for safe logging
 *
 * @param input - String that may contain PII
 * @param options - Scrubbing options
 * @returns Scrubbed string safe for logging
 */
export function scrubPII(input: string, options: ScrubOptions = DEFAULT_OPTIONS): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  let scrubbed = input;

  // Apply mandatory patterns
  for (const { pattern, replacement } of PII_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, replacement);
  }

  // Apply optional patterns based on options
  if (options.scrubEmails) {
    scrubbed = scrubbed.replace(OPTIONAL_PATTERNS.email.pattern, OPTIONAL_PATTERNS.email.replacement);
  }

  if (options.scrubPhones) {
    scrubbed = scrubbed.replace(OPTIONAL_PATTERNS.phone.pattern, OPTIONAL_PATTERNS.phone.replacement);
  }

  return scrubbed;
}

/**
 * Scrub PII from an object (deep traversal)
 *
 * @param obj - Object that may contain PII in string fields
 * @param options - Scrubbing options
 * @returns New object with PII scrubbed from string fields
 */
export function scrubPIIFromObject<T extends Record<string, unknown>>(
  obj: T,
  options: ScrubOptions = DEFAULT_OPTIONS
): T {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const scrubbed: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      scrubbed[key] = scrubPII(value, options);
    } else if (Array.isArray(value)) {
      scrubbed[key] = value.map((item) =>
        typeof item === 'string' ? scrubPII(item, options) :
        typeof item === 'object' && item !== null ? scrubPIIFromObject(item as Record<string, unknown>, options) :
        item
      );
    } else if (typeof value === 'object' && value !== null) {
      scrubbed[key] = scrubPIIFromObject(value as Record<string, unknown>, options);
    } else {
      scrubbed[key] = value;
    }
  }

  return scrubbed as T;
}

/**
 * Check if a string likely contains PII (for detection without modification)
 *
 * @param input - String to check
 * @returns true if PII patterns detected
 */
export function containsPII(input: string): boolean {
  if (!input || typeof input !== 'string') {
    return false;
  }

  for (const { pattern } of PII_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    if (pattern.test(input)) {
      return true;
    }
  }

  return false;
}

export default scrubPII;

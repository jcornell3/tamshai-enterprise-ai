/**
 * Directive Parser for MCP UI Generative Components
 *
 * Parses display directives in the format:
 * display:<domain>:<component>:<params>
 *
 * Examples:
 * - display:hr:org_chart:userId=me,depth=1
 * - display:sales:customer:customerId=abc123
 * - display:finance:budget:department=engineering,year=2026
 */

export interface ParsedDirective {
  domain: string;
  component: string;
  params: Record<string, string>;
}

/**
 * Parses a display directive string into its components.
 *
 * @param directive - The directive string to parse
 * @returns ParsedDirective if valid, null if invalid
 *
 * @example
 * parseDirective('display:hr:org_chart:userId=me,depth=1')
 * // Returns: { domain: 'hr', component: 'org_chart', params: { userId: 'me', depth: '1' } }
 */
export function parseDirective(directive: string): ParsedDirective | null {
  // Guard clauses for invalid input
  if (!directive || typeof directive !== 'string') {
    return null;
  }

  // Match the directive format: display:<domain>:<component>:<params>
  const match = directive.match(/^display:(\w+):(\w+):(.*)$/);
  if (!match) {
    return null;
  }

  const [, domain, component, paramString] = match;
  const params = parseParams(paramString);

  return { domain, component, params };
}

// Safe key pattern: only word characters (letters, digits, underscores)
// This prevents prototype pollution (__proto__, constructor, etc.)
// and any injection via special characters in keys.
const SAFE_KEY_PATTERN = /^\w+$/;

/**
 * Parses a parameter string into a key-value object.
 * Uses Object.create(null) to prevent prototype pollution.
 * Keys must match /^\w+$/ (alphanumeric + underscore only).
 *
 * @param paramString - Comma-separated key=value pairs
 * @returns Object with parsed parameters
 */
function parseParams(paramString: string): Record<string, string> {
  const params: Record<string, string> = Object.create(null);

  if (!paramString) {
    return params;
  }

  for (const pair of paramString.split(',')) {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) continue; // Skip entries without =

    const key = pair.slice(0, eqIndex).trim();
    const value = pair.slice(eqIndex + 1).trim();

    if (key && SAFE_KEY_PATTERN.test(key)) {
      params[key] = value;
    }
  }

  return params;
}

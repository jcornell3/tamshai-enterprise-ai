/**
 * Sanitize Utilities Tests
 *
 * Tests for input sanitization functions that prevent log injection,
 * prototype pollution, and remote property injection.
 */

import {
  isSafeKey,
  sanitizeLogString,
  sanitizeForLogging,
  buildSafeQueryParams,
} from './sanitize';

describe('isSafeKey', () => {
  test('accepts simple alphanumeric keys', () => {
    expect(isSafeKey('name')).toBe(true);
    expect(isSafeKey('userId')).toBe(true);
    expect(isSafeKey('count123')).toBe(true);
  });

  test('accepts keys with dots, hyphens, and underscores', () => {
    expect(isSafeKey('user.name')).toBe(true);
    expect(isSafeKey('content-type')).toBe(true);
    expect(isSafeKey('my_field')).toBe(true);
    expect(isSafeKey('a.b-c_d')).toBe(true);
  });

  test('rejects dangerous prototype pollution keys', () => {
    expect(isSafeKey('__proto__')).toBe(false);
    expect(isSafeKey('constructor')).toBe(false);
    expect(isSafeKey('prototype')).toBe(false);
    expect(isSafeKey('__defineGetter__')).toBe(false);
    expect(isSafeKey('__defineSetter__')).toBe(false);
    expect(isSafeKey('__lookupGetter__')).toBe(false);
    expect(isSafeKey('__lookupSetter__')).toBe(false);
  });

  test('rejects keys longer than 100 characters', () => {
    expect(isSafeKey('a'.repeat(100))).toBe(true);
    expect(isSafeKey('a'.repeat(101))).toBe(false);
  });

  test('rejects keys starting with non-letter characters', () => {
    expect(isSafeKey('1name')).toBe(false);
    expect(isSafeKey('_name')).toBe(false);
    expect(isSafeKey('.name')).toBe(false);
    expect(isSafeKey('-name')).toBe(false);
  });

  test('rejects keys with special characters', () => {
    expect(isSafeKey('key=value')).toBe(false);
    expect(isSafeKey('key[0]')).toBe(false);
    expect(isSafeKey('key{}')).toBe(false);
    expect(isSafeKey('key;drop')).toBe(false);
    expect(isSafeKey('key<script>')).toBe(false);
  });

  test('rejects empty string', () => {
    expect(isSafeKey('')).toBe(false);
  });

  test('accepts single letter key', () => {
    expect(isSafeKey('a')).toBe(true);
    expect(isSafeKey('Z')).toBe(true);
  });
});

describe('sanitizeLogString', () => {
  test('returns normal strings unchanged', () => {
    expect(sanitizeLogString('hello world')).toBe('hello world');
    expect(sanitizeLogString('user@example.com')).toBe('user@example.com');
  });

  test('escapes tab characters', () => {
    expect(sanitizeLogString('before\tafter')).toBe('before\\tafter');
  });

  test('escapes newline characters', () => {
    expect(sanitizeLogString('line1\nline2')).toBe('line1\\nline2');
  });

  test('escapes carriage return characters', () => {
    expect(sanitizeLogString('line1\rline2')).toBe('line1\\rline2');
  });

  test('escapes null bytes and other control characters as hex', () => {
    expect(sanitizeLogString('before\x00after')).toBe('before\\x00after');
    expect(sanitizeLogString('test\x01data')).toBe('test\\x01data');
    expect(sanitizeLogString('test\x1fdata')).toBe('test\\x1fdata');
  });

  test('escapes DEL character (0x7F)', () => {
    expect(sanitizeLogString('test\x7fdata')).toBe('test\\x7fdata');
  });

  test('handles multiple control characters', () => {
    expect(sanitizeLogString('\x00\n\t\r\x1f')).toBe('\\x00\\n\\t\\r\\x1f');
  });

  test('truncates strings longer than 200 characters', () => {
    const longString = 'a'.repeat(250);
    const result = sanitizeLogString(longString);
    expect(result).toBe('a'.repeat(200) + '...[truncated]');
  });

  test('does not truncate strings at exactly 200 characters', () => {
    const exactString = 'a'.repeat(200);
    expect(sanitizeLogString(exactString)).toBe(exactString);
  });

  test('truncates at 201 characters', () => {
    const overString = 'a'.repeat(201);
    const result = sanitizeLogString(overString);
    expect(result).toBe('a'.repeat(200) + '...[truncated]');
  });

  test('returns empty string unchanged', () => {
    expect(sanitizeLogString('')).toBe('');
  });

  test('converts non-string inputs to strings', () => {
    expect(sanitizeLogString(123 as unknown as string)).toBe('123');
    expect(sanitizeLogString(null as unknown as string)).toBe('null');
    expect(sanitizeLogString(undefined as unknown as string)).toBe('undefined');
    expect(sanitizeLogString(true as unknown as string)).toBe('true');
  });
});

describe('sanitizeForLogging', () => {
  describe('primitive types', () => {
    test('returns null as-is', () => {
      expect(sanitizeForLogging(null)).toBe(null);
    });

    test('returns undefined as-is', () => {
      expect(sanitizeForLogging(undefined)).toBe(undefined);
    });

    test('returns numbers as-is', () => {
      expect(sanitizeForLogging(42)).toBe(42);
      expect(sanitizeForLogging(0)).toBe(0);
      expect(sanitizeForLogging(-1.5)).toBe(-1.5);
    });

    test('returns booleans as-is', () => {
      expect(sanitizeForLogging(true)).toBe(true);
      expect(sanitizeForLogging(false)).toBe(false);
    });

    test('sanitizes strings', () => {
      expect(sanitizeForLogging('hello')).toBe('hello');
      expect(sanitizeForLogging('line1\nline2')).toBe('line1\\nline2');
    });
  });

  describe('non-standard types', () => {
    test('returns [function] for functions', () => {
      expect(sanitizeForLogging(() => {})).toBe('[function]');
      expect(sanitizeForLogging(function test() {})).toBe('[function]');
    });

    test('returns [symbol] for symbols', () => {
      expect(sanitizeForLogging(Symbol('test'))).toBe('[symbol]');
    });
  });

  describe('arrays', () => {
    test('sanitizes array elements recursively', () => {
      expect(sanitizeForLogging([1, 'hello', true])).toEqual([1, 'hello', true]);
    });

    test('truncates arrays longer than 10 elements', () => {
      const longArray = Array.from({ length: 15 }, (_, i) => i);
      const result = sanitizeForLogging(longArray) as unknown[];
      expect(result).toHaveLength(11); // 10 elements + truncation message
      expect(result[10]).toBe('...[5 more items]');
    });

    test('does not truncate arrays with exactly 10 elements', () => {
      const exactArray = Array.from({ length: 10 }, (_, i) => i);
      const result = sanitizeForLogging(exactArray) as unknown[];
      expect(result).toHaveLength(10);
    });

    test('handles empty arrays', () => {
      expect(sanitizeForLogging([])).toEqual([]);
    });

    test('sanitizes nested objects in arrays', () => {
      const result = sanitizeForLogging([{ password: 'secret' }]) as unknown[];
      expect(result).toEqual([{ password: '[REDACTED]' }]);
    });
  });

  describe('objects', () => {
    test('sanitizes object values recursively', () => {
      const result = sanitizeForLogging({ name: 'Alice', age: 30 });
      expect(result).toEqual({ name: 'Alice', age: 30 });
    });

    test('skips dangerous keys (prototype pollution prevention)', () => {
      const obj = { name: 'test', __proto__: 'polluted', constructor: 'bad' };
      const result = sanitizeForLogging(obj) as Record<string, unknown>;
      expect(result).not.toHaveProperty('__proto__');
      expect(result).not.toHaveProperty('constructor');
      expect(result).toHaveProperty('name', 'test');
    });

    test('skips keys with invalid patterns', () => {
      const obj = { validKey: 'ok', '1invalid': 'skip', 'has spaces': 'skip' };
      const result = sanitizeForLogging(obj) as Record<string, unknown>;
      expect(result).toHaveProperty('validKey', 'ok');
      expect(result).not.toHaveProperty('1invalid');
      expect(result).not.toHaveProperty('has spaces');
    });

    test('skips keys longer than 100 characters', () => {
      const longKey = 'a'.repeat(101);
      const obj = { [longKey]: 'value', short: 'ok' };
      const result = sanitizeForLogging(obj) as Record<string, unknown>;
      expect(result).not.toHaveProperty(longKey);
      expect(result).toHaveProperty('short', 'ok');
    });

    test('redacts sensitive keys', () => {
      const obj = {
        username: 'alice',
        password: 'secret123', // pragma: allowlist secret
        apiToken: 'tok_abc',
        authHeader: 'Bearer xyz',
      };
      const result = sanitizeForLogging(obj) as Record<string, unknown>;
      expect(result.username).toBe('alice');
      expect(result.password).toBe('[REDACTED]');
      expect(result.apiToken).toBe('[REDACTED]');
      expect(result.authHeader).toBe('[REDACTED]');
    });

    test('redacts all sensitive key patterns', () => {
      // Test values are dummy data for redaction verification (pragma: allowlist secret)
      const sensitiveKeys: Record<string, string> = {
        userPassword: 'pass', // pragma: allowlist secret
        clientSecret: 'sec', // pragma: allowlist secret
        accessToken: 'tok', // pragma: allowlist secret
        myApikey: 'key', // pragma: allowlist secret
        someApi_key: 'key2', // pragma: allowlist secret
        dbCredential: 'cred', // pragma: allowlist secret
        bearerToken: 'bt',
        privateKey: 'pk', // pragma: allowlist secret
        userSsn: '123',
        social_security_num: '456',
      };
      const result = sanitizeForLogging(sensitiveKeys) as Record<string, unknown>;
      for (const key of Object.keys(sensitiveKeys)) {
        expect(result[key]).toBe('[REDACTED]');
      }
    });

    test('handles empty objects', () => {
      expect(sanitizeForLogging({})).toEqual({});
    });

    test('uses Object.create(null) for output (no prototype)', () => {
      const result = sanitizeForLogging({ a: 1 }) as Record<string, unknown>;
      expect(Object.getPrototypeOf(result)).toBe(null);
    });
  });

  describe('depth limiting', () => {
    test('returns [max depth exceeded] beyond MAX_LOG_DEPTH (3)', () => {
      // depth 0: root, depth 1: a, depth 2: b, depth 3: c, depth 4: d (exceeds 3)
      const deep = { a: { b: { c: { d: { e: 'too deep' } } } } };
      const result = sanitizeForLogging(deep) as Record<string, Record<string, Record<string, Record<string, unknown>>>>;
      expect(result.a.b.c.d).toBe('[max depth exceeded]');
    });

    test('allows objects up to depth 3', () => {
      // depth 0: root, depth 1: a, depth 2: b, depth 3: c (string, no deeper recursion)
      const nested = { a: { b: { c: 'ok' } } };
      const result = sanitizeForLogging(nested) as Record<string, Record<string, Record<string, unknown>>>;
      expect(result.a.b.c).toBe('ok');
    });
  });
});

describe('buildSafeQueryParams', () => {
  test('passes through string values', () => {
    const result = buildSafeQueryParams({ name: 'alice', status: 'active' });
    expect(result.name).toBe('alice');
    expect(result.status).toBe('active');
  });

  test('parses numeric strings as integers', () => {
    const result = buildSafeQueryParams({ page: '1', limit: '50' });
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
  });

  test('parses zero as integer', () => {
    const result = buildSafeQueryParams({ offset: '0' });
    expect(result.offset).toBe(0);
  });

  test('keeps non-numeric strings as strings', () => {
    const result = buildSafeQueryParams({ name: 'alice', id: 'abc123' });
    expect(result.name).toBe('alice');
    expect(result.id).toBe('abc123');
  });

  test('keeps unsafe large integers as strings', () => {
    const bigNum = '99999999999999999999';
    const result = buildSafeQueryParams({ id: bigNum });
    expect(result.id).toBe(bigNum);
  });

  test('filters arrays to string elements only', () => {
    const result = buildSafeQueryParams({ tags: ['hr', 'finance', 42 as unknown as string] });
    expect(result.tags).toEqual(['hr', 'finance']);
  });

  test('skips undefined values', () => {
    const result = buildSafeQueryParams({ name: 'alice', missing: undefined });
    expect(result).toHaveProperty('name');
    expect(result).not.toHaveProperty('missing');
  });

  test('skips unsafe keys', () => {
    const result = buildSafeQueryParams({
      validKey: 'ok',
      __proto__: 'bad',
      '1invalid': 'skip',
    });
    expect(result).toHaveProperty('validKey');
    expect(result).not.toHaveProperty('__proto__');
    expect(result).not.toHaveProperty('1invalid');
  });

  test('skips non-string non-array values', () => {
    const result = buildSafeQueryParams({
      name: 'alice',
      nested: { a: 1 } as unknown as string,
      count: 42 as unknown as string,
    });
    expect(result).toHaveProperty('name');
    expect(result).not.toHaveProperty('nested');
    expect(result).not.toHaveProperty('count');
  });

  test('returns object with null prototype', () => {
    const result = buildSafeQueryParams({ a: '1' });
    expect(Object.getPrototypeOf(result)).toBe(null);
  });

  test('handles empty query object', () => {
    const result = buildSafeQueryParams({});
    expect(Object.keys(result)).toHaveLength(0);
  });
});

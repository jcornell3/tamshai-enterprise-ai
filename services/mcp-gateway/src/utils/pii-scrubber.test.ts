/**
 * Unit tests for PII Scrubber Module
 *
 * Tests the PII detection and scrubbing functions for audit logging.
 */

import { scrubPII, scrubPIIFromObject, containsPII } from './pii-scrubber';

describe('scrubPII', () => {
  describe('SSN detection and scrubbing', () => {
    test('scrubs SSN with dashes', () => {
      const input = 'Employee SSN: 123-45-6789';
      const result = scrubPII(input);
      expect(result).toBe('Employee SSN: [SSN-REDACTED]');
      expect(result).not.toContain('123-45-6789');
    });

    test('scrubs SSN without dashes', () => {
      const input = 'SSN number is 123456789 for this employee';
      const result = scrubPII(input);
      expect(result).toContain('[SSN-REDACTED]');
      expect(result).not.toContain('123456789');
    });

    test('scrubs multiple SSNs in same string', () => {
      const input = 'Alice: 111-22-3333, Bob: 444-55-6666';
      const result = scrubPII(input);
      expect(result).not.toContain('111-22-3333');
      expect(result).not.toContain('444-55-6666');
      expect(result.match(/\[SSN-REDACTED\]/g)?.length).toBe(2);
    });
  });

  describe('Credit card detection and scrubbing', () => {
    test('scrubs Visa card numbers', () => {
      const input = 'Card: 4111111111111111';
      const result = scrubPII(input);
      expect(result).toContain('[CARD-REDACTED]');
      expect(result).not.toContain('4111111111111111');
    });

    test('scrubs MasterCard numbers', () => {
      const input = 'Payment with 5555555555554444';
      const result = scrubPII(input);
      expect(result).toContain('[CARD-REDACTED]');
    });

    test('scrubs American Express numbers', () => {
      const input = 'Amex: 378282246310005';
      const result = scrubPII(input);
      expect(result).toContain('[CARD-REDACTED]');
    });

    test('scrubs Discover card numbers', () => {
      const input = 'Discover: 6011111111111117';
      const result = scrubPII(input);
      expect(result).toContain('[CARD-REDACTED]');
    });
  });

  describe('Bank account detection', () => {
    test('scrubs account numbers in context', () => {
      const input = 'Transfer to account 12345678901234';
      const result = scrubPII(input);
      expect(result).toContain('[ACCOUNT-REDACTED]');
    });

    test('scrubs routing numbers in context', () => {
      const input = 'Routing: 123456789';
      const result = scrubPII(input);
      expect(result).toContain('[ACCOUNT-REDACTED]');
    });
  });

  describe('Password detection', () => {
    test('scrubs password in various formats', () => {
      const inputs = [
        'password: secret123',
        'passwd=mysecret',
        'pwd: hunter2',
        'password="complexP@ss!"',
      ];

      inputs.forEach((input) => {
        const result = scrubPII(input);
        expect(result).toContain('[PASSWORD-REDACTED]');
      });
    });
  });

  describe('Optional scrubbing', () => {
    test('does not scrub emails by default', () => {
      const input = 'Contact: alice@example.com';
      const result = scrubPII(input);
      expect(result).toContain('alice@example.com');
    });

    test('scrubs emails when option enabled', () => {
      const input = 'Contact: alice@example.com';
      const result = scrubPII(input, { scrubEmails: true });
      expect(result).toContain('[EMAIL-REDACTED]');
      expect(result).not.toContain('alice@example.com');
    });

    test('scrubs phone numbers by default', () => {
      const input = 'Call me at 555-123-4567';
      const result = scrubPII(input);
      expect(result).toContain('[PHONE-REDACTED]');
    });

    test('scrubs various phone formats', () => {
      const phones = [
        '555-123-4567',
        '(555) 123-4567',
        '+1-555-123-4567',
        '5551234567',
      ];

      phones.forEach((phone) => {
        const result = scrubPII(`Phone: ${phone}`);
        expect(result).toContain('[PHONE-REDACTED]');
      });
    });
  });

  describe('Edge cases', () => {
    test('handles null/undefined input gracefully', () => {
      expect(scrubPII(null as any)).toBe(null);
      expect(scrubPII(undefined as any)).toBe(undefined);
    });

    test('handles empty string', () => {
      expect(scrubPII('')).toBe('');
    });

    test('handles non-string input', () => {
      expect(scrubPII(12345 as any)).toBe(12345);
    });

    test('preserves non-PII content', () => {
      const input = 'Regular business text with no sensitive data.';
      const result = scrubPII(input);
      expect(result).toBe(input);
    });

    test('handles mixed PII and non-PII content', () => {
      const input = 'Employee John (SSN: 123-45-6789) works in Engineering dept.';
      const result = scrubPII(input);
      expect(result).toBe('Employee John (SSN: [SSN-REDACTED]) works in Engineering dept.');
    });
  });
});

describe('scrubPIIFromObject', () => {
  test('scrubs PII from all string fields', () => {
    const obj = {
      name: 'John Doe',
      ssn: '123-45-6789',
      notes: 'Card: 4111111111111111',
      department: 'Engineering',
    };

    const result = scrubPIIFromObject(obj);

    expect(result.name).toBe('John Doe');
    expect(result.ssn).toContain('[SSN-REDACTED]');
    expect(result.notes).toContain('[CARD-REDACTED]');
    expect(result.department).toBe('Engineering');
  });

  test('handles nested objects', () => {
    const obj = {
      user: {
        profile: {
          ssn: '123-45-6789',
          name: 'Jane',
        },
      },
    };

    const result = scrubPIIFromObject(obj);

    expect((result.user as any).profile.ssn).toContain('[SSN-REDACTED]');
    expect((result.user as any).profile.name).toBe('Jane');
  });

  test('handles arrays of strings', () => {
    const obj = {
      ssns: ['111-22-3333', '444-55-6666'],
      names: ['Alice', 'Bob'],
    };

    const result = scrubPIIFromObject(obj);

    expect(result.ssns[0]).toContain('[SSN-REDACTED]');
    expect(result.ssns[1]).toContain('[SSN-REDACTED]');
    expect(result.names[0]).toBe('Alice');
    expect(result.names[1]).toBe('Bob');
  });

  test('handles arrays of objects', () => {
    const obj = {
      employees: [
        { name: 'Alice', ssn: '111-22-3333' },
        { name: 'Bob', ssn: '444-55-6666' },
      ],
    };

    const result = scrubPIIFromObject(obj);

    expect((result.employees as any)[0].ssn).toContain('[SSN-REDACTED]');
    expect((result.employees as any)[1].ssn).toContain('[SSN-REDACTED]');
  });

  test('preserves non-object values', () => {
    const obj = {
      count: 42,
      active: true,
      data: null,
    };

    const result = scrubPIIFromObject(obj);

    expect(result.count).toBe(42);
    expect(result.active).toBe(true);
    expect(result.data).toBe(null);
  });

  test('handles null/undefined input', () => {
    expect(scrubPIIFromObject(null as any)).toBe(null);
    expect(scrubPIIFromObject(undefined as any)).toBe(undefined);
  });
});

describe('containsPII', () => {
  test('returns true when SSN is present', () => {
    expect(containsPII('SSN: 123-45-6789')).toBe(true);
    expect(containsPII('Number 123456789 found')).toBe(true);
  });

  test('returns true when credit card is present', () => {
    expect(containsPII('Card: 4111111111111111')).toBe(true);
    expect(containsPII('Payment 5555555555554444')).toBe(true);
  });

  test('returns false for clean text', () => {
    expect(containsPII('Regular business text')).toBe(false);
    expect(containsPII('Employee count: 25')).toBe(false);
    expect(containsPII('Department: Engineering')).toBe(false);
  });

  test('handles null/undefined/empty input', () => {
    expect(containsPII(null as any)).toBe(false);
    expect(containsPII(undefined as any)).toBe(false);
    expect(containsPII('')).toBe(false);
  });

  test('detects PII in mixed content', () => {
    const text = 'Employee John Doe, ID 12345, SSN 123-45-6789, Dept: Eng';
    expect(containsPII(text)).toBe(true);
  });
});

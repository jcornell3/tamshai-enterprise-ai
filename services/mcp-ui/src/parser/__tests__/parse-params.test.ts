/**
 * parseParams Function Tests
 *
 * Tests specifically for the parseParams internal function
 * which is exercised through parseDirective.
 * Focuses on edge cases for parameter parsing.
 */

import { parseDirective } from '../directive-parser';

describe('parseParams Edge Cases', () => {
  describe('Empty and Whitespace Handling', () => {
    it('handles empty param string', () => {
      const result = parseDirective('display:hr:list:');
      expect(result?.params).toEqual({});
    });

    it('handles whitespace-only values', () => {
      const result = parseDirective('display:hr:list:key=   ');
      expect(result?.params.key).toBe('');
    });

    it('handles whitespace around key', () => {
      const result = parseDirective('display:hr:list:  key  =value');
      expect(result?.params.key).toBe('value');
    });

    it('handles multiple trailing commas', () => {
      const result = parseDirective('display:hr:list:key=value,,,');
      expect(result?.params).toEqual({ key: 'value' });
    });
  });

  describe('Empty Key Edge Cases', () => {
    it('ignores params with empty key after trim', () => {
      const result = parseDirective('display:hr:list:=value');
      expect(result?.params).toEqual({});
    });

    it('ignores whitespace-only keys', () => {
      const result = parseDirective('display:hr:list:   =value');
      expect(result?.params).toEqual({});
    });
  });

  describe('Special Characters in Values', () => {
    it('handles colons in values', () => {
      const result = parseDirective('display:hr:doc:time=10:30:00');
      expect(result?.params.time).toBe('10:30:00');
    });

    it('handles slashes in values', () => {
      const result = parseDirective('display:hr:doc:path=/usr/local/bin');
      expect(result?.params.path).toBe('/usr/local/bin');
    });

    it('handles plus signs in values', () => {
      const result = parseDirective('display:hr:search:phone=+1-555-1234');
      expect(result?.params.phone).toBe('+1-555-1234');
    });

    it('handles ampersands in values', () => {
      const result = parseDirective('display:hr:search:company=A&B');
      expect(result?.params.company).toBe('A&B');
    });

    it('handles hash symbols in values', () => {
      const result = parseDirective('display:hr:issue:id=#123');
      expect(result?.params.id).toBe('#123');
    });

    it('handles parentheses in values', () => {
      const result = parseDirective('display:hr:search:query=(test)');
      expect(result?.params.query).toBe('(test)');
    });

    it('handles brackets in values', () => {
      const result = parseDirective('display:hr:search:filter=[active]');
      expect(result?.params.filter).toBe('[active]');
    });
  });

  describe('Multiple Equals Signs', () => {
    it('handles key=value=extra', () => {
      const result = parseDirective('display:hr:search:equation=x=y');
      expect(result?.params.equation).toBe('x=y');
    });

    it('handles multiple equals in value', () => {
      const result = parseDirective('display:hr:search:filter=a=b=c=d');
      expect(result?.params.filter).toBe('a=b=c=d');
    });
  });

  describe('Multiple Parameters', () => {
    it('handles many parameters', () => {
      const result = parseDirective(
        'display:hr:search:a=1,b=2,c=3,d=4,e=5'
      );
      expect(result?.params).toEqual({
        a: '1',
        b: '2',
        c: '3',
        d: '4',
        e: '5',
      });
    });

    it('handles duplicate keys (last wins)', () => {
      const result = parseDirective('display:hr:search:key=first,key=second');
      expect(result?.params.key).toBe('second');
    });
  });

  describe('Invalid Parameter Entries', () => {
    it('skips entries without equals completely', () => {
      const result = parseDirective('display:hr:list:valid=true,invalid,also=ok');
      expect(result?.params).toEqual({ valid: 'true', also: 'ok' });
    });

    it('skips all-whitespace entries', () => {
      const result = parseDirective('display:hr:list:a=1,   ,b=2');
      expect(result?.params).toEqual({ a: '1', b: '2' });
    });
  });

  describe('Numeric and Boolean Values', () => {
    it('preserves numeric values as strings', () => {
      const result = parseDirective('display:finance:report:amount=1234.56');
      expect(result?.params.amount).toBe('1234.56');
      expect(typeof result?.params.amount).toBe('string');
    });

    it('preserves boolean-like values as strings', () => {
      const result = parseDirective('display:hr:filter:active=true');
      expect(result?.params.active).toBe('true');
      expect(typeof result?.params.active).toBe('string');
    });

    it('preserves negative numbers as strings', () => {
      const result = parseDirective('display:finance:report:balance=-500.00');
      expect(result?.params.balance).toBe('-500.00');
    });
  });

  describe('Unicode and International Characters', () => {
    it('handles unicode characters in values', () => {
      const result = parseDirective('display:hr:search:name=日本語');
      expect(result?.params.name).toBe('日本語');
    });

    it('handles accented characters', () => {
      const result = parseDirective('display:hr:search:name=José García');
      expect(result?.params.name).toBe('José García');
    });

    it('handles emoji in values', () => {
      const result = parseDirective('display:hr:status:mood=😀');
      expect(result?.params.mood).toBe('😀');
    });
  });

  describe('Long Values', () => {
    it('handles very long values', () => {
      const longValue = 'a'.repeat(1000);
      const result = parseDirective(`display:hr:search:query=${longValue}`);
      expect(result?.params.query).toBe(longValue);
      expect(result?.params.query.length).toBe(1000);
    });

    it('handles long key names', () => {
      const longKey = 'k'.repeat(100);
      const result = parseDirective(`display:hr:search:${longKey}=value`);
      expect(result?.params[longKey]).toBe('value');
    });
  });
});

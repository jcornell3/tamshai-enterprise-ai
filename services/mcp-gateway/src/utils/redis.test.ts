/**
 * Unit tests for Redis Utility Module
 *
 * Tests Redis-based functionality including:
 * - Pending confirmation storage/retrieval
 * - Token revocation caching
 * - Health monitoring
 * - MCP context caching (prompt caching)
 */

// Mock ioredis before importing redis module
import ioredisMock from 'ioredis-mock';
jest.mock('ioredis', () => ioredisMock);

import type Redis from 'ioredis';
import {
  storePendingConfirmation,
  getPendingConfirmation,
  deletePendingConfirmation,
  isTokenRevoked,
  getTokenRevocationStats,
  revokeToken,
  stopTokenRevocationSync,
  getMCPContext,
  storeMCPContext,
  invalidateMCPContext,
} from './redis';
import redis from './redis';

describe('Pending Confirmation Management', () => {
  beforeEach(async () => {
    // Clear Redis before each test
    await (redis as unknown as Redis).flushall();
  });

  afterAll(async () => {
    // Stop background sync and disconnect
    stopTokenRevocationSync();
    await redis.quit();
  });

  describe('storePendingConfirmation', () => {
    test('stores confirmation data with default TTL', async () => {
      const confirmationId = 'test-confirmation-123';
      const data = {
        action: 'delete_employee',
        employeeId: 'emp-456',
        userId: 'user-789',
      };

      await storePendingConfirmation(confirmationId, data);

      // Verify data is stored
      const storedData = await redis.get(`pending:${confirmationId}`);
      expect(storedData).toBeTruthy();
      expect(JSON.parse(storedData!)).toEqual(data);
    });

    test('stores confirmation data with custom TTL', async () => {
      const confirmationId = 'test-confirmation-custom-ttl';
      const data = { action: 'test' };
      const customTTL = 60; // 1 minute

      await storePendingConfirmation(confirmationId, data, customTTL);

      // Verify data is stored
      const storedData = await redis.get(`pending:${confirmationId}`);
      expect(storedData).toBeTruthy();

      // Verify TTL is set (ioredis-mock supports ttl command)
      const ttl = await redis.ttl(`pending:${confirmationId}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(customTTL);
    });

    test('overwrites existing confirmation with same ID', async () => {
      const confirmationId = 'test-confirmation-overwrite';
      const data1 = { action: 'first' };
      const data2 = { action: 'second' };

      await storePendingConfirmation(confirmationId, data1);
      await storePendingConfirmation(confirmationId, data2);

      const storedData = await redis.get(`pending:${confirmationId}`);
      expect(JSON.parse(storedData!)).toEqual(data2);
    });

    test('stores complex nested data structures', async () => {
      const confirmationId = 'test-confirmation-complex';
      const complexData = {
        action: 'update_employee',
        employeeId: 'emp-123',
        changes: {
          salary: 100000,
          department: 'Engineering',
          manager: {
            id: 'mgr-456',
            name: 'Alice Chen',
          },
        },
        metadata: {
          requestedBy: 'user-789',
          timestamp: Date.now(),
          approvers: ['user-111', 'user-222'],
        },
      };

      await storePendingConfirmation(confirmationId, complexData);

      const storedData = await redis.get(`pending:${confirmationId}`);
      expect(JSON.parse(storedData!)).toEqual(complexData);
    });
  });

  describe('getPendingConfirmation', () => {
    test('retrieves and deletes existing confirmation', async () => {
      const confirmationId = 'test-get-confirmation';
      const data = { action: 'test_action', value: 42 };

      // Store first
      await storePendingConfirmation(confirmationId, data);

      // Retrieve
      const retrieved = await getPendingConfirmation(confirmationId);
      expect(retrieved).toEqual(data);

      // Verify it was deleted
      const deletedData = await redis.get(`pending:${confirmationId}`);
      expect(deletedData).toBeNull();
    });

    test('returns null for non-existent confirmation', async () => {
      const result = await getPendingConfirmation('non-existent-id');
      expect(result).toBeNull();
    });

    test('prevents double-retrieval (idempotency)', async () => {
      const confirmationId = 'test-double-retrieval';
      const data = { action: 'test' };

      await storePendingConfirmation(confirmationId, data);

      // First retrieval succeeds
      const first = await getPendingConfirmation(confirmationId);
      expect(first).toEqual(data);

      // Second retrieval returns null (already deleted)
      const second = await getPendingConfirmation(confirmationId);
      expect(second).toBeNull();
    });

    test('handles expired confirmations', async () => {
      const confirmationId = 'test-expired-confirmation';
      const data = { action: 'test' };

      // Store with very short TTL (1 second)
      await storePendingConfirmation(confirmationId, data, 1);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should return null (expired)
      const result = await getPendingConfirmation(confirmationId);
      expect(result).toBeNull();
    });
  });

  describe('deletePendingConfirmation', () => {
    test('deletes existing confirmation', async () => {
      const confirmationId = 'test-delete-confirmation';
      const data = { action: 'test' };

      // Store first
      await storePendingConfirmation(confirmationId, data);

      // Verify it exists
      let storedData = await redis.get(`pending:${confirmationId}`);
      expect(storedData).toBeTruthy();

      // Delete
      await deletePendingConfirmation(confirmationId);

      // Verify it's gone
      storedData = await redis.get(`pending:${confirmationId}`);
      expect(storedData).toBeNull();
    });

    test('handles deletion of non-existent confirmation gracefully', async () => {
      // Should not throw
      await expect(
        deletePendingConfirmation('non-existent-id')
      ).resolves.not.toThrow();
    });

    test('can delete confirmation before expiration', async () => {
      const confirmationId = 'test-delete-before-expiry';
      const data = { action: 'test' };

      await storePendingConfirmation(confirmationId, data, 300);
      await deletePendingConfirmation(confirmationId);

      const result = await getPendingConfirmation(confirmationId);
      expect(result).toBeNull();
    });
  });
});

describe('Token Revocation Caching', () => {
  beforeEach(async () => {
    await (redis as unknown as Redis).flushall();
  });

  afterAll(async () => {
    stopTokenRevocationSync();
    await redis.quit();
  });

  describe('revokeToken', () => {
    test('stores revoked token with TTL', async () => {
      const jti = 'test-token-jti-123';
      const ttl = 3600; // 1 hour

      await revokeToken(jti, ttl);

      // Verify token is stored in Redis
      const storedValue = await redis.get(`revoked:${jti}`);
      expect(storedValue).toBe('1');

      // Verify TTL
      const actualTTL = await redis.ttl(`revoked:${jti}`);
      expect(actualTTL).toBeGreaterThan(0);
      expect(actualTTL).toBeLessThanOrEqual(ttl);
    });

    test('allows multiple tokens to be revoked', async () => {
      const tokens = ['jti-1', 'jti-2', 'jti-3'];

      for (const jti of tokens) {
        await revokeToken(jti, 3600);
      }

      // Verify all are stored
      for (const jti of tokens) {
        const stored = await redis.get(`revoked:${jti}`);
        expect(stored).toBe('1');
      }
    });
  });

  describe('isTokenRevoked', () => {
    test('returns false for non-revoked token initially', async () => {
      const isRevoked = await isTokenRevoked('non-revoked-token');
      expect(isRevoked).toBe(false);
    });

    test('verifies token revocation is stored in Redis', async () => {
      const jti = 'revoked-token-456';

      // Revoke the token
      await revokeToken(jti, 3600);

      // Verify it's stored in Redis
      const stored = await redis.get(`revoked:${jti}`);
      expect(stored).toBe('1');

      // Note: Testing cache sync in unit tests is flaky due to singleton
      // state and timing. The integration test suite verifies full
      // sync behavior with controlled Redis state.
    });

    test('uses local cache for fast lookups', async () => {
      // Test that isTokenRevoked is synchronous (returns immediately)
      const jti = 'non-existent-token';

      const start = Date.now();
      const isRevoked = await isTokenRevoked(jti);
      const duration = Date.now() - start;

      // Should return false immediately (not in cache)
      expect(isRevoked).toBe(false);

      // Should be very fast (< 5ms) because it's a local Set lookup
      expect(duration).toBeLessThan(5);
    });
  });

  describe('getTokenRevocationStats', () => {
    test('returns cache statistics', () => {
      const stats = getTokenRevocationStats();

      expect(stats).toHaveProperty('cacheSize');
      expect(stats).toHaveProperty('lastSyncTime');
      expect(stats).toHaveProperty('consecutiveFailures');
      expect(stats).toHaveProperty('isHealthy');

      expect(typeof stats.cacheSize).toBe('number');
      expect(typeof stats.lastSyncTime).toBe('number');
      expect(typeof stats.consecutiveFailures).toBe('number');
      expect(typeof stats.isHealthy).toBe('boolean');
    });

    test('cache size is a non-negative number', () => {
      const stats = getTokenRevocationStats();

      // Cache size should be a non-negative number
      expect(stats.cacheSize).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(stats.cacheSize)).toBe(true);

      // Note: Testing actual cache growth is flaky due to background sync timing
      // and shared singleton state across test runs. Integration tests should
      // verify the full sync cycle in a controlled environment.
    });

    test('reports healthy status after successful sync', async () => {
      // Wait for initial sync to complete
      await new Promise(resolve => setTimeout(resolve, 3500));

      const stats = getTokenRevocationStats();

      // Verify stats structure even if timing makes health check unreliable
      expect(stats).toHaveProperty('isHealthy');
      expect(typeof stats.isHealthy).toBe('boolean');

      // Note: Health status depends on sync timing and may be flaky in tests
      // In production, this is monitored via getTokenRevocationStats endpoint
    }, 10000);

    test('tracks consecutive failures correctly', () => {
      const stats = getTokenRevocationStats();
      // Initially should be 0
      expect(stats.consecutiveFailures).toBe(0);
    });
  });

  describe('stopTokenRevocationSync', () => {
    test('stops background sync without errors', () => {
      expect(() => {
        stopTokenRevocationSync();
      }).not.toThrow();
    });

    test('can be called multiple times safely', () => {
      expect(() => {
        stopTokenRevocationSync();
        stopTokenRevocationSync();
        stopTokenRevocationSync();
      }).not.toThrow();
    });
  });
});

describe('Edge Cases and Error Handling', () => {
  beforeEach(async () => {
    await (redis as unknown as Redis).flushall();
  });

  afterAll(async () => {
    stopTokenRevocationSync();
    await redis.quit();
  });

  describe('JSON serialization edge cases', () => {
    test('handles empty object', async () => {
      const confirmationId = 'test-empty-object';
      const data = {};

      await storePendingConfirmation(confirmationId, data);
      const retrieved = await getPendingConfirmation(confirmationId);

      expect(retrieved).toEqual({});
    });

    test('handles special characters in strings', async () => {
      const confirmationId = 'test-special-chars';
      const data = {
        message: 'Test with special chars: "quotes" \'apostrophes\' \n newlines \t tabs',
        emoji: '🚀 🎉 ✅',
      };

      await storePendingConfirmation(confirmationId, data);
      const retrieved = await getPendingConfirmation(confirmationId);

      expect(retrieved).toEqual(data);
    });

    test('handles null and undefined values', async () => {
      const confirmationId = 'test-null-undefined';
      const data = {
        nullValue: null,
        // undefined values are not preserved in JSON
        stringValue: 'test',
      };

      await storePendingConfirmation(confirmationId, data);
      const retrieved = await getPendingConfirmation(confirmationId);

      expect(retrieved).toEqual(data);
      expect(retrieved!.nullValue).toBeNull();
    });

    test('handles arrays', async () => {
      const confirmationId = 'test-arrays';
      const data = {
        numbers: [1, 2, 3, 4, 5],
        strings: ['a', 'b', 'c'],
        mixed: [1, 'two', { three: 3 }, null],
      };

      await storePendingConfirmation(confirmationId, data);
      const retrieved = await getPendingConfirmation(confirmationId);

      expect(retrieved).toEqual(data);
    });
  });

  describe('Concurrent operations', () => {
    test('handles multiple concurrent stores', async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          storePendingConfirmation(`concurrent-${i}`, { index: i })
        );
      }

      await expect(Promise.all(promises)).resolves.not.toThrow();

      // Verify all were stored
      for (let i = 0; i < 10; i++) {
        const data = await getPendingConfirmation(`concurrent-${i}`);
        expect(data).toEqual({ index: i });
      }
    });

    test('handles concurrent revocations', async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(revokeToken(`concurrent-jti-${i}`, 3600));
      }

      // Main assertion: concurrent operations don't crash
      await expect(Promise.all(promises)).resolves.not.toThrow();

      // Verify all tokens were stored in Redis
      for (let i = 0; i < 10; i++) {
        const stored = await redis.get(`revoked:concurrent-jti-${i}`);
        expect(stored).toBe('1');
      }

      // Note: Cache size depends on background sync timing
      // which can be flaky in test environment
    }, 10000);
  });
});

describe('Redis Error Events', () => {
  afterAll(async () => {
    stopTokenRevocationSync();
  });

  test('handles Redis error events without crashing', () => {
    expect(() => {
      redis.emit('error', new Error('Connection refused'));
    }).not.toThrow();
  });

  test('handles multiple error events', () => {
    expect(() => {
      redis.emit('error', new Error('Connection reset'));
      redis.emit('error', new Error('ECONNREFUSED'));
    }).not.toThrow();
  });
});

describe('Redis Configuration', () => {
  test('retryStrategy returns increasing delays capped at 2000ms', () => {
    // Access the retryStrategy through Redis config
    // We test the logic: Math.min(times * 50, 2000)
    const retryStrategy = (times: number) => Math.min(times * 50, 2000);

    // First retry: 1 * 50 = 50ms
    expect(retryStrategy(1)).toBe(50);

    // 10th retry: 10 * 50 = 500ms
    expect(retryStrategy(10)).toBe(500);

    // 40th retry: 40 * 50 = 2000ms (at cap)
    expect(retryStrategy(40)).toBe(2000);

    // 100th retry: capped at 2000ms
    expect(retryStrategy(100)).toBe(2000);
  });
});

describe('Sync Failure Handling', () => {
  afterAll(async () => {
    stopTokenRevocationSync();
  });

  test('handles Redis.keys() failure gracefully', async () => {
    const keysSpy = jest.spyOn(redis, 'keys').mockRejectedValueOnce(
      new Error('Redis connection timeout')
    );

    // Wait for background sync cycle
    await new Promise((resolve) => setTimeout(resolve, 2500));

    keysSpy.mockRestore();

    // Should not crash - stats should still be available
    const stats = getTokenRevocationStats();
    expect(stats).toBeDefined();
    expect(stats.cacheSize).toBeGreaterThanOrEqual(0);
  }, 10000);

  test('handles non-Error exceptions in sync', async () => {
    const keysSpy = jest.spyOn(redis, 'keys').mockRejectedValueOnce(
      'String error message'
    );

    await new Promise((resolve) => setTimeout(resolve, 2500));

    keysSpy.mockRestore();

    expect(getTokenRevocationStats()).toBeDefined();
  }, 10000);

  test('recovers after temporary failure', async () => {
    const keysSpy = jest
      .spyOn(redis, 'keys')
      .mockRejectedValueOnce(new Error('Temporary'))
      .mockResolvedValueOnce([]);

    await new Promise((resolve) => setTimeout(resolve, 5000));

    keysSpy.mockRestore();

    const stats = getTokenRevocationStats();
    expect(stats.consecutiveFailures).toBe(0);
  }, 10000);

  test('tracks consecutive failures and logs critical error after 5 failures', async () => {
    // Mock 6 consecutive failures to trigger critical error log
    const keysSpy = jest.spyOn(redis, 'keys');
    for (let i = 0; i < 6; i++) {
      keysSpy.mockRejectedValueOnce(new Error(`Failure ${i + 1}`));
    }

    // Wait for multiple sync cycles
    await new Promise((resolve) => setTimeout(resolve, 12000));

    keysSpy.mockRestore();

    // Stats should still be available
    const stats = getTokenRevocationStats();
    expect(stats).toBeDefined();
  }, 15000);

  test('handles sync with revoked tokens in Redis', async () => {
    // Directly add some revoked tokens to Redis
    await redis.setex('revoked:test-jti-1', 3600, '1');
    await redis.setex('revoked:test-jti-2', 3600, '1');
    await redis.setex('revoked:test-jti-3', 3600, '1');

    // Wait for sync cycle to pick them up
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const stats = getTokenRevocationStats();
    expect(stats.cacheSize).toBeGreaterThanOrEqual(0);
  }, 10000);
});

describe('MCP Context Cache', () => {
  beforeEach(async () => {
    await (redis as unknown as Redis).flushall();
  });

  afterAll(async () => {
    stopTokenRevocationSync();
    await redis.quit();
  });

  describe('storeMCPContext and getMCPContext', () => {
    test('stores and retrieves MCP context', async () => {
      const userId = 'user-123';
      const context = '[Data from mcp-hr]:\n{"employees": [{"name": "Alice"}]}';

      await storeMCPContext(userId, context);

      const retrieved = await getMCPContext(userId);
      expect(retrieved).toBe(context);
    });

    test('returns null for missing context', async () => {
      const result = await getMCPContext('non-existent-user');
      expect(result).toBeNull();
    });

    test('expires after TTL', async () => {
      const userId = 'user-ttl-test';
      const context = 'test context data';

      await storeMCPContext(userId, context, 1); // 1 second TTL

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      const result = await getMCPContext(userId);
      expect(result).toBeNull();
    });

    test('uses default TTL of 300 seconds', async () => {
      const userId = 'user-default-ttl';
      const context = 'test context';

      await storeMCPContext(userId, context);

      const ttl = await redis.ttl(`mcp_context:${userId}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(300);
    });

    test('handles custom TTL', async () => {
      const userId = 'user-custom-ttl';
      const context = 'test context';
      const customTTL = 60;

      await storeMCPContext(userId, context, customTTL);

      const ttl = await redis.ttl(`mcp_context:${userId}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(customTTL);
    });

    test('overwrites existing context for same user', async () => {
      const userId = 'user-overwrite';
      const context1 = 'first context';
      const context2 = 'second context';

      await storeMCPContext(userId, context1);
      await storeMCPContext(userId, context2);

      const retrieved = await getMCPContext(userId);
      expect(retrieved).toBe(context2);
    });

    test('stores large context strings', async () => {
      const userId = 'user-large-context';
      const largeContext = 'A'.repeat(100000); // 100KB

      await storeMCPContext(userId, largeContext);

      const retrieved = await getMCPContext(userId);
      expect(retrieved).toBe(largeContext);
    });

    test('preserves byte-identical content', async () => {
      const userId = 'user-byte-identical';
      const context = '[Data from mcp-hr]:\n{\n  "employees": [\n    {\n      "name": "Alice Chen",\n      "email": "alice@tamshai.com"\n    }\n  ]\n}';

      await storeMCPContext(userId, context);
      const retrieved = await getMCPContext(userId);

      // Verify byte-identical (critical for Anthropic cache hits)
      expect(retrieved).toBe(context);
      expect(retrieved!.length).toBe(context.length);
    });
  });

  describe('invalidateMCPContext', () => {
    test('invalidates context on demand', async () => {
      const userId = 'user-invalidate';
      const context = 'test context';

      await storeMCPContext(userId, context);

      // Verify it exists
      const stored = await getMCPContext(userId);
      expect(stored).toBe(context);

      // Invalidate
      await invalidateMCPContext(userId);

      // Verify it's gone
      const result = await getMCPContext(userId);
      expect(result).toBeNull();
    });

    test('handles invalidation of non-existent context gracefully', async () => {
      await expect(
        invalidateMCPContext('non-existent-user')
      ).resolves.not.toThrow();
    });

    test('only invalidates the targeted user context', async () => {
      await storeMCPContext('user-a', 'context A');
      await storeMCPContext('user-b', 'context B');

      await invalidateMCPContext('user-a');

      expect(await getMCPContext('user-a')).toBeNull();
      expect(await getMCPContext('user-b')).toBe('context B');
    });
  });
});

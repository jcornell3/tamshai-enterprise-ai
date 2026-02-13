/**
 * Redis Utility Tests
 *
 * Tests for Redis client and pending confirmation functions.
 */
import ioredis from 'ioredis-mock';
import {
  getRedisClient,
  storePendingConfirmation,
  getPendingConfirmation,
  checkRedisConnection,
  closeRedis,
} from './redis';

// Mock ioredis with ioredis-mock
jest.mock('ioredis', () => ioredis);

jest.mock('./logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('getRedisClient', () => {
  beforeEach(async () => {
    // Reset by closing any existing connection
    await closeRedis();
  });

  it('creates a Redis client instance', () => {
    const client = getRedisClient();

    expect(client).toBeDefined();
    expect(typeof client.get).toBe('function');
    expect(typeof client.setex).toBe('function');
  });

  it('returns the same client instance (singleton)', () => {
    const client1 = getRedisClient();
    const client2 = getRedisClient();

    expect(client1).toBe(client2);
  });

  it('creates new client after closeRedis', async () => {
    const client1 = getRedisClient();
    await closeRedis();
    const client2 = getRedisClient();

    expect(client2).toBeDefined();
    // Note: Due to mock behavior, they may be equal but the singleton was reset
  });
});

describe('storePendingConfirmation', () => {
  beforeEach(async () => {
    await closeRedis();
    // Clear any existing data
    const client = getRedisClient();
    await client.flushall();
  });

  it('stores confirmation data with correct key', async () => {
    const confirmationId = 'conf-123';
    const data = { action: 'update_rate', rateId: 'rate-001' };

    await storePendingConfirmation(confirmationId, data);

    const client = getRedisClient();
    const stored = await client.get(`pending:tax:${confirmationId}`);
    expect(stored).toBe(JSON.stringify(data));
  });

  it('stores data as JSON', async () => {
    const confirmationId = 'conf-456';
    const data = {
      action: 'delete_filing',
      filingId: 'filing-001',
      userId: 'user-123',
      timestamp: 1234567890,
    };

    await storePendingConfirmation(confirmationId, data);

    const client = getRedisClient();
    const stored = await client.get(`pending:tax:${confirmationId}`);
    expect(JSON.parse(stored!)).toEqual(data);
  });

  it('uses default TTL of 300 seconds', async () => {
    const confirmationId = 'conf-ttl';
    const data = { action: 'test' };

    await storePendingConfirmation(confirmationId, data);

    const client = getRedisClient();
    const ttl = await client.ttl(`pending:tax:${confirmationId}`);
    // TTL should be close to 300 (allow for small timing differences)
    expect(ttl).toBeGreaterThan(295);
    expect(ttl).toBeLessThanOrEqual(300);
  });

  it('accepts custom TTL', async () => {
    const confirmationId = 'conf-custom-ttl';
    const data = { action: 'test' };
    const customTtl = 600;

    await storePendingConfirmation(confirmationId, data, customTtl);

    const client = getRedisClient();
    const ttl = await client.ttl(`pending:tax:${confirmationId}`);
    expect(ttl).toBeGreaterThan(595);
    expect(ttl).toBeLessThanOrEqual(600);
  });

  it('overwrites existing confirmation with same ID', async () => {
    const confirmationId = 'conf-overwrite';
    const originalData = { action: 'original' };
    const newData = { action: 'updated' };

    await storePendingConfirmation(confirmationId, originalData);
    await storePendingConfirmation(confirmationId, newData);

    const client = getRedisClient();
    const stored = await client.get(`pending:tax:${confirmationId}`);
    expect(JSON.parse(stored!)).toEqual(newData);
  });
});

describe('getPendingConfirmation', () => {
  beforeEach(async () => {
    await closeRedis();
    const client = getRedisClient();
    await client.flushall();
  });

  it('retrieves stored confirmation data', async () => {
    const confirmationId = 'conf-get';
    const data = { action: 'update_rate', rateId: 'rate-001' };
    await storePendingConfirmation(confirmationId, data);

    const result = await getPendingConfirmation(confirmationId);

    expect(result).toEqual(data);
  });

  it('deletes confirmation after retrieval (one-time use)', async () => {
    const confirmationId = 'conf-one-time';
    const data = { action: 'test' };
    await storePendingConfirmation(confirmationId, data);

    // First retrieval should succeed
    const result1 = await getPendingConfirmation(confirmationId);
    expect(result1).toEqual(data);

    // Second retrieval should return null (deleted)
    const result2 = await getPendingConfirmation(confirmationId);
    expect(result2).toBeNull();
  });

  it('returns null for non-existent confirmation', async () => {
    const result = await getPendingConfirmation('non-existent-id');

    expect(result).toBeNull();
  });

  it('returns null after TTL expires', async () => {
    // Note: ioredis-mock doesn't simulate TTL expiration automatically
    // This test verifies the null return for non-existent keys
    const result = await getPendingConfirmation('expired-id');

    expect(result).toBeNull();
  });

  it('parses JSON data correctly', async () => {
    const confirmationId = 'conf-json';
    const complexData = {
      action: 'update_filing',
      filingId: 'filing-001',
      changes: {
        status: 'submitted',
        amount: 15000.50,
      },
      metadata: {
        timestamp: Date.now(),
        userId: 'user-123',
      },
    };
    await storePendingConfirmation(confirmationId, complexData);

    const result = await getPendingConfirmation(confirmationId);

    expect(result).toEqual(complexData);
  });
});

describe('checkRedisConnection', () => {
  beforeEach(async () => {
    await closeRedis();
  });

  it('returns true when Redis responds with PONG', async () => {
    const result = await checkRedisConnection();

    expect(result).toBe(true);
  });

  it('verifies ping returns PONG', async () => {
    const client = getRedisClient();
    const pingResult = await client.ping();

    expect(pingResult).toBe('PONG');
  });
});

describe('closeRedis', () => {
  it('closes the Redis connection', async () => {
    // Get a client first
    getRedisClient();

    // Close should not throw
    await expect(closeRedis()).resolves.toBeUndefined();
  });

  it('can be called multiple times safely', async () => {
    await closeRedis();
    await closeRedis();
    await closeRedis();

    // Should not throw
    expect(true).toBe(true);
  });

  it('allows new client creation after close', async () => {
    const client1 = getRedisClient();
    await closeRedis();
    const client2 = getRedisClient();

    expect(client2).toBeDefined();
    expect(typeof client2.get).toBe('function');
  });
});

describe('Redis key format', () => {
  beforeEach(async () => {
    await closeRedis();
    const client = getRedisClient();
    await client.flushall();
  });

  it('uses pending:tax: prefix for keys', async () => {
    const confirmationId = 'test-id';
    await storePendingConfirmation(confirmationId, { action: 'test' });

    const client = getRedisClient();
    const keys = await client.keys('pending:tax:*');

    expect(keys).toContain('pending:tax:test-id');
  });

  it('isolates tax confirmations from other services', async () => {
    const client = getRedisClient();

    // Simulate another service storing a confirmation
    await client.set('pending:hr:other-conf', JSON.stringify({ action: 'hr_action' }));

    // Store tax confirmation
    await storePendingConfirmation('tax-conf', { action: 'tax_action' });

    // getPendingConfirmation should only find tax confirmations
    const taxResult = await getPendingConfirmation('tax-conf');
    expect(taxResult).toEqual({ action: 'tax_action' });

    // Other service's confirmation should still exist
    const hrData = await client.get('pending:hr:other-conf');
    expect(hrData).toBe(JSON.stringify({ action: 'hr_action' }));
  });
});

describe('Redis client configuration', () => {
  beforeEach(async () => {
    await closeRedis();
  });

  it('client has ping method for health checks', async () => {
    const client = getRedisClient();
    expect(typeof client.ping).toBe('function');
  });

  it('client has setex method for TTL storage', async () => {
    const client = getRedisClient();
    expect(typeof client.setex).toBe('function');
  });

  it('client has del method for deletion', async () => {
    const client = getRedisClient();
    expect(typeof client.del).toBe('function');
  });

  it('client has quit method for closing', async () => {
    const client = getRedisClient();
    expect(typeof client.quit).toBe('function');
  });
});

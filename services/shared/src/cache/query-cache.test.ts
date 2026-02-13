/**
 * Unit tests for Query Cache module
 */

// Mock ioredis before importing QueryCache
const mockRedis = {
  get: jest.fn(),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  ping: jest.fn().mockResolvedValue('PONG'),
  quit: jest.fn().mockResolvedValue('OK'),
  on: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

import {
  QueryCache,
  generateCacheKey,
  getQueryCache,
  createQueryCache,
} from './query-cache';

describe('QueryCache', () => {
  let cache: QueryCache;

  beforeEach(() => {
    jest.clearAllMocks();
    cache = new QueryCache({ keyPrefix: 'test:' });
  });

  afterEach(async () => {
    await cache.close();
  });

  describe('cachedQuery', () => {
    it('should return cached value on cache hit', async () => {
      const cachedData = { id: '123', name: 'Test' };
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedData));

      const queryFn = jest.fn();
      const result = await cache.cachedQuery('test-key', queryFn);

      expect(result).toEqual(cachedData);
      expect(queryFn).not.toHaveBeenCalled();
      expect(mockRedis.get).toHaveBeenCalledWith('test:test-key');
    });

    it('should execute query function on cache miss', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      const freshData = { id: '456', name: 'Fresh' };
      const queryFn = jest.fn().mockResolvedValue(freshData);

      const result = await cache.cachedQuery('test-key', queryFn);

      expect(result).toEqual(freshData);
      expect(queryFn).toHaveBeenCalled();
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'test:test-key',
        60,
        JSON.stringify(freshData)
      );
    });

    it('should use custom TTL when provided', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      const queryFn = jest.fn().mockResolvedValue({ data: 'test' });

      await cache.cachedQuery('test-key', queryFn, 120);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'test:test-key',
        120,
        expect.any(String)
      );
    });

    it('should track cache hits', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ data: 'cached' }));

      await cache.cachedQuery('key1', jest.fn());
      await cache.cachedQuery('key2', jest.fn());

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(1);
    });

    it('should track cache misses', async () => {
      mockRedis.get.mockResolvedValue(null);

      await cache.cachedQuery('key1', jest.fn().mockResolvedValue({}));
      await cache.cachedQuery('key2', jest.fn().mockResolvedValue({}));

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0);
    });

    it('should calculate correct hit rate', async () => {
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify({ data: 'hit' }))
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(JSON.stringify({ data: 'hit' }))
        .mockResolvedValueOnce(null);

      await cache.cachedQuery('key1', jest.fn());
      await cache.cachedQuery('key2', jest.fn().mockResolvedValue({}));
      await cache.cachedQuery('key3', jest.fn());
      await cache.cachedQuery('key4', jest.fn().mockResolvedValue({}));

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0.5);
    });
  });

  describe('invalidate', () => {
    it('should delete specific cache key', async () => {
      await cache.invalidate('test-key');

      expect(mockRedis.del).toHaveBeenCalledWith('test:test-key');
    });
  });

  describe('invalidatePattern', () => {
    it('should delete all keys matching pattern', async () => {
      mockRedis.keys.mockResolvedValueOnce([
        'test:employees:dept1',
        'test:employees:dept2',
      ]);

      const count = await cache.invalidatePattern('employees:*');

      expect(count).toBe(2);
      expect(mockRedis.keys).toHaveBeenCalledWith('test:employees:*');
      expect(mockRedis.del).toHaveBeenCalledWith(
        'test:employees:dept1',
        'test:employees:dept2'
      );
    });

    it('should return 0 when no keys match', async () => {
      mockRedis.keys.mockResolvedValueOnce([]);

      const count = await cache.invalidatePattern('nonexistent:*');

      expect(count).toBe(0);
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return initial stats with zero hit rate', () => {
      const stats = cache.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('resetStats', () => {
    it('should reset statistics to zero', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({}));
      await cache.cachedQuery('key', jest.fn());

      cache.resetStats();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('isConnected', () => {
    it('should return true when Redis responds to ping', async () => {
      mockRedis.ping.mockResolvedValueOnce('PONG');

      const connected = await cache.isConnected();

      expect(connected).toBe(true);
    });

    it('should return false when Redis ping fails', async () => {
      mockRedis.ping.mockRejectedValueOnce(new Error('Connection failed'));

      const connected = await cache.isConnected();

      expect(connected).toBe(false);
    });
  });

  describe('close', () => {
    it('should quit Redis connection', async () => {
      await cache.close();

      expect(mockRedis.quit).toHaveBeenCalled();
    });
  });
});

describe('generateCacheKey', () => {
  it('should generate key with sorted parameters', () => {
    const key = generateCacheKey('employees', {
      department: 'engineering',
      location: 'remote',
    });

    expect(key).toBe('employees:department:engineering:location:remote');
  });

  it('should exclude undefined parameters', () => {
    const key = generateCacheKey('employees', {
      department: 'engineering',
      location: undefined,
    });

    expect(key).toBe('employees:department:engineering');
  });

  it('should handle boolean parameters', () => {
    const key = generateCacheKey('invoices', {
      paid: true,
      overdue: false,
    });

    expect(key).toBe('invoices:overdue:false:paid:true');
  });

  it('should handle numeric parameters', () => {
    const key = generateCacheKey('tickets', {
      priority: 1,
      limit: 50,
    });

    expect(key).toBe('tickets:limit:50:priority:1');
  });

  it('should return default key when no parameters', () => {
    const key = generateCacheKey('employees', {});

    expect(key).toBe('employees:default');
  });
});

describe('getQueryCache', () => {
  it('should return singleton instance', () => {
    const cache1 = getQueryCache();
    const cache2 = getQueryCache();

    expect(cache1).toBe(cache2);
  });
});

describe('createQueryCache', () => {
  it('should create new instance with custom config', () => {
    const cache1 = createQueryCache({ keyPrefix: 'custom1:' });
    const cache2 = createQueryCache({ keyPrefix: 'custom2:' });

    expect(cache1).not.toBe(cache2);
  });
});

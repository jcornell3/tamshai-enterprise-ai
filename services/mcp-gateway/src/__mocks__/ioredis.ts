/**
 * Mock Redis client for testing
 */

class MockRedis {
  private store: Map<string, { value: string; ttl?: number }> = new Map();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_options?: unknown) {
    // Ignore options in mock
  }

  async connect(): Promise<void> {
    return Promise.resolve();
  }

  async quit(): Promise<void> {
    this.store.clear();
    return Promise.resolve();
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    return entry ? entry.value : null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, { value });
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    this.store.set(key, { value, ttl: seconds });
    return 'OK';
  }

  async exists(key: string): Promise<number> {
    return this.store.has(key) ? 1 : 0;
  }

  async del(key: string): Promise<number> {
    const existed = this.store.has(key);
    this.store.delete(key);
    return existed ? 1 : 0;
  }

  async keys(pattern: string): Promise<string[]> {
    // Escape special regex characters except *, then convert * to .*
    // This prevents regex injection from the pattern parameter
    const escapedPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // Escape special regex chars
      .replace(/\*/g, '.*');  // Convert Redis wildcard to regex
    const regex = new RegExp(`^${escapedPattern}$`);
    return Array.from(this.store.keys()).filter(key => regex.test(key));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  on(_event: string, _callback: (...args: unknown[]) => void): this {
    // Ignore event listeners in mock
    return this;
  }

  // For testing purposes: clear the mock store
  __clear(): void {
    this.store.clear();
  }

  // For testing purposes: get all keys
  __getStore(): Map<string, { value: string; ttl?: number }> {
    return this.store;
  }
}

export default MockRedis;
export { MockRedis as Redis };

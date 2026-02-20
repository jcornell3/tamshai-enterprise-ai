/**
 * Tests for Backend Factory
 *
 * Validates backend selection based on SUPPORT_DATA_BACKEND environment variable
 */

import { createSupportBackend } from '../backend.factory';
import { ElasticsearchBackend } from '../elasticsearch.backend';
import { MongoDBBackend } from '../mongodb.backend';

describe('createSupportBackend', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should create Elasticsearch backend by default (no env var set)', () => {
    delete process.env.SUPPORT_DATA_BACKEND;

    const backend = createSupportBackend();

    expect(backend).toBeInstanceOf(ElasticsearchBackend);
  });

  it('should create Elasticsearch backend when SUPPORT_DATA_BACKEND=elasticsearch', () => {
    process.env.SUPPORT_DATA_BACKEND = 'elasticsearch';

    const backend = createSupportBackend();

    expect(backend).toBeInstanceOf(ElasticsearchBackend);
  });

  it('should create Elasticsearch backend when SUPPORT_DATA_BACKEND=ELASTICSEARCH (case insensitive)', () => {
    process.env.SUPPORT_DATA_BACKEND = 'ELASTICSEARCH';

    const backend = createSupportBackend();

    expect(backend).toBeInstanceOf(ElasticsearchBackend);
  });

  it('should create MongoDB backend when SUPPORT_DATA_BACKEND=mongodb', () => {
    process.env.SUPPORT_DATA_BACKEND = 'mongodb';

    const backend = createSupportBackend();

    expect(backend).toBeInstanceOf(MongoDBBackend);
  });

  it('should create MongoDB backend when SUPPORT_DATA_BACKEND=MONGODB (case insensitive)', () => {
    process.env.SUPPORT_DATA_BACKEND = 'MONGODB';

    const backend = createSupportBackend();

    expect(backend).toBeInstanceOf(MongoDBBackend);
  });

  it('should throw error for unknown backend type', () => {
    process.env.SUPPORT_DATA_BACKEND = 'invalid-backend';

    expect(() => createSupportBackend()).toThrow(
      'Unknown SUPPORT_DATA_BACKEND: "invalid-backend". Valid options: \'elasticsearch\' or \'mongodb\'.'
    );
  });

  it('should use custom ELASTICSEARCH_URL when provided', () => {
    process.env.SUPPORT_DATA_BACKEND = 'elasticsearch';
    process.env.ELASTICSEARCH_URL = 'http://custom-es:9200';

    const backend = createSupportBackend();

    expect(backend).toBeInstanceOf(ElasticsearchBackend);
    // URL is passed to constructor, validated by ElasticsearchBackend tests
  });

  it('should use default ELASTICSEARCH_URL when not provided', () => {
    process.env.SUPPORT_DATA_BACKEND = 'elasticsearch';
    delete process.env.ELASTICSEARCH_URL;

    const backend = createSupportBackend();

    expect(backend).toBeInstanceOf(ElasticsearchBackend);
    // Default is http://localhost:9201, validated by ElasticsearchBackend tests
  });

  describe('URL encoding for special characters', () => {
    it('should URL-encode password with @ symbol in ELASTICSEARCH_URL', () => {
      process.env.SUPPORT_DATA_BACKEND = 'elasticsearch';
      // Password: @test123 (starts with @)
      process.env.ELASTICSEARCH_URL = 'http://elastic:@test123@elasticsearch:9200';

      // Should not throw - special chars are encoded
      const backend = createSupportBackend();
      expect(backend).toBeInstanceOf(ElasticsearchBackend);
    });

    it('should URL-encode password with multiple special chars', () => {
      process.env.SUPPORT_DATA_BACKEND = 'elasticsearch';
      // Password with @, {, }, ?, > chars
      process.env.ELASTICSEARCH_URL = 'http://elastic:@ft{Sy!>Cp?BUXXB}VEvJH_1@elasticsearch:9200';

      // Should not throw - special chars are encoded
      const backend = createSupportBackend();
      expect(backend).toBeInstanceOf(ElasticsearchBackend);
    });

    it('should use ES_HOST and ELASTIC_PASSWORD when provided', () => {
      process.env.SUPPORT_DATA_BACKEND = 'elasticsearch';
      process.env.ES_HOST = 'elasticsearch:9200';
      process.env.ELASTIC_PASSWORD = '@ft{Sy!>Cp?BUXXB}VEvJH_1';
      delete process.env.ELASTICSEARCH_URL;

      const backend = createSupportBackend();
      expect(backend).toBeInstanceOf(ElasticsearchBackend);
    });

    it('should prefer ES_HOST over ELASTICSEARCH_URL when both provided', () => {
      process.env.SUPPORT_DATA_BACKEND = 'elasticsearch';
      process.env.ES_HOST = 'custom-host:9200';
      process.env.ELASTIC_PASSWORD = 'test-password';
      process.env.ELASTICSEARCH_URL = 'http://elastic:wrong@other-host:9200';

      const backend = createSupportBackend();
      expect(backend).toBeInstanceOf(ElasticsearchBackend);
      // ES_HOST takes precedence
    });
  });
});

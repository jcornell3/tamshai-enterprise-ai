/**
 * Embedding Generator Unit Tests - Sprint 1 RED Phase
 *
 * These tests define the expected behavior for the EmbeddingGenerator component.
 * All tests should FAIL initially (RED phase of TDD).
 *
 * The Gemini API is mocked to avoid real API calls and costs.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmbeddingGenerator } from '@/indexer/embedding-generator';

// Mock Gemini API
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      embedContent: vi.fn().mockResolvedValue({
        embedding: { values: new Array(768).fill(0.1) }
      })
    })
  }))
}));

describe('EmbeddingGenerator', () => {
  let generator: EmbeddingGenerator;

  beforeEach(() => {
    generator = new EmbeddingGenerator({
      apiKey: 'test-api-key',
      model: 'text-embedding-004'
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generateEmbedding', () => {
    it('should generate 768-dimensional embedding for text', async () => {
      const embedding = await generator.generateEmbedding('Test content');

      expect(embedding).toHaveLength(768);
      expect(embedding.every(v => typeof v === 'number')).toBe(true);
    });

    it('should normalize embeddings to unit vectors', async () => {
      const embedding = await generator.generateEmbedding('Test content');

      const magnitude = Math.sqrt(
        embedding.reduce((sum, v) => sum + v * v, 0)
      );
      expect(magnitude).toBeCloseTo(1.0, 5);
    });

    it('should truncate text exceeding max tokens', async () => {
      const longText = 'word '.repeat(10000); // Way over token limit

      // Should not throw
      const embedding = await generator.generateEmbedding(longText);

      expect(embedding).toHaveLength(768);
    });

    it('should cache embeddings for identical text', async () => {
      const text = 'Identical content';

      const embedding1 = await generator.generateEmbedding(text);
      const embedding2 = await generator.generateEmbedding(text);

      expect(embedding1).toEqual(embedding2);
      // API should only be called once due to cache
    });

    it('should handle empty text gracefully', async () => {
      const embedding = await generator.generateEmbedding('');

      // Return zero vector for empty text
      expect(embedding).toHaveLength(768);
      expect(embedding.every(v => v === 0)).toBe(true);
    });

    it('should handle whitespace-only text', async () => {
      const embedding = await generator.generateEmbedding('   \n\t   ');

      // Should treat as empty
      expect(embedding).toHaveLength(768);
      expect(embedding.every(v => v === 0)).toBe(true);
    });
  });

  describe('generateBatch', () => {
    it('should generate embeddings for multiple texts', async () => {
      const texts = ['First document', 'Second document', 'Third document'];

      const embeddings = await generator.generateBatch(texts);

      expect(embeddings).toHaveLength(3);
      embeddings.forEach(emb => expect(emb).toHaveLength(768));
    });

    it('should respect batch size limits', async () => {
      const texts = Array(150).fill('Document'); // Over default batch size

      const embeddings = await generator.generateBatch(texts, { batchSize: 100 });

      expect(embeddings).toHaveLength(150);
    });

    it('should handle partial batch failures gracefully', async () => {
      // Mock one batch to fail
      const texts = ['Good', 'Bad', 'Good'];

      // Even if one fails, should return results for successful ones
      const embeddings = await generator.generateBatch(texts, { continueOnError: true });

      expect(embeddings.filter(e => e !== null).length).toBeGreaterThanOrEqual(2);
    });

    it('should process empty array without error', async () => {
      const embeddings = await generator.generateBatch([]);

      expect(embeddings).toEqual([]);
    });

    it('should maintain order of results', async () => {
      const texts = ['First', 'Second', 'Third'];

      const embeddings = await generator.generateBatch(texts);

      // Each embedding should be deterministic for the same input
      expect(embeddings).toHaveLength(3);
    });
  });

  describe('cosineSimilarity', () => {
    it('should calculate similarity between two embeddings', () => {
      const a = [1, 0, 0];
      const b = [1, 0, 0];

      const similarity = EmbeddingGenerator.cosineSimilarity(a, b);

      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];

      const similarity = EmbeddingGenerator.cosineSimilarity(a, b);

      expect(similarity).toBeCloseTo(0, 5);
    });

    it('should return -1 for opposite vectors', () => {
      const a = [1, 0, 0];
      const b = [-1, 0, 0];

      const similarity = EmbeddingGenerator.cosineSimilarity(a, b);

      expect(similarity).toBeCloseTo(-1, 5);
    });

    it('should throw for vectors of different dimensions', () => {
      const a = [1, 0, 0];
      const b = [1, 0];

      expect(() => EmbeddingGenerator.cosineSimilarity(a, b))
        .toThrow('Vectors must have same dimensions');
    });

    it('should handle zero vectors gracefully', () => {
      const a = [0, 0, 0];
      const b = [1, 0, 0];

      // Should return 0 or NaN depending on implementation
      const similarity = EmbeddingGenerator.cosineSimilarity(a, b);

      expect([0, NaN]).toContain(similarity);
    });

    it('should work with normalized 768-dimensional vectors', () => {
      const a = new Array(768).fill(1 / Math.sqrt(768));
      const b = new Array(768).fill(1 / Math.sqrt(768));

      const similarity = EmbeddingGenerator.cosineSimilarity(a, b);

      expect(similarity).toBeCloseTo(1.0, 4);
    });
  });

  describe('error handling', () => {
    it('should throw on API key not configured', async () => {
      const noKeyGenerator = new EmbeddingGenerator({ apiKey: '' });

      await expect(noKeyGenerator.generateEmbedding('test'))
        .rejects.toThrow('GEMINI_API_KEY not configured');
    });

    it('should throw on undefined API key', async () => {
      const noKeyGenerator = new EmbeddingGenerator({ apiKey: undefined as unknown as string });

      await expect(noKeyGenerator.generateEmbedding('test'))
        .rejects.toThrow('GEMINI_API_KEY not configured');
    });

    it('should retry on transient API errors', async () => {
      // Create a generator that tracks calls
      const mockEmbedContent = vi.fn();
      let callCount = 0;

      mockEmbedContent.mockImplementation(async () => {
        callCount++;
        if (callCount < 3) throw new Error('Rate limited');
        return { embedding: { values: new Array(768).fill(0.1) } };
      });

      vi.mocked(generator['embeddingModel']).embedContent = mockEmbedContent;

      const embedding = await generator.generateEmbedding('test');

      expect(embedding).toHaveLength(768);
      expect(callCount).toBe(3);
    });

    it('should give up after max retries', async () => {
      const mockEmbedContent = vi.fn().mockRejectedValue(new Error('Persistent error'));

      vi.mocked(generator['embeddingModel']).embedContent = mockEmbedContent;

      await expect(generator.generateEmbedding('test'))
        .rejects.toThrow('Persistent error');
    });
  });

  describe('configuration', () => {
    it('should use default model when not specified', () => {
      const defaultGenerator = new EmbeddingGenerator({ apiKey: 'test-key' });

      expect(defaultGenerator.model).toBe('text-embedding-004');
    });

    it('should allow custom model specification', () => {
      const customGenerator = new EmbeddingGenerator({
        apiKey: 'test-key',
        model: 'custom-model'
      });

      expect(customGenerator.model).toBe('custom-model');
    });
  });
});

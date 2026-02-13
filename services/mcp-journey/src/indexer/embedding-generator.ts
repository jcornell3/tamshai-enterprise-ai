/**
 * Embedding Generator - Sprint 1 GREEN Phase
 *
 * Generates vector embeddings for semantic search using Gemini API.
 * Features:
 * - 768-dimensional embeddings
 * - Normalization to unit vectors
 * - Caching for identical texts
 * - Batch processing with configurable batch size
 * - Retry on transient errors
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

export interface EmbeddingConfig {
  apiKey: string;
  model?: string;
  maxRetries?: number;
  maxTokens?: number;
}

export interface BatchOptions {
  batchSize?: number;
  continueOnError?: boolean;
}

// Default configuration
const DEFAULT_MODEL = 'text-embedding-004';
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_BATCH_SIZE = 100;
const EMBEDDING_DIMENSIONS = 768;

/**
 * Generates vector embeddings for semantic search using Gemini API.
 */
export class EmbeddingGenerator {
  public readonly model: string;
  private readonly apiKey: string;
  private readonly maxRetries: number;
  private readonly maxTokens: number;
  private genAI: GoogleGenerativeAI | null = null;
  // Note: Made protected for testability - tests should use generator['embeddingModel']
  protected embeddingModel: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | null = null;
  private cache: Map<string, number[]> = new Map();

  constructor(config: EmbeddingConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;

    // Initialize Gemini client if API key is provided
    if (this.apiKey) {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      this.embeddingModel = this.genAI.getGenerativeModel({ model: this.model });
    }
  }

  /**
   * Generate embedding for a single text.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // Check API key
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Handle empty or whitespace-only text
    if (!text || text.trim() === '') {
      return new Array(EMBEDDING_DIMENSIONS).fill(0);
    }

    // Check cache first
    const cacheKey = this.getCacheKey(text);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Truncate text if too long (approximate token count by characters)
    const truncatedText = this.truncateText(text);

    // Generate embedding with retries
    const embedding = await this.generateWithRetry(truncatedText);

    // Normalize to unit vector
    const normalized = this.normalize(embedding);

    // Cache the result
    this.cache.set(cacheKey, normalized);

    return normalized;
  }

  /**
   * Generate embeddings for multiple texts in batches.
   */
  async generateBatch(
    texts: string[],
    options?: BatchOptions
  ): Promise<Array<number[] | null>> {
    if (texts.length === 0) {
      return [];
    }

    const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
    const continueOnError = options?.continueOnError ?? false;
    const results: Array<number[] | null> = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      for (const text of batch) {
        try {
          const embedding = await this.generateEmbedding(text);
          results.push(embedding);
        } catch (err) {
          if (continueOnError) {
            results.push(null);
          } else {
            throw err;
          }
        }
      }
    }

    return results;
  }

  /**
   * Calculate cosine similarity between two embedding vectors.
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same dimensions');
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i] ?? 0;
      const bVal = b[i] ?? 0;
      dotProduct += aVal * bVal;
      magnitudeA += aVal * aVal;
      magnitudeB += bVal * bVal;
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    // Handle zero vectors
    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Generate embedding with retry logic for transient errors.
   */
  private async generateWithRetry(text: string): Promise<number[]> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        if (!this.embeddingModel) {
          throw new Error('GEMINI_API_KEY not configured');
        }

        const result = await this.embeddingModel.embedContent(text);
        const values = result.embedding?.values;

        if (!values || !Array.isArray(values)) {
          throw new Error('Invalid embedding response');
        }

        return values;
      } catch (err) {
        lastError = err as Error;

        // Don't retry on configuration errors
        if (lastError.message === 'GEMINI_API_KEY not configured') {
          throw lastError;
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.maxRetries) {
          await this.sleep(Math.pow(2, attempt) * 100);
        }
      }
    }

    throw lastError ?? new Error('Failed to generate embedding');
  }

  /**
   * Normalize a vector to unit length.
   */
  private normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));

    if (magnitude === 0) {
      return vector;
    }

    return vector.map((v) => v / magnitude);
  }

  /**
   * Truncate text to fit within max tokens.
   * Approximate: ~4 characters per token for English text.
   */
  private truncateText(text: string): string {
    const maxChars = this.maxTokens * 4;

    if (text.length <= maxChars) {
      return text;
    }

    return text.slice(0, maxChars);
  }

  /**
   * Generate a cache key for a text.
   */
  private getCacheKey(text: string): string {
    // Simple hash for cache key
    // Security: Limit iterations to prevent loop bound injection
    const maxHashLength = 10000; // Only hash first 10k chars for cache key
    const hashLength = Math.min(text.length, maxHashLength);
    let hash = 0;
    for (let i = 0; i < hashLength; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `${this.model}:${hash}:${text.length}`;
  }

  /**
   * Sleep for a specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clear the embedding cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): { size: number } {
    return { size: this.cache.size };
  }
}

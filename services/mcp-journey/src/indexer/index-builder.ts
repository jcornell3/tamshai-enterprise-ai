/**
 * Index Builder - Sprint 1 GREEN Phase
 *
 * Builds and queries SQLite index from parsed documents.
 * Features:
 * - SQLite with FTS5 for full-text search
 * - Vector similarity search for embeddings
 * - JSON-LD metadata storage and querying
 * - Combined text + semantic search
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import Database, { type Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { EmbeddingGenerator } from './embedding-generator.js';

export interface IndexConfig {
  dbPath: string;
}

export interface DocumentToIndex {
  filePath: string;
  title: string;
  content: string;
  plainText: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

export interface IndexedDocument {
  id: number;
  filePath: string;
  title: string;
  content: string;
  plainText: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
  score?: number;
}

export interface SearchOptions {
  limit?: number;
}

export interface CombinedSearchOptions {
  query: string;
  embedding: number[];
  weights: {
    text: number;
    semantic: number;
  };
  limit?: number;
}

export interface IndexStatistics {
  totalDocuments: number;
  totalEmbeddings: number;
  dbSizeBytes: number;
  documentsWithMetadata?: number;
}

export type KnowledgeIndex = IndexBuilder;

/**
 * Builds and queries SQLite index from parsed documents.
 */
export class IndexBuilder {
  private db: DatabaseType | null = null;
  private readonly dbPath: string;
  private initialized = false;

  constructor(config: IndexConfig) {
    this.dbPath = config.dbPath;
  }

  /**
   * Initialize the database and create tables.
   */
  initialize(): void {
    if (this.initialized && this.db) {
      return;
    }

    // Ensure directory exists for the database file
    const dir = path.dirname(this.dbPath);
    if (dir && dir !== '.' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Create documents table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        plain_text TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create embeddings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        embedding BLOB NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      )
    `);

    // Create JSON-LD metadata table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS json_ld_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        type TEXT,
        learning_resource_type TEXT,
        metadata_json TEXT NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      )
    `);

    // Create FTS5 virtual table for full-text search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
        title,
        plain_text,
        content='documents',
        content_rowid='id'
      )
    `);

    // Create triggers to keep FTS in sync
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
        INSERT INTO documents_fts(rowid, title, plain_text) VALUES (new.id, new.title, new.plain_text);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, plain_text) VALUES ('delete', old.id, old.title, old.plain_text);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, plain_text) VALUES ('delete', old.id, old.title, old.plain_text);
        INSERT INTO documents_fts(rowid, title, plain_text) VALUES (new.id, new.title, new.plain_text);
      END
    `);

    // Create indexes for common queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_documents_file_path ON documents(file_path)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_embeddings_document_id ON embeddings(document_id)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_metadata_document_id ON json_ld_metadata(document_id)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_metadata_type ON json_ld_metadata(learning_resource_type)
    `);

    this.initialized = true;
  }

  /**
   * Close the database connection.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }

  /**
   * Index a document.
   */
  async indexDocument(doc: DocumentToIndex): Promise<number> {
    this.ensureInitialized();
    const db = this.db!;

    // Check if document already exists
    const existing = db
      .prepare('SELECT id FROM documents WHERE file_path = ?')
      .get(doc.filePath) as { id: number } | undefined;

    let documentId: number;

    if (existing) {
      // Update existing document
      db.prepare(`
        UPDATE documents
        SET title = ?, content = ?, plain_text = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(doc.title, doc.content, doc.plainText, existing.id);

      documentId = existing.id;

      // Delete old embedding and metadata
      db.prepare('DELETE FROM embeddings WHERE document_id = ?').run(documentId);
      db.prepare('DELETE FROM json_ld_metadata WHERE document_id = ?').run(documentId);
    } else {
      // Insert new document
      const result = db
        .prepare(
          'INSERT INTO documents (file_path, title, content, plain_text) VALUES (?, ?, ?, ?)'
        )
        .run(doc.filePath, doc.title, doc.content, doc.plainText);

      documentId = result.lastInsertRowid as number;
    }

    // Store embedding as blob
    const embeddingBuffer = Buffer.from(new Float64Array(doc.embedding).buffer);
    db.prepare('INSERT INTO embeddings (document_id, embedding) VALUES (?, ?)').run(
      documentId,
      embeddingBuffer
    );

    // Store metadata if present
    if (doc.metadata && Object.keys(doc.metadata).length > 0) {
      const type = (doc.metadata['@type'] as string) || null;
      const learningResourceType = (doc.metadata.learningResourceType as string) || null;
      const metadataJson = JSON.stringify(doc.metadata);

      db.prepare(
        'INSERT INTO json_ld_metadata (document_id, type, learning_resource_type, metadata_json) VALUES (?, ?, ?, ?)'
      ).run(documentId, type, learningResourceType, metadataJson);
    }

    return documentId;
  }

  /**
   * Get a document by ID.
   */
  getDocument(id: number): IndexedDocument | null {
    this.ensureInitialized();
    const db = this.db!;

    const doc = db
      .prepare(
        `
        SELECT d.id, d.file_path, d.title, d.content, d.plain_text, e.embedding, m.metadata_json
        FROM documents d
        LEFT JOIN embeddings e ON d.id = e.document_id
        LEFT JOIN json_ld_metadata m ON d.id = m.document_id
        WHERE d.id = ?
      `
      )
      .get(id) as
      | {
          id: number;
          file_path: string;
          title: string;
          content: string;
          plain_text: string;
          embedding: Buffer | null;
          metadata_json: string | null;
        }
      | undefined;

    if (!doc) {
      return null;
    }

    return this.mapDocument(doc);
  }

  /**
   * Get a document by file path.
   */
  getDocumentByPath(filePath: string): IndexedDocument | null {
    this.ensureInitialized();
    const db = this.db!;

    const doc = db
      .prepare(
        `
        SELECT d.id, d.file_path, d.title, d.content, d.plain_text, e.embedding, m.metadata_json
        FROM documents d
        LEFT JOIN embeddings e ON d.id = e.document_id
        LEFT JOIN json_ld_metadata m ON d.id = m.document_id
        WHERE d.file_path = ?
      `
      )
      .get(filePath) as
      | {
          id: number;
          file_path: string;
          title: string;
          content: string;
          plain_text: string;
          embedding: Buffer | null;
          metadata_json: string | null;
        }
      | undefined;

    if (!doc) {
      return null;
    }

    return this.mapDocument(doc);
  }

  /**
   * Search using full-text search (FTS5).
   */
  searchFullText(query: string, options?: SearchOptions): IndexedDocument[] {
    this.ensureInitialized();
    const db = this.db!;
    const limit = options?.limit ?? 10;

    // Escape special FTS5 characters
    const safeQuery = this.escapeFtsQuery(query);

    if (!safeQuery) {
      return [];
    }

    try {
      const results = db
        .prepare(
          `
          SELECT d.id, d.file_path, d.title, d.content, d.plain_text,
                 e.embedding, m.metadata_json,
                 bm25(documents_fts) as score
          FROM documents_fts fts
          JOIN documents d ON fts.rowid = d.id
          LEFT JOIN embeddings e ON d.id = e.document_id
          LEFT JOIN json_ld_metadata m ON d.id = m.document_id
          WHERE documents_fts MATCH ?
          ORDER BY score
          LIMIT ?
        `
        )
        .all(safeQuery, limit) as Array<{
        id: number;
        file_path: string;
        title: string;
        content: string;
        plain_text: string;
        embedding: Buffer | null;
        metadata_json: string | null;
        score: number;
      }>;

      return results.map((r) => ({
        ...this.mapDocument(r),
        score: Math.abs(r.score), // BM25 returns negative scores, convert to positive
      }));
    } catch {
      // FTS query error, return empty results
      return [];
    }
  }

  /**
   * Search by semantic similarity.
   */
  async searchSemantic(
    embedding: number[],
    options?: SearchOptions
  ): Promise<IndexedDocument[]> {
    this.ensureInitialized();
    const db = this.db!;
    const limit = options?.limit ?? 10;

    // Get all documents with embeddings
    const docs = db
      .prepare(
        `
        SELECT d.id, d.file_path, d.title, d.content, d.plain_text,
               e.embedding, m.metadata_json
        FROM documents d
        JOIN embeddings e ON d.id = e.document_id
        LEFT JOIN json_ld_metadata m ON d.id = m.document_id
      `
      )
      .all() as Array<{
      id: number;
      file_path: string;
      title: string;
      content: string;
      plain_text: string;
      embedding: Buffer;
      metadata_json: string | null;
    }>;

    // Calculate similarity for each document
    const scoredDocs = docs.map((doc) => {
      const docEmbedding = this.bufferToArray(doc.embedding);
      const similarity = EmbeddingGenerator.cosineSimilarity(embedding, docEmbedding);

      return {
        doc,
        score: similarity,
      };
    });

    // Sort by similarity descending and take top N
    scoredDocs.sort((a, b) => b.score - a.score);
    const topDocs = scoredDocs.slice(0, limit);

    return topDocs.map((item) => ({
      ...this.mapDocument(item.doc),
      score: item.score,
    }));
  }

  /**
   * Search by document type (learningResourceType).
   */
  searchByType(type: string): IndexedDocument[] {
    this.ensureInitialized();
    const db = this.db!;

    const results = db
      .prepare(
        `
        SELECT d.id, d.file_path, d.title, d.content, d.plain_text,
               e.embedding, m.metadata_json
        FROM documents d
        JOIN json_ld_metadata m ON d.id = m.document_id
        LEFT JOIN embeddings e ON d.id = e.document_id
        WHERE m.learning_resource_type = ?
      `
      )
      .all(type) as Array<{
      id: number;
      file_path: string;
      title: string;
      content: string;
      plain_text: string;
      embedding: Buffer | null;
      metadata_json: string | null;
    }>;

    return results.map((r) => this.mapDocument(r));
  }

  /**
   * Combined text + semantic search.
   */
  async searchCombined(options: CombinedSearchOptions): Promise<IndexedDocument[]> {
    this.ensureInitialized();
    const limit = options.limit ?? 10;

    // Get text search results
    const textResults = this.searchFullText(options.query, { limit: limit * 2 });

    // Get semantic search results
    const semanticResults = await this.searchSemantic(options.embedding, {
      limit: limit * 2,
    });

    // Combine and score
    const combinedScores = new Map<number, { doc: IndexedDocument; score: number }>();

    // Add text results with weighted score
    for (const doc of textResults) {
      const textScore = (doc.score ?? 0) * options.weights.text;
      combinedScores.set(doc.id, { doc, score: textScore });
    }

    // Add semantic results with weighted score
    for (const doc of semanticResults) {
      const semanticScore = (doc.score ?? 0) * options.weights.semantic;
      const existing = combinedScores.get(doc.id);

      if (existing) {
        existing.score += semanticScore;
      } else {
        combinedScores.set(doc.id, { doc, score: semanticScore });
      }
    }

    // Sort by combined score
    const sorted = Array.from(combinedScores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return sorted.map((item) => ({
      ...item.doc,
      score: item.score,
    }));
  }

  /**
   * Get metadata by learningResourceType.
   */
  getMetadataByType(type: string): Array<Record<string, unknown>> {
    this.ensureInitialized();
    const db = this.db!;

    const results = db
      .prepare(
        'SELECT metadata_json FROM json_ld_metadata WHERE learning_resource_type = ?'
      )
      .all(type) as Array<{ metadata_json: string }>;

    return results.map((r) => JSON.parse(r.metadata_json) as Record<string, unknown>);
  }

  /**
   * Get index statistics.
   */
  getStatistics(): IndexStatistics {
    this.ensureInitialized();
    const db = this.db!;

    const docCount = (
      db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number }
    ).count;

    const embeddingCount = (
      db.prepare('SELECT COUNT(*) as count FROM embeddings').get() as { count: number }
    ).count;

    const metadataCount = (
      db.prepare('SELECT COUNT(*) as count FROM json_ld_metadata').get() as {
        count: number;
      }
    ).count;

    // Get database file size
    let dbSizeBytes = 0;
    if (this.dbPath !== ':memory:' && fs.existsSync(this.dbPath)) {
      dbSizeBytes = fs.statSync(this.dbPath).size;
    }

    return {
      totalDocuments: docCount,
      totalEmbeddings: embeddingCount,
      dbSizeBytes,
      documentsWithMetadata: metadataCount,
    };
  }

  /**
   * Delete a document by ID or file path.
   */
  deleteDocument(idOrPath: number | string): boolean {
    this.ensureInitialized();
    const db = this.db!;

    if (typeof idOrPath === 'number') {
      const result = db.prepare('DELETE FROM documents WHERE id = ?').run(idOrPath);
      return result.changes > 0;
    } else {
      const result = db
        .prepare('DELETE FROM documents WHERE file_path = ?')
        .run(idOrPath);
      return result.changes > 0;
    }
  }

  /**
   * List all indexed documents.
   */
  listDocuments(): IndexedDocument[] {
    this.ensureInitialized();
    const db = this.db!;

    const rows = db
      .prepare(
        `SELECT d.id, d.file_path, d.title, d.content, d.plain_text,
                e.embedding, m.metadata_json
         FROM documents d
         LEFT JOIN embeddings e ON d.id = e.document_id
         LEFT JOIN json_ld_metadata m ON d.id = m.document_id
         ORDER BY d.id`
      )
      .all() as Array<{
      id: number;
      file_path: string;
      title: string;
      content: string;
      plain_text: string;
      embedding: Buffer | null;
      metadata_json: string | null;
    }>;

    return rows.map((row) => this.mapDocument(row));
  }

  /**
   * Ensure the database is initialized.
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
  }

  /**
   * Map a database row to an IndexedDocument.
   */
  private mapDocument(row: {
    id: number;
    file_path: string;
    title: string;
    content: string;
    plain_text: string;
    embedding: Buffer | null;
    metadata_json: string | null;
  }): IndexedDocument {
    return {
      id: row.id,
      filePath: row.file_path,
      title: row.title,
      content: row.content,
      plainText: row.plain_text,
      embedding: row.embedding ? this.bufferToArray(row.embedding) : [],
      metadata: row.metadata_json
        ? (JSON.parse(row.metadata_json) as Record<string, unknown>)
        : undefined,
    };
  }

  /**
   * Convert a Buffer to a number array.
   */
  private bufferToArray(buffer: Buffer): number[] {
    const float64Array = new Float64Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.length / 8
    );
    return Array.from(float64Array);
  }

  /**
   * Escape special FTS5 query characters.
   */
  private escapeFtsQuery(query: string): string {
    // Remove FTS5 operators and special characters
    let safe = query
      .replace(/['"]/g, '')
      .replace(/\bAND\b/gi, '')
      .replace(/\bOR\b/gi, '')
      .replace(/\bNOT\b/gi, '')
      .replace(/\*/g, '')
      .replace(/\^/g, '')
      .replace(/:/g, '')
      .replace(/[()]/g, '')
      .trim();

    // If empty after cleaning, return empty
    if (!safe) {
      return '';
    }

    // Split into words and wrap each in quotes for exact matching
    const words = safe.split(/\s+/).filter((w) => w.length > 0);
    return words.join(' OR ');
  }

  /**
   * Get evolution history for a component.
   * TODO: Implement full evolution tracking
   */
  getEvolutionHistory(_component: string): Record<string, unknown> | null {
    // Stub implementation - returns null (component not found)
    // Full implementation would query documents and build evolution history
    return null;
  }

  /**
   * List all tracked components.
   * TODO: Implement component tracking
   */
  listComponents(): string[] {
    // Stub implementation - returns empty array
    // Full implementation would extract components from indexed documents
    return [];
  }

  /**
   * Get documents by type(s).
   * TODO: Implement document type filtering
   */
  getDocumentsByType(types: string[]): IndexedDocument[] {
    this.ensureInitialized();
    const db = this.db!;

    if (types.length === 0) {
      return [];
    }

    const placeholders = types.map(() => '?').join(', ');
    const results = db
      .prepare(
        `SELECT d.id, d.file_path, d.title, d.content, d.plain_text,
                e.embedding, m.metadata_json
         FROM documents d
         JOIN json_ld_metadata m ON d.id = m.document_id
         LEFT JOIN embeddings e ON d.id = e.document_id
         WHERE m.learning_resource_type IN (${placeholders})`
      )
      .all(...types) as Array<{
      id: number;
      file_path: string;
      title: string;
      content: string;
      plain_text: string;
      embedding: Buffer | null;
      metadata_json: string | null;
    }>;

    return results.map((r) => this.mapDocument(r));
  }
}

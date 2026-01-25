/**
 * Build Index Script
 *
 * Indexes project documentation for the MCP Journey server.
 * Scans docs/, .specify/, and other documentation directories.
 */

import { IndexBuilder } from '../indexer/index-builder.js';
import { MarkdownParser } from '../indexer/markdown-parser.js';
import { EmbeddingGenerator } from '../indexer/embedding-generator.js';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
const DB_PATH = process.env.DB_PATH || './data/journey.db';

// Directories to index
const DOCS_DIRS = [
  'docs',
  '.specify',
  'docs/plans',
  'docs/architecture',
  'docs/security',
  'docs/development',
];

// File patterns to include
const INCLUDE_PATTERNS = [
  /\.md$/i,
];

// Patterns to exclude
const EXCLUDE_PATTERNS = [
  /node_modules/,
  /dist/,
  /\.git/,
  /coverage/,
];

async function findMarkdownFiles(baseDir: string): Promise<string[]> {
  const files: string[] = [];

  for (const docsDir of DOCS_DIRS) {
    const fullPath = path.join(baseDir, docsDir);
    if (fs.existsSync(fullPath)) {
      await scanDirectory(fullPath, files);
    }
  }

  // Also index CLAUDE.md and README.md at root
  const rootFiles = ['CLAUDE.md', 'README.md'];
  for (const file of rootFiles) {
    const filePath = path.join(baseDir, file);
    if (fs.existsSync(filePath)) {
      files.push(filePath);
    }
  }

  return files;
}

async function scanDirectory(dir: string, files: string[]): Promise<void> {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(PROJECT_ROOT, fullPath);

    // Skip excluded paths
    if (EXCLUDE_PATTERNS.some(p => p.test(relativePath))) {
      continue;
    }

    if (entry.isDirectory()) {
      await scanDirectory(fullPath, files);
    } else if (entry.isFile() && INCLUDE_PATTERNS.some(p => p.test(entry.name))) {
      files.push(fullPath);
    }
  }
}

async function main(): Promise<void> {
  console.log('Building MCP Journey index...');
  console.log(`Project root: ${PROJECT_ROOT}`);
  console.log(`Database path: ${DB_PATH}`);

  // Initialize components
  const index = new IndexBuilder({ dbPath: DB_PATH });
  const embeddings = new EmbeddingGenerator({
    apiKey: process.env.GEMINI_API_KEY || '',
  });

  index.initialize();

  // Find all markdown files
  const files = await findMarkdownFiles(PROJECT_ROOT);
  console.log(`Found ${files.length} markdown files to index`);

  let indexed = 0;
  let errors = 0;

  for (const filePath of files) {
    try {
      const relativePath = path.relative(PROJECT_ROOT, filePath);
      const content = fs.readFileSync(filePath, 'utf-8');

      // Parse markdown (static async method)
      const parsed = await MarkdownParser.parse(content);

      // Generate embedding if API key is available
      let embedding: number[] | undefined;
      if (process.env.GEMINI_API_KEY) {
        try {
          embedding = await embeddings.generateEmbedding(parsed.plainText.substring(0, 8000));
        } catch (e) {
          // Embedding generation is optional
          console.warn(`  Warning: Could not generate embedding for ${relativePath}`);
        }
      }

      // Extract title from frontmatter or first heading
      const title = (parsed.frontmatter?.title as string) ||
        parsed.headings[0]?.text ||
        path.basename(filePath, '.md');

      // Add to index (indexDocument is async and embedding is required)
      await index.indexDocument({
        filePath: relativePath,
        title,
        content: content,
        plainText: parsed.plainText,
        embedding: embedding || [], // Empty array if no embedding generated
        metadata: parsed.frontmatter,
      });

      indexed++;
      if (indexed % 10 === 0) {
        console.log(`  Indexed ${indexed}/${files.length} files...`);
      }
    } catch (error) {
      errors++;
      const relativePath = path.relative(PROJECT_ROOT, filePath);
      console.error(`  Error indexing ${relativePath}:`, error);
    }
  }

  // Get statistics
  const stats = index.getStatistics();

  console.log('\nIndex build complete!');
  console.log(`  Total documents: ${stats.totalDocuments}`);
  console.log(`  Total embeddings: ${stats.totalEmbeddings}`);
  console.log(`  Database size: ${(stats.dbSizeBytes / 1024).toFixed(1)} KB`);
  console.log(`  Indexed: ${indexed}, Errors: ${errors}`);

  index.close();
}

main().catch((error) => {
  console.error('Failed to build index:', error);
  process.exit(1);
});

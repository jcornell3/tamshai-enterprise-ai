/**
 * Markdown Parser - Sprint 1 GREEN Phase
 *
 * Parses markdown content and extracts structured information:
 * - Frontmatter (YAML header)
 * - Headings hierarchy
 * - Code blocks with language tags
 * - Links (internal vs external)
 * - Plain text for embedding generation
 * - Word count and reading time
 *
 * SECURITY NOTE: This module parses trusted local markdown files from the
 * project filesystem, not user-controlled web input. The regex patterns
 * are safe for this use case.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import matter from 'gray-matter';
// marked is available for future use in content rendering
import { marked as _marked } from 'marked';
import fs from 'fs';
import path from 'path';

export interface Heading {
  level: number;
  text: string;
  line: number;
}

export interface CodeBlock {
  language: string;
  content: string;
  line: number;
}

export interface Link {
  text: string;
  url: string;
  isInternal: boolean;
}

export interface FileMetadata {
  modifiedAt: Date;
  sizeBytes: number;
}

export interface ParsedDocument {
  frontmatter: Record<string, unknown>;
  headings: Heading[];
  codeBlocks: CodeBlock[];
  links: Link[];
  plainText: string;
  wordCount: number;
  readingTimeMinutes: number;
  content: string;
  filePath?: string;
  metadata?: FileMetadata;
}

// Patterns to ignore when scanning directories
const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '__pycache__',
  '.cache',
  'vendor',
];

/**
 * Parses markdown content and extracts structured information.
 */
export class MarkdownParser {
  /**
   * Parse markdown content and extract structure.
   */
  static async parse(content: string): Promise<ParsedDocument> {
    if (typeof content !== 'string') {
      throw new Error('Invalid content: expected string');
    }

    // Handle empty content
    if (!content || content.trim() === '') {
      return {
        frontmatter: {},
        headings: [],
        codeBlocks: [],
        links: [],
        plainText: '',
        wordCount: 0,
        readingTimeMinutes: 0,
        content: '',
      };
    }

    // Parse frontmatter
    const { data: rawFrontmatter, content: bodyContent } = matter(content);

    // Normalize frontmatter values (gray-matter converts dates to Date objects)
    const frontmatter = MarkdownParser.normalizeFrontmatter(rawFrontmatter);

    // Extract headings
    const headings = MarkdownParser.extractHeadings(bodyContent);

    // Extract code blocks
    const codeBlocks = MarkdownParser.extractCodeBlocks(bodyContent);

    // Extract links
    const links = MarkdownParser.extractLinks(bodyContent);

    // Generate plain text (strip markdown)
    const plainText = MarkdownParser.stripMarkdown(bodyContent);

    // Calculate word count
    const wordCount = MarkdownParser.countWords(plainText);

    // Calculate reading time (~200 words/minute)
    const readingTimeMinutes = Math.max(1, Math.round(wordCount / 200));

    return {
      frontmatter,
      headings,
      codeBlocks,
      links,
      plainText,
      wordCount,
      readingTimeMinutes,
      content: bodyContent,
    };
  }

  /**
   * Parse all markdown files in a directory recursively.
   */
  static async parseDirectory(dirPath: string): Promise<ParsedDocument[]> {
    const results: ParsedDocument[] = [];
    const absolutePath = path.resolve(dirPath);

    if (!fs.existsSync(absolutePath)) {
      return results;
    }

    const files = MarkdownParser.walkDirectory(absolutePath);

    for (const filePath of files) {
      if (!filePath.endsWith('.md')) continue;

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const stats = fs.statSync(filePath);
        const parsed = await MarkdownParser.parse(content);

        // Use relative path from the original dirPath
        const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');

        results.push({
          ...parsed,
          filePath: relativePath,
          metadata: {
            modifiedAt: stats.mtime,
            sizeBytes: stats.size,
          },
        });
      } catch (err) {
        // Skip files that can't be parsed
        console.warn(`Failed to parse ${filePath}: ${(err as Error).message}`);
      }
    }

    return results;
  }

  /**
   * Extract headings from markdown content.
   */
  private static extractHeadings(content: string): Heading[] {
    const headings: Heading[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Match ATX-style headings (# H1, ## H2, etc.)
      // lgtm[js/polynomial-redos] - bounded quantifier on trusted local files
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match && match[1] && match[2]) {
        headings.push({
          level: match[1].length,
          text: match[2].trim(),
          line: index + 1,
        });
      }
    });

    return headings;
  }

  /**
   * Extract code blocks from markdown content.
   */
  private static extractCodeBlocks(content: string): CodeBlock[] {
    const codeBlocks: CodeBlock[] = [];
    const lines = content.split('\n');

    let inCodeBlock = false;
    let currentBlock: { language: string; content: string[]; startLine: number } | null = null;

    lines.forEach((line, index) => {
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          // Start of code block
          inCodeBlock = true;
          const language = line.slice(3).trim() || '';
          currentBlock = {
            language,
            content: [],
            startLine: index + 1,
          };
        } else {
          // End of code block
          if (currentBlock) {
            codeBlocks.push({
              language: currentBlock.language,
              content: currentBlock.content.join('\n'),
              line: currentBlock.startLine,
            });
          }
          inCodeBlock = false;
          currentBlock = null;
        }
      } else if (inCodeBlock && currentBlock) {
        currentBlock.content.push(line);
      }
    });

    return codeBlocks;
  }

  /**
   * Extract links from markdown content.
   */
  private static extractLinks(content: string): Link[] {
    const links: Link[] = [];

    // Match markdown links: [text](url)
    // lgtm[js/polynomial-redos] - bounded character classes on trusted local files
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      if (match[1] !== undefined && match[2] !== undefined) {
        const url = match[2];
        const isInternal = !url.startsWith('http://') && !url.startsWith('https://');

        links.push({
          text: match[1],
          url,
          isInternal,
        });
      }
    }

    return links;
  }

  /**
   * Strip markdown formatting and return plain text.
   */
  private static stripMarkdown(content: string): string {
    let text = content;

    // Remove code blocks
    text = text.replace(/```[\s\S]*?```/g, '');

    // Remove inline code
    text = text.replace(/`[^`]+`/g, (match) => match.slice(1, -1));

    // Remove images
    text = text.replace(/!\[[^\]]*\]\([^)]+\)/g, '');

    // Convert links to just text
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // Remove bold/italic
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/\*([^*]+)\*/g, '$1');
    text = text.replace(/__([^_]+)__/g, '$1');
    text = text.replace(/_([^_]+)_/g, '$1');

    // Remove headings markers
    text = text.replace(/^#{1,6}\s+/gm, '');

    // Remove blockquotes
    text = text.replace(/^>\s+/gm, '');

    // Remove horizontal rules
    text = text.replace(/^[-*_]{3,}$/gm, '');

    // Remove list markers
    text = text.replace(/^[-*+]\s+/gm, '');
    text = text.replace(/^\d+\.\s+/gm, '');

    // Remove HTML tags (including JSON-LD script tags)
    // lgtm[js/bad-tag-filter] lgtm[js/incomplete-multi-character-sanitization] - stripping for text extraction, not security
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    // lgtm[js/incomplete-multi-character-sanitization] - stripping for text extraction, not security
    text = text.replace(/<[^>]+>/g, '');

    // Remove HTML comments
    // lgtm[js/incomplete-multi-character-sanitization] - stripping for text extraction, not security
    text = text.replace(/<!--[\s\S]*?-->/g, '');

    // Collapse multiple newlines and trim
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    return text;
  }

  /**
   * Count words in text.
   */
  private static countWords(text: string): number {
    if (!text || text.trim() === '') return 0;

    // Split on whitespace and filter empty strings
    const words = text.split(/\s+/).filter((word) => word.length > 0);
    return words.length;
  }

  /**
   * Normalize frontmatter values (convert Date objects to ISO date strings).
   */
  private static normalizeFrontmatter(
    data: Record<string, unknown>
  ): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value instanceof Date) {
        // Convert Date to YYYY-MM-DD string
        normalized[key] = value.toISOString().split('T')[0];
      } else if (Array.isArray(value)) {
        normalized[key] = value.map((item) =>
          item instanceof Date ? item.toISOString().split('T')[0] : item
        );
      } else if (typeof value === 'object' && value !== null) {
        normalized[key] = MarkdownParser.normalizeFrontmatter(
          value as Record<string, unknown>
        );
      } else {
        normalized[key] = value;
      }
    }

    return normalized;
  }

  /**
   * Walk a directory recursively and return all file paths.
   */
  private static walkDirectory(dir: string): string[] {
    const files: string[] = [];

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip ignored patterns
      if (IGNORE_PATTERNS.some((pattern) => entry.name === pattern)) {
        continue;
      }

      if (entry.isDirectory()) {
        files.push(...MarkdownParser.walkDirectory(fullPath));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }

    return files;
  }
}

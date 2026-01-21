/**
 * Markdown Parser Unit Tests - Sprint 1 RED Phase
 *
 * These tests define the expected behavior for the MarkdownParser component.
 * All tests should FAIL initially (RED phase of TDD).
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MarkdownParser, type ParsedDocument } from '@/indexer/markdown-parser';

describe('MarkdownParser', () => {
  describe('parseFile', () => {
    it('should extract frontmatter from markdown files', async () => {
      const content = `---
title: Test Document
date: 2026-01-15
tags: [test, example]
---
# Content here
`;
      const result = await MarkdownParser.parse(content);

      expect(result.frontmatter).toEqual({
        title: 'Test Document',
        date: '2026-01-15',
        tags: ['test', 'example']
      });
    });

    it('should extract headings hierarchy', async () => {
      const content = `# H1 Title
## H2 Section
### H3 Subsection
## Another H2`;

      const result = await MarkdownParser.parse(content);

      expect(result.headings).toEqual([
        { level: 1, text: 'H1 Title', line: 1 },
        { level: 2, text: 'H2 Section', line: 2 },
        { level: 3, text: 'H3 Subsection', line: 3 },
        { level: 2, text: 'Another H2', line: 4 }
      ]);
    });

    it('should extract code blocks with language tags', async () => {
      const content = '```typescript\nconst x = 1;\n```';

      const result = await MarkdownParser.parse(content);

      expect(result.codeBlocks).toEqual([
        { language: 'typescript', content: 'const x = 1;', line: 1 }
      ]);
    });

    it('should extract links and references', async () => {
      const content = `See [related doc](./other.md) and [external](https://example.com)`;

      const result = await MarkdownParser.parse(content);

      expect(result.links).toHaveLength(2);
      expect(result.links[0]).toEqual({
        text: 'related doc',
        url: './other.md',
        isInternal: true
      });
      expect(result.links[1]).toEqual({
        text: 'external',
        url: 'https://example.com',
        isInternal: false
      });
    });

    it('should handle files without frontmatter', async () => {
      const content = '# Just a heading\nSome content';

      const result = await MarkdownParser.parse(content);

      expect(result.frontmatter).toEqual({});
      expect(result.headings).toHaveLength(1);
    });

    it('should extract plain text content for embedding', async () => {
      const content = `# Title
Some **bold** and _italic_ text.
- List item 1
- List item 2
`;
      const result = await MarkdownParser.parse(content);

      // Should strip markdown formatting
      expect(result.plainText).toContain('Title');
      expect(result.plainText).toContain('bold');
      expect(result.plainText).not.toContain('**');
      expect(result.plainText).not.toContain('_');
    });

    it('should calculate word count and reading time', async () => {
      const content = '# Title\n' + 'word '.repeat(200);

      const result = await MarkdownParser.parse(content);

      expect(result.wordCount).toBeGreaterThanOrEqual(200);
      expect(result.readingTimeMinutes).toBe(1); // ~200 words/min
    });

    it('should extract multiple code blocks with different languages', async () => {
      const content = `# Example
\`\`\`typescript
const x = 1;
\`\`\`

Some text

\`\`\`bash
echo "hello"
\`\`\`
`;
      const result = await MarkdownParser.parse(content);

      expect(result.codeBlocks).toHaveLength(2);
      expect(result.codeBlocks[0]?.language).toBe('typescript');
      expect(result.codeBlocks[1]?.language).toBe('bash');
    });
  });

  describe('parseDirectory', () => {
    it('should recursively parse all markdown files in directory', async () => {
      // Uses actual test fixtures directory
      const results = await MarkdownParser.parseDirectory('./docs/adr');

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('filePath');
      expect(results[0]).toHaveProperty('content');
    });

    it('should respect .gitignore patterns', async () => {
      const results = await MarkdownParser.parseDirectory('./');

      const nodeModulesFiles = results.filter(r =>
        r.filePath.includes('node_modules')
      );
      expect(nodeModulesFiles).toHaveLength(0);
    });

    it('should include file metadata (mtime, size)', async () => {
      const results = await MarkdownParser.parseDirectory('./docs/adr');

      expect(results[0]).toHaveProperty('metadata');
      expect(results[0]?.metadata).toHaveProperty('modifiedAt');
      expect(results[0]?.metadata).toHaveProperty('sizeBytes');
    });
  });

  describe('error handling', () => {
    it('should throw descriptive error for invalid markdown', async () => {
      // Extremely malformed content that can't be parsed
      await expect(MarkdownParser.parse(null as unknown as string))
        .rejects.toThrow('Invalid content: expected string');
    });

    it('should handle empty files gracefully', async () => {
      const result = await MarkdownParser.parse('');

      expect(result.plainText).toBe('');
      expect(result.headings).toEqual([]);
      expect(result.wordCount).toBe(0);
    });
  });
});

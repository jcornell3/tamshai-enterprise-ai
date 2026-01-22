/**
 * MCP Journey Server - Sprint 4 RED Phase Stub
 *
 * Main entry point for the MCP Journey server.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import type { Express } from 'express';

export interface McpServerConfig {
  port: number;
  dbPath: string;
}

/**
 * MCP Journey Server
 */
export class McpServer {
  constructor(private readonly config: McpServerConfig) {}

  /**
   * Start the MCP server.
   */
  async start(): Promise<Express> {
    throw new Error('Not implemented');
  }

  /**
   * Stop the MCP server.
   */
  async stop(): Promise<void> {
    throw new Error('Not implemented');
  }
}

// Re-export components
export * from './indexer/index-builder.js';
export * from './indexer/markdown-parser.js';
export * from './indexer/embedding-generator.js';
export * from './indexer/json-ld-extractor.js';
export * from './tools/index.js';
export * from './resources/index.js';
export * from './middleware/index.js';

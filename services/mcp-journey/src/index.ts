/**
 * MCP Journey Server - Sprint 4 GREEN Phase
 *
 * Main entry point for the MCP Journey server.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import express, { Express, Request, Response } from 'express';
import { requireGatewayAuth } from '@tamshai/shared';
import { IndexBuilder } from './indexer/index-builder.js';
import { EmbeddingGenerator } from './indexer/embedding-generator.js';
import { QueryFailuresTool } from './tools/query-failures.js';
import { LookupAdrTool } from './tools/lookup-adr.js';
import { SearchJourneyTool } from './tools/search-journey.js';
import { GetContextTool } from './tools/get-context.js';
import { ListPivotsTool } from './tools/list-pivots.js';
import { FailuresResource } from './resources/failures.js';
import { DecisionsResource } from './resources/decisions.js';
import { EvolutionResource } from './resources/evolution.js';
import { LessonsResource } from './resources/lessons.js';
import { PhoenixResource } from './resources/phoenix.js';
import { wrapWithIdentity } from './middleware/agent-identity.js';
import { burstLimiter } from './middleware/rate-limit.js';

export interface McpServerConfig {
  port: number;
  dbPath: string;
}

/**
 * MCP Journey Server
 */
export class McpServer {
  private app: Express;
  private index: IndexBuilder;
  private server: ReturnType<Express['listen']> | null = null;
  private startTime: number = 0;

  // Tools
  private queryFailuresTool: QueryFailuresTool;
  private lookupAdrTool: LookupAdrTool;
  private searchJourneyTool: SearchJourneyTool;
  private getContextTool: GetContextTool;
  private listPivotsTool: ListPivotsTool;

  // Resources
  private failuresResource: FailuresResource;
  private decisionsResource: DecisionsResource;
  private evolutionResource: EvolutionResource;
  private lessonsResource: LessonsResource;
  private phoenixResource: PhoenixResource;

  constructor(private readonly config: McpServerConfig) {
    this.app = express();
    this.index = new IndexBuilder({ dbPath: config.dbPath });

    // Initialize embedding generator (optional - uses GEMINI_API_KEY if available)
    const embeddingGenerator = new EmbeddingGenerator({
      apiKey: process.env.GEMINI_API_KEY || '',
    });

    // Initialize tools
    this.queryFailuresTool = new QueryFailuresTool(this.index);
    this.lookupAdrTool = new LookupAdrTool(this.index);
    this.searchJourneyTool = new SearchJourneyTool(this.index, embeddingGenerator);
    this.getContextTool = new GetContextTool(this.index);
    this.listPivotsTool = new ListPivotsTool(this.index);

    // Initialize resources
    this.failuresResource = new FailuresResource(this.index);
    this.decisionsResource = new DecisionsResource(this.index);
    this.evolutionResource = new EvolutionResource(this.index);
    this.lessonsResource = new LessonsResource(this.index);
    this.phoenixResource = new PhoenixResource(this.index);
  }

  /**
   * Start the MCP server.
   */
  async start(): Promise<Express> {
    this.startTime = Date.now();

    // Initialize database
    this.index.initialize();

    // Middleware
    this.app.use(express.json());

    // Gateway authentication middleware (prevents direct access bypass)
    // Health endpoints are automatically exempt
    this.app.use(requireGatewayAuth(process.env.MCP_INTERNAL_SECRET));

    // Health endpoint
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        service: 'mcp-journey',
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
      });
    });

    // Rate limiting for MCP endpoints
    this.app.use('/mcp', burstLimiter);

    // Tool endpoints
    this.app.post('/mcp/tools/:toolName', async (req: Request, res: Response): Promise<void> => {
      const { toolName } = req.params;
      const params = req.body;

      try {
        let result: unknown;

        switch (toolName) {
          case 'query_failures':
            if (!params.topic) {
              res.status(400).json({ error: 'Missing required parameter: topic' });
              return;
            }
            result = await this.queryFailuresTool.execute(params);
            break;

          case 'lookup_adr':
            if (!params.adr_id) {
              res.status(400).json({ error: 'Missing required parameter: adr_id' });
              return;
            }
            result = await this.lookupAdrTool.execute(params);
            break;

          case 'search_journey':
            if (!params.query) {
              res.status(400).json({ error: 'Missing required parameter: query' });
              return;
            }
            result = await this.searchJourneyTool.execute(params);
            break;

          case 'get_context':
            result = await this.getContextTool.execute(params);
            break;

          case 'list_pivots':
            result = await this.listPivotsTool.execute(params);
            break;

          default:
            // Security: Return generic error without user input
            res.status(404).json({ error: 'Unknown tool requested' });
            return;
        }

        // Wrap successful responses with identity metadata
        const wrappedResult = wrapWithIdentity(result, []);
        res.json(wrappedResult);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: message });
      }
    });

    // Resource list endpoint
    this.app.get('/mcp/resources', (_req: Request, res: Response) => {
      res.json({
        resourceTemplates: [
          'journey://failures/{topic}',
          'journey://decisions/{adr-id}',
          'journey://evolution/{component}',
          'journey://lessons',
          'journey://phoenix/{version}',
        ],
      });
    });

    // Resource read endpoint
    this.app.get('/mcp/resources/:uri(*)', async (req: Request, res: Response): Promise<void> => {
      const uri = req.params.uri;

      if (!uri) {
        res.status(400).json({ error: 'URI is required' });
        return;
      }

      try {
        // Parse URI
        const failuresMatch = uri.match(/^journey:\/\/failures\/(.+)$/);
        const decisionsMatch = uri.match(/^journey:\/\/decisions\/(.+)$/);
        const evolutionMatch = uri.match(/^journey:\/\/evolution\/(.+)$/);
        const lessonsMatch = uri.match(/^journey:\/\/lessons$/);
        const phoenixMatch = uri.match(/^journey:\/\/phoenix\/(.+)$/);

        let result;

        if (failuresMatch && failuresMatch[1]) {
          result = await this.failuresResource.read({ topic: failuresMatch[1] });
        } else if (decisionsMatch && decisionsMatch[1]) {
          result = await this.decisionsResource.read({ 'adr-id': decisionsMatch[1] });
        } else if (evolutionMatch && evolutionMatch[1]) {
          result = await this.evolutionResource.read({ component: evolutionMatch[1] });
        } else if (lessonsMatch) {
          result = await this.lessonsResource.read();
        } else if (phoenixMatch && phoenixMatch[1]) {
          result = await this.phoenixResource.read({ version: phoenixMatch[1] });
        } else {
          // Security: Return generic error without user input
          res.status(404).json({ error: 'Unknown resource URI requested' });
          return;
        }

        res.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes('not found') || message.includes('required')) {
          res.status(404).json({ error: message });
        } else {
          res.status(500).json({ error: message });
        }
      }
    });

    // Start server if port > 0
    if (this.config.port > 0) {
      this.server = this.app.listen(this.config.port);
    }

    return this.app;
  }

  /**
   * Stop the MCP server.
   */
  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.index.close();
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

// Start server if this is the main module
const PORT = parseInt(process.env.PORT || '3105', 10);
const DB_PATH = process.env.DB_PATH || './data/journey.db';

const server = new McpServer({ port: PORT, dbPath: DB_PATH });

server.start().then(() => {
  console.log(`MCP Journey server started on port ${PORT}`);
}).catch((error) => {
  console.error('Failed to start MCP Journey server:', error);
  process.exit(1);
});

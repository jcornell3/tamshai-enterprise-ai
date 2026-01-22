/**
 * MCP Server Integration Tests - Sprint 4 RED Phase
 *
 * These tests verify the full MCP server functionality.
 * All tests should FAIL initially (RED phase of TDD).
 *
 * Purpose: Test complete request/response cycle through MCP server.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpServer, McpServerConfig } from '@/index';
import request from 'supertest';
import type { Express } from 'express';

describe('MCP Server Integration', () => {
  let server: McpServer;
  let app: Express;

  beforeAll(async () => {
    const config: McpServerConfig = {
      port: 0, // Random available port
      dbPath: ':memory:' // In-memory database for tests
    };

    server = new McpServer(config);
    app = await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('health endpoint', () => {
    it('should return healthy status', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });

    it('should include service name in health response', async () => {
      const res = await request(app).get('/health');

      expect(res.body.service).toBe('mcp-journey');
    });

    it('should include uptime in health response', async () => {
      const res = await request(app).get('/health');

      expect(res.body.uptime).toBeDefined();
      expect(typeof res.body.uptime).toBe('number');
    });
  });

  describe('tool endpoints', () => {
    it('should execute query_failures tool', async () => {
      const res = await request(app)
        .post('/mcp/tools/query_failures')
        .send({ topic: 'keycloak' });

      expect(res.status).toBe(200);
      expect(res.body._meta?.source).toBe('tamshai-project-journey');
    });

    it('should execute lookup_adr tool', async () => {
      const res = await request(app)
        .post('/mcp/tools/lookup_adr')
        .send({ adr_id: 'ADR-001' });

      expect(res.status).toBe(200);
    });

    it('should execute search_journey tool', async () => {
      const res = await request(app)
        .post('/mcp/tools/search_journey')
        .send({ query: 'authentication' });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('should return 400 for invalid tool input', async () => {
      const res = await request(app)
        .post('/mcp/tools/query_failures')
        .send({ invalid_param: 'test' });

      expect(res.status).toBe(400);
    });

    it('should return 404 for unknown tool', async () => {
      const res = await request(app)
        .post('/mcp/tools/unknown_tool')
        .send({ param: 'test' });

      expect(res.status).toBe(404);
    });
  });

  describe('resource endpoints', () => {
    it('should read journey://failures/{topic}', async () => {
      const res = await request(app)
        .get('/mcp/resources/journey://failures/keycloak');

      expect(res.status).toBe(200);
      expect(res.body.contents).toBeDefined();
    });

    it('should read journey://decisions/{adr-id}', async () => {
      const res = await request(app)
        .get('/mcp/resources/journey://decisions/ADR-001');

      expect(res.status).toBe(200);
    });

    it('should list available resources', async () => {
      const res = await request(app).get('/mcp/resources');

      expect(res.status).toBe(200);
      expect(res.body.resourceTemplates).toContain('journey://failures/{topic}');
    });

    it('should return 404 for unknown resource URI', async () => {
      const res = await request(app)
        .get('/mcp/resources/unknown://resource');

      expect(res.status).toBe(404);
    });
  });

  describe('rate limiting', () => {
    it('should enforce burst limit', async () => {
      // Send 11 requests rapidly
      const promises = Array(11).fill(null).map(() =>
        request(app).post('/mcp/tools/search_journey').send({ query: 'test' })
      );

      const results = await Promise.all(promises);
      const rateLimited = results.filter(r => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should include rate limit headers', async () => {
      const res = await request(app)
        .post('/mcp/tools/search_journey')
        .send({ query: 'test' });

      expect(res.headers['x-ratelimit-limit']).toBeDefined();
      expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    });
  });

  describe('agent identity', () => {
    it('should include identity metadata in all tool responses', async () => {
      const res = await request(app)
        .post('/mcp/tools/search_journey')
        .send({ query: 'test' });

      expect(res.body._meta).toBeDefined();
      expect(res.body._meta.source).toBe('tamshai-project-journey');
    });

    it('should include disclaimer in all responses', async () => {
      const res = await request(app)
        .post('/mcp/tools/query_failures')
        .send({ topic: 'test' });

      expect(res.body._meta?.disclaimer).toBeDefined();
      expect(res.body._meta?.disclaimer).toContain('historical');
    });

    it('should not include identity metadata in error responses', async () => {
      const res = await request(app)
        .post('/mcp/tools/query_failures')
        .send({}); // Missing required topic

      expect(res.body._meta).toBeUndefined();
    });
  });
});

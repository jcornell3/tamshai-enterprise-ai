import request from 'supertest';
import { app } from '../app';

describe('Health Endpoint', () => {
  describe('GET /health', () => {
    it('should return 200 status code', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
    });

    it('should return healthy status', async () => {
      const response = await request(app).get('/health');
      expect(response.body.status).toBe('healthy');
    });

    it('should return service name as mcp-ui', async () => {
      const response = await request(app).get('/health');
      expect(response.body.service).toBe('mcp-ui');
    });

    it('should return version string', async () => {
      const response = await request(app).get('/health');
      expect(response.body.version).toBeDefined();
      expect(typeof response.body.version).toBe('string');
    });

    it('should return valid ISO timestamp', async () => {
      const response = await request(app).get('/health');
      expect(response.body.timestamp).toBeDefined();
      const parsed = new Date(response.body.timestamp);
      expect(parsed.toISOString()).toBe(response.body.timestamp);
    });

    it('should match complete health response schema', async () => {
      const response = await request(app).get('/health');
      expect(response.body).toEqual({
        status: 'healthy',
        service: 'mcp-ui',
        version: expect.any(String),
        timestamp: expect.any(String),
      });
    });
  });
});

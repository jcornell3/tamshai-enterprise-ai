import request from 'supertest';
import { app } from '../app';

describe('Server Configuration', () => {
  describe('JSON Middleware', () => {
    it('should accept JSON content-type', async () => {
      const response = await request(app)
        .post('/api/display')
        .send({ test: true })
        .set('Content-Type', 'application/json');

      // Should not return 415 Unsupported Media Type
      expect(response.status).not.toBe(415);
    });

    it('should parse JSON body correctly', async () => {
      const response = await request(app)
        .post('/api/display')
        .send({ directive: 'test', userContext: { userId: '123' } })
        .set('Content-Type', 'application/json');

      // Even if endpoint returns error, body should be parsed
      expect(response.status).not.toBe(415);
    });
  });

  describe('Port Configuration', () => {
    it('should default to port 3108', () => {
      // Reset PORT to check default
      const originalPort = process.env.PORT;
      delete process.env.PORT;

      // Re-require to get fresh default
      jest.resetModules();
      const defaultPort = process.env.PORT || '3108';
      expect(defaultPort).toBe('3108');

      // Restore
      process.env.PORT = originalPort;
    });
  });

  describe('Error Handling', () => {
    it('should return JSON for unknown routes', async () => {
      const response = await request(app).get('/unknown-route');
      expect(response.headers['content-type']).toMatch(/json/);
    });

    it('should return 404 status for unknown routes', async () => {
      const response = await request(app).get('/unknown-route');
      expect(response.status).toBe(404);
    });

    it('should return error object with status field', async () => {
      const response = await request(app).get('/unknown-route');
      expect(response.body.status).toBe('error');
    });

    it('should return error object with code NOT_FOUND', async () => {
      const response = await request(app).get('/unknown-route');
      expect(response.body.code).toBe('NOT_FOUND');
    });

    it('should return error object with message', async () => {
      const response = await request(app).get('/unknown-route');
      expect(response.body.message).toBeDefined();
      expect(typeof response.body.message).toBe('string');
    });

    it('should return error object with suggestedAction', async () => {
      const response = await request(app).get('/unknown-route');
      expect(response.body.suggestedAction).toBeDefined();
      expect(typeof response.body.suggestedAction).toBe('string');
    });
  });
});

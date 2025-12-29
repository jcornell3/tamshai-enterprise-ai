/**
 * Unit tests for Health Routes
 *
 * Tests health check endpoints and component status reporting.
 */

import request from 'supertest';
import express, { Express } from 'express';
import healthRoutes from './health.routes';
import * as redisModule from '../utils/redis';

// Mock the redis utility
jest.mock('../utils/redis', () => ({
  getTokenRevocationStats: jest.fn(),
}));

describe('Health Routes', () => {
  let app: Express;
  let mockGetTokenRevocationStats: jest.Mock;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Get the mocked function
    mockGetTokenRevocationStats = redisModule.getTokenRevocationStats as jest.Mock;

    // Create test Express app
    app = express();
    app.use(healthRoutes);
  });

  describe('GET /health', () => {
    test('returns 200 when system is healthy', async () => {
      mockGetTokenRevocationStats.mockReturnValue({
        isHealthy: true,
        cacheSize: 100,
        lastSyncTime: Date.now() - 1000, // 1 second ago
        consecutiveFailures: 0,
      });

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version', '0.1.0');
      expect(response.body).toHaveProperty('components');
      expect(response.body.components.tokenRevocationCache).toHaveProperty('status', 'healthy');
      expect(response.body.components.tokenRevocationCache).toHaveProperty('cacheSize', 100);
      expect(response.body.components.tokenRevocationCache).toHaveProperty('consecutiveFailures', 0);
    });

    test('returns 503 when system is degraded', async () => {
      mockGetTokenRevocationStats.mockReturnValue({
        isHealthy: false,
        cacheSize: 50,
        lastSyncTime: Date.now() - 10000, // 10 seconds ago
        consecutiveFailures: 3,
      });

      const response = await request(app).get('/health');

      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('status', 'degraded');
      expect(response.body.components.tokenRevocationCache).toHaveProperty('status', 'degraded');
      expect(response.body.components.tokenRevocationCache).toHaveProperty('consecutiveFailures', 3);
    });

    test('includes timestamp in ISO format', async () => {
      mockGetTokenRevocationStats.mockReturnValue({
        isHealthy: true,
        cacheSize: 0,
        lastSyncTime: Date.now(),
        consecutiveFailures: 0,
      });

      const response = await request(app).get('/health');

      expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test('includes lastSyncMs calculation', async () => {
      const fiveSecondsAgo = Date.now() - 5000;
      mockGetTokenRevocationStats.mockReturnValue({
        isHealthy: true,
        cacheSize: 25,
        lastSyncTime: fiveSecondsAgo,
        consecutiveFailures: 0,
      });

      const response = await request(app).get('/health');

      const lastSyncMs = response.body.components.tokenRevocationCache.lastSyncMs;
      expect(lastSyncMs).toBeGreaterThanOrEqual(5000);
      expect(lastSyncMs).toBeLessThan(6000); // Allow some test execution time
    });
  });

  describe('GET /api/health', () => {
    test('returns 200 when system is healthy', async () => {
      mockGetTokenRevocationStats.mockReturnValue({
        isHealthy: true,
        cacheSize: 150,
        lastSyncTime: Date.now() - 500,
        consecutiveFailures: 0,
      });

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version', '0.1.0');
    });

    test('includes detailed system information', async () => {
      mockGetTokenRevocationStats.mockReturnValue({
        isHealthy: true,
        cacheSize: 75,
        lastSyncTime: Date.now(),
        consecutiveFailures: 0,
      });

      const response = await request(app).get('/api/health');

      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('memory');
      expect(response.body).toHaveProperty('node');
      expect(response.body).toHaveProperty('env');
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });

    test('includes memory statistics', async () => {
      mockGetTokenRevocationStats.mockReturnValue({
        isHealthy: true,
        cacheSize: 0,
        lastSyncTime: Date.now(),
        consecutiveFailures: 0,
      });

      const response = await request(app).get('/api/health');

      expect(response.body.memory).toHaveProperty('rss');
      expect(response.body.memory).toHaveProperty('heapTotal');
      expect(response.body.memory).toHaveProperty('heapUsed');
      expect(response.body.memory).toHaveProperty('external');
      expect(typeof response.body.memory.rss).toBe('number');
      expect(typeof response.body.memory.heapUsed).toBe('number');
    });

    test('includes Node.js version', async () => {
      mockGetTokenRevocationStats.mockReturnValue({
        isHealthy: true,
        cacheSize: 0,
        lastSyncTime: Date.now(),
        consecutiveFailures: 0,
      });

      const response = await request(app).get('/api/health');

      expect(response.body.node).toMatch(/^v\d+\.\d+\.\d+/);
    });

    test('includes environment', async () => {
      mockGetTokenRevocationStats.mockReturnValue({
        isHealthy: true,
        cacheSize: 0,
        lastSyncTime: Date.now(),
        consecutiveFailures: 0,
      });

      const response = await request(app).get('/api/health');

      expect(response.body.env).toBeDefined();
      expect(typeof response.body.env).toBe('string');
    });

    test('returns 503 when system is degraded', async () => {
      mockGetTokenRevocationStats.mockReturnValue({
        isHealthy: false,
        cacheSize: 10,
        lastSyncTime: Date.now() - 20000,
        consecutiveFailures: 5,
      });

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('status', 'degraded');
      expect(response.body.components.tokenRevocationCache.status).toBe('degraded');
      expect(response.body.components.tokenRevocationCache.consecutiveFailures).toBe(5);
    });

    test('includes component health status', async () => {
      mockGetTokenRevocationStats.mockReturnValue({
        isHealthy: true,
        cacheSize: 200,
        lastSyncTime: Date.now() - 1500,
        consecutiveFailures: 0,
      });

      const response = await request(app).get('/api/health');

      expect(response.body.components).toHaveProperty('tokenRevocationCache');
      expect(response.body.components.tokenRevocationCache).toHaveProperty('status');
      expect(response.body.components.tokenRevocationCache).toHaveProperty('cacheSize');
      expect(response.body.components.tokenRevocationCache).toHaveProperty('lastSyncMs');
      expect(response.body.components.tokenRevocationCache).toHaveProperty('consecutiveFailures');
    });
  });

  describe('Edge Cases', () => {
    test('handles zero cache size', async () => {
      mockGetTokenRevocationStats.mockReturnValue({
        isHealthy: true,
        cacheSize: 0,
        lastSyncTime: Date.now(),
        consecutiveFailures: 0,
      });

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.components.tokenRevocationCache.cacheSize).toBe(0);
    });

    test('handles very old last sync time', async () => {
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      mockGetTokenRevocationStats.mockReturnValue({
        isHealthy: false,
        cacheSize: 5,
        lastSyncTime: oneHourAgo,
        consecutiveFailures: 10,
      });

      const response = await request(app).get('/health');

      expect(response.status).toBe(503);
      const lastSyncMs = response.body.components.tokenRevocationCache.lastSyncMs;
      expect(lastSyncMs).toBeGreaterThanOrEqual(60 * 60 * 1000);
    });
  });
});

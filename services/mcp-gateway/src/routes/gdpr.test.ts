/**
 * Unit tests for GDPR Routes
 *
 * Tests GDPR compliance endpoints:
 * - Data export (Art. 15)
 * - Data erasure (Art. 17)
 * - Breach notification (Art. 33)
 */

import request from 'supertest';
import express, { Express, Request } from 'express';
import gdprRoutes from './gdpr';

// Authenticated request type for tests
interface AuthenticatedRequest extends Request {
  userContext?: {
    userId: string;
    username: string;
    email?: string;
    roles: string[];
  };
}

// Mock uuid to return unique predictable IDs
let uuidCounter = 0;
jest.mock('uuid', () => ({
  v4: jest.fn(() => `test-uuid-${++uuidCounter}`),
}));

describe('GDPR Routes', () => {
  let app: Express;

  beforeEach(() => {
    // Reset UUID counter for each test
    uuidCounter = 0;

    // Create a test Express app
    app = express();
    app.use(express.json());

    // Add middleware to inject userContext for testing
    app.use((req, _res, next) => {
      // Default: hr-write role (authorized)
      (req as AuthenticatedRequest).userContext = {
        userId: 'test-user-123',
        username: 'test.user',
        email: 'test@example.com',
        roles: ['hr-write'],
      };
      next();
    });

    app.use('/api/admin/gdpr', gdprRoutes);
  });

  describe('Access Control - requireHRRole middleware', () => {
    test('allows access with hr-write role', async () => {
      const response = await request(app)
        .post('/api/admin/gdpr/export')
        .send({ employeeId: 'emp-123', reason: 'Employee request' });

      // Should not get 403
      expect(response.status).not.toBe(403);
    });

    test('allows access with security-admin role', async () => {
      // Override middleware for this test
      const testApp = express();
      testApp.use(express.json());
      testApp.use((req, _res, next) => {
        (req as AuthenticatedRequest).userContext = {
          userId: 'security-admin-123',
          username: 'security.admin',
          roles: ['security-admin'],
        };
        next();
      });
      testApp.use('/api/admin/gdpr', gdprRoutes);

      const response = await request(testApp)
        .post('/api/admin/gdpr/export')
        .send({ employeeId: 'emp-123', reason: 'Security audit' });

      expect(response.status).not.toBe(403);
    });

    test('denies access without proper role', async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use((req, _res, next) => {
        (req as AuthenticatedRequest).userContext = {
          userId: 'regular-user-123',
          username: 'regular.user',
          roles: ['user'],
        };
        next();
      });
      testApp.use('/api/admin/gdpr', gdprRoutes);

      const response = await request(testApp)
        .post('/api/admin/gdpr/export')
        .send({ employeeId: 'emp-123' });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('hr-write or security-admin');
    });

    test('denies access without authentication', async () => {
      const testApp = express();
      testApp.use(express.json());
      // No userContext middleware
      testApp.use('/api/admin/gdpr', gdprRoutes);

      const response = await request(testApp)
        .post('/api/admin/gdpr/export')
        .send({ employeeId: 'emp-123' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Authentication required');
    });
  });

  describe('POST /export - Data Export Request', () => {
    test('creates export request with valid input', async () => {
      const response = await request(app)
        .post('/api/admin/gdpr/export')
        .send({
          employeeId: 'emp-123',
          reason: 'Employee data access request',
        });

      expect(response.status).toBe(202);
      expect(response.body).toHaveProperty('exportId');
      expect(response.body).toHaveProperty('status', 'processing');
      expect(response.body).toHaveProperty('employeeId', 'emp-123');
      expect(response.body).toHaveProperty('downloadUrl');
    });

    test('requires employeeId', async () => {
      const response = await request(app)
        .post('/api/admin/gdpr/export')
        .send({
          reason: 'Missing employeeId',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('employeeId is required');
    });

    test('accepts export without reason', async () => {
      const response = await request(app)
        .post('/api/admin/gdpr/export')
        .send({
          employeeId: 'emp-456',
        });

      expect(response.status).toBe(202);
      expect(response.body).toHaveProperty('exportId');
    });
  });

  describe('GET /export/:exportId/download - Download Export', () => {
    test('downloads completed export', async () => {
      // First create an export
      const createResponse = await request(app)
        .post('/api/admin/gdpr/export')
        .send({ employeeId: 'emp-789', reason: 'Test download' });

      const exportId = createResponse.body.exportId;

      // Then download it (wait for async completion)
      await new Promise(resolve => setTimeout(resolve, 2500));

      const downloadResponse = await request(app)
        .get(`/api/admin/gdpr/export/${exportId}/download`);

      expect(downloadResponse.status).toBe(200);
      expect(downloadResponse.body).toHaveProperty('subject');
      expect(downloadResponse.body).toHaveProperty('exportDate');
      expect(downloadResponse.body).toHaveProperty('data');
    });

    test('returns 404 for non-existent export', async () => {
      const response = await request(app)
        .get('/api/admin/gdpr/export/non-existent-id/download');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('not found');
    });
  });

  describe('POST /erase - Data Erasure Request', () => {
    test('creates erasure request with valid input', async () => {
      const response = await request(app)
        .post('/api/admin/gdpr/erase')
        .send({
          employeeId: 'emp-delete-123',
          reason: 'Employee right to erasure request',
          retainAuditLog: true,
          retainFinancialRecords: true,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('erasureId');
      expect(response.body).toHaveProperty('status', 'pending_confirmation');
      expect(response.body).toHaveProperty('employeeId', 'emp-delete-123');
      expect(response.body).toHaveProperty('affectedSystems');
      expect(response.body).toHaveProperty('retentionExceptions');
      expect(response.body).toHaveProperty('confirmationRequired', true);
    });

    test('requires employeeId', async () => {
      const response = await request(app)
        .post('/api/admin/gdpr/erase')
        .send({
          reason: 'Missing employeeId',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('employeeId is required');
    });

    test('uses default retention flags when not specified', async () => {
      const response = await request(app)
        .post('/api/admin/gdpr/erase')
        .send({
          employeeId: 'emp-default-456',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'pending_confirmation');
      expect(response.body).toHaveProperty('retentionExceptions');
      expect(Array.isArray(response.body.retentionExceptions)).toBe(true);
    });
  });

  describe('POST /erase/:erasureId/confirm - Confirm Erasure', () => {
    test('confirms pending erasure', async () => {
      // First create an erasure request
      const createResponse = await request(app)
        .post('/api/admin/gdpr/erase')
        .send({ employeeId: 'emp-confirm-123' });

      const erasureId = createResponse.body.erasureId;

      // Then confirm it
      const confirmResponse = await request(app)
        .post(`/api/admin/gdpr/erase/${erasureId}/confirm`)
        .send({ confirmed: true });

      expect(confirmResponse.status).toBe(200);
      expect(confirmResponse.body).toHaveProperty('status', 'processing');
      expect(confirmResponse.body).toHaveProperty('erasureId', erasureId);
      expect(confirmResponse.body).toHaveProperty('message');
    });

    test('cancels erasure when not confirmed', async () => {
      // Create erasure request
      const createResponse = await request(app)
        .post('/api/admin/gdpr/erase')
        .send({ employeeId: 'emp-cancel-456' });

      const erasureId = createResponse.body.erasureId;

      // Cancel it
      const cancelResponse = await request(app)
        .post(`/api/admin/gdpr/erase/${erasureId}/confirm`)
        .send({ confirmed: false });

      expect(cancelResponse.status).toBe(200);
      expect(cancelResponse.body).toHaveProperty('status', 'cancelled');
    });

    test('returns 404 for non-existent erasure', async () => {
      const response = await request(app)
        .post('/api/admin/gdpr/erase/non-existent-id/confirm')
        .send({ confirmed: true });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    test('treats missing confirmed field as cancellation', async () => {
      // Create erasure request
      const createResponse = await request(app)
        .post('/api/admin/gdpr/erase')
        .send({ employeeId: 'emp-missing-confirm' });

      const erasureId = createResponse.body.erasureId;

      // Send request without 'confirmed' field (treated as false)
      const confirmResponse = await request(app)
        .post(`/api/admin/gdpr/erase/${erasureId}/confirm`)
        .send({});

      expect(confirmResponse.status).toBe(200);
      expect(confirmResponse.body).toHaveProperty('status', 'cancelled');
    });
  });

  describe('GET /erase/:erasureId - Get Erasure Status', () => {
    test('retrieves erasure status', async () => {
      // Create erasure request
      const createResponse = await request(app)
        .post('/api/admin/gdpr/erase')
        .send({ employeeId: 'emp-status-123' });

      const erasureId = createResponse.body.erasureId;

      // Get status
      const statusResponse = await request(app)
        .get(`/api/admin/gdpr/erase/${erasureId}`);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body).toHaveProperty('erasureId', erasureId);
      expect(statusResponse.body).toHaveProperty('status');
      expect(statusResponse.body).toHaveProperty('employeeId');
    });

    test('returns 404 for non-existent erasure', async () => {
      const response = await request(app)
        .get('/api/admin/gdpr/erase/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /breach - Register Data Breach', () => {
    test('registers breach with valid input', async () => {
      const response = await request(app)
        .post('/api/admin/gdpr/breach')
        .send({
          breachType: 'unauthorized_access',
          affectedDataTypes: ['employee_records', 'salary_data'],
          affectedCount: 150,
          description: 'Unauthorized access to HR database',
          discoveryDate: new Date().toISOString(),
          containmentActions: ['Disabled compromised accounts', 'Reset passwords'],
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('breachId');
      expect(response.body).toHaveProperty('status', 'registered');
      expect(response.body).toHaveProperty('notificationDeadline');
      expect(response.body).toHaveProperty('hoursRemaining');
      expect(response.body).toHaveProperty('requiredActions');
      expect(Array.isArray(response.body.requiredActions)).toBe(true);
    });

    test('requires breachType', async () => {
      const response = await request(app)
        .post('/api/admin/gdpr/breach')
        .send({
          affectedDataTypes: ['employee_records'],
          affectedCount: 100,
          description: 'Test breach',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    test('accepts breach without affectedDataTypes (uses default)', async () => {
      const response = await request(app)
        .post('/api/admin/gdpr/breach')
        .send({
          breachType: 'data_loss',
          affectedCount: 100,
          discoveryDate: new Date().toISOString(),
          description: 'Test breach without data types',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('breachId');
    });

    test('accepts breach without affectedCount (uses default)', async () => {
      const response = await request(app)
        .post('/api/admin/gdpr/breach')
        .send({
          breachType: 'data_loss',
          affectedDataTypes: ['employee_records'],
          discoveryDate: new Date().toISOString(),
          description: 'Test breach without count',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('breachId');
    });

    test('requires description', async () => {
      const response = await request(app)
        .post('/api/admin/gdpr/breach')
        .send({
          breachType: 'data_loss',
          affectedDataTypes: ['employee_records'],
          affectedCount: 100,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    test('sets 72-hour notification deadline', async () => {
      const now = new Date();
      const response = await request(app)
        .post('/api/admin/gdpr/breach')
        .send({
          breachType: 'disclosure',
          affectedDataTypes: ['personal_data'],
          affectedCount: 50,
          description: 'Accidental disclosure',
          discoveryDate: now.toISOString(),
          containmentActions: ['Contained'],
        });

      expect(response.status).toBe(201);

      const deadline = new Date(response.body.notificationDeadline);
      const expectedDeadline = new Date(now);
      expectedDeadline.setHours(expectedDeadline.getHours() + 72);

      // Allow 1 second tolerance for test execution time
      const timeDiff = Math.abs(deadline.getTime() - expectedDeadline.getTime());
      expect(timeDiff).toBeLessThan(1000);
    });
  });

  describe('GET /breach/:breachId - Get Breach Details', () => {
    test('retrieves breach details', async () => {
      // Create breach
      const createResponse = await request(app)
        .post('/api/admin/gdpr/breach')
        .send({
          breachType: 'system_compromise',
          affectedDataTypes: ['employee_data'],
          affectedCount: 200,
          description: 'System compromised',
          discoveryDate: new Date().toISOString(),
          containmentActions: ['System isolated'],
        });

      const breachId = createResponse.body.breachId;

      // Get details
      const detailsResponse = await request(app)
        .get(`/api/admin/gdpr/breach/${breachId}`);

      expect(detailsResponse.status).toBe(200);
      expect(detailsResponse.body).toHaveProperty('breachId', breachId);
      expect(detailsResponse.body).toHaveProperty('status');
      expect(detailsResponse.body).toHaveProperty('breachType');
    });

    test('returns 404 for non-existent breach', async () => {
      const response = await request(app)
        .get('/api/admin/gdpr/breach/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /breach - List All Breaches', () => {
    test('returns empty array when no breaches', async () => {
      const response = await request(app).get('/api/admin/gdpr/breach');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('breaches');
      expect(Array.isArray(response.body.breaches)).toBe(true);
    });

    test('lists all registered breaches', async () => {
      // Create multiple breaches
      await request(app)
        .post('/api/admin/gdpr/breach')
        .send({
          breachType: 'unauthorized_access',
          affectedDataTypes: ['data1'],
          affectedCount: 10,
          description: 'Breach 1',
          discoveryDate: new Date().toISOString(),
        });

      await request(app)
        .post('/api/admin/gdpr/breach')
        .send({
          breachType: 'data_loss',
          affectedDataTypes: ['data2'],
          affectedCount: 20,
          description: 'Breach 2',
          discoveryDate: new Date().toISOString(),
        });

      const response = await request(app).get('/api/admin/gdpr/breach');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('breaches');
      expect(response.body.breaches.length).toBeGreaterThanOrEqual(2);
      expect(response.body).toHaveProperty('total');
      expect(response.body.total).toBeGreaterThanOrEqual(2);
    });
  });
});

/**
 * Display Route Error Handling Tests
 *
 * Tests specifically for error paths in the display route,
 * including MCP call failures, network errors, and edge cases.
 */
import request from 'supertest';

// Mock the MCP client BEFORE importing app
const mockCallMCPTool = jest.fn();

jest.mock('../../mcp/mcp-client', () => ({
  callMCPTool: mockCallMCPTool,
  setAuthService: jest.fn(),
}));

// Mock logger to prevent console noise during tests
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Import app after mock is set up
import { app } from '../../app';

beforeEach(() => {
  mockCallMCPTool.mockReset();
});

describe('POST /api/display - Error Handling', () => {
  const validRequest = {
    directive: 'display:hr:org_chart:userId=me',
    userContext: { userId: 'user-123', roles: ['hr-read'] },
  };

  describe('MCP Network Errors', () => {
    it('returns 500 when MCP call throws network error', async () => {
      mockCallMCPTool.mockRejectedValue(new Error('Network Error'));

      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      expect(response.status).toBe(500);
      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('MCP_ERROR');
    });

    it('returns suggestedAction on MCP error', async () => {
      mockCallMCPTool.mockRejectedValue(new Error('Connection refused'));

      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      expect(response.body.suggestedAction).toBeDefined();
      expect(response.body.suggestedAction).toContain('MCP server');
    });

    it('returns appropriate message on MCP failure', async () => {
      mockCallMCPTool.mockRejectedValue(new Error('ECONNREFUSED'));

      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      expect(response.body.message).toContain('Failed to fetch');
    });
  });

  describe('MCP Timeout Errors', () => {
    it('returns 500 when MCP call times out', async () => {
      mockCallMCPTool.mockRejectedValue(new Error('timeout of 30000ms exceeded'));

      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      expect(response.status).toBe(500);
      expect(response.body.code).toBe('MCP_ERROR');
    });
  });

  describe('MCP Server Errors', () => {
    it('returns 500 when MCP server returns 500', async () => {
      const error = new Error('Request failed with status code 500');
      (error as any).response = { status: 500 };
      mockCallMCPTool.mockRejectedValue(error);

      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      expect(response.status).toBe(500);
      expect(response.body.code).toBe('MCP_ERROR');
    });

    it('returns 500 when MCP server returns 503', async () => {
      const error = new Error('Service Unavailable');
      (error as any).response = { status: 503 };
      mockCallMCPTool.mockRejectedValue(error);

      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      expect(response.status).toBe(500);
    });
  });

  describe('Multi-call Component Errors', () => {
    const approvalsRequest = {
      directive: 'display:approvals:pending:userId=me',
      userContext: { userId: 'user-123', roles: ['hr-read', 'finance-read'] },
    };

    it('returns 500 when first MCP call fails in multi-call component', async () => {
      mockCallMCPTool.mockRejectedValueOnce(new Error('First call failed'));

      const response = await request(app)
        .post('/api/display')
        .send(approvalsRequest);

      expect(response.status).toBe(500);
      expect(response.body.code).toBe('MCP_ERROR');
    });

    it('returns 500 when any MCP call fails in Promise.all', async () => {
      // First call succeeds, second fails
      mockCallMCPTool
        .mockResolvedValueOnce({
          status: 'success',
          data: { timeOffRequests: [] },
        })
        .mockRejectedValueOnce(new Error('Second call failed'));

      const response = await request(app)
        .post('/api/display')
        .send(approvalsRequest);

      expect(response.status).toBe(500);
    });
  });

  describe('MCP Response Status Error', () => {
    it('handles MCP error response gracefully', async () => {
      mockCallMCPTool.mockResolvedValue({
        status: 'error',
        code: 'NOT_FOUND',
        message: 'Resource not found',
        suggestedAction: 'Check ID',
      });

      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      // The route returns success because axios doesn't throw for error status
      // The transform will work on empty data
      expect(response.status).toBe(200);
    });

    it('handles pending_confirmation response', async () => {
      mockCallMCPTool.mockResolvedValue({
        status: 'pending_confirmation',
        confirmationId: 'conf-123',
        message: 'Please confirm',
      });

      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      // Should still return 200 but with empty transformed data
      expect(response.status).toBe(200);
    });
  });

  describe('Truncation Detection', () => {
    it('detects truncation in MCP response', async () => {
      mockCallMCPTool.mockResolvedValue({
        status: 'success',
        data: { manager: { name: 'Boss' }, employee: { name: 'Me' } },
        metadata: { truncated: true, totalCount: '100+' },
      });

      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body.metadata.truncated).toBe(true);
    });

    it('returns truncated=false when not truncated', async () => {
      mockCallMCPTool.mockResolvedValue({
        status: 'success',
        data: { manager: { name: 'Boss' }, employee: { name: 'Me' } },
        metadata: { truncated: false },
      });

      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      expect(response.body.metadata.truncated).toBe(false);
    });

    it('returns truncated=false when metadata is absent', async () => {
      mockCallMCPTool.mockResolvedValue({
        status: 'success',
        data: { manager: { name: 'Boss' }, employee: { name: 'Me' } },
      });

      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      expect(response.body.metadata.truncated).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('handles null response data from MCP', async () => {
      mockCallMCPTool.mockResolvedValue({
        status: 'success',
        data: null,
      });

      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      // Should handle gracefully
      expect(response.status).toBe(200);
    });

    it('handles undefined response data from MCP', async () => {
      mockCallMCPTool.mockResolvedValue({
        status: 'success',
        data: undefined,
      });

      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      expect(response.status).toBe(200);
    });

    it('handles empty object response from MCP', async () => {
      mockCallMCPTool.mockResolvedValue({
        status: 'success',
        data: {},
      });

      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body.component.props).toBeDefined();
    });

    it('merges data from multiple successful MCP calls', async () => {
      const approvalsRequest = {
        directive: 'display:approvals:pending:userId=me',
        userContext: { userId: 'user-123', roles: ['hr-read', 'finance-read'] },
      };

      mockCallMCPTool
        .mockResolvedValueOnce({
          status: 'success',
          data: { timeOffRequests: [{ id: 't1' }] },
        })
        .mockResolvedValueOnce({
          status: 'success',
          data: { expenseReports: [{ id: 'e1' }, { id: 'e2' }] },
        })
        .mockResolvedValueOnce({
          status: 'success',
          data: { budgetAmendments: [] },
        });

      const response = await request(app)
        .post('/api/display')
        .send(approvalsRequest);

      expect(response.status).toBe(200);
      expect(response.body.component.props.timeOffRequests).toHaveLength(1);
      expect(response.body.component.props.expenseReports).toHaveLength(2);
      expect(response.body.component.props.budgetAmendments).toHaveLength(0);
    });
  });
});

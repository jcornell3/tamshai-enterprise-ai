/**
 * Display Route Tests - GREEN Phase
 *
 * Tests for POST /api/display and GET /api/display/components endpoints.
 * Tests verify the implementation meets requirements.
 */
import request from 'supertest';

// Mock the MCP client BEFORE importing app
const mockCallMCPTool = jest.fn().mockResolvedValue({
  status: 'success',
  data: {
    manager: { id: '1', name: 'Alice Chen' },
    employee: { id: '2', name: 'Test User' },
    peers: [],
    directReports: [{ id: '3', name: 'Bob' }],
  },
});

jest.mock('../../mcp/mcp-client', () => ({
  callMCPTool: mockCallMCPTool,
  setAuthService: jest.fn(),
}));

// Import app after mock is set up
import { app } from '../../app';

beforeEach(() => {
  // Reset mock before each test
  mockCallMCPTool.mockClear();
  mockCallMCPTool.mockResolvedValue({
    status: 'success',
    data: {
      manager: { id: '1', name: 'Alice Chen' },
      employee: { id: '2', name: 'Test User' },
      peers: [],
      directReports: [{ id: '3', name: 'Bob' }],
    },
  });
});

describe('POST /api/display', () => {
  const validRequest = {
    directive: 'display:hr:org_chart:userId=me,depth=1',
    userContext: { userId: 'user-123', roles: ['hr-read'] },
  };

  describe('Success Cases', () => {
    it('returns 200 for valid directive', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      expect(response.status).toBe(200);
    });

    it('returns success status in body', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      expect(response.body.status).toBe('success');
    });

    it('returns component with correct type', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      expect(response.body.component).toBeDefined();
      expect(response.body.component.type).toBe('OrgChartComponent');
    });

    it('returns component props from transform', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      expect(response.body.component.props).toBeDefined();
      expect(response.body.component.props.self).toBeDefined();
    });

    it('returns narration with text', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      expect(response.body.narration).toBeDefined();
      expect(response.body.narration.text).toBeDefined();
      expect(typeof response.body.narration.text).toBe('string');
    });

    it('returns metadata with dataFreshness timestamp', async () => {
      const response = await request(app)
        .post('/api/display')
        .send(validRequest);

      expect(response.body.metadata).toBeDefined();
      expect(response.body.metadata.dataFreshness).toBeDefined();
      // Should be valid ISO timestamp
      const date = new Date(response.body.metadata.dataFreshness);
      expect(date.toISOString()).toBe(response.body.metadata.dataFreshness);
    });

    it('handles different component types', async () => {
      const approvalRequest = {
        directive: 'display:approvals:pending:userId=me',
        userContext: { userId: 'user-123', roles: ['hr-read', 'finance-read'] },
      };

      const response = await request(app)
        .post('/api/display')
        .send(approvalRequest);

      expect(response.body.component.type).toBe('ApprovalsQueue');
    });
  });

  describe('Error Cases', () => {
    it('returns 400 for invalid directive format', async () => {
      const response = await request(app)
        .post('/api/display')
        .send({ ...validRequest, directive: 'invalid-directive' });

      expect(response.status).toBe(400);
    });

    it('returns INVALID_DIRECTIVE error code', async () => {
      const response = await request(app)
        .post('/api/display')
        .send({ ...validRequest, directive: 'not-a-directive' });

      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('INVALID_DIRECTIVE');
    });

    it('returns suggestedAction for invalid directive', async () => {
      const response = await request(app)
        .post('/api/display')
        .send({ ...validRequest, directive: 'bad' });

      expect(response.body.suggestedAction).toBeDefined();
      expect(typeof response.body.suggestedAction).toBe('string');
    });

    it('returns 404 for unknown component', async () => {
      const response = await request(app)
        .post('/api/display')
        .send({ ...validRequest, directive: 'display:unknown:thing:id=1' });

      expect(response.status).toBe(404);
    });

    it('returns UNKNOWN_COMPONENT error code', async () => {
      const response = await request(app)
        .post('/api/display')
        .send({ ...validRequest, directive: 'display:fake:component:x=y' });

      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('UNKNOWN_COMPONENT');
    });

    it('returns 400 for missing directive field', async () => {
      const response = await request(app)
        .post('/api/display')
        .send({ userContext: validRequest.userContext });

      expect(response.status).toBe(400);
    });

    it('returns 400 for missing userContext field', async () => {
      const response = await request(app)
        .post('/api/display')
        .send({ directive: validRequest.directive });

      expect(response.status).toBe(400);
    });

    it('returns MISSING_FIELD error for missing fields', async () => {
      const response = await request(app)
        .post('/api/display')
        .send({});

      expect(response.body.code).toBe('MISSING_FIELD');
    });
  });
});

describe('GET /api/display/components', () => {
  it('returns 200 status', async () => {
    const response = await request(app).get('/api/display/components');
    expect(response.status).toBe(200);
  });

  it('returns array of components', async () => {
    const response = await request(app).get('/api/display/components');
    expect(response.body.components).toBeInstanceOf(Array);
  });

  it('returns exactly 7 components', async () => {
    const response = await request(app).get('/api/display/components');
    expect(response.body.components.length).toBe(7);
  });

  it('each component has type field', async () => {
    const response = await request(app).get('/api/display/components');
    for (const comp of response.body.components) {
      expect(comp.type).toBeDefined();
      expect(typeof comp.type).toBe('string');
    }
  });

  it('each component has directivePattern field', async () => {
    const response = await request(app).get('/api/display/components');
    for (const comp of response.body.components) {
      expect(comp.directivePattern).toBeDefined();
      expect(comp.directivePattern).toMatch(/^display:\w+:\w+:/);
    }
  });

  it('each component has description field', async () => {
    const response = await request(app).get('/api/display/components');
    for (const comp of response.body.components) {
      expect(comp.description).toBeDefined();
      expect(typeof comp.description).toBe('string');
    }
  });

  it('includes OrgChartComponent', async () => {
    const response = await request(app).get('/api/display/components');
    const orgChart = response.body.components.find(
      (c: { type: string }) => c.type === 'OrgChartComponent'
    );
    expect(orgChart).toBeDefined();
    expect(orgChart.directivePattern).toContain('hr:org_chart');
  });

  it('includes ApprovalsQueue', async () => {
    const response = await request(app).get('/api/display/components');
    const approvals = response.body.components.find(
      (c: { type: string }) => c.type === 'ApprovalsQueue'
    );
    expect(approvals).toBeDefined();
    expect(approvals.directivePattern).toContain('approvals:pending');
  });
});

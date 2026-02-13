/**
 * Unit tests for Get Org Chart Tool
 *
 * Tests the hierarchical org chart retrieval functionality
 * including tree building and RLS enforcement.
 */

import { getOrgChart, GetOrgChartInputSchema, OrgChartNode } from './get-org-chart';
import * as connection from '../database/connection';

// Mock database connection
jest.mock('../database/connection', () => ({
  queryWithRLS: jest.fn(),
}));

const mockedQueryWithRLS = connection.queryWithRLS as jest.MockedFunction<
  typeof connection.queryWithRLS
>;

describe('GetOrgChartInputSchema', () => {
  it('should accept empty input (full org chart)', () => {
    const result = GetOrgChartInputSchema.parse({});
    expect(result.rootEmployeeId).toBeUndefined();
    expect(result.maxDepth).toBe(10); // default
  });

  it('should accept valid rootEmployeeId', () => {
    const result = GetOrgChartInputSchema.parse({
      rootEmployeeId: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(result.rootEmployeeId).toBe('123e4567-e89b-12d3-a456-426614174000');
  });

  it('should accept maxDepth parameter', () => {
    const result = GetOrgChartInputSchema.parse({ maxDepth: 5 });
    expect(result.maxDepth).toBe(5);
  });

  it('should accept any string for rootEmployeeId (relaxed validation)', () => {
    // Validation relaxed from .uuid() to .string().optional() to support
    // both UUID and VARCHAR keycloak_user_id lookups (see commit a8ac80a9)
    const result = GetOrgChartInputSchema.parse({ rootEmployeeId: 'not-a-uuid' });
    expect(result.rootEmployeeId).toBe('not-a-uuid');
  });

  it('should reject maxDepth greater than 10', () => {
    expect(() => GetOrgChartInputSchema.parse({ maxDepth: 11 })).toThrow();
  });

  it('should reject maxDepth less than 1', () => {
    expect(() => GetOrgChartInputSchema.parse({ maxDepth: 0 })).toThrow();
  });
});

describe('getOrgChart', () => {
  const mockUserContext = {
    userId: 'user-123',
    username: 'alice.chen',
    email: 'alice@tamshai.com',
    roles: ['hr-read'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return entire org chart when no rootEmployeeId provided', async () => {
    mockedQueryWithRLS.mockResolvedValue({
      rows: [
        {
          employee_id: 'ceo-001',
          first_name: 'Eve',
          last_name: 'Thompson',
          email: 'eve@tamshai.com',
          title: 'CEO',
          department: 'Executive',
          location: 'Seattle, WA',
          manager_id: null,
          level: 0,
        },
        {
          employee_id: 'vp-001',
          first_name: 'Alice',
          last_name: 'Chen',
          email: 'alice@tamshai.com',
          title: 'VP of HR',
          department: 'Human Resources',
          location: 'Seattle, WA',
          manager_id: 'ceo-001',
          level: 1,
        },
      ],
      rowCount: 2,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await getOrgChart({}, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data).toHaveLength(1); // One root node (CEO)
      expect(result.data[0].full_name).toBe('Eve Thompson');
      expect(result.data[0].direct_reports).toHaveLength(1); // VP reports to CEO
      expect(result.data[0].direct_reports[0].full_name).toBe('Alice Chen');
      expect(result.metadata?.returnedCount).toBe(2);
    }
  });

  it('should return org chart starting from specific employee', async () => {
    const rootEmployeeId = '123e4567-e89b-12d3-a456-426614174000';

    mockedQueryWithRLS.mockResolvedValue({
      rows: [
        {
          employee_id: rootEmployeeId,
          first_name: 'Alice',
          last_name: 'Chen',
          email: 'alice@tamshai.com',
          title: 'VP of HR',
          department: 'Human Resources',
          location: 'Seattle, WA',
          manager_id: 'ceo-001', // Not null but will be the "root" since we're filtering
          level: 0,
        },
        {
          employee_id: 'mgr-001',
          first_name: 'Jennifer',
          last_name: 'Lee',
          email: 'jennifer@tamshai.com',
          title: 'HR Manager',
          department: 'Human Resources',
          location: 'Seattle, WA',
          manager_id: rootEmployeeId,
          level: 1,
        },
      ],
      rowCount: 2,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await getOrgChart({ rootEmployeeId }, mockUserContext);

    expect(result.status).toBe('success');
    // Query was called with rootEmployeeId in the params array
    expect(mockedQueryWithRLS).toHaveBeenCalledWith(
      mockUserContext,
      expect.any(String),
      expect.arrayContaining([rootEmployeeId])
    );
  });

  it('should return error when employee not found', async () => {
    mockedQueryWithRLS.mockResolvedValue({
      rows: [],
      rowCount: 0,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await getOrgChart(
      { rootEmployeeId: '00000000-0000-0000-0000-000000000000' },
      mockUserContext
    );

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('EMPLOYEE_NOT_FOUND');
    }
  });

  it('should return empty array when no employees exist (no root specified)', async () => {
    mockedQueryWithRLS.mockResolvedValue({
      rows: [],
      rowCount: 0,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await getOrgChart({}, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data).toEqual([]);
    }
  });

  it('should build correct hierarchical tree with multiple levels', async () => {
    mockedQueryWithRLS.mockResolvedValue({
      rows: [
        {
          employee_id: 'ceo-001',
          first_name: 'Eve',
          last_name: 'Thompson',
          email: 'eve@tamshai.com',
          title: 'CEO',
          department: 'Executive',
          location: 'Seattle, WA',
          manager_id: null,
          level: 0,
        },
        {
          employee_id: 'vp-001',
          first_name: 'Alice',
          last_name: 'Chen',
          email: 'alice@tamshai.com',
          title: 'VP of HR',
          department: 'Human Resources',
          location: 'Seattle, WA',
          manager_id: 'ceo-001',
          level: 1,
        },
        {
          employee_id: 'vp-002',
          first_name: 'Bob',
          last_name: 'Martinez',
          email: 'bob@tamshai.com',
          title: 'Finance Director',
          department: 'Finance',
          location: 'Seattle, WA',
          manager_id: 'ceo-001',
          level: 1,
        },
        {
          employee_id: 'mgr-001',
          first_name: 'Jennifer',
          last_name: 'Lee',
          email: 'jennifer@tamshai.com',
          title: 'HR Manager',
          department: 'Human Resources',
          location: 'Seattle, WA',
          manager_id: 'vp-001',
          level: 2,
        },
      ],
      rowCount: 4,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await getOrgChart({}, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      // One root (CEO)
      expect(result.data).toHaveLength(1);
      const ceo = result.data[0];
      expect(ceo.full_name).toBe('Eve Thompson');
      expect(ceo.direct_reports_count).toBe(2); // Two VPs

      // Two VPs report to CEO
      const vps = ceo.direct_reports;
      expect(vps).toHaveLength(2);

      // Alice Chen has one direct report
      const aliceChen = vps.find((vp) => vp.first_name === 'Alice');
      expect(aliceChen?.direct_reports_count).toBe(1);
      expect(aliceChen?.direct_reports[0].full_name).toBe('Jennifer Lee');

      // Bob Martinez has no direct reports
      const bobMartinez = vps.find((vp) => vp.first_name === 'Bob');
      expect(bobMartinez?.direct_reports_count).toBe(0);
    }
  });

  it('should respect maxDepth parameter', async () => {
    mockedQueryWithRLS.mockResolvedValue({
      rows: [],
      rowCount: 0,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    await getOrgChart({ maxDepth: 3 }, mockUserContext);

    expect(mockedQueryWithRLS).toHaveBeenCalledWith(
      mockUserContext,
      expect.stringContaining('oh.level < $1'),
      [3]
    );
  });

  it('should handle database errors gracefully', async () => {
    mockedQueryWithRLS.mockRejectedValue(new Error('Database connection failed'));

    const result = await getOrgChart({}, mockUserContext);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('DATABASE_ERROR');
    }
  });

  it('should include all required fields in org chart nodes', async () => {
    mockedQueryWithRLS.mockResolvedValue({
      rows: [
        {
          employee_id: 'emp-001',
          first_name: 'Test',
          last_name: 'Employee',
          email: 'test@tamshai.com',
          title: 'Engineer',
          department: 'Engineering',
          location: 'Remote',
          manager_id: null,
          level: 0,
        },
      ],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    });

    const result = await getOrgChart({}, mockUserContext);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      const node = result.data[0];
      expect(node.employee_id).toBe('emp-001');
      expect(node.first_name).toBe('Test');
      expect(node.last_name).toBe('Employee');
      expect(node.full_name).toBe('Test Employee');
      expect(node.email).toBe('test@tamshai.com');
      expect(node.title).toBe('Engineer');
      expect(node.department).toBe('Engineering');
      expect(node.location).toBe('Remote');
      expect(node.level).toBe(0);
      expect(node.direct_reports_count).toBe(0);
      expect(node.direct_reports).toEqual([]);
    }
  });
});

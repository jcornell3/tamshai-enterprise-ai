/**
 * List Invoices Tool Tests - MCP-Finance
 *
 * RED Phase: Tests for invoice listing with cursor-based pagination.
 * Tests filtering, pagination, and RLS enforcement.
 */

import { listInvoices, ListInvoicesInput, Invoice } from './list-invoices';
import {
  createMockUserContext,
  createMockDbResult,
  TEST_INVOICES,
} from '../test-utils';
import {
  isSuccessResponse,
  isErrorResponse,
} from '../types/response';

// Mock the database connection
jest.mock('../database/connection', () => ({
  queryWithRLS: jest.fn(),
}));

import { queryWithRLS } from '../database/connection';

const mockQueryWithRLS = queryWithRLS as jest.MockedFunction<typeof queryWithRLS>;

// Sample invoice data matching actual schema
const sampleInvoices: Invoice[] = [
  {
    id: 'inv-001',
    vendor_name: 'Acme Corp',
    invoice_number: 'INV-2024-001',
    amount: 15000,
    currency: 'USD',
    invoice_date: '2024-02-15',
    due_date: '2024-03-15',
    paid_date: null,
    status: 'PENDING',
    department_code: 'HR',
    description: 'Office supplies',
    approved_by: null,
    approved_at: null,
    created_at: '2024-02-15T10:00:00Z',
  },
  {
    id: 'inv-002',
    vendor_name: 'Tech Solutions',
    invoice_number: 'INV-2024-002',
    amount: 8500,
    currency: 'USD',
    invoice_date: '2024-02-18',
    due_date: '2024-03-20',
    paid_date: null,
    status: 'APPROVED',
    department_code: 'ENGINEERING',
    description: 'Software licenses',
    approved_by: 'alice.chen',
    approved_at: '2024-02-20T14:30:00Z',
    created_at: '2024-02-18T09:00:00Z',
  },
];

describe('listInvoices', () => {
  const userContext = createMockUserContext({ roles: ['finance-read'] });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('successful queries', () => {
    it('should return paginated invoice list', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(sampleInvoices));

      const result = await listInvoices({ limit: 50 }, userContext);

      expect(isSuccessResponse(result)).toBe(true);
      if (isSuccessResponse(result)) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].vendor_name).toBe('Acme Corp');
      }
    });

    it('should detect truncation with LIMIT+1 pattern', async () => {
      const manyInvoices = Array(51).fill(sampleInvoices[0]);
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(manyInvoices));

      const result = await listInvoices({ limit: 50 }, userContext);

      expect(isSuccessResponse(result)).toBe(true);
      if (isSuccessResponse(result)) {
        expect(result.data).toHaveLength(50);
        expect(result.metadata?.hasMore).toBe(true);
        expect(result.metadata?.nextCursor).toBeDefined();
      }
    });

    it('should include pagination hint when truncated', async () => {
      const manyInvoices = Array(51).fill(sampleInvoices[0]);
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(manyInvoices));

      const result = await listInvoices({ limit: 50 }, userContext);

      if (isSuccessResponse(result)) {
        expect(result.metadata?.hint).toContain('next page');
      }
    });
  });

  describe('filtering', () => {
    it('should filter by vendor name (case-insensitive)', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([sampleInvoices[0]]));

      const result = await listInvoices({ vendor: 'acme', limit: 50 }, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.stringContaining('vendor_name ILIKE'),
        expect.arrayContaining(['%acme%'])
      );
      expect(isSuccessResponse(result)).toBe(true);
    });

    it('should filter by status (converted to uppercase)', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([sampleInvoices[0]]));

      const result = await listInvoices({ status: 'pending', limit: 50 }, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.stringContaining('status'),
        expect.arrayContaining(['PENDING'])
      );
    });

    it('should filter by department', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([sampleInvoices[1]]));

      const result = await listInvoices({ department: 'ENGINEERING', limit: 50 }, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.stringContaining('department_code'),
        expect.arrayContaining(['ENGINEERING'])
      );
    });

    it('should filter by date range', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(sampleInvoices));

      const result = await listInvoices(
        { startDate: '2024-02-01', endDate: '2024-02-28', limit: 50 },
        userContext
      );

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.stringContaining('invoice_date >='),
        expect.arrayContaining(['2024-02-01', '2024-02-28'])
      );
    });

    it('should filter by amount range', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([sampleInvoices[0]]));

      const result = await listInvoices(
        { minAmount: 10000, maxAmount: 20000, limit: 50 },
        userContext
      );

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.stringContaining('amount >='),
        expect.arrayContaining([10000, 20000])
      );
    });

    it('should combine multiple filters', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      await listInvoices(
        {
          vendor: 'Acme',
          status: 'pending',
          department: 'HR',
          limit: 50,
        },
        userContext
      );

      const [, query] = mockQueryWithRLS.mock.calls[0];
      expect(query).toContain('AND');
      expect(query).toContain('vendor_name');
      expect(query).toContain('status');
      expect(query).toContain('department_code');
    });
  });

  describe('cursor-based pagination', () => {
    it('should use default limit of 50 when not specified', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      await listInvoices({}, userContext);

      // Should query with limit + 1 for truncation detection
      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.any(String),
        expect.arrayContaining([51]) // 50 + 1
      );
    });

    it('should decode and apply cursor for pagination', async () => {
      // Create a cursor from the first invoice
      const cursor = Buffer.from(JSON.stringify({
        invoiceDate: '2024-02-15',
        createdAt: '2024-02-15T10:00:00Z',
        id: 'inv-001',
      })).toString('base64');

      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      await listInvoices({ cursor, limit: 50 }, userContext);

      // Should include cursor-based WHERE clause
      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.stringContaining('invoice_date'),
        expect.arrayContaining(['2024-02-15', '2024-02-15T10:00:00Z', 'inv-001'])
      );
    });

    it('should generate nextCursor when more records exist', async () => {
      const manyInvoices = Array(51).fill({
        ...sampleInvoices[0],
        invoice_date: '2024-02-15',
        created_at: '2024-02-15T10:00:00Z',
        id: 'last-id',
      });
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(manyInvoices));

      const result = await listInvoices({ limit: 50 }, userContext);

      if (isSuccessResponse(result)) {
        expect(result.metadata?.nextCursor).toBeDefined();
        // Decode and verify cursor structure
        const decoded = JSON.parse(
          Buffer.from(result.metadata!.nextCursor!, 'base64').toString('utf-8')
        );
        expect(decoded).toHaveProperty('invoiceDate');
        expect(decoded).toHaveProperty('createdAt');
        expect(decoded).toHaveProperty('id');
      }
    });

    it('should handle invalid cursor gracefully', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(sampleInvoices));

      const result = await listInvoices(
        { cursor: 'invalid-base64!!!', limit: 50 },
        userContext
      );

      // Should not crash, should return results
      expect(isSuccessResponse(result)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should return error response on database failure', async () => {
      mockQueryWithRLS.mockRejectedValue(new Error('Connection refused'));

      const result = await listInvoices({ limit: 50 }, userContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });

    it('should validate limit bounds', async () => {
      const result = await listInvoices(
        { limit: 500 } as ListInvoicesInput,
        userContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });

    it('should validate status enum', async () => {
      const result = await listInvoices(
        { status: 'invalid' as any, limit: 50 },
        userContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('RLS enforcement', () => {
    it('should pass user context to queryWithRLS', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      await listInvoices({ limit: 50 }, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.any(String),
        expect.any(Array)
      );
    });

    it('should work with finance-write role', async () => {
      const writeUser = createMockUserContext({ roles: ['finance-write'] });
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(sampleInvoices));

      const result = await listInvoices({ limit: 50 }, writeUser);

      expect(isSuccessResponse(result)).toBe(true);
    });
  });
});

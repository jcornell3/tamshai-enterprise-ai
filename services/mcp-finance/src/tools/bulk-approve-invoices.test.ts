/**
 * Bulk Approve Invoices Tool Tests - MCP-Finance
 *
 * Tests for bulk invoice approval with human-in-the-loop confirmation.
 * Tests permission checks, business rules, and confirmation flow.
 */

import { bulkApproveInvoices, executeBulkApproveInvoices, BulkApproveInvoicesInput } from './bulk-approve-invoices';
import {
  createMockUserContext,
  createMockDbResult,
} from '../test-utils';
import {
  isSuccessResponse,
  isErrorResponse,
  isPendingConfirmationResponse,
} from '../types/response';

// Mock the database connection
jest.mock('../database/connection', () => ({
  queryWithRLS: jest.fn(),
}));

// Mock Redis for confirmation storage
jest.mock('../utils/redis', () => ({
  storePendingConfirmation: jest.fn().mockResolvedValue(undefined),
}));

// Mock UUID for deterministic testing
jest.mock('uuid', () => ({
  v4: () => 'test-bulk-confirmation-id',
}));

import { queryWithRLS } from '../database/connection';
import { storePendingConfirmation } from '../utils/redis';

const mockQueryWithRLS = queryWithRLS as jest.MockedFunction<typeof queryWithRLS>;
const mockStorePendingConfirmation = storePendingConfirmation as jest.MockedFunction<
  typeof storePendingConfirmation
>;

describe('bulkApproveInvoices', () => {
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });
  const readUserContext = createMockUserContext({ roles: ['finance-read'] });
  const execUserContext = createMockUserContext({ roles: ['executive'] });

  const pendingInvoices = [
    {
      id: 'inv-001',
      vendor_name: 'Acme Corp',
      invoice_number: 'INV-2024-001',
      amount: 1500,
      currency: 'USD',
      department_code: 'HR',
      status: 'PENDING',
    },
    {
      id: 'inv-002',
      vendor_name: 'Tech Solutions',
      invoice_number: 'INV-2024-002',
      amount: 2500,
      currency: 'USD',
      department_code: 'ENGINEERING',
      status: 'PENDING',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('permission checks', () => {
    it('should reject users without finance-write role', async () => {
      const result = await bulkApproveInvoices(
        { invoiceIds: ['inv-001', 'inv-002'] },
        readUserContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INSUFFICIENT_PERMISSIONS');
        expect(result.message).toContain('finance-write');
      }
    });

    it('should allow users with finance-write role', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(pendingInvoices));

      const result = await bulkApproveInvoices(
        { invoiceIds: ['inv-001', 'inv-002'] },
        writeUserContext
      );

      expect(isPendingConfirmationResponse(result)).toBe(true);
    });

    it('should allow users with executive role', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(pendingInvoices));

      const result = await bulkApproveInvoices(
        { invoiceIds: ['inv-001', 'inv-002'] },
        execUserContext
      );

      expect(isPendingConfirmationResponse(result)).toBe(true);
    });
  });

  describe('input validation', () => {
    it('should reject empty invoiceIds array', async () => {
      const result = await bulkApproveInvoices(
        { invoiceIds: [] } as unknown as BulkApproveInvoicesInput,
        writeUserContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('invoice lookup', () => {
    it('should return error when no invoices found', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      const result = await bulkApproveInvoices(
        { invoiceIds: ['nonexistent-1', 'nonexistent-2'] },
        writeUserContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVOICES_NOT_FOUND');
      }
    });

    it('should reject when any invoice is not PENDING', async () => {
      const mixedInvoices = [
        { ...pendingInvoices[0] },
        { ...pendingInvoices[1], status: 'APPROVED' },
      ];
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(mixedInvoices));

      const result = await bulkApproveInvoices(
        { invoiceIds: ['inv-001', 'inv-002'] },
        writeUserContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_INVOICE_STATUS');
        expect(result.message).toContain('APPROVED');
      }
    });
  });

  describe('confirmation flow', () => {
    it('should return pending_confirmation for valid invoices', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(pendingInvoices));

      const result = await bulkApproveInvoices(
        { invoiceIds: ['inv-001', 'inv-002'] },
        writeUserContext
      );

      expect(isPendingConfirmationResponse(result)).toBe(true);
      if (isPendingConfirmationResponse(result)) {
        expect(result.confirmationId).toBe('test-bulk-confirmation-id');
        expect(result.action).toBe('bulk_approve_invoices');
        expect(result.message).toContain('2 Invoice(s)');
        expect(result.message).toContain('Acme Corp');
        expect(result.message).toContain('Tech Solutions');
      }
    });

    it('should store confirmation data in Redis with 5-minute TTL', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(pendingInvoices));

      await bulkApproveInvoices(
        { invoiceIds: ['inv-001', 'inv-002'] },
        writeUserContext
      );

      expect(mockStorePendingConfirmation).toHaveBeenCalledWith(
        'test-bulk-confirmation-id',
        expect.objectContaining({
          action: 'bulk_approve_invoices',
          mcpServer: 'finance',
          invoiceCount: 2,
          invoiceIds: ['inv-001', 'inv-002'],
        }),
        300
      );
    });
  });

  describe('error handling', () => {
    it('should return database error on query failure', async () => {
      mockQueryWithRLS.mockRejectedValue(new Error('Connection failed'));

      const result = await bulkApproveInvoices(
        { invoiceIds: ['inv-001'] },
        writeUserContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });
  });
});

describe('executeBulkApproveInvoices', () => {
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should approve all invoices and return success count', async () => {
    const approvedInvoices = [
      { id: 'inv-001', invoice_number: 'INV-2024-001', vendor_name: 'Acme Corp', amount: 1500, currency: 'USD' },
      { id: 'inv-002', invoice_number: 'INV-2024-002', vendor_name: 'Tech Solutions', amount: 2500, currency: 'USD' },
    ];
    mockQueryWithRLS.mockResolvedValue(createMockDbResult(approvedInvoices));

    const confirmationData = {
      action: 'bulk_approve_invoices',
      invoiceIds: ['inv-001', 'inv-002'],
      approverNotes: null,
    };
    const result = await executeBulkApproveInvoices(confirmationData, writeUserContext);

    expect(isSuccessResponse(result)).toBe(true);
    if (isSuccessResponse(result)) {
      const data = result.data as { success: boolean; approvedCount: number; newStatus: string };
      expect(data.success).toBe(true);
      expect(data.approvedCount).toBe(2);
      expect(data.newStatus).toBe('APPROVED');
    }
  });

  it('should return error when no invoices could be approved', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

    const confirmationData = {
      action: 'bulk_approve_invoices',
      invoiceIds: ['already-approved-1', 'already-approved-2'],
    };
    const result = await executeBulkApproveInvoices(confirmationData, writeUserContext);

    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) {
      expect(result.code).toBe('NO_INVOICES_APPROVED');
    }
  });

  it('should handle database errors', async () => {
    mockQueryWithRLS.mockRejectedValue(new Error('Database unavailable'));

    const confirmationData = {
      action: 'bulk_approve_invoices',
      invoiceIds: ['inv-001'],
    };
    const result = await executeBulkApproveInvoices(confirmationData, writeUserContext);

    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) {
      expect(result.code).toBe('DATABASE_ERROR');
    }
  });
});

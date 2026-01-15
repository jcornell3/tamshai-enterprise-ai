/**
 * Delete Invoice Tool Tests - MCP-Finance
 *
 * RED Phase: Tests for invoice deletion with human-in-the-loop confirmation.
 * Tests permission checks, business rules, and confirmation flow.
 */

import { deleteInvoice, executeDeleteInvoice, DeleteInvoiceInput } from './delete-invoice';
import {
  createMockUserContext,
  createMockDbResult,
  TEST_INVOICES,
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
// Note: Using a simple function instead of jest.fn() because resetMocks: true in jest.config
jest.mock('uuid', () => ({
  v4: () => 'test-confirmation-id',
}));

import { queryWithRLS } from '../database/connection';
import { storePendingConfirmation } from '../utils/redis';

const mockQueryWithRLS = queryWithRLS as jest.MockedFunction<typeof queryWithRLS>;
const mockStorePendingConfirmation = storePendingConfirmation as jest.MockedFunction<
  typeof storePendingConfirmation
>;

describe('deleteInvoice', () => {
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });
  const readUserContext = createMockUserContext({ roles: ['finance-read'] });
  const execUserContext = createMockUserContext({ roles: ['executive'] });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('permission checks', () => {
    it('should reject users without finance-write role', async () => {
      const result = await deleteInvoice({ invoiceId: 'inv-001' }, readUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INSUFFICIENT_PERMISSIONS');
        expect(result.message).toContain('finance-write');
      }
    });

    it('should allow users with finance-write role', async () => {
      const invoice = {
        id: 'inv-001',
        vendor_name: 'Acme Corp',
        invoice_number: 'INV-2024-001',
        amount: 1500,
        currency: 'USD',
        department_code: 'HR',
        status: 'PENDING',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([invoice]));

      const result = await deleteInvoice({ invoiceId: 'inv-001' }, writeUserContext);

      expect(isPendingConfirmationResponse(result)).toBe(true);
    });

    it('should allow users with executive role', async () => {
      const invoice = {
        id: 'inv-001',
        vendor_name: 'Acme Corp',
        invoice_number: 'INV-2024-001',
        amount: 1500,
        currency: 'USD',
        department_code: 'HR',
        status: 'PENDING',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([invoice]));

      const result = await deleteInvoice({ invoiceId: 'inv-001' }, execUserContext);

      expect(isPendingConfirmationResponse(result)).toBe(true);
    });
  });

  describe('invoice lookup', () => {
    it('should return error when invoice not found', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      const result = await deleteInvoice({ invoiceId: 'nonexistent' }, writeUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVOICE_NOT_FOUND');
        expect(result.details?.invoiceId).toBe('nonexistent');
      }
    });

    it('should lookup by UUID', async () => {
      const invoice = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        vendor_name: 'Test',
        invoice_number: 'INV-001',
        amount: 100,
        currency: 'USD',
        department_code: 'HR',
        status: 'PENDING',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([invoice]));

      await deleteInvoice(
        { invoiceId: '550e8400-e29b-41d4-a716-446655440000' },
        writeUserContext
      );

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        writeUserContext,
        expect.stringContaining('i.id = $1'),
        expect.any(Array)
      );
    });

    it('should lookup by invoice number', async () => {
      const invoice = {
        id: 'inv-uuid',
        vendor_name: 'Test',
        invoice_number: 'INV-2024-001',
        amount: 100,
        currency: 'USD',
        department_code: 'HR',
        status: 'PENDING',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([invoice]));

      await deleteInvoice({ invoiceId: 'INV-2024-001' }, writeUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        writeUserContext,
        expect.stringContaining('i.invoice_number = $1'),
        expect.any(Array)
      );
    });
  });

  describe('business rules', () => {
    it('should reject deletion of approved invoices', async () => {
      const approvedInvoice = {
        id: 'inv-001',
        vendor_name: 'Acme Corp',
        invoice_number: 'INV-2024-001',
        amount: 1500,
        currency: 'USD',
        department_code: 'HR',
        status: 'APPROVED',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([approvedInvoice]));

      const result = await deleteInvoice({ invoiceId: 'inv-001' }, writeUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('CANNOT_DELETE_APPROVED_INVOICE');
      }
    });

    it('should reject deletion of paid invoices', async () => {
      const paidInvoice = {
        id: 'inv-001',
        vendor_name: 'Acme Corp',
        invoice_number: 'INV-2024-001',
        amount: 1500,
        currency: 'USD',
        department_code: 'HR',
        status: 'PAID',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([paidInvoice]));

      const result = await deleteInvoice({ invoiceId: 'inv-001' }, writeUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('CANNOT_DELETE_APPROVED_INVOICE');
      }
    });

    it('should allow deletion of pending invoices', async () => {
      const pendingInvoice = {
        id: 'inv-001',
        vendor_name: 'Acme Corp',
        invoice_number: 'INV-2024-001',
        amount: 1500,
        currency: 'USD',
        department_code: 'HR',
        status: 'PENDING',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([pendingInvoice]));

      const result = await deleteInvoice({ invoiceId: 'inv-001' }, writeUserContext);

      expect(isPendingConfirmationResponse(result)).toBe(true);
    });

    it('should allow deletion of cancelled invoices', async () => {
      const cancelledInvoice = {
        id: 'inv-001',
        vendor_name: 'Acme Corp',
        invoice_number: 'INV-2024-001',
        amount: 1500,
        currency: 'USD',
        department_code: 'HR',
        status: 'CANCELLED',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([cancelledInvoice]));

      const result = await deleteInvoice({ invoiceId: 'inv-001' }, writeUserContext);

      expect(isPendingConfirmationResponse(result)).toBe(true);
    });
  });

  describe('confirmation flow', () => {
    const pendingInvoice = {
      id: 'inv-001',
      vendor_name: 'Acme Corp',
      invoice_number: 'INV-2024-001',
      amount: 1500,
      currency: 'USD',
      department_code: 'HR',
      status: 'PENDING',
    };

    it('should return pending_confirmation response', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([pendingInvoice]));

      const result = await deleteInvoice({ invoiceId: 'inv-001' }, writeUserContext);

      expect(isPendingConfirmationResponse(result)).toBe(true);
      if (isPendingConfirmationResponse(result)) {
        expect(result.confirmationId).toBe('test-confirmation-id');
        expect(result.action).toBe('delete_invoice');
      }
    });

    it('should store confirmation data in Redis with 5-minute TTL', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([pendingInvoice]));

      await deleteInvoice({ invoiceId: 'inv-001' }, writeUserContext);

      expect(mockStorePendingConfirmation).toHaveBeenCalledWith(
        'test-confirmation-id',
        expect.objectContaining({
          action: 'delete_invoice',
          mcpServer: 'finance',
          invoiceId: 'inv-001',
        }),
        300 // 5 minutes TTL
      );
    });

    it('should include invoice details in confirmation message', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([pendingInvoice]));

      const result = await deleteInvoice({ invoiceId: 'inv-001' }, writeUserContext);

      if (isPendingConfirmationResponse(result)) {
        expect(result.message).toContain('INV-2024-001');
        expect(result.message).toContain('Acme Corp');
        expect(result.message).toContain('1500');
        expect(result.message).toContain('HR');
      }
    });

    it('should include reason in confirmation message when provided', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([pendingInvoice]));

      const result = await deleteInvoice(
        { invoiceId: 'inv-001', reason: 'Duplicate entry' },
        writeUserContext
      );

      if (isPendingConfirmationResponse(result)) {
        expect(result.message).toContain('Duplicate entry');
      }
    });
  });

  describe('error handling', () => {
    it('should return database error on query failure', async () => {
      mockQueryWithRLS.mockRejectedValue(new Error('Connection failed'));

      const result = await deleteInvoice({ invoiceId: 'inv-001' }, writeUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });

    it('should validate input', async () => {
      const result = await deleteInvoice(
        { invoiceId: '' } as DeleteInvoiceInput,
        writeUserContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });
});

describe('executeDeleteInvoice', () => {
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should delete invoice and return success', async () => {
    const deletedInvoice = {
      id: 'inv-001',
      vendor_name: 'Acme Corp',
      invoice_number: 'INV-2024-001',
    };
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([deletedInvoice]));

    const confirmationData = { invoiceId: 'inv-001', action: 'delete_invoice' };
    const result = await executeDeleteInvoice(confirmationData, writeUserContext);

    expect(isSuccessResponse(result)).toBe(true);
    if (isSuccessResponse(result)) {
      expect(result.data.success).toBe(true);
      expect(result.data.message).toContain('INV-2024-001');
    }
  });

  it('should return error when invoice no longer exists', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

    const confirmationData = { invoiceId: 'deleted-already', action: 'delete_invoice' };
    const result = await executeDeleteInvoice(confirmationData, writeUserContext);

    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) {
      expect(result.code).toBe('INVOICE_NOT_FOUND');
    }
  });

  it('should handle database errors', async () => {
    mockQueryWithRLS.mockRejectedValue(new Error('Database unavailable'));

    const confirmationData = { invoiceId: 'inv-001', action: 'delete_invoice' };
    const result = await executeDeleteInvoice(confirmationData, writeUserContext);

    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) {
      expect(result.code).toBe('DATABASE_ERROR');
    }
  });
});

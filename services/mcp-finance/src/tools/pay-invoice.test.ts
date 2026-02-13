/**
 * Pay Invoice Tool Tests - MCP-Finance
 *
 * Tests for invoice payment with human-in-the-loop confirmation.
 * Tests permission checks, business rules, and confirmation flow.
 */

import { payInvoice, executePayInvoice, PayInvoiceInput } from './pay-invoice';
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
  v4: () => 'test-confirmation-id',
}));

import { queryWithRLS } from '../database/connection';
import { storePendingConfirmation } from '../utils/redis';

const mockQueryWithRLS = queryWithRLS as jest.MockedFunction<typeof queryWithRLS>;
const mockStorePendingConfirmation = storePendingConfirmation as jest.MockedFunction<
  typeof storePendingConfirmation
>;

describe('payInvoice', () => {
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });
  const readUserContext = createMockUserContext({ roles: ['finance-read'] });
  const execUserContext = createMockUserContext({ roles: ['executive'] });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('permission checks', () => {
    it('should reject users without finance-write role', async () => {
      const result = await payInvoice({ invoiceId: 'inv-001' }, readUserContext);

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
        status: 'APPROVED',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([invoice]));

      const result = await payInvoice({ invoiceId: 'inv-001' }, writeUserContext);

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
        status: 'APPROVED',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([invoice]));

      const result = await payInvoice({ invoiceId: 'inv-001' }, execUserContext);

      expect(isPendingConfirmationResponse(result)).toBe(true);
    });
  });

  describe('invoice lookup', () => {
    it('should return error when invoice not found', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      const result = await payInvoice({ invoiceId: 'nonexistent' }, writeUserContext);

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
        status: 'APPROVED',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([invoice]));

      await payInvoice(
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
        status: 'APPROVED',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([invoice]));

      await payInvoice({ invoiceId: 'INV-2024-001' }, writeUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        writeUserContext,
        expect.stringContaining('i.invoice_number = $1'),
        expect.any(Array)
      );
    });
  });

  describe('business rules', () => {
    it('should reject payment of pending invoices with suggestion', async () => {
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

      const result = await payInvoice({ invoiceId: 'inv-001' }, writeUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_INVOICE_STATUS');
        expect(result.suggestedAction).toContain('approve_invoice');
      }
    });

    it('should reject payment of already paid invoices', async () => {
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

      const result = await payInvoice({ invoiceId: 'inv-001' }, writeUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_INVOICE_STATUS');
        expect(result.suggestedAction).toContain('already been paid');
      }
    });

    it('should allow payment of approved invoices', async () => {
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

      const result = await payInvoice({ invoiceId: 'inv-001' }, writeUserContext);

      expect(isPendingConfirmationResponse(result)).toBe(true);
    });
  });

  describe('confirmation flow', () => {
    const approvedInvoice = {
      id: 'inv-001',
      vendor_name: 'Acme Corp',
      invoice_number: 'INV-2024-001',
      amount: 1500,
      currency: 'USD',
      department_code: 'HR',
      due_date: '2024-03-15',
      status: 'APPROVED',
    };

    it('should return pending_confirmation response', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([approvedInvoice]));

      const result = await payInvoice({ invoiceId: 'inv-001' }, writeUserContext);

      expect(isPendingConfirmationResponse(result)).toBe(true);
      if (isPendingConfirmationResponse(result)) {
        expect(result.confirmationId).toBe('test-confirmation-id');
        expect(result.action).toBe('pay_invoice');
      }
    });

    it('should store confirmation data in Redis with 5-minute TTL', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([approvedInvoice]));

      await payInvoice({ invoiceId: 'inv-001' }, writeUserContext);

      expect(mockStorePendingConfirmation).toHaveBeenCalledWith(
        'test-confirmation-id',
        expect.objectContaining({
          action: 'pay_invoice',
          mcpServer: 'finance',
          invoiceId: 'inv-001',
        }),
        300 // 5 minutes TTL
      );
    });

    it('should include invoice details in confirmation message', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([approvedInvoice]));

      const result = await payInvoice({ invoiceId: 'inv-001' }, writeUserContext);

      if (isPendingConfirmationResponse(result)) {
        expect(result.message).toContain('INV-2024-001');
        expect(result.message).toContain('Acme Corp');
        expect(result.message).toContain('1500');
        expect(result.message).toContain('HR');
      }
    });

    it('should default payment date to today when not provided', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([approvedInvoice]));

      await payInvoice({ invoiceId: 'inv-001' }, writeUserContext);

      expect(mockStorePendingConfirmation).toHaveBeenCalledWith(
        'test-confirmation-id',
        expect.objectContaining({
          paymentDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
        300
      );
    });

    it('should use provided payment date', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([approvedInvoice]));

      await payInvoice(
        { invoiceId: 'inv-001', paymentDate: '2024-03-20' },
        writeUserContext
      );

      expect(mockStorePendingConfirmation).toHaveBeenCalledWith(
        'test-confirmation-id',
        expect.objectContaining({
          paymentDate: '2024-03-20',
        }),
        300
      );
    });

    it('should include payment reference in confirmation when provided', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([approvedInvoice]));

      const result = await payInvoice(
        { invoiceId: 'inv-001', paymentReference: 'CHK-12345' },
        writeUserContext
      );

      if (isPendingConfirmationResponse(result)) {
        expect(result.message).toContain('CHK-12345');
      }
    });
  });

  describe('error handling', () => {
    it('should return database error on query failure', async () => {
      mockQueryWithRLS.mockRejectedValue(new Error('Connection failed'));

      const result = await payInvoice({ invoiceId: 'inv-001' }, writeUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });

    it('should validate input', async () => {
      const result = await payInvoice(
        { invoiceId: '' } as PayInvoiceInput,
        writeUserContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });

    it('should reject invalid payment date format', async () => {
      const result = await payInvoice(
        { invoiceId: 'inv-001', paymentDate: '03/20/2024' } as PayInvoiceInput,
        writeUserContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });
});

describe('executePayInvoice', () => {
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should mark invoice as paid and return success', async () => {
    const paidInvoice = {
      id: 'inv-001',
      vendor_name: 'Acme Corp',
      invoice_number: 'INV-2024-001',
      amount: 1500,
      currency: 'USD',
    };
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([paidInvoice]));

    const confirmationData = {
      invoiceId: 'inv-001',
      action: 'pay_invoice',
      paymentDate: '2024-03-20',
    };
    const result = await executePayInvoice(confirmationData, writeUserContext);

    expect(isSuccessResponse(result)).toBe(true);
    if (isSuccessResponse(result)) {
      const data = result.data as { success: boolean; message: string; newStatus: string; paymentDate: string };
      expect(data.success).toBe(true);
      expect(data.message).toContain('INV-2024-001');
      expect(data.newStatus).toBe('PAID');
      expect(data.paymentDate).toBe('2024-03-20');
    }
  });

  it('should return error when invoice no longer exists or status changed', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

    const confirmationData = {
      invoiceId: 'already-paid',
      action: 'pay_invoice',
      paymentDate: '2024-03-20',
    };
    const result = await executePayInvoice(confirmationData, writeUserContext);

    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) {
      expect(result.code).toBe('INVOICE_NOT_FOUND');
    }
  });

  it('should handle database errors', async () => {
    mockQueryWithRLS.mockRejectedValue(new Error('Database unavailable'));

    const confirmationData = {
      invoiceId: 'inv-001',
      action: 'pay_invoice',
      paymentDate: '2024-03-20',
    };
    const result = await executePayInvoice(confirmationData, writeUserContext);

    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) {
      expect(result.code).toBe('DATABASE_ERROR');
    }
  });
});

/**
 * MCP Finance Server (Architecture v1.4)
 *
 * Provides financial data access with:
 * - Row Level Security (RLS) enforcement
 * - LLM-friendly error responses (Section 7.4)
 * - Truncation warnings for large result sets (Section 5.3)
 * - Human-in-the-loop confirmations for write operations (Section 5.6)
 *
 * Port: 3102
 */

import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { requireGatewayAuth, createLogger, createHealthRoutes, createFinanceTierAuthMiddleware, createFinanceWriteAuthMiddleware, hasDomainWriteAccess } from '@tamshai/shared';
import { UserContext, checkConnection, closePool } from './database/connection';
import { getBudget, GetBudgetInputSchema } from './tools/get-budget';
import { listBudgets, ListBudgetsInputSchema } from './tools/list-budgets';
import { listInvoices, ListInvoicesInputSchema } from './tools/list-invoices';
import { getQuarterlyReport, GetQuarterlyReportInputSchema } from './tools/get-quarterly-report';
import { getExpenseReport, GetExpenseReportInputSchema } from './tools/get-expense-report';
import { listExpenseReports, ListExpenseReportsInputSchema } from './tools/list-expense-reports';
import { getArr, GetArrInputSchema } from './tools/get-arr';
import { getArrMovement, GetArrMovementInputSchema } from './tools/get-arr-movement';
import {
  deleteInvoice,
  executeDeleteInvoice,
  DeleteInvoiceInputSchema,
} from './tools/delete-invoice';
import {
  approveBudget,
  executeApproveBudget,
  ApproveBudgetInputSchema,
} from './tools/approve-budget';
import {
  submitBudget,
  SubmitBudgetInputSchema,
} from './tools/submit-budget';
import {
  rejectBudget,
  executeRejectBudget,
  RejectBudgetInputSchema,
} from './tools/reject-budget';
import {
  deleteBudget,
  executeDeleteBudget,
  DeleteBudgetInputSchema,
} from './tools/delete-budget';
import {
  approveInvoice,
  executeApproveInvoice,
  ApproveInvoiceInputSchema,
} from './tools/approve-invoice';
import {
  payInvoice,
  executePayInvoice,
  PayInvoiceInputSchema,
} from './tools/pay-invoice';
import {
  approveExpenseReport,
  executeApproveExpenseReport,
  ApproveExpenseReportInputSchema,
} from './tools/approve-expense-report';
import {
  rejectExpenseReport,
  executeRejectExpenseReport,
  RejectExpenseReportInputSchema,
} from './tools/reject-expense-report';
import {
  reimburseExpenseReport,
  executeReimburseExpenseReport,
  ReimburseExpenseReportInputSchema,
} from './tools/reimburse-expense-report';
import {
  deleteExpenseReport,
  executeDeleteExpenseReport,
  DeleteExpenseReportInputSchema,
} from './tools/delete-expense-report';
import {
  bulkApproveInvoices,
  executeBulkApproveInvoices,
  BulkApproveInvoicesInputSchema,
} from './tools/bulk-approve-invoices';
import { getPendingExpenses, GetPendingExpensesInputSchema } from './tools/get-pending-expenses';
import { getPendingBudgets, GetPendingBudgetsInputSchema } from './tools/get-pending-budgets';
import { MCPToolResponse } from '@tamshai/shared';
import { getPendingConfirmation, deletePendingConfirmation } from './utils/redis';

dotenv.config();

const logger = createLogger('mcp-finance');

const app = express();
const PORT = parseInt(process.env.PORT || '3102');

// =============================================================================
// TIERED AUTHORIZATION (v1.5 - Uses shared middleware factories)
// =============================================================================
// Authorization middleware imported from @tamshai/shared:
// - createFinanceTierAuthMiddleware('expenses')  → TIER 1: All employees (self-access via RLS)
// - createFinanceTierAuthMiddleware('budgets')    → TIER 2: Employees+ (filtered via RLS)
// - createFinanceTierAuthMiddleware('dashboard')  → TIER 3: Finance personnel only
// - createFinanceWriteAuthMiddleware()            → Write: finance-write or executive only
// Special cases (inline auth): submit_budget (custom role check), approve_budget (200 error body)

// Middleware
app.use(express.json());

// Gateway authentication middleware (prevents direct access bypass)
// Health endpoints are automatically exempt
app.use(requireGatewayAuth(process.env.MCP_INTERNAL_SECRET, { logger }));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    userId: req.headers['x-user-id'],
  });
  next();
});

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.use(createHealthRoutes('mcp-finance', [
  { name: 'database', check: async () => { try { return await checkConnection(); } catch { return false; } } },
]));

// =============================================================================
// MCP QUERY ENDPOINT
// =============================================================================

/**
 * Main query endpoint called by MCP Gateway
 *
 * Extracts user context from headers and routes to appropriate tool.
 * Supports cursor-based pagination for list operations.
 */
app.post('/query', async (req: Request, res: Response) => {
  try {
    const { query, userContext: bodyUserContext, cursor } = req.body;

    // Build user context from request
    const userContext: UserContext = bodyUserContext || {
      userId: req.headers['x-user-id'] as string,
      username: req.headers['x-user-username'] as string || 'unknown',
      email: req.headers['x-user-email'] as string,
      roles: (req.headers['x-user-roles'] as string || '').split(','),
    };

    if (!userContext.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
        suggestedAction: 'Ensure authentication headers are set',
      });
      return;
    }

    logger.info('Processing query', {
      query: query.substring(0, 100),
      userId: userContext.userId,
      roles: userContext.roles,
      hasCursor: !!cursor,
    });

    // Simple query routing based on keywords
    const queryLower = query.toLowerCase();

    // Check for pagination requests
    const isPaginationRequest = queryLower.includes('next page') ||
      queryLower.includes('more') ||
      queryLower.includes('show more') ||
      queryLower.includes('continue') ||
      !!cursor;

    // Check if this is a budget query
    const isBudgetQuery = queryLower.includes('budget') ||
      queryLower.includes('spending') ||
      queryLower.includes('allocation');

    // Check if this is a list invoices query
    const isListInvoicesQuery = queryLower.includes('invoice');

    // Route to appropriate handler
    if (isBudgetQuery) {
      // Extract department filter if mentioned
      const deptMatch = queryLower.match(/(?:for|in)\s+(\w+)\s+(?:department|dept)?/);
      const yearMatch = queryLower.match(/(\d{4})/);

      const input: any = { limit: 50 };
      if (deptMatch) {
        input.department = deptMatch[1].toUpperCase();
      }
      if (yearMatch) {
        input.fiscalYear = parseInt(yearMatch[1]);
      }

      const result = await listBudgets(input, userContext);
      res.json(result);
      return;
    }

    if (isListInvoicesQuery || isPaginationRequest) {
      const input: any = { limit: 50 };
      if (cursor) {
        input.cursor = cursor;
      }

      const result = await listInvoices(input, userContext);
      res.json(result);
      return;
    }

    // Default: Return budget summary as it's the most commonly requested
    const result = await listBudgets({ limit: 50 }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('Query error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to process query',
      suggestedAction: 'Please try again or contact support',
    });
  }
});

// =============================================================================
// TOOL ENDPOINTS (v1.4)
// =============================================================================

/**
 * Get Budget Tool (TIER 2 - Managers and above, department filtering via RLS)
 */
app.post('/tools/get_budget', createFinanceTierAuthMiddleware('budgets'), async (req: Request, res: Response) => {
  try {
    const { userContext, department, year } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await getBudget({ department, year }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('get_budget error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to get budget',
    });
  }
});

/**
 * Get Quarterly Report Tool (TIER 2 - Finance read and executive)
 */
app.post('/tools/get_quarterly_report', createFinanceTierAuthMiddleware('budgets'), async (req: Request, res: Response) => {
  try {
    const { userContext, quarter, year } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await getQuarterlyReport({ quarter, year }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('get_quarterly_report error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to get quarterly report',
    });
  }
});

/**
 * List Invoices Tool (TIER 3 - Finance personnel only)
 */
app.post('/tools/list_invoices', createFinanceTierAuthMiddleware('dashboard'), async (req: Request, res: Response) => {
  try {
    const { userContext, status, department, startDate, endDate, limit, cursor } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await listInvoices({ status, department, startDate, endDate, limit, cursor }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('list_invoices error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to list invoices',
    });
  }
});

/**
 * List Budgets Tool (TIER 2 - Managers and above, department filtering via RLS)
 */
app.post('/tools/list_budgets', createFinanceTierAuthMiddleware('budgets'), async (req: Request, res: Response) => {
  try {
    const { userContext, fiscalYear, department, limit, cursor } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await listBudgets({ fiscalYear, department, limit, cursor }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('list_budgets error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to list budgets',
    });
  }
});

/**
 * Get Expense Report Tool (TIER 1 - All employees via RLS self-access)
 */
app.post('/tools/get_expense_report', createFinanceTierAuthMiddleware('expenses'), async (req: Request, res: Response) => {
  try {
    const { userContext, reportId } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await getExpenseReport({ reportId }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('get_expense_report error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to get expense report',
    });
  }
});

/**
 * List Expense Reports Tool (TIER 1 - All employees via RLS self-access)
 */
app.post('/tools/list_expense_reports', createFinanceTierAuthMiddleware('expenses'), async (req: Request, res: Response) => {
  try {
    const { userContext, status, employeeId, startDate, endDate, limit, cursor } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await listExpenseReports({ status, employeeId, startDate, endDate, limit, cursor }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('list_expense_reports error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to list expense reports',
    });
  }
});

/**
 * Get Pending Expenses Tool (for ApprovalsQueue)
 *
 * Returns expense reports with status IN ('SUBMITTED', 'UNDER_REVIEW')
 * awaiting approval. Used by managers and finance staff.
 *
 * TIER 1: All employees can access (own reports via RLS)
 */
app.post('/tools/get_pending_expenses', createFinanceTierAuthMiddleware('expenses'), async (req: Request, res: Response) => {
  try {
    const { userContext, departmentCode, limit, cursor } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await getPendingExpenses({ departmentCode, limit, cursor }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('get_pending_expenses error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to get pending expense reports',
    });
  }
});

/**
 * Get Pending Budgets Tool (for ApprovalsQueue)
 *
 * Returns budgets with status = 'PENDING_APPROVAL' awaiting approval.
 * Used by finance staff and executives.
 *
 * TIER 2: Managers and above can access budgets
 */
app.post('/tools/get_pending_budgets', createFinanceTierAuthMiddleware('budgets'), async (req: Request, res: Response) => {
  try {
    const { userContext, departmentCode, fiscalYear, limit, cursor } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await getPendingBudgets({ departmentCode, fiscalYear, limit, cursor }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('get_pending_budgets error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to get pending budgets',
    });
  }
});

/**
 * Get ARR Tool - Returns current ARR metrics (TIER 3 - Finance personnel only)
 */
app.post('/tools/get_arr', createFinanceTierAuthMiddleware('dashboard'), async (req: Request, res: Response) => {
  try {
    const { userContext, asOfDate } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await getArr({ asOfDate }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('get_arr error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to get ARR metrics',
    });
  }
});

/**
 * Get ARR Movement Tool - Returns ARR waterfall/movement data (TIER 3 - Finance personnel only)
 */
app.post('/tools/get_arr_movement', createFinanceTierAuthMiddleware('dashboard'), async (req: Request, res: Response) => {
  try {
    const { userContext, year, months } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await getArrMovement({ year, months }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('get_arr_movement error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to get ARR movement data',
    });
  }
});

/**
 * Delete Invoice Tool (WRITE - finance-write or executive only)
 */
app.post('/tools/delete_invoice', createFinanceWriteAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { userContext, invoiceId } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await deleteInvoice({ invoiceId }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('delete_invoice error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to delete invoice',
    });
  }
});

/**
 * Approve Invoice Tool (WRITE - finance-write or executive only)
 */
app.post('/tools/approve_invoice', createFinanceWriteAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { userContext, invoiceId, approverNotes } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await approveInvoice({ invoiceId, approverNotes }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('approve_invoice error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to approve invoice',
    });
  }
});

/**
 * Bulk Approve Invoices Tool (WRITE - finance-write or executive only)
 */
app.post('/tools/bulk_approve_invoices', createFinanceWriteAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { userContext, invoiceIds, approverNotes } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await bulkApproveInvoices({ invoiceIds, approverNotes }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('bulk_approve_invoices error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to bulk approve invoices',
    });
  }
});

/**
 * Pay Invoice Tool (WRITE - finance-write or executive only)
 */
app.post('/tools/pay_invoice', createFinanceWriteAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { userContext, invoiceId, paymentDate, paymentReference, paymentNotes } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await payInvoice({ invoiceId, paymentDate, paymentReference, paymentNotes }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('pay_invoice error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to pay invoice',
    });
  }
});

/**
 * Submit Budget Tool (WRITE - department heads/managers only)
 *
 * Allows department heads to submit their department's budget for approval.
 * Changes status from DRAFT to PENDING_APPROVAL.
 */
app.post('/tools/submit_budget', async (req: Request, res: Response) => {
  try {
    const { userContext, budgetId, comments } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    // Authorization check - managers, executives, and finance-write can submit budgets
    const canSubmit = userContext.roles.some((role: string) =>
      role === 'manager' || role === 'executive' || role === 'finance-write'
    );

    if (!canSubmit) {
      res.json({
        status: 'error',
        code: 'UNAUTHORIZED',
        message: `Access denied. Submitting budgets requires manager, executive, or finance-write role. Only department heads can submit budgets for approval. You have: ${userContext.roles.join(', ')}`,
        suggestedAction: 'Contact your department head to submit this budget for approval.',
      });
      return;
    }

    const result = await submitBudget({ budgetId, comments }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('submit_budget error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to submit budget',
    });
  }
});

/**
 * Approve Budget Tool (WRITE - finance-write or executive only)
 */
app.post('/tools/approve_budget', async (req: Request, res: Response) => {
  try {
    const { userContext, budgetId, approvedAmount, approverNotes } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    // Authorization check - WRITE: finance-write or executive only
    // Note: Return JSON error (not 403 HTTP) for consistent MCP tool response format
    if (!hasDomainWriteAccess(userContext.roles, 'finance')) {
      res.json({
        status: 'error',
        code: 'UNAUTHORIZED',
        message: `Access denied. Approving budgets requires finance-write or executive role. You have: ${userContext.roles.join(', ')}`,
        suggestedAction: 'Contact your administrator to request finance-write access permissions.',
      });
      return;
    }

    const result = await approveBudget({ budgetId, approvedAmount, approverNotes }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('approve_budget error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to approve budget',
    });
  }
});

/**
 * Reject Budget Tool (WRITE - finance-write or executive only)
 */
app.post('/tools/reject_budget', createFinanceWriteAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { userContext, budgetId, rejectionReason } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await rejectBudget({ budgetId, rejectionReason }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('reject_budget error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to reject budget',
    });
  }
});

/**
 * Delete Budget Tool (WRITE - finance-write or executive only)
 */
app.post('/tools/delete_budget', createFinanceWriteAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { userContext, budgetId, reason } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await deleteBudget({ budgetId, reason }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('delete_budget error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to delete budget',
    });
  }
});

/**
 * Approve Expense Report Tool (WRITE - finance-write or executive only)
 */
app.post('/tools/approve_expense_report', createFinanceWriteAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { userContext, reportId, approverNotes } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await approveExpenseReport({ reportId, approverNotes }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('approve_expense_report error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to approve expense report',
    });
  }
});

/**
 * Reject Expense Report Tool (WRITE - finance-write or executive only)
 */
app.post('/tools/reject_expense_report', createFinanceWriteAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { userContext, reportId, rejectionReason } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await rejectExpenseReport({ reportId, rejectionReason }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('reject_expense_report error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to reject expense report',
    });
  }
});

/**
 * Reimburse Expense Report Tool (WRITE - finance-write or executive only)
 */
app.post('/tools/reimburse_expense_report', createFinanceWriteAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { userContext, reportId, paymentReference, paymentNotes } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await reimburseExpenseReport({ reportId, paymentReference, paymentNotes }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('reimburse_expense_report error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to reimburse expense report',
    });
  }
});

/**
 * Delete Expense Report Tool (WRITE - finance-write or executive only)
 */
app.post('/tools/delete_expense_report', createFinanceWriteAuthMiddleware(), async (req: Request, res: Response) => {
  try {
    const { userContext, reportId, reason } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await deleteExpenseReport({ reportId, reason }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('delete_expense_report error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to delete expense report',
    });
  }
});

// =============================================================================
// EXECUTE ENDPOINT (v1.4 - Called by Gateway after confirmation)
// =============================================================================

/**
 * Execute a confirmed action
 *
 * This endpoint supports two patterns:
 * 1. Direct: { action, data, userContext } - Called by Gateway with pre-loaded data
 * 2. ConfirmationId: { confirmationId, approved, userContext } - Looks up from Redis
 *
 * For pattern 2, if approved=false, the action becomes a rejection.
 */
app.post('/execute', async (req: Request, res: Response) => {
  try {
    let { action, data, userContext, confirmationId, approved, rejectionReason, comments } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    // Pattern 2: ConfirmationId flow - look up from Redis
    if (confirmationId && !action) {
      const confirmationData = await getPendingConfirmation(confirmationId);

      if (!confirmationData) {
        res.json({
          status: 'error',
          code: 'CONFIRMATION_NOT_FOUND',
          message: 'Confirmation not found or expired. Please request the action again.',
          suggestedAction: 'The confirmation may have expired (5 minute TTL). Re-initiate the action.',
        });
        return;
      }

      // Determine action and transform data based on approved flag
      action = confirmationData.action as string;
      data = confirmationData;

      // If rejected (approved === false), handle the cancellation
      if (approved === false) {
        // For budget approvals, convert to rejection
        if (action === 'approve_budget') {
          action = 'reject_budget';
          data = { ...confirmationData, rejectionReason: rejectionReason || 'Rejected by user' };
        } else {
          // For all other actions (expense reports, invoices, etc.),
          // a denied confirmation means cancel the action without executing
          await deletePendingConfirmation(confirmationId);
          res.json({
            status: 'success',
            data: {
              cancelled: true,
              message: 'Confirmation denied. No action was taken.',
              action: confirmationData.action,
            },
          });
          return;
        }
      }

      // Add comments to data if provided
      if (comments) {
        data = { ...data, approverNotes: comments, comments };
      }

      // Delete the confirmation after use
      await deletePendingConfirmation(confirmationId);
    }

    logger.info('Executing confirmed action', {
      action,
      userId: userContext.userId,
      hasConfirmationId: !!confirmationId,
    });

    let result: MCPToolResponse;

    switch (action) {
      case 'delete_invoice':
        result = await executeDeleteInvoice(data, userContext);
        break;

      case 'approve_invoice':
        result = await executeApproveInvoice(data, userContext);
        break;

      case 'bulk_approve_invoices':
        result = await executeBulkApproveInvoices(data, userContext);
        break;

      case 'pay_invoice':
        result = await executePayInvoice(data, userContext);
        break;

      case 'approve_budget':
        result = await executeApproveBudget(data, userContext);
        break;

      case 'reject_budget':
        result = await executeRejectBudget(data, userContext);
        break;

      case 'delete_budget':
        result = await executeDeleteBudget(data, userContext);
        break;

      case 'approve_expense_report':
        result = await executeApproveExpenseReport(data, userContext);
        break;

      case 'reject_expense_report':
        result = await executeRejectExpenseReport(data, userContext);
        break;

      case 'reimburse_expense_report':
        result = await executeReimburseExpenseReport(data, userContext);
        break;

      case 'delete_expense_report':
        result = await executeDeleteExpenseReport(data, userContext);
        break;

      default:
        result = {
          status: 'error',
          code: 'UNKNOWN_ACTION',
          message: `Unknown action: ${action}`,
          suggestedAction: 'Check the action name and try again',
        };
    }

    res.json(result);
  } catch (error) {
    logger.error('Execute error:', error);
    res.status(500).json({
      status: 'error',
      code: 'EXECUTION_FAILED',
      message: 'Failed to execute confirmed action',
      suggestedAction: 'Please try the operation again',
    });
  }
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

const server = app.listen(PORT, async () => {
  logger.info(`MCP Finance Server listening on port ${PORT}`);
  logger.info('Architecture version: 1.4');

  // Check database connection
  const dbHealthy = await checkConnection();
  if (dbHealthy) {
    logger.info('Database connection: OK');
  } else {
    logger.error('Database connection: FAILED');
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing server...');
  server.close(async () => {
    await closePool();
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing server...');
  server.close(async () => {
    await closePool();
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;

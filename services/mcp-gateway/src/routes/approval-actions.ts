/**
 * Approval Actions Routes
 *
 * Gateway endpoints for approval workflows with auto-confirmation.
 * Wraps MCP server confirmation flows to provide simplified approve/reject actions.
 */
import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import axios from 'axios';
import winston from 'winston';
import { generateInternalToken, INTERNAL_TOKEN_HEADER } from '@tamshai/shared';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

const router = Router();

/**
 * Helper function to execute confirmation
 */
async function confirmAction(
  confirmationId: string,
  approved: boolean,
  gatewayUrl: string,
  authToken: string
): Promise<unknown> {
  const confirmUrl = `${gatewayUrl}/api/confirm/${confirmationId}`;

  logger.info('[APPROVAL] Executing confirmation', { confirmationId, approved });

  const response = await axios.post(
    confirmUrl,
    { approved },
    {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data;
}

/**
 * POST /api/mcp/hr/tools/approve_time_off_request
 *
 * Approve or reject a time-off request with auto-confirmation
 * Auth middleware applied at app level in index.ts
 */
router.post('/hr/tools/approve_time_off_request', async (req: AuthenticatedRequest, res: Response) => {
  const { requestId, approved } = req.body;
  const authToken = req.headers.authorization?.replace('Bearer ', '') || '';
  const userContext = req.userContext;

  if (!requestId) {
    return res.status(400).json({
      status: 'error',
      code: 'MISSING_FIELD',
      message: 'Missing required field: requestId',
    });
  }

  if (!userContext) {
    return res.status(401).json({
      status: 'error',
      code: 'UNAUTHORIZED',
      message: 'User context not found - authentication required',
    });
  }

  try {
    const mcpHrUrl = process.env.MCP_HR_URL || `http://localhost:${process.env.DEV_MCP_HR}`;
    const gatewayUrl = `http://localhost:${process.env.PORT || process.env.DEV_MCP_GATEWAY}`;
    const internalSecret = process.env.MCP_INTERNAL_SECRET;

    if (!internalSecret) {
      logger.error('[APPROVAL] MCP_INTERNAL_SECRET not configured');
      return res.status(500).json({
        status: 'error',
        code: 'CONFIG_ERROR',
        message: 'Internal authentication not configured',
      });
    }

    logger.info('[APPROVAL] Approving time-off request', { requestId, approved, userId: userContext.userId });

    // Generate MCP internal token for service-to-service authentication
    const internalToken = generateInternalToken(internalSecret, userContext.userId, userContext.roles);

    // Call MCP HR tool with userContext
    const mcpResponse = await axios.post(
      `${mcpHrUrl}/tools/approve_time_off_request`,
      {
        userContext,  // Include userContext in body
        requestId,
        approved: approved !== false
      },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          [INTERNAL_TOKEN_HEADER]: internalToken,  // Add internal authentication
          'Content-Type': 'application/json',
        },
      }
    );

    // If pending_confirmation, auto-confirm immediately
    if (mcpResponse.data.status === 'pending_confirmation' && mcpResponse.data.confirmationId) {
      const confirmResult = await confirmAction(
        mcpResponse.data.confirmationId,
        true,
        gatewayUrl,
        authToken!
      );

      return res.json({
        status: 'success',
        message: 'Time-off request approved successfully',
        data: confirmResult,
      });
    }

    return res.json(mcpResponse.data);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const statusCode = error && typeof error === 'object' && 'response' in error &&
                       error.response && typeof error.response === 'object' &&
                       'status' in error.response ?
                       (error.response.status as number) : 500;
    const details = error && typeof error === 'object' && 'response' in error &&
                    error.response && typeof error.response === 'object' &&
                    'data' in error.response ?
                    error.response.data : errorMessage;

    logger.error('[APPROVAL] Time-off approval failed', { error: errorMessage });

    return res.status(statusCode).json({
      status: 'error',
      code: 'APPROVAL_FAILED',
      message: 'Failed to approve time-off request',
      details,
    });
  }
});

/**
 * POST /api/mcp/finance/tools/approve_expense_report
 *
 * Approve an expense report with auto-confirmation
 * Auth middleware applied at app level in index.ts
 */
router.post('/finance/tools/approve_expense_report', async (req: AuthenticatedRequest, res: Response) => {
  const { reportId, approved } = req.body;
  const authToken = req.headers.authorization?.replace('Bearer ', '') || '';
  const userContext = req.userContext;

  if (!reportId) {
    return res.status(400).json({
      status: 'error',
      code: 'MISSING_FIELD',
      message: 'Missing required field: reportId',
    });
  }

  if (!userContext) {
    return res.status(401).json({
      status: 'error',
      code: 'UNAUTHORIZED',
      message: 'User context not found - authentication required',
    });
  }

  try {
    const mcpFinanceUrl = process.env.MCP_FINANCE_URL || `http://localhost:${process.env.DEV_MCP_FINANCE}`;
    const gatewayUrl = `http://localhost:${process.env.PORT || process.env.DEV_MCP_GATEWAY}`;
    const internalSecret = process.env.MCP_INTERNAL_SECRET;

    if (!internalSecret) {
      logger.error('[APPROVAL] MCP_INTERNAL_SECRET not configured');
      return res.status(500).json({
        status: 'error',
        code: 'CONFIG_ERROR',
        message: 'Internal authentication not configured',
      });
    }

    logger.info('[APPROVAL] Approving expense report', { reportId, approved, userId: userContext.userId });

    // Generate MCP internal token for service-to-service authentication
    const internalToken = generateInternalToken(internalSecret, userContext.userId, userContext.roles);

    // Call MCP Finance tool with userContext
    const mcpResponse = await axios.post(
      `${mcpFinanceUrl}/tools/approve_expense_report`,
      {
        userContext,  // Include userContext in body
        reportId,
        approved: approved !== false
      },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          [INTERNAL_TOKEN_HEADER]: internalToken,  // Add internal authentication
          'Content-Type': 'application/json',
        },
      }
    );

    // If pending_confirmation, auto-confirm immediately
    if (mcpResponse.data.status === 'pending_confirmation' && mcpResponse.data.confirmationId) {
      const confirmResult = await confirmAction(
        mcpResponse.data.confirmationId,
        true,
        gatewayUrl,
        authToken!
      );

      return res.json({
        status: 'success',
        message: 'Expense report approved successfully',
        data: confirmResult,
      });
    }

    return res.json(mcpResponse.data);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const statusCode = error && typeof error === 'object' && 'response' in error &&
                       error.response && typeof error.response === 'object' &&
                       'status' in error.response ?
                       (error.response.status as number) : 500;
    const details = error && typeof error === 'object' && 'response' in error &&
                    error.response && typeof error.response === 'object' &&
                    'data' in error.response ?
                    error.response.data : errorMessage;

    logger.error('[APPROVAL] Expense approval failed', { error: errorMessage });

    return res.status(statusCode).json({
      status: 'error',
      code: 'APPROVAL_FAILED',
      message: 'Failed to approve expense report',
      details,
    });
  }
});

/**
 * POST /api/mcp/finance/tools/approve_budget
 *
 * Approve a pending budget with auto-confirmation
 * Auth middleware applied at app level in index.ts
 */
router.post('/finance/tools/approve_budget', async (req: AuthenticatedRequest, res: Response) => {
  const { budgetId, approved, approvedAmount, approverNotes } = req.body;
  const authToken = req.headers.authorization?.replace('Bearer ', '') || '';

  if (!budgetId) {
    return res.status(400).json({
      status: 'error',
      code: 'MISSING_FIELD',
      message: 'Missing required field: budgetId',
    });
  }

  try {
    const mcpFinanceUrl = process.env.MCP_FINANCE_URL || `http://localhost:${process.env.DEV_MCP_FINANCE}`;
    const gatewayUrl = `http://localhost:${process.env.PORT || process.env.DEV_MCP_GATEWAY}`;

    logger.info('[APPROVAL] Approving budget', { budgetId, approved });

    // Call MCP Finance tool
    const mcpResponse = await axios.post(
      `${mcpFinanceUrl}/tools/approve_budget`,
      { budgetId, approved: approved !== false, approvedAmount, approverNotes },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // If pending_confirmation, auto-confirm immediately
    if (mcpResponse.data.status === 'pending_confirmation' && mcpResponse.data.confirmationId) {
      const confirmResult = await confirmAction(
        mcpResponse.data.confirmationId,
        true,
        gatewayUrl,
        authToken!
      );

      return res.json({
        status: 'success',
        message: 'Budget approved successfully',
        data: confirmResult,
      });
    }

    return res.json(mcpResponse.data);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const statusCode = error && typeof error === 'object' && 'response' in error &&
                       error.response && typeof error.response === 'object' &&
                       'status' in error.response ?
                       (error.response.status as number) : 500;
    const details = error && typeof error === 'object' && 'response' in error &&
                    error.response && typeof error.response === 'object' &&
                    'data' in error.response ?
                    error.response.data : errorMessage;

    logger.error('[APPROVAL] Budget approval failed', { error: errorMessage });

    return res.status(statusCode).json({
      status: 'error',
      code: 'APPROVAL_FAILED',
      message: 'Failed to approve budget',
      details,
    });
  }
});

export default router;

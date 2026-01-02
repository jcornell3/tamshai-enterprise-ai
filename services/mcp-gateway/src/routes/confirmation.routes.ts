/**
 * Confirmation Routes
 *
 * Routes: /api/confirm/:confirmationId (POST)
 *
 * Handles human-in-the-loop confirmations for write operations (v1.4 Section 5.6).
 * Retrieves pending action from Redis and executes or cancels it.
 *
 * Extracted from index.ts for testability (Phase 7 Refactoring)
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
import { Logger } from 'winston';
import { getPendingConfirmation } from '../utils/redis';
import { UserContext } from '../test-utils/mock-user-context';

// Extended Request type with userContext property
interface AuthenticatedRequest extends Request {
  userContext?: UserContext;
}

export interface MCPServerUrlConfig {
  hr: string;
  finance: string;
  sales: string;
  support: string;
}

export interface ConfirmationRoutesDependencies {
  logger: Logger;
  mcpServerUrls: MCPServerUrlConfig;
  timeout?: number;
}

/**
 * Creates confirmation routes with dependency injection
 */
export function createConfirmationRoutes(deps: ConfirmationRoutesDependencies): Router {
  const router = Router();
  const { logger, mcpServerUrls, timeout = 30000 } = deps;

  /**
   * POST /confirm/:confirmationId
   * Handles human-in-the-loop confirmations for write operations
   */
  router.post('/confirm/:confirmationId', async (req: Request, res: Response) => {
    const { confirmationId } = req.params;
    const { approved } = req.body;
    const userContext: UserContext = (req as AuthenticatedRequest).userContext!;
    const requestId = req.headers['x-request-id'] as string;

    logger.info('Confirmation request', {
      requestId,
      confirmationId,
      approved,
      userId: userContext.userId,
    });

    if (typeof approved !== 'boolean') {
      res.status(400).json({ error: 'Field "approved" must be a boolean' });
      return;
    }

    try {
      // Retrieve pending confirmation from Redis
      const pendingAction = await getPendingConfirmation(confirmationId);

      if (!pendingAction) {
        res.status(404).json({
          error: 'Confirmation not found or expired',
          message: '⏱️ Confirmation expired. Please retry the operation.',
        });
        return;
      }

      // Verify user is the same one who initiated the request
      if (pendingAction.userId !== userContext.userId) {
        logger.warn('Confirmation user mismatch', {
          requestId,
          confirmationId,
          initiatingUser: pendingAction.userId,
          confirmingUser: userContext.userId,
        });
        res.status(403).json({ error: 'Confirmation can only be completed by the initiating user' });
        return;
      }

      if (!approved) {
        // User rejected the action
        logger.info('Action rejected by user', { requestId, confirmationId });
        res.json({
          status: 'cancelled',
          message: '❌ Action cancelled',
        });
        return;
      }

      // Execute the confirmed action by calling the MCP server
      // SECURITY: Validate mcpServer is a known server name to prevent property injection
      const validServerNames = Object.keys(mcpServerUrls);
      const mcpServerName = typeof pendingAction.mcpServer === 'string' ? pendingAction.mcpServer : '';
      if (!mcpServerName || !validServerNames.includes(mcpServerName)) {
        logger.warn('Invalid MCP server in pending action', {
          requestId,
          confirmationId,
          attemptedServer: String(pendingAction.mcpServer).substring(0, 50),
          validServers: validServerNames,
        });
        res.status(500).json({ error: 'Invalid MCP server in pending action' });
        return;
      }
      const mcpServerUrl = mcpServerUrls[mcpServerName as keyof MCPServerUrlConfig];

      const executeResponse = await axios.post(
        `${mcpServerUrl}/execute`,
        {
          action: pendingAction.action,
          data: pendingAction,
          userContext: {
            userId: userContext.userId,
            username: userContext.username,
            roles: userContext.roles,
          },
        },
        {
          timeout,
          headers: {
            'Content-Type': 'application/json',
            'X-User-ID': userContext.userId,
            'X-User-Roles': userContext.roles.join(','),
            'X-Request-ID': requestId,
          },
        }
      );

      logger.info('Action executed successfully', {
        requestId,
        confirmationId,
        action: pendingAction.action,
      });

      res.json({
        status: 'success',
        message: '✅ Action completed successfully',
        result: executeResponse.data,
      });
    } catch (error) {
      logger.error('Confirmation execution error:', error);
      res.status(500).json({
        error: 'Failed to execute confirmed action',
        requestId,
      });
    }
  });

  return router;
}

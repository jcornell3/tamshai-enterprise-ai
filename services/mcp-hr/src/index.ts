/**
 * MCP HR Server (Architecture v1.4)
 *
 * Provides employee data access with:
 * - Row Level Security (RLS) enforcement
 * - LLM-friendly error responses (Section 7.4)
 * - Truncation warnings for large result sets (Section 5.3)
 * - Human-in-the-loop confirmations for write operations (Section 5.6)
 *
 * Port: 3101
 */

import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import winston from 'winston';
import { Queue } from 'bullmq';
import KeycloakAdminClient from '@keycloak/keycloak-admin-client';
import pool, { UserContext, checkConnection, closePool, queryWithRLS } from './database/connection';
import {
  IdentityService,
  CleanupQueue,
  KcAdminClient,
  KcUserRepresentation,
  KcRoleRepresentation,
  KcClientRepresentation,
  transformEmailForDatabaseLookup,
} from './services/identity';
import { getEmployee, GetEmployeeInputSchema } from './tools/get-employee';
import { listEmployees, ListEmployeesInputSchema } from './tools/list-employees';
import {
  deleteEmployee,
  executeDeleteEmployee,
  DeleteEmployeeInputSchema,
} from './tools/delete-employee';
import {
  updateSalary,
  executeUpdateSalary,
  UpdateSalaryInputSchema,
} from './tools/update-salary';
import { MCPToolResponse } from './types/response';

dotenv.config();

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

const app = express();
const PORT = parseInt(process.env.PORT || '3101');

// Authorization helper - checks if user has HR access
function hasHRAccess(roles: string[]): boolean {
  return roles.some(role =>
    role === 'hr-read' ||
    role === 'hr-write' ||
    role === 'executive' ||
    role === 'manager' ||
    role === 'user'  // Users can see their own data via RLS
  );
}

// Middleware
app.use(express.json());

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

app.get('/health', async (req: Request, res: Response) => {
  const dbHealthy = await checkConnection();

  if (!dbHealthy) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  res.json({
    status: 'healthy',
    service: 'mcp-hr',
    version: '1.4.0',
    database: 'connected',
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// MCP QUERY ENDPOINT
// =============================================================================

/**
 * Main query endpoint called by MCP Gateway
 *
 * Analyzes the natural language query and routes to appropriate tool.
 * Supports cursor-based pagination for complete data retrieval.
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
      query: query?.substring(0, 100),
      userId: userContext.userId,
      roles: userContext.roles,
      hasCursor: !!cursor,
    });

    // Analyze the query to determine which tool to invoke
    const queryLower = (query || '').toLowerCase();

    // Check for pagination requests (next page, more, continue)
    const isPaginationRequest = queryLower.includes('next page') ||
      queryLower.includes('more employees') ||
      queryLower.includes('show more') ||
      queryLower.includes('continue') ||
      queryLower.includes('next batch') ||
      !!cursor;  // If cursor is provided, it's a pagination request

    // Check for "my team" / "direct reports" queries
    const isMyTeamQuery = queryLower.includes('my team') ||
      queryLower.includes('team members') ||
      queryLower.includes('my direct reports') ||
      queryLower.includes('direct reports') ||
      queryLower.includes('who reports to me') ||
      queryLower.includes('my employees') ||
      queryLower.includes('people who report');

    // Check for employee listing queries
    const isListQuery = queryLower.includes('list') ||
      queryLower.includes('all employees') ||
      queryLower.includes('show employees') ||
      queryLower.includes('employee list') ||
      queryLower.includes('employees') ||
      queryLower.includes('who works') ||
      queryLower.includes('staff');

    // Check for specific employee queries (ID or name)
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const hasEmployeeId = uuidPattern.test(query || '');

    // Extract filter keywords
    // Department: match "in X department", "from X", or "department X"
    const departmentMatch = queryLower.match(/(?:in\s+(\w+)\s+department|from\s+(\w+)|department\s+(\w+))/);
    // Location: only match explicit location keywords (not "in" which is ambiguous)
    const locationMatch = queryLower.match(/(?:at|location|based in|located in|office)\s+([^,]+)/);

    let result: MCPToolResponse;

    if (hasEmployeeId && !isPaginationRequest) {
      // Get specific employee by ID
      const employeeId = query.match(uuidPattern)?.[0];
      result = await getEmployee({ employeeId: employeeId! }, userContext);
    } else if (isMyTeamQuery && !isPaginationRequest) {
      // Query for the current user's direct reports
      // First, find the user's employee ID by their email

      // Check if email is available for lookup
      if (!userContext.email) {
        result = {
          status: 'error',
          code: 'MISSING_EMAIL',
          message: 'Your email is required to look up your team members',
          suggestedAction: 'Ensure your authentication token includes your email address',
        };
      } else {
        // Transform email from Keycloak format (@tamshai.local in dev) to DB format (@tamshai.com)
        const dbEmail = transformEmailForDatabaseLookup(userContext.email);
        logger.info('Looking up user employee ID for team query', {
          email: userContext.email,
          dbEmail,
        });

        try {
          // Use queryWithRLS to respect RLS policies while looking up user
          // Search by both original and transformed email for robustness
          const userLookupResult = await queryWithRLS(
            userContext,
            'SELECT id FROM hr.employees WHERE work_email = $1 OR email = $1 OR work_email = $2 OR email = $2',
            [userContext.email, dbEmail]
          );

          if (userLookupResult.rows.length === 0) {
            // User not found in employee database
            result = {
              status: 'error',
              code: 'USER_NOT_FOUND',
              message: `Could not find your employee record (${userContext.email})`,
              suggestedAction: 'Ensure your Keycloak email matches your employee record in the HR database',
            };
          } else {
            const managerId = userLookupResult.rows[0].id;
            logger.info('Found user employee ID, querying direct reports', { managerId });

            // Query for employees who report to this manager
            result = await listEmployees({ managerId, limit: 50 }, userContext);

            // Add context to the response for clarity
            if (result.status === 'success') {
              const directReports = result.data as any[];
              logger.info('Found direct reports', { count: directReports.length });
            }
          }
        } catch (dbError) {
          logger.error('Database error looking up user', dbError);
          result = {
            status: 'error',
            code: 'DATABASE_ERROR',
            message: 'Failed to look up your employee record',
            suggestedAction: 'Please try again or contact support',
          };
        }
      }
    } else if (isListQuery || isPaginationRequest) {
      // List employees with optional filters and pagination
      const input: any = { limit: 50 };

      // Pass cursor for pagination
      if (cursor) {
        input.cursor = cursor;
      }

      if (departmentMatch) {
        // Extract from whichever capture group matched (1, 2, or 3)
        input.department = departmentMatch[1] || departmentMatch[2] || departmentMatch[3];
      }
      if (locationMatch) {
        input.location = locationMatch[1].trim();
      }

      result = await listEmployees(input, userContext);
    } else {
      // Default: Return list of employees to provide context
      result = await listEmployees({ limit: 50 }, userContext);
    }

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
 * Get Employee Tool
 */
app.post('/tools/get_employee', async (req: Request, res: Response) => {
  try {
    const { userContext, employeeId } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    // Authorization check - must have HR access
    if (!hasHRAccess(userContext.roles)) {
      res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Access denied. This operation requires HR access (hr-read, hr-write, or executive role). You have: ${userContext.roles.join(', ')}`,
        suggestedAction: 'Contact your administrator to request HR access permissions.',
      });
      return;
    }

    const result = await getEmployee({ employeeId }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('get_employee error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to get employee',
    });
  }
});

/**
 * List Employees Tool (v1.4 with truncation detection)
 */
app.post('/tools/list_employees', async (req: Request, res: Response) => {
  try {
    const { userContext, department, location, managerId, limit, cursor } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    // Authorization check - must have HR access
    if (!hasHRAccess(userContext.roles)) {
      res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Access denied. This operation requires HR access (hr-read, hr-write, or executive role). You have: ${userContext.roles.join(', ')}`,
        suggestedAction: 'Contact your administrator to request HR access permissions.',
      });
      return;
    }

    const result = await listEmployees({ department, location, managerId, limit, cursor }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('list_employees error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to list employees',
    });
  }
});

/**
 * Delete Employee Tool (v1.4 with confirmation)
 */
app.post('/tools/delete_employee', async (req: Request, res: Response) => {
  try {
    const { userContext, employeeId } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await deleteEmployee({ employeeId }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('delete_employee error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to delete employee',
    });
  }
});

/**
 * Update Salary Tool (v1.4 with confirmation)
 */
app.post('/tools/update_salary', async (req: Request, res: Response) => {
  try {
    const { userContext, employeeId, newSalary, reason } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await updateSalary({ employeeId, newSalary, reason }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('update_salary error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to update salary',
    });
  }
});

// =============================================================================
// EXECUTE ENDPOINT (v1.4 - Called by Gateway after confirmation)
// =============================================================================

/**
 * Execute a confirmed action
 *
 * This endpoint is called by the Gateway after the user approves a
 * pending confirmation. It executes the actual write operation.
 */
app.post('/execute', async (req: Request, res: Response) => {
  try {
    const { action, data, userContext } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    logger.info('Executing confirmed action', {
      action,
      userId: userContext.userId,
    });

    let result: MCPToolResponse;

    switch (action) {
      case 'delete_employee':
        result = await executeDeleteEmployee(data, userContext);
        break;

      case 'update_salary':
        result = await executeUpdateSalary(data, userContext);
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
// PHOENIX SELF-HEALING: Identity Reconciliation
// =============================================================================

/**
 * Creates a KcAdminClient adapter that wraps the @keycloak/keycloak-admin-client
 * to match the KcAdminClient interface expected by IdentityService.
 */
function createKcAdminClientAdapter(kcAdmin: KeycloakAdminClient): KcAdminClient {
  return {
    users: {
      create: async (user: Partial<KcUserRepresentation>): Promise<{ id: string }> => {
        return kcAdmin.users.create(user);
      },
      update: async (query: { id: string }, user: Partial<KcUserRepresentation>): Promise<void> => {
        await kcAdmin.users.update(query, user);
      },
      del: async (query: { id: string }): Promise<void> => {
        await kcAdmin.users.del(query);
      },
      find: async (query: { email?: string; username?: string }): Promise<KcUserRepresentation[]> => {
        const users = await kcAdmin.users.find(query);
        return users as KcUserRepresentation[];
      },
      findOne: async (query: { id: string }): Promise<KcUserRepresentation | null> => {
        const user = await kcAdmin.users.findOne(query);
        return user ?? null;
      },
      resetPassword: async (params: {
        id: string;
        credential: { type: string; value: string; temporary: boolean };
      }): Promise<void> => {
        await kcAdmin.users.resetPassword({ id: params.id, credential: params.credential });
      },
      addClientRoleMappings: async (params: {
        id: string;
        clientUniqueId: string;
        roles: KcRoleRepresentation[];
      }): Promise<void> => {
        const rolesWithIds = params.roles.filter(
          (r): r is KcRoleRepresentation & { id: string; name: string } => !!r.id && !!r.name
        );
        await kcAdmin.users.addClientRoleMappings({
          id: params.id,
          clientUniqueId: params.clientUniqueId,
          roles: rolesWithIds.map((r) => ({ id: r.id, name: r.name })),
        });
      },
      listClientRoleMappings: async (params: {
        id: string;
        clientUniqueId: string;
      }): Promise<KcRoleRepresentation[]> => {
        const roles = await kcAdmin.users.listClientRoleMappings(params);
        return roles as KcRoleRepresentation[];
      },
      addRealmRoleMappings: async (params: {
        id: string;
        roles: KcRoleRepresentation[];
      }): Promise<void> => {
        const rolesWithIds = params.roles.filter(
          (r): r is KcRoleRepresentation & { id: string; name: string } => !!r.id && !!r.name
        );
        await kcAdmin.users.addRealmRoleMappings({
          id: params.id,
          roles: rolesWithIds.map((r) => ({ id: r.id, name: r.name })),
        });
      },
      listSessions: async (query: { id: string }): Promise<{ id: string }[]> => {
        const sessions = await kcAdmin.users.listSessions(query);
        return sessions.map((s: { id?: string }) => ({ id: s.id || '' }));
      },
      logout: async (query: { id: string }): Promise<void> => {
        await kcAdmin.users.logout(query);
      },
    },
    clients: {
      find: async (query: { clientId: string }): Promise<KcClientRepresentation[]> => {
        const clients = await kcAdmin.clients.find(query);
        return clients as KcClientRepresentation[];
      },
      listRoles: async (query: { id: string }): Promise<KcRoleRepresentation[]> => {
        const roles = await kcAdmin.clients.listRoles(query);
        return roles as KcRoleRepresentation[];
      },
    },
    roles: {
      find: async (): Promise<KcRoleRepresentation[]> => {
        const roles = await kcAdmin.roles.find();
        return roles as KcRoleRepresentation[];
      },
      findOneByName: async (query: { name: string }): Promise<KcRoleRepresentation | undefined> => {
        const role = await kcAdmin.roles.findOneByName(query);
        return role as KcRoleRepresentation | undefined;
      },
    },
    auth: async (credentials: {
      grantType: string;
      clientId: string;
      clientSecret: string;
    }): Promise<void> => {
      await kcAdmin.auth({
        grantType: credentials.grantType as 'client_credentials',
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
      });
    },
  };
}

/**
 * Phoenix Architecture: Self-healing identity reconciliation on startup.
 *
 * This function ensures HR employees are synced to Keycloak users whenever
 * mcp-hr starts. This enables "Phoenix Server" behavior where the VPS can
 * be destroyed and recreated, and users will be automatically provisioned.
 *
 * The reconciliation is idempotent - it skips users that already exist in Keycloak.
 */
async function reconcileIdentitiesOnStartup(): Promise<void> {
  const keycloakUrl = process.env.KEYCLOAK_URL || 'http://keycloak:8080';
  const keycloakRealm = process.env.KEYCLOAK_REALM || 'tamshai-corp';
  const clientId = process.env.KEYCLOAK_CLIENT_ID || 'mcp-hr-service';
  const clientSecret = process.env.MCP_HR_SERVICE_CLIENT_SECRET || '';

  // Skip if no client secret configured (e.g., in unit tests)
  if (!clientSecret) {
    logger.warn('Skipping identity reconciliation: MCP_HR_SERVICE_CLIENT_SECRET not set');
    return;
  }

  logger.info('Starting identity reconciliation (Phoenix self-healing)...', {
    keycloakUrl,
    realm: keycloakRealm,
    clientId,
  });

  try {
    // Create BullMQ queue for cleanup jobs (required by IdentityService)
    const redisHost = process.env.REDIS_HOST || 'redis';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

    const cleanupQueue = new Queue('identity-cleanup', {
      connection: { host: redisHost, port: redisPort },
    }) as CleanupQueue;

    // Create Keycloak Admin Client
    const kcAdmin = new KeycloakAdminClient({
      baseUrl: keycloakUrl,
      realmName: keycloakRealm,
    });

    // Authenticate with Keycloak
    await kcAdmin.auth({
      grantType: 'client_credentials',
      clientId,
      clientSecret,
    });
    logger.info('Keycloak authentication successful');

    // Create IdentityService with adapted Keycloak client
    const kcAdminAdapter = createKcAdminClientAdapter(kcAdmin);
    const identityService = new IdentityService(pool, kcAdminAdapter, cleanupQueue);

    // Check pending sync count
    const pendingCount = await identityService.getPendingSyncCount();
    if (pendingCount === 0) {
      logger.info('No employees pending sync. Reconciliation complete.');
      await closeQueue(cleanupQueue);
      return;
    }

    logger.info(`Found ${pendingCount} employees pending sync`);

    // Run bulk sync
    const result = await identityService.syncAllEmployees();

    logger.info('Identity reconciliation complete', {
      totalEmployees: result.totalEmployees,
      created: result.created,
      skipped: result.skipped,
      errors: result.errors.length,
      duration: `${result.duration}ms`,
    });

    if (result.errors.length > 0) {
      logger.warn(`${result.errors.length} errors during reconciliation`);
      for (const err of result.errors) {
        logger.error('Sync error', { employeeId: err.employeeId, email: err.email, error: err.error });
      }
    }

    await closeQueue(cleanupQueue);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Identity reconciliation failed (non-fatal)', { error: message });
    // Don't throw - allow server to continue running even if reconciliation fails
  }
}

async function closeQueue(queue: CleanupQueue): Promise<void> {
  try {
    if ('close' in queue) {
      await (queue as unknown as { close(): Promise<void> }).close();
    }
  } catch {
    // Ignore cleanup errors
  }
}

// =============================================================================
// SERVER STARTUP
// =============================================================================

const server = app.listen(PORT, async () => {
  logger.info(`MCP HR Server listening on port ${PORT}`);
  logger.info('Architecture version: 1.4 (Phoenix self-healing)');

  // Check database connection
  const dbHealthy = await checkConnection();
  if (dbHealthy) {
    logger.info('Database connection: OK');

    // Phoenix Architecture: Reconcile identities on startup
    // Wait for Keycloak to be ready, then sync HR employees to Keycloak users
    setTimeout(async () => {
      await reconcileIdentitiesOnStartup();
    }, 5000); // 5 second delay to allow Keycloak to be ready
  } else {
    logger.error('Database connection: FAILED');
    logger.warn('Skipping identity reconciliation due to database connection failure');
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

/**
 * List Audit Logs Tool
 *
 * Returns tax audit log entries with optional filters.
 */
import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createSuccessResponse,
  encodeCursor,
  decodeCursor,
  PaginationMetadata,
} from '../types/response';
import { withErrorHandling, handleInvalidInput } from '../utils/error-handler';
import { logger } from '../utils/logger';

// Input validation schema
export const ListAuditLogsInputSchema = z.object({
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
  action: z.enum(['create', 'update', 'delete', 'submit', 'approve', 'reject']).optional(),
  entityType: z.enum(['filing', 'estimate', 'registration', 'rate']).optional(),
  userId: z.string().optional(),
  startDate: z.string().optional(), // ISO date
  endDate: z.string().optional(), // ISO date
});

export type ListAuditLogsInput = z.infer<typeof ListAuditLogsInputSchema>;

// Audit log record type
export interface AuditLogEntry {
  log_id: string;
  timestamp: string;
  action: string;
  entity_type: string;
  entity_id: string;
  user_id: string;
  user_name: string;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  ip_address: string | null;
  notes: string | null;
}

/**
 * List audit logs with pagination and filters.
 */
export async function listAuditLogs(
  input: ListAuditLogsInput,
  userContext: UserContext
): Promise<MCPToolResponse<AuditLogEntry[]>> {
  return withErrorHandling('list_audit_logs', async () => {
    const validatedInput = ListAuditLogsInputSchema.parse(input);
    const { limit, cursor, action, entityType, userId, startDate, endDate } = validatedInput;

    logger.debug('Listing audit logs', { limit, action, entityType, userId: userContext.userId });

    // Build query with filters
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (action) {
      conditions.push(`action = $${paramIndex++}`);
      values.push(action);
    }

    if (entityType) {
      conditions.push(`entity_type = $${paramIndex++}`);
      values.push(entityType);
    }

    if (userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      values.push(userId);
    }

    if (startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      values.push(startDate);
    }

    if (endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      values.push(endDate);
    }

    // Handle cursor-based pagination
    if (cursor) {
      const decodedCursor = decodeCursor(cursor);
      if (!decodedCursor) {
        return handleInvalidInput('Invalid pagination cursor', 'cursor');
      }
      conditions.push(`(timestamp, log_id) < ($${paramIndex++}, $${paramIndex++})`);
      values.push(decodedCursor.sortKey, decodedCursor.id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Query with LIMIT + 1 to detect if more records exist
    const queryLimit = limit + 1;
    values.push(queryLimit);

    const query = `
      SELECT
        log_id,
        timestamp,
        action,
        entity_type,
        entity_id,
        user_id,
        user_name,
        previous_value,
        new_value,
        ip_address,
        notes
      FROM tax.audit_logs
      ${whereClause}
      ORDER BY timestamp DESC, log_id DESC
      LIMIT $${paramIndex}
    `;

    const result = await queryWithRLS<AuditLogEntry>(userContext, query, values);

    // Determine if there are more records
    const hasMore = result.rowCount! > limit;
    const records = hasMore ? result.rows.slice(0, limit) : result.rows;

    // Build pagination metadata
    let metadata: PaginationMetadata | undefined;
    if (hasMore && records.length > 0) {
      const lastRecord = records[records.length - 1];
      metadata = {
        hasMore: true,
        nextCursor: encodeCursor({
          sortKey: lastRecord!.timestamp,
          id: lastRecord!.log_id,
        }),
        returnedCount: records.length,
        totalEstimate: `${limit}+`,
        hint: 'Use the nextCursor value to retrieve the next page of results.',
      };
    }

    logger.info('Listed audit logs', {
      count: records.length,
      hasMore,
      userId: userContext.userId,
    });

    return createSuccessResponse(records, metadata);
  });
}

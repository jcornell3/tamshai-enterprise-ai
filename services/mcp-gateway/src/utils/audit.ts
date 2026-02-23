/**
 * Audit Logging Utility (H5 - Security Governance)
 *
 * Provides structured audit logging for security-relevant events.
 * Output format is optimized for SIEM ingestion and compliance reporting.
 *
 * Audit Events Include:
 * - Authentication attempts (success/failure)
 * - Authorization decisions
 * - Data access patterns
 * - Rate limit violations
 * - Prompt injection attempts
 * - Human-in-the-loop confirmations
 *
 * Environment Variables:
 *   AUDIT_LOG_ENABLED=true              - Enable audit logging (default: true in prod)
 *   AUDIT_LOG_ENDPOINT=https://...      - External SIEM webhook (optional)
 *   AUDIT_LOG_LEVEL=info                - Minimum severity to log
 *   BETTER_STACK_SOURCE_TOKEN=xxx       - Better Stack (Logtail) source token (optional)
 *
 * Better Stack Integration:
 *   If BETTER_STACK_SOURCE_TOKEN is set, logs are automatically sent to
 *   Better Stack's HTTP ingestion endpoint (https://in.logs.betterstack.com).
 *   This takes precedence over AUDIT_LOG_ENDPOINT.
 */

import { logger } from './logger';

/**
 * Audit event severity levels (aligned with RFC 5424)
 */
export type AuditSeverity = 'emergency' | 'alert' | 'critical' | 'error' | 'warning' | 'notice' | 'info' | 'debug';

/**
 * Audit event categories for filtering and routing
 */
export type AuditCategory =
  | 'authentication'   // Login, logout, token refresh
  | 'authorization'    // RBAC decisions, permission checks
  | 'data_access'      // Read operations on sensitive data
  | 'data_mutation'    // Write/delete operations
  | 'security'         // Injection attempts, rate limits, anomalies
  | 'confirmation'     // Human-in-the-loop approvals/rejections
  | 'system';          // Service lifecycle, config changes

/**
 * Structured audit event payload
 */
export interface AuditEvent {
  /** Event timestamp (ISO 8601) */
  timestamp: string;
  /** Unique event identifier */
  eventId: string;
  /** Severity level */
  severity: AuditSeverity;
  /** Event category */
  category: AuditCategory;
  /** Human-readable event description */
  message: string;
  /** User identifier (if authenticated) */
  userId?: string;
  /** Username (if available) */
  username?: string;
  /** User's roles at time of event */
  roles?: string[];
  /** Client IP address */
  clientIp?: string;
  /** HTTP request ID for correlation */
  requestId?: string;
  /** Target resource (API path, MCP server, etc.) */
  resource?: string;
  /** Action performed (read, write, delete, etc.) */
  action?: string;
  /** Outcome of the action */
  outcome: 'success' | 'failure' | 'pending' | 'blocked';
  /** Additional metadata specific to the event type */
  metadata?: Record<string, unknown>;
  /** Service that generated the event */
  service: string;
  /** Environment (dev, stage, prod) */
  environment: string;
}

/**
 * Audit logger configuration
 */
interface AuditConfig {
  enabled: boolean;
  minSeverity: AuditSeverity;
  serviceName: string;
  environment: string;
  externalEndpoint?: string;
  betterStackToken?: string;
}

/** Better Stack HTTP ingestion endpoint */
const BETTER_STACK_ENDPOINT = 'https://in.logs.betterstack.com';

const severityOrder: AuditSeverity[] = [
  'emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug'
];

function shouldLog(eventSeverity: AuditSeverity, minSeverity: AuditSeverity): boolean {
  return severityOrder.indexOf(eventSeverity) <= severityOrder.indexOf(minSeverity);
}

function generateEventId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Get audit configuration from environment
 */
function getAuditConfig(): AuditConfig {
  return {
    enabled: process.env.AUDIT_LOG_ENABLED !== 'false',
    minSeverity: (process.env.AUDIT_LOG_LEVEL as AuditSeverity) || 'info',
    serviceName: 'mcp-gateway',
    environment: process.env.NODE_ENV || 'development',
    externalEndpoint: process.env.AUDIT_LOG_ENDPOINT,
    betterStackToken: process.env.BETTER_STACK_SOURCE_TOKEN,
  };
}

/**
 * Send audit event to Better Stack (Logtail)
 * Non-blocking, fire-and-forget with error logging
 */
async function sendToBetterStack(event: AuditEvent, token: string): Promise<void> {
  try {
    const response = await fetch(BETTER_STACK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        dt: event.timestamp,
        level: event.severity,
        ...event,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.warn('Failed to send audit event to Better Stack', {
        eventId: event.eventId,
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (error) {
    logger.warn('Error sending audit event to Better Stack', {
      eventId: event.eventId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Send audit event to external SIEM endpoint (generic webhook)
 * Non-blocking, fire-and-forget with error logging
 */
async function sendToExternalSIEM(event: AuditEvent, endpoint: string): Promise<void> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Audit-Event-Id': event.eventId,
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.warn('Failed to send audit event to SIEM', {
        eventId: event.eventId,
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (error) {
    logger.warn('Error sending audit event to SIEM', {
      eventId: event.eventId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Log an audit event
 */
export function logAuditEvent(
  category: AuditCategory,
  severity: AuditSeverity,
  message: string,
  details: Partial<Omit<AuditEvent, 'timestamp' | 'eventId' | 'category' | 'severity' | 'message' | 'service' | 'environment'>> & { outcome: AuditEvent['outcome'] }
): void {
  const config = getAuditConfig();

  if (!config.enabled || !shouldLog(severity, config.minSeverity)) {
    return;
  }

  const event: AuditEvent = {
    timestamp: new Date().toISOString(),
    eventId: generateEventId(),
    severity,
    category,
    message,
    service: config.serviceName,
    environment: config.environment,
    ...details,
  };

  // Log to stdout (picked up by Docker logging driver)
  // Use 'audit' as the log level context for filtering
  const logMethod = severity === 'debug' ? 'debug' :
    severity === 'info' || severity === 'notice' ? 'info' :
    severity === 'warning' ? 'warn' : 'error';

  logger[logMethod](`[AUDIT] ${message}`, {
    audit: true,
    ...event,
  });

  // Send to Better Stack if configured (takes precedence)
  if (config.betterStackToken) {
    void sendToBetterStack(event, config.betterStackToken);
  }
  // Otherwise, send to generic SIEM endpoint if configured
  else if (config.externalEndpoint) {
    void sendToExternalSIEM(event, config.externalEndpoint);
  }
}

/**
 * Convenience functions for common audit scenarios
 */
export const audit = {
  /**
   * Log successful authentication
   */
  authSuccess: (userId: string, username: string, requestId?: string, clientIp?: string) => {
    logAuditEvent('authentication', 'info', `User authenticated successfully: ${username}`, {
      userId,
      username,
      requestId,
      clientIp,
      action: 'authenticate',
      outcome: 'success',
    });
  },

  /**
   * Log failed authentication attempt
   */
  authFailure: (reason: string, username?: string, requestId?: string, clientIp?: string) => {
    logAuditEvent('authentication', 'warning', `Authentication failed: ${reason}`, {
      username,
      requestId,
      clientIp,
      action: 'authenticate',
      outcome: 'failure',
      metadata: { reason },
    });
  },

  /**
   * Log authorization decision
   */
  authzDecision: (
    userId: string,
    resource: string,
    action: string,
    granted: boolean,
    roles: string[],
    requestId?: string
  ) => {
    const outcome = granted ? 'success' : 'blocked';
    const severity = granted ? 'info' : 'warning';
    logAuditEvent('authorization', severity, `Authorization ${outcome}: ${action} on ${resource}`, {
      userId,
      roles,
      resource,
      action,
      requestId,
      outcome,
      metadata: { granted },
    });
  },

  /**
   * Log data access (read operations)
   */
  dataAccess: (
    userId: string,
    resource: string,
    recordCount: number,
    requestId?: string,
    truncated?: boolean
  ) => {
    logAuditEvent('data_access', 'info', `Data accessed: ${resource} (${recordCount} records)`, {
      userId,
      resource,
      action: 'read',
      requestId,
      outcome: 'success',
      metadata: { recordCount, truncated },
    });
  },

  /**
   * Log data mutation (write/delete operations)
   */
  dataMutation: (
    userId: string,
    resource: string,
    action: string,
    success: boolean,
    requestId?: string,
    metadata?: Record<string, unknown>
  ) => {
    const outcome = success ? 'success' : 'failure';
    const severity = success ? 'notice' : 'warning';
    logAuditEvent('data_mutation', severity, `Data ${action}: ${resource}`, {
      userId,
      resource,
      action,
      requestId,
      outcome,
      metadata,
    });
  },

  /**
   * Log security violation (injection attempt, rate limit, etc.)
   */
  securityViolation: (
    type: string,
    details: string,
    userId?: string,
    requestId?: string,
    clientIp?: string
  ) => {
    logAuditEvent('security', 'alert', `Security violation: ${type}`, {
      userId,
      requestId,
      clientIp,
      action: type,
      outcome: 'blocked',
      metadata: { details },
    });
  },

  /**
   * Log rate limit violation
   */
  rateLimitExceeded: (
    userId: string | undefined,
    endpoint: string,
    requestId?: string,
    clientIp?: string
  ) => {
    logAuditEvent('security', 'warning', `Rate limit exceeded: ${endpoint}`, {
      userId,
      resource: endpoint,
      action: 'rate_limit',
      requestId,
      clientIp,
      outcome: 'blocked',
    });
  },

  /**
   * Log prompt injection attempt
   */
  promptInjectionBlocked: (
    userId: string,
    reason: string,
    requestId?: string,
    clientIp?: string
  ) => {
    logAuditEvent('security', 'alert', `Prompt injection blocked: ${reason}`, {
      userId,
      requestId,
      clientIp,
      action: 'prompt_injection',
      outcome: 'blocked',
      metadata: { reason },
    });
  },

  /**
   * Log human-in-the-loop confirmation
   */
  confirmation: (
    userId: string,
    confirmationId: string,
    action: string,
    approved: boolean,
    requestId?: string
  ) => {
    const outcome = approved ? 'success' : 'blocked';
    logAuditEvent('confirmation', 'notice', `Confirmation ${approved ? 'approved' : 'rejected'}: ${action}`, {
      userId,
      requestId,
      action,
      outcome,
      metadata: { confirmationId, approved },
    });
  },

  /**
   * Log PII redaction event
   */
  piiRedacted: (
    userId: string,
    redactionTypes: string[],
    direction: 'input' | 'output',
    requestId?: string
  ) => {
    logAuditEvent('security', 'info', `PII redacted in ${direction}: ${redactionTypes.join(', ')}`, {
      userId,
      requestId,
      action: 'pii_redaction',
      outcome: 'success',
      metadata: { redactionTypes, direction },
    });
  },
};

export default audit;

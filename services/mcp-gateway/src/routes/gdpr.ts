/**
 * GDPR Compliance Routes (v1.5)
 *
 * Implements GDPR data subject rights:
 * - Art. 15: Right of Access (data export)
 * - Art. 17: Right to Erasure (data deletion)
 * - Art. 33: Breach Notification
 *
 * Access Control: HR representatives only (hr-write role required)
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '@tamshai/shared';

// Types
interface UserContext {
  userId: string;
  username: string;
  email?: string;
  roles: string[];
}

interface GDPRExport {
  exportId: string;
  employeeId: string;
  status: 'processing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  requestedBy: string;
  reason?: string;
  data?: GDPRExportData;
}

interface GDPRExportData {
  subject: {
    id: string;
    name: string;
    email: string;
  };
  exportDate: string;
  requestedBy: string;
  data: {
    hrData: Record<string, unknown>;
    financeData: Record<string, unknown>;
    supportData: Record<string, unknown>;
    auditLogs: Record<string, unknown>[];
  };
  retentionInfo: {
    payroll: string;
    employment: string;
    performance: string;
  };
}

interface GDPRErasure {
  erasureId: string;
  employeeId: string;
  status: 'pending_confirmation' | 'processing' | 'completed' | 'cancelled' | 'failed';
  createdAt: Date;
  confirmedAt?: Date;
  completedAt?: Date;
  requestedBy: string;
  reason?: string;
  retainAuditLog: boolean;
  retainFinancialRecords: boolean;
  affectedSystems: string[];
  affectedRecords?: Record<string, number>;
}

interface GDPRBreach {
  breachId: string;
  breachType: 'unauthorized_access' | 'data_loss' | 'ransomware' | 'disclosure' | 'system_compromise';
  status: 'registered' | 'investigating' | 'contained' | 'notified' | 'closed';
  affectedDataTypes: string[];
  affectedCount: number;
  discoveryDate: Date;
  registeredAt: Date;
  notificationDeadline: Date;
  description: string;
  containmentActions: string[];
  registeredBy: string;
  requiredActions: {
    action: string;
    deadline: Date;
    status: 'pending' | 'in_progress' | 'completed';
    template?: string;
  }[];
}

// In-memory storage (replace with database in production)
const gdprExports: Map<string, GDPRExport> = new Map();
const erasures: Map<string, GDPRErasure> = new Map();
const breaches: Map<string, GDPRBreach> = new Map();

// Logger
const logger = createLogger('mcp-gateway');

// Create router
const router = Router();

// Middleware to check HR role
function requireHRRole(req: Request, res: Response, next: () => void): void {
  const userContext = (req as Request & { userContext?: UserContext }).userContext;

  if (!userContext) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const hasHRWrite = userContext.roles.includes('hr-write');
  const hasSecurityAdmin = userContext.roles.includes('security-admin');

  if (!hasHRWrite && !hasSecurityAdmin) {
    logger.warn('GDPR endpoint access denied', {
      userId: userContext.userId,
      roles: userContext.roles,
      path: req.path,
    });
    res.status(403).json({ error: 'Requires hr-write or security-admin role' });
    return;
  }

  next();
}

// =============================================================================
// GDPR Export Endpoints (Art. 15 - Right of Access)
// =============================================================================

/**
 * POST /api/admin/gdpr/export
 * Initiate a GDPR data export for an employee
 */
router.post('/export', requireHRRole, async (req: Request, res: Response) => {
  const userContext = (req as Request & { userContext?: UserContext }).userContext!;
  const { employeeId, reason } = req.body;

  if (!employeeId) {
    res.status(400).json({ error: 'employeeId is required' });
    return;
  }

  const exportId = uuidv4();
  const now = new Date();

  const exportRecord: GDPRExport = {
    exportId,
    employeeId,
    status: 'processing',
    createdAt: now,
    requestedBy: userContext.userId,
    reason,
  };

  gdprExports.set(exportId, exportRecord);

  logger.info('GDPR export initiated', {
    exportId,
    employeeId,
    requestedBy: userContext.userId,
    reason,
  });

  // Simulate async processing (in production, this would query MCP servers)
  setTimeout(() => {
    const record = gdprExports.get(exportId);
    if (record) {
      record.status = 'completed';
      record.completedAt = new Date();
      record.data = {
        subject: {
          id: employeeId,
          name: '[Employee Name]', // Would come from MCP-HR
          email: '[employee@company.com]',
        },
        exportDate: new Date().toISOString(),
        requestedBy: userContext.username,
        data: {
          hrData: {
            note: 'HR data would be fetched from MCP-HR server',
            employeeId,
          },
          financeData: {
            note: 'Finance data would be fetched from MCP-Finance server',
          },
          supportData: {
            note: 'Support tickets would be fetched from MCP-Support server',
          },
          auditLogs: [
            { note: 'AI query audit logs for last 90 days would be included' },
          ],
        },
        retentionInfo: {
          payroll: '7 years (legal requirement)',
          employment: 'Duration + statute of limitations',
          performance: 'Employment + 3 years',
        },
      };
      gdprExports.set(exportId, record);
    }
  }, 2000);

  res.status(202).json({
    exportId,
    status: 'processing',
    employeeId,
    createdAt: now.toISOString(),
    estimatedCompletion: new Date(now.getTime() + 60000).toISOString(),
    downloadUrl: `/api/admin/gdpr/export/${exportId}/download`,
  });
});

/**
 * GET /api/admin/gdpr/export/:exportId/download
 * Download a completed GDPR export
 */
router.get('/export/:exportId/download', requireHRRole, (req: Request, res: Response) => {
  const { exportId } = req.params as Record<string, string>;
  const exportRecord = gdprExports.get(exportId);

  if (!exportRecord) {
    res.status(404).json({ error: 'Export not found or expired' });
    return;
  }

  if (exportRecord.status === 'processing') {
    res.status(202).json({
      status: 'processing',
      message: 'Export is still being generated',
    });
    return;
  }

  if (exportRecord.status === 'failed') {
    res.status(500).json({
      status: 'failed',
      error: 'Export generation failed',
    });
    return;
  }

  logger.info('GDPR export downloaded', {
    exportId,
    employeeId: exportRecord.employeeId,
    downloadedBy: (req as Request & { userContext?: UserContext }).userContext?.userId,
  });

  res.json(exportRecord.data);
});

// =============================================================================
// GDPR Erasure Endpoints (Art. 17 - Right to Erasure)
// =============================================================================

/**
 * POST /api/admin/gdpr/erase
 * Initiate a GDPR data erasure request
 */
router.post('/erase', requireHRRole, async (req: Request, res: Response) => {
  const userContext = (req as Request & { userContext?: UserContext }).userContext!;
  const {
    employeeId,
    reason,
    retainAuditLog = true,
    retainFinancialRecords = true,
  } = req.body;

  if (!employeeId) {
    res.status(400).json({ error: 'employeeId is required' });
    return;
  }

  const erasureId = uuidv4();
  const now = new Date();

  // Determine affected systems
  const affectedSystems = ['mcp-hr', 'mcp-finance', 'mcp-support'];

  const erasureRecord: GDPRErasure = {
    erasureId,
    employeeId,
    status: 'pending_confirmation',
    createdAt: now,
    requestedBy: userContext.userId,
    reason,
    retainAuditLog,
    retainFinancialRecords,
    affectedSystems,
  };

  erasures.set(erasureId, erasureRecord);

  logger.info('GDPR erasure request initiated', {
    erasureId,
    employeeId,
    requestedBy: userContext.userId,
    reason,
    retainAuditLog,
    retainFinancialRecords,
  });

  res.json({
    erasureId,
    status: 'pending_confirmation',
    employeeId,
    affectedSystems,
    retentionExceptions: [
      ...(retainFinancialRecords
        ? [{ system: 'mcp-finance', reason: '7-year tax retention', anonymized: true }]
        : []),
      ...(retainAuditLog
        ? [{ system: 'audit-logs', reason: 'Compliance requirement', anonymized: true }]
        : []),
    ],
    confirmationRequired: true,
    confirmationUrl: `/api/admin/gdpr/erase/${erasureId}/confirm`,
  });
});

/**
 * POST /api/admin/gdpr/erase/:erasureId/confirm
 * Confirm and execute GDPR erasure
 */
router.post('/erase/:erasureId/confirm', requireHRRole, async (req: Request, res: Response) => {
  const userContext = (req as Request & { userContext?: UserContext }).userContext!;
  const { erasureId } = req.params as Record<string, string>;
  const { confirmed } = req.body;

  const erasureRecord = erasures.get(erasureId);

  if (!erasureRecord) {
    res.status(404).json({ error: 'Erasure request not found or expired' });
    return;
  }

  if (erasureRecord.status !== 'pending_confirmation') {
    res.status(400).json({ error: `Erasure already ${erasureRecord.status}` });
    return;
  }

  if (!confirmed) {
    erasureRecord.status = 'cancelled';
    erasures.set(erasureId, erasureRecord);

    logger.info('GDPR erasure cancelled', {
      erasureId,
      employeeId: erasureRecord.employeeId,
      cancelledBy: userContext.userId,
    });

    res.json({
      erasureId,
      status: 'cancelled',
    });
    return;
  }

  // Execute erasure
  erasureRecord.status = 'processing';
  erasureRecord.confirmedAt = new Date();
  erasures.set(erasureId, erasureRecord);

  // Simulate erasure (in production, this would call MCP servers)
  setTimeout(() => {
    const record = erasures.get(erasureId);
    if (record) {
      record.status = 'completed';
      record.completedAt = new Date();
      record.affectedRecords = {
        'mcp-hr': 1,
        'mcp-finance': record.retainFinancialRecords ? 0 : 5,
        'mcp-support': 3,
        'audit-logs': record.retainAuditLog ? 0 : 15,
      };
      erasures.set(erasureId, record);
    }
  }, 3000);

  logger.info('GDPR erasure confirmed and processing', {
    erasureId,
    employeeId: erasureRecord.employeeId,
    confirmedBy: userContext.userId,
  });

  res.json({
    erasureId,
    status: 'processing',
    message: 'Erasure in progress. Data will be anonymized/deleted according to retention policy.',
  });
});

/**
 * GET /api/admin/gdpr/erase/:erasureId
 * Get erasure status
 */
router.get('/erase/:erasureId', requireHRRole, (req: Request, res: Response) => {
  const { erasureId } = req.params as Record<string, string>;
  const erasureRecord = erasures.get(erasureId);

  if (!erasureRecord) {
    res.status(404).json({ error: 'Erasure request not found' });
    return;
  }

  res.json({
    erasureId: erasureRecord.erasureId,
    status: erasureRecord.status,
    employeeId: erasureRecord.employeeId,
    createdAt: erasureRecord.createdAt.toISOString(),
    confirmedAt: erasureRecord.confirmedAt?.toISOString(),
    completedAt: erasureRecord.completedAt?.toISOString(),
    affectedSystems: erasureRecord.affectedSystems,
    affectedRecords: erasureRecord.affectedRecords,
  });
});

// =============================================================================
// Breach Notification Endpoints (Art. 33)
// =============================================================================

/**
 * POST /api/admin/gdpr/breach
 * Register a data breach
 */
router.post('/breach', requireHRRole, async (req: Request, res: Response) => {
  const userContext = (req as Request & { userContext?: UserContext }).userContext!;
  const {
    breachType,
    affectedDataTypes = [],
    affectedCount = 0,
    discoveryDate,
    description,
    containmentActions = [],
  } = req.body;

  if (!breachType || !discoveryDate || !description) {
    res.status(400).json({
      error: 'breachType, discoveryDate, and description are required',
    });
    return;
  }

  const breachId = uuidv4();
  const discovery = new Date(discoveryDate);
  const now = new Date();

  // Calculate 72-hour notification deadline
  const notificationDeadline = new Date(discovery.getTime() + 72 * 60 * 60 * 1000);

  const breachRecord: GDPRBreach = {
    breachId,
    breachType,
    status: 'registered',
    affectedDataTypes,
    affectedCount,
    discoveryDate: discovery,
    registeredAt: now,
    notificationDeadline,
    description,
    containmentActions,
    registeredBy: userContext.userId,
    requiredActions: [
      {
        action: 'Notify supervisory authority',
        deadline: notificationDeadline,
        status: 'pending',
        template: `/api/admin/gdpr/breach/${breachId}/template/authority`,
      },
      {
        action: 'Assess risk to affected individuals',
        deadline: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        status: 'pending',
      },
      {
        action: 'Document breach details and response',
        deadline: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        status: 'pending',
      },
    ],
  };

  // Add individual notification if high risk
  if (affectedDataTypes.includes('health_data') ||
      affectedDataTypes.includes('credentials') ||
      affectedCount > 500) {
    breachRecord.requiredActions.push({
      action: 'Notify affected individuals (high risk)',
      deadline: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      status: 'pending',
      template: `/api/admin/gdpr/breach/${breachId}/template/individual`,
    });
  }

  breaches.set(breachId, breachRecord);

  logger.warn('GDPR breach registered', {
    breachId,
    breachType,
    affectedCount,
    discoveryDate: discovery.toISOString(),
    notificationDeadline: notificationDeadline.toISOString(),
    registeredBy: userContext.userId,
  });

  res.status(201).json({
    breachId,
    status: 'registered',
    notificationDeadline: notificationDeadline.toISOString(),
    hoursRemaining: Math.max(0, (notificationDeadline.getTime() - now.getTime()) / (60 * 60 * 1000)),
    requiredActions: breachRecord.requiredActions.map((a) => ({
      action: a.action,
      deadline: a.deadline.toISOString(),
      status: a.status,
      template: a.template,
    })),
    affectedUserList: `/api/admin/gdpr/breach/${breachId}/affected-users`,
  });
});

/**
 * GET /api/admin/gdpr/breach/:breachId
 * Get breach details
 */
router.get('/breach/:breachId', requireHRRole, (req: Request, res: Response) => {
  const { breachId } = req.params as Record<string, string>;
  const breachRecord = breaches.get(breachId);

  if (!breachRecord) {
    res.status(404).json({ error: 'Breach not found' });
    return;
  }

  const now = new Date();

  res.json({
    breachId: breachRecord.breachId,
    breachType: breachRecord.breachType,
    status: breachRecord.status,
    affectedDataTypes: breachRecord.affectedDataTypes,
    affectedCount: breachRecord.affectedCount,
    discoveryDate: breachRecord.discoveryDate.toISOString(),
    registeredAt: breachRecord.registeredAt.toISOString(),
    notificationDeadline: breachRecord.notificationDeadline.toISOString(),
    hoursRemaining: Math.max(
      0,
      (breachRecord.notificationDeadline.getTime() - now.getTime()) / (60 * 60 * 1000)
    ),
    description: breachRecord.description,
    containmentActions: breachRecord.containmentActions,
    requiredActions: breachRecord.requiredActions.map((a) => ({
      action: a.action,
      deadline: a.deadline.toISOString(),
      status: a.status,
      template: a.template,
    })),
  });
});

/**
 * GET /api/admin/gdpr/breach
 * List all breaches
 */
router.get('/breach', requireHRRole, (req: Request, res: Response) => {
  const breachList = Array.from(breaches.values()).map((b) => ({
    breachId: b.breachId,
    breachType: b.breachType,
    status: b.status,
    affectedCount: b.affectedCount,
    discoveryDate: b.discoveryDate.toISOString(),
    notificationDeadline: b.notificationDeadline.toISOString(),
  }));

  res.json({
    breaches: breachList,
    total: breachList.length,
  });
});

export default router;

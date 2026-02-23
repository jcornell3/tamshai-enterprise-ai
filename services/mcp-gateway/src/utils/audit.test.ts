/**
 * Audit Logging Utility Tests (H5 - Security Governance)
 */

import { audit, logAuditEvent, AuditSeverity } from './audit';
import { logger } from './logger';

// Mock the logger
jest.mock('./logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock fetch for SIEM endpoint testing
global.fetch = jest.fn();

describe('Audit Logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.AUDIT_LOG_ENABLED;
    delete process.env.AUDIT_LOG_ENDPOINT;
    delete process.env.AUDIT_LOG_LEVEL;
  });

  describe('logAuditEvent', () => {
    it('should log audit events with correct structure', () => {
      logAuditEvent('authentication', 'info', 'Test message', {
        userId: 'user-123',
        outcome: 'success',
      });

      expect(logger.info).toHaveBeenCalledWith(
        '[AUDIT] Test message',
        expect.objectContaining({
          audit: true,
          category: 'authentication',
          severity: 'info',
          userId: 'user-123',
          outcome: 'success',
          service: 'mcp-gateway',
        })
      );
    });

    it('should include timestamp and eventId', () => {
      logAuditEvent('security', 'warning', 'Security event', {
        outcome: 'blocked',
      });

      expect(logger.warn).toHaveBeenCalledWith(
        '[AUDIT] Security event',
        expect.objectContaining({
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
          eventId: expect.stringMatching(/^audit-\d+-[a-z0-9]+$/),
        })
      );
    });

    it('should respect AUDIT_LOG_ENABLED=false', () => {
      process.env.AUDIT_LOG_ENABLED = 'false';

      logAuditEvent('authentication', 'info', 'Should not log', {
        outcome: 'success',
      });

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should filter by severity level', () => {
      process.env.AUDIT_LOG_LEVEL = 'warning';

      // Info should be filtered out
      logAuditEvent('authentication', 'info', 'Info message', {
        outcome: 'success',
      });
      expect(logger.info).not.toHaveBeenCalled();

      // Warning should pass
      logAuditEvent('authentication', 'warning', 'Warning message', {
        outcome: 'failure',
      });
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should use correct log method based on severity', () => {
      // Set log level to debug to capture all severity levels
      process.env.AUDIT_LOG_LEVEL = 'debug';

      const severityMethods: [AuditSeverity, keyof typeof logger][] = [
        ['debug', 'debug'],
        ['info', 'info'],
        ['notice', 'info'],
        ['warning', 'warn'],
        ['error', 'error'],
        ['critical', 'error'],
        ['alert', 'error'],
        ['emergency', 'error'],
      ];

      severityMethods.forEach(([severity, method]) => {
        jest.clearAllMocks();
        logAuditEvent('system', severity, `${severity} message`, {
          outcome: 'success',
        });
        expect(logger[method]).toHaveBeenCalled();
      });
    });
  });

  describe('audit convenience functions', () => {
    describe('authSuccess', () => {
      it('should log successful authentication', () => {
        audit.authSuccess('user-123', 'alice.chen', 'req-456', '192.168.1.1');

        expect(logger.info).toHaveBeenCalledWith(
          '[AUDIT] User authenticated successfully: alice.chen',
          expect.objectContaining({
            category: 'authentication',
            userId: 'user-123',
            username: 'alice.chen',
            action: 'authenticate',
            outcome: 'success',
          })
        );
      });
    });

    describe('authFailure', () => {
      it('should log failed authentication', () => {
        audit.authFailure('Invalid credentials', 'bob.smith', 'req-789', '192.168.1.2');

        expect(logger.warn).toHaveBeenCalledWith(
          '[AUDIT] Authentication failed: Invalid credentials',
          expect.objectContaining({
            category: 'authentication',
            outcome: 'failure',
            metadata: { reason: 'Invalid credentials' },
          })
        );
      });
    });

    describe('authzDecision', () => {
      it('should log granted authorization', () => {
        audit.authzDecision(
          'user-123',
          '/api/employees',
          'read',
          true,
          ['hr-read'],
          'req-123'
        );

        expect(logger.info).toHaveBeenCalledWith(
          '[AUDIT] Authorization success: read on /api/employees',
          expect.objectContaining({
            category: 'authorization',
            outcome: 'success',
            metadata: { granted: true },
          })
        );
      });

      it('should log denied authorization', () => {
        audit.authzDecision(
          'user-123',
          '/api/employees',
          'delete',
          false,
          ['hr-read'],
          'req-123'
        );

        expect(logger.warn).toHaveBeenCalledWith(
          '[AUDIT] Authorization blocked: delete on /api/employees',
          expect.objectContaining({
            outcome: 'blocked',
          })
        );
      });
    });

    describe('securityViolation', () => {
      it('should log security violations as alerts', () => {
        audit.securityViolation(
          'sql_injection',
          'Detected SQL injection attempt',
          'user-123',
          'req-456',
          '10.0.0.1'
        );

        expect(logger.error).toHaveBeenCalledWith(
          '[AUDIT] Security violation: sql_injection',
          expect.objectContaining({
            category: 'security',
            severity: 'alert',
            outcome: 'blocked',
          })
        );
      });
    });

    describe('promptInjectionBlocked', () => {
      it('should log prompt injection attempts', () => {
        audit.promptInjectionBlocked(
          'user-123',
          'Query contains blocked keywords',
          'req-789',
          '192.168.1.1'
        );

        expect(logger.error).toHaveBeenCalledWith(
          '[AUDIT] Prompt injection blocked: Query contains blocked keywords',
          expect.objectContaining({
            category: 'security',
            action: 'prompt_injection',
            outcome: 'blocked',
          })
        );
      });
    });

    describe('piiRedacted', () => {
      it('should log PII redaction events', () => {
        audit.piiRedacted(
          'user-123',
          ['SSN: 1 instance(s)', 'Email: 2 instance(s)'],
          'input',
          'req-456'
        );

        expect(logger.info).toHaveBeenCalledWith(
          '[AUDIT] PII redacted in input: SSN: 1 instance(s), Email: 2 instance(s)',
          expect.objectContaining({
            category: 'security',
            action: 'pii_redaction',
            metadata: {
              redactionTypes: ['SSN: 1 instance(s)', 'Email: 2 instance(s)'],
              direction: 'input',
            },
          })
        );
      });
    });

    describe('confirmation', () => {
      it('should log approved confirmations', () => {
        audit.confirmation('user-123', 'conf-456', 'delete_employee', true, 'req-789');

        expect(logger.info).toHaveBeenCalledWith(
          '[AUDIT] Confirmation approved: delete_employee',
          expect.objectContaining({
            category: 'confirmation',
            outcome: 'success',
            metadata: { confirmationId: 'conf-456', approved: true },
          })
        );
      });

      it('should log rejected confirmations', () => {
        audit.confirmation('user-123', 'conf-456', 'delete_employee', false, 'req-789');

        expect(logger.info).toHaveBeenCalledWith(
          '[AUDIT] Confirmation rejected: delete_employee',
          expect.objectContaining({
            outcome: 'blocked',
            metadata: { confirmationId: 'conf-456', approved: false },
          })
        );
      });
    });

    describe('dataAccess', () => {
      it('should log data access with record count', () => {
        audit.dataAccess('user-123', '/api/employees', 50, 'req-456', true);

        expect(logger.info).toHaveBeenCalledWith(
          '[AUDIT] Data accessed: /api/employees (50 records)',
          expect.objectContaining({
            category: 'data_access',
            action: 'read',
            metadata: { recordCount: 50, truncated: true },
          })
        );
      });
    });

    describe('dataMutation', () => {
      it('should log successful data mutations', () => {
        audit.dataMutation('user-123', '/api/employees/emp-456', 'update', true, 'req-789');

        expect(logger.info).toHaveBeenCalledWith(
          '[AUDIT] Data update: /api/employees/emp-456',
          expect.objectContaining({
            category: 'data_mutation',
            outcome: 'success',
          })
        );
      });

      it('should log failed data mutations', () => {
        audit.dataMutation('user-123', '/api/employees/emp-456', 'delete', false, 'req-789');

        expect(logger.warn).toHaveBeenCalledWith(
          '[AUDIT] Data delete: /api/employees/emp-456',
          expect.objectContaining({
            outcome: 'failure',
          })
        );
      });
    });

    describe('rateLimitExceeded', () => {
      it('should log rate limit violations', () => {
        audit.rateLimitExceeded('user-123', '/api/query', 'req-456', '192.168.1.1');

        expect(logger.warn).toHaveBeenCalledWith(
          '[AUDIT] Rate limit exceeded: /api/query',
          expect.objectContaining({
            category: 'security',
            action: 'rate_limit',
            outcome: 'blocked',
          })
        );
      });
    });
  });

  describe('External SIEM endpoint', () => {
    it('should send events to external endpoint when configured', async () => {
      process.env.AUDIT_LOG_ENDPOINT = 'https://siem.example.com/audit';
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

      logAuditEvent('authentication', 'info', 'Test message', {
        outcome: 'success',
      });

      // Allow async operation to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(global.fetch).toHaveBeenCalledWith(
        'https://siem.example.com/audit',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle SIEM endpoint errors gracefully', async () => {
      process.env.AUDIT_LOG_ENDPOINT = 'https://siem.example.com/audit';
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      // Should not throw
      expect(() => {
        logAuditEvent('authentication', 'info', 'Test message', {
          outcome: 'success',
        });
      }).not.toThrow();

      // Allow async error handling
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should have logged warning about SIEM failure
      expect(logger.warn).toHaveBeenCalledWith(
        'Error sending audit event to SIEM',
        expect.objectContaining({
          error: 'Network error',
        })
      );
    });
  });
});

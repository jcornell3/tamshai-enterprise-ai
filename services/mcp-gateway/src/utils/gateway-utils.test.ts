/**
 * Unit tests for Gateway Utility Functions
 *
 * Tests core business logic including:
 * - Input sanitization
 * - Tool name validation
 * - Role-based access control
 */

import {
  sanitizeForLog,
  isValidToolName,
  getAccessibleMCPServers,
  getDeniedMCPServers,
  MCPServerConfig,
} from './gateway-utils';

// Mock MCP server configurations for testing
const mockMCPServers: MCPServerConfig[] = [
  {
    name: 'hr',
    url: 'http://localhost:3001',
    requiredRoles: ['hr-read', 'hr-write', 'executive'],
    description: 'HR data including employees, departments, org structure',
  },
  {
    name: 'finance',
    url: 'http://localhost:3002',
    requiredRoles: ['finance-read', 'finance-write', 'executive'],
    description: 'Financial data including budgets, reports, invoices',
  },
  {
    name: 'sales',
    url: 'http://localhost:3003',
    requiredRoles: ['sales-read', 'sales-write', 'executive'],
    description: 'CRM data including customers, deals, pipeline',
  },
  {
    name: 'support',
    url: 'http://localhost:3004',
    requiredRoles: ['support-read', 'support-write', 'executive'],
    description: 'Support data including tickets, knowledge base',
  },
];

describe('sanitizeForLog', () => {
  describe('security - log injection prevention', () => {
    test('removes newline characters', () => {
      const input = 'Line 1\nLine 2\nLine 3';
      const result = sanitizeForLog(input);
      expect(result).not.toContain('\n');
      expect(result).toBe('Line 1 Line 2 Line 3');
    });

    test('removes carriage returns', () => {
      const input = 'Text\rwith\rcarriage\rreturns';
      const result = sanitizeForLog(input);
      expect(result).not.toContain('\r');
      expect(result).toBe('Text with carriage returns');
    });

    test('removes tab characters', () => {
      const input = 'Column1\tColumn2\tColumn3';
      const result = sanitizeForLog(input);
      expect(result).not.toContain('\t');
      expect(result).toBe('Column1 Column2 Column3');
    });

    test('prevents log forging with fake timestamps', () => {
      const maliciousInput = 'Normal log\n2024-01-01 ADMIN: Elevated privileges granted';
      const result = sanitizeForLog(maliciousInput);
      expect(result).not.toContain('\n');
      expect(result).toContain('Normal log 2024-01-01 ADMIN');
    });

    test('removes non-printable ASCII characters', () => {
      const input = 'Text\x00with\x01control\x02chars';
      const result = sanitizeForLog(input);
      expect(result).toBe('Textwithcontrolchars');
    });

    test('preserves printable ASCII characters', () => {
      const input = 'Valid log entry with numbers 123 and symbols !@#$%';
      const result = sanitizeForLog(input);
      expect(result).toBe(input);
    });
  });

  describe('length limiting', () => {
    test('truncates to default 100 characters', () => {
      const longInput = 'a'.repeat(200);
      const result = sanitizeForLog(longInput);
      expect(result.length).toBe(100);
    });

    test('truncates to custom max length', () => {
      const longInput = 'a'.repeat(200);
      const result = sanitizeForLog(longInput, 50);
      expect(result.length).toBe(50);
    });

    test('does not truncate short strings', () => {
      const shortInput = 'Short log message';
      const result = sanitizeForLog(shortInput);
      expect(result).toBe(shortInput);
      expect(result.length).toBeLessThan(100);
    });
  });

  describe('edge cases', () => {
    test('handles empty string', () => {
      const result = sanitizeForLog('');
      expect(result).toBe('');
    });

    test('handles string with only whitespace', () => {
      const result = sanitizeForLog('   ');
      expect(result).toBe('   ');
    });

    test('handles string with mixed valid and invalid characters', () => {
      const input = 'Valid\ntext\twith\rinvalid\x00chars';
      const result = sanitizeForLog(input);
      expect(result).toBe('Valid text with invalidchars');
    });
  });
});

describe('isValidToolName', () => {
  describe('valid tool names', () => {
    test('accepts simple alphanumeric names', () => {
      expect(isValidToolName('listEmployees')).toBe(true);
      expect(isValidToolName('getEmployee')).toBe(true);
      expect(isValidToolName('searchTickets')).toBe(true);
    });

    test('accepts names with underscores', () => {
      expect(isValidToolName('list_employees')).toBe(true);
      expect(isValidToolName('get_employee_by_id')).toBe(true);
      expect(isValidToolName('search_support_tickets')).toBe(true);
    });

    test('accepts names with hyphens', () => {
      expect(isValidToolName('list-employees')).toBe(true);
      expect(isValidToolName('get-employee-by-id')).toBe(true);
      expect(isValidToolName('search-support-tickets')).toBe(true);
    });

    test('accepts names with mixed case', () => {
      expect(isValidToolName('listEmployeesInDept')).toBe(true);
      expect(isValidToolName('getEmployeeByID')).toBe(true);
      expect(isValidToolName('ListAll')).toBe(true);
    });

    test('accepts names starting with uppercase', () => {
      expect(isValidToolName('GetEmployee')).toBe(true);
      expect(isValidToolName('ListAll')).toBe(true);
    });

    test('accepts names starting with lowercase', () => {
      expect(isValidToolName('getEmployee')).toBe(true);
      expect(isValidToolName('listAll')).toBe(true);
    });

    test('accepts maximum length names (64 chars)', () => {
      const maxLengthName = 'a' + 'b'.repeat(63); // 64 total
      expect(isValidToolName(maxLengthName)).toBe(true);
    });
  });

  describe('invalid tool names - security', () => {
    test('rejects names with path traversal attempts', () => {
      expect(isValidToolName('../etc/passwd')).toBe(false);
      expect(isValidToolName('../../secret')).toBe(false);
      expect(isValidToolName('./../config')).toBe(false);
    });

    test('rejects names with forward slashes', () => {
      expect(isValidToolName('list/employees')).toBe(false);
      expect(isValidToolName('/etc/passwd')).toBe(false);
    });

    test('rejects names with backslashes', () => {
      expect(isValidToolName('list\\employees')).toBe(false);
      expect(isValidToolName('C:\\Windows\\System32')).toBe(false);
    });

    test('rejects names with special characters', () => {
      expect(isValidToolName('list@employees')).toBe(false);
      expect(isValidToolName('get$employee')).toBe(false);
      expect(isValidToolName('search%tickets')).toBe(false);
    });

    test('rejects names with spaces', () => {
      expect(isValidToolName('list employees')).toBe(false);
      expect(isValidToolName('get employee by id')).toBe(false);
    });

    test('rejects names starting with numbers', () => {
      expect(isValidToolName('1listEmployees')).toBe(false);
      expect(isValidToolName('2getEmployee')).toBe(false);
    });

    test('rejects names starting with underscore', () => {
      expect(isValidToolName('_privateMethod')).toBe(false);
    });

    test('rejects names starting with hyphen', () => {
      expect(isValidToolName('-privateMethod')).toBe(false);
    });
  });

  describe('invalid tool names - length', () => {
    test('rejects empty string', () => {
      expect(isValidToolName('')).toBe(false);
    });

    test('rejects names exceeding 64 characters', () => {
      const tooLongName = 'a' + 'b'.repeat(64); // 65 total
      expect(isValidToolName(tooLongName)).toBe(false);
    });
  });
});

describe('getAccessibleMCPServers', () => {
  describe('executive role access', () => {
    test('grants access to all MCP servers', () => {
      const servers = getAccessibleMCPServers(['executive'], mockMCPServers);
      expect(servers).toHaveLength(mockMCPServers.length);
      expect(servers.map(s => s.name)).toEqual(
        expect.arrayContaining(['hr', 'finance', 'sales', 'support'])
      );
    });
  });

  describe('HR roles access', () => {
    test('grants hr-read access to HR server only', () => {
      const servers = getAccessibleMCPServers(['hr-read'], mockMCPServers);
      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe('hr');
    });

    test('grants hr-write access to HR server only', () => {
      const servers = getAccessibleMCPServers(['hr-write'], mockMCPServers);
      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe('hr');
    });

    test('grants both hr-read and hr-write access to HR server (no duplicates)', () => {
      const servers = getAccessibleMCPServers(['hr-read', 'hr-write'], mockMCPServers);
      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe('hr');
    });
  });

  describe('Finance roles access', () => {
    test('grants finance-read access to Finance server only', () => {
      const servers = getAccessibleMCPServers(['finance-read'], mockMCPServers);
      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe('finance');
    });

    test('grants finance-write access to Finance server only', () => {
      const servers = getAccessibleMCPServers(['finance-write'], mockMCPServers);
      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe('finance');
    });
  });

  describe('Sales roles access', () => {
    test('grants sales-read access to Sales server only', () => {
      const servers = getAccessibleMCPServers(['sales-read'], mockMCPServers);
      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe('sales');
    });

    test('grants sales-write access to Sales server only', () => {
      const servers = getAccessibleMCPServers(['sales-write'], mockMCPServers);
      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe('sales');
    });
  });

  describe('Support roles access', () => {
    test('grants support-read access to Support server only', () => {
      const servers = getAccessibleMCPServers(['support-read'], mockMCPServers);
      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe('support');
    });

    test('grants support-write access to Support server only', () => {
      const servers = getAccessibleMCPServers(['support-write'], mockMCPServers);
      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe('support');
    });
  });

  describe('Multiple roles access', () => {
    test('grants HR and Finance roles access to both servers', () => {
      const servers = getAccessibleMCPServers(['hr-read', 'finance-read'], mockMCPServers);
      expect(servers).toHaveLength(2);
      expect(servers.map(s => s.name)).toEqual(
        expect.arrayContaining(['hr', 'finance'])
      );
    });

    test('grants all department read roles access to all servers', () => {
      const servers = getAccessibleMCPServers([
        'hr-read',
        'finance-read',
        'sales-read',
        'support-read',
      ], mockMCPServers);
      expect(servers).toHaveLength(4);
      expect(servers.map(s => s.name)).toEqual(
        expect.arrayContaining(['hr', 'finance', 'sales', 'support'])
      );
    });
  });

  describe('No access', () => {
    test('returns empty array for users with no relevant roles', () => {
      const servers = getAccessibleMCPServers(['user', 'guest'], mockMCPServers);
      expect(servers).toHaveLength(0);
    });

    test('returns empty array for empty roles array', () => {
      const servers = getAccessibleMCPServers([], mockMCPServers);
      expect(servers).toHaveLength(0);
    });
  });

  describe('Case sensitivity', () => {
    test('role names are case-sensitive', () => {
      const servers = getAccessibleMCPServers(['HR-READ', 'EXECUTIVE'], mockMCPServers);
      // Should not match hr-read or executive
      expect(servers).toHaveLength(0);
    });
  });
});

describe('getDeniedMCPServers', () => {
  describe('Executive role - no denials', () => {
    test('returns empty array for executive with full access', () => {
      const denied = getDeniedMCPServers(['executive'], mockMCPServers);
      expect(denied).toHaveLength(0);
    });
  });

  describe('HR roles - denied servers', () => {
    test('hr-read is denied access to finance, sales, support', () => {
      const denied = getDeniedMCPServers(['hr-read'], mockMCPServers);
      expect(denied).toHaveLength(3);
      expect(denied.map(s => s.name)).toEqual(
        expect.arrayContaining(['finance', 'sales', 'support'])
      );
      expect(denied.map(s => s.name)).not.toContain('hr');
    });
  });

  describe('Finance roles - denied servers', () => {
    test('finance-read is denied access to hr, sales, support', () => {
      const denied = getDeniedMCPServers(['finance-read'], mockMCPServers);
      expect(denied).toHaveLength(3);
      expect(denied.map(s => s.name)).toEqual(
        expect.arrayContaining(['hr', 'sales', 'support'])
      );
      expect(denied.map(s => s.name)).not.toContain('finance');
    });
  });

  describe('No roles - all servers denied', () => {
    test('user with no roles is denied all servers', () => {
      const denied = getDeniedMCPServers([], mockMCPServers);
      expect(denied).toHaveLength(mockMCPServers.length);
      expect(denied.map(s => s.name)).toEqual(
        expect.arrayContaining(['hr', 'finance', 'sales', 'support'])
      );
    });

    test('user with irrelevant roles is denied all servers', () => {
      const denied = getDeniedMCPServers(['user', 'guest', 'other'], mockMCPServers);
      expect(denied).toHaveLength(mockMCPServers.length);
    });
  });

  describe('Multiple roles - partial denials', () => {
    test('user with HR and Finance access is denied Sales and Support', () => {
      const denied = getDeniedMCPServers(['hr-read', 'finance-write'], mockMCPServers);
      expect(denied).toHaveLength(2);
      expect(denied.map(s => s.name)).toEqual(
        expect.arrayContaining(['sales', 'support'])
      );
    });

    test('user with all read roles is denied nothing', () => {
      const denied = getDeniedMCPServers([
        'hr-read',
        'finance-read',
        'sales-read',
        'support-read',
      ], mockMCPServers);
      expect(denied).toHaveLength(0);
    });
  });

  describe('Inverse relationship with getAccessibleMCPServers', () => {
    test('accessible + denied = all servers', () => {
      const roles = ['hr-read', 'finance-read'];
      const accessible = getAccessibleMCPServers(roles, mockMCPServers);
      const denied = getDeniedMCPServers(roles, mockMCPServers);

      expect(accessible.length + denied.length).toBe(mockMCPServers.length);

      // No overlap
      const accessibleNames = accessible.map(s => s.name);
      const deniedNames = denied.map(s => s.name);
      const overlap = accessibleNames.filter(name => deniedNames.includes(name));
      expect(overlap).toHaveLength(0);
    });

    test('executive: all accessible, none denied', () => {
      const accessible = getAccessibleMCPServers(['executive'], mockMCPServers);
      const denied = getDeniedMCPServers(['executive'], mockMCPServers);

      expect(accessible.length).toBe(mockMCPServers.length);
      expect(denied.length).toBe(0);
    });

    test('no roles: none accessible, all denied', () => {
      const accessible = getAccessibleMCPServers([], mockMCPServers);
      const denied = getDeniedMCPServers([], mockMCPServers);

      expect(accessible.length).toBe(0);
      expect(denied.length).toBe(mockMCPServers.length);
    });
  });
});

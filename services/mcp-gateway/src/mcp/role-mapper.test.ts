/**
 * Unit tests for Role Mapper Module
 *
 * Target: 100% coverage (pure functions, no dependencies)
 */

import {
  createDefaultMCPServers,
  getAccessibleMCPServers,
  getDeniedMCPServers,
  MCPServerConfig,
} from './role-mapper';

describe('Role Mapper Module', () => {
  describe('createDefaultMCPServers', () => {
    it('should create all four default MCP server configs', () => {
      const urls = {
        hr: 'http://localhost:3001',
        finance: 'http://localhost:3002',
        sales: 'http://localhost:3003',
        support: 'http://localhost:3004',
      };

      const servers = createDefaultMCPServers(urls);

      expect(servers).toHaveLength(4);
      expect(servers.map(s => s.name)).toEqual(['hr', 'finance', 'sales', 'support']);
    });

    it('should use provided URLs for each server', () => {
      const urls = {
        hr: 'http://hr.example.com:3101',
        finance: 'http://finance.example.com:3102',
        sales: 'http://sales.example.com:3103',
        support: 'http://support.example.com:3104',
      };

      const servers = createDefaultMCPServers(urls);

      expect(servers.find(s => s.name === 'hr')?.url).toBe('http://hr.example.com:3101');
      expect(servers.find(s => s.name === 'finance')?.url).toBe('http://finance.example.com:3102');
      expect(servers.find(s => s.name === 'sales')?.url).toBe('http://sales.example.com:3103');
      expect(servers.find(s => s.name === 'support')?.url).toBe('http://support.example.com:3104');
    });

    it('should set correct required roles for HR server', () => {
      const urls = {
        hr: 'http://localhost:3001',
        finance: 'http://localhost:3002',
        sales: 'http://localhost:3003',
        support: 'http://localhost:3004',
      };

      const servers = createDefaultMCPServers(urls);
      const hrServer = servers.find(s => s.name === 'hr');

      expect(hrServer?.requiredRoles).toEqual(['employee', 'hr-read', 'hr-write', 'executive']);
      expect(hrServer?.description).toContain('HR data');
    });

    it('should set correct required roles for Finance server', () => {
      const urls = {
        hr: 'http://localhost:3001',
        finance: 'http://localhost:3002',
        sales: 'http://localhost:3003',
        support: 'http://localhost:3004',
      };

      const servers = createDefaultMCPServers(urls);
      const financeServer = servers.find(s => s.name === 'finance');

      expect(financeServer?.requiredRoles).toEqual(['employee', 'finance-read', 'finance-write', 'executive']);
      expect(financeServer?.description).toContain('Financial data');
    });

    it('should set correct required roles for Sales server', () => {
      const urls = {
        hr: 'http://localhost:3001',
        finance: 'http://localhost:3002',
        sales: 'http://localhost:3003',
        support: 'http://localhost:3004',
      };

      const servers = createDefaultMCPServers(urls);
      const salesServer = servers.find(s => s.name === 'sales');

      expect(salesServer?.requiredRoles).toEqual(['employee', 'sales-read', 'sales-write', 'executive']);
      expect(salesServer?.description).toContain('CRM data');
    });

    it('should set correct required roles for Support server', () => {
      const urls = {
        hr: 'http://localhost:3001',
        finance: 'http://localhost:3002',
        sales: 'http://localhost:3003',
        support: 'http://localhost:3004',
      };

      const servers = createDefaultMCPServers(urls);
      const supportServer = servers.find(s => s.name === 'support');

      expect(supportServer?.requiredRoles).toEqual(['employee', 'support-read', 'support-write', 'executive']);
      expect(supportServer?.description).toContain('Support data');
    });
  });

  describe('getAccessibleMCPServers', () => {
    const testServers: MCPServerConfig[] = [
      {
        name: 'hr',
        url: 'http://localhost:3001',
        requiredRoles: ['employee', 'hr-read', 'hr-write', 'executive'],
        description: 'HR server',
      },
      {
        name: 'finance',
        url: 'http://localhost:3002',
        requiredRoles: ['employee', 'finance-read', 'finance-write', 'executive'],
        description: 'Finance server',
      },
      {
        name: 'sales',
        url: 'http://localhost:3003',
        requiredRoles: ['employee', 'sales-read', 'sales-write', 'executive'],
        description: 'Sales server',
      },
    ];

    it('should return servers matching user roles', () => {
      const accessible = getAccessibleMCPServers(['hr-read'], testServers);

      expect(accessible).toHaveLength(1);
      expect(accessible[0].name).toBe('hr');
    });

    it('should return multiple servers for executive role', () => {
      const accessible = getAccessibleMCPServers(['executive'], testServers);

      expect(accessible).toHaveLength(3);
      expect(accessible.map(s => s.name)).toEqual(['hr', 'finance', 'sales']);
    });

    it('should return empty array for user with no matching roles', () => {
      const accessible = getAccessibleMCPServers(['intern'], testServers);

      expect(accessible).toHaveLength(0);
    });

    it('should return servers when user has multiple roles', () => {
      const accessible = getAccessibleMCPServers(['hr-read', 'finance-read'], testServers);

      expect(accessible).toHaveLength(2);
      expect(accessible.map(s => s.name)).toContain('hr');
      expect(accessible.map(s => s.name)).toContain('finance');
    });

    it('should return server when user has ANY of the required roles', () => {
      const accessible = getAccessibleMCPServers(['hr-write'], testServers);

      expect(accessible).toHaveLength(1);
      expect(accessible[0].name).toBe('hr');
    });

    it('should handle empty server list', () => {
      const accessible = getAccessibleMCPServers(['hr-read'], []);

      expect(accessible).toHaveLength(0);
    });

    it('should handle empty user roles', () => {
      const accessible = getAccessibleMCPServers([], testServers);

      expect(accessible).toHaveLength(0);
    });

    it('should not return duplicate servers when user has multiple matching roles', () => {
      const accessible = getAccessibleMCPServers(['hr-read', 'hr-write', 'executive'], testServers);

      expect(accessible).toHaveLength(3); // hr, finance, sales (no duplicates)
      const hrServers = accessible.filter(s => s.name === 'hr');
      expect(hrServers).toHaveLength(1); // Only one HR server
    });
  });

  describe('getDeniedMCPServers', () => {
    const testServers: MCPServerConfig[] = [
      {
        name: 'hr',
        url: 'http://localhost:3001',
        requiredRoles: ['employee', 'hr-read', 'hr-write', 'executive'],
        description: 'HR server',
      },
      {
        name: 'finance',
        url: 'http://localhost:3002',
        requiredRoles: ['employee', 'finance-read', 'finance-write', 'executive'],
        description: 'Finance server',
      },
      {
        name: 'sales',
        url: 'http://localhost:3003',
        requiredRoles: ['employee', 'sales-read', 'sales-write', 'executive'],
        description: 'Sales server',
      },
    ];

    it('should return servers NOT matching user roles', () => {
      const denied = getDeniedMCPServers(['hr-read'], testServers);

      expect(denied).toHaveLength(2);
      expect(denied.map(s => s.name)).toEqual(['finance', 'sales']);
    });

    it('should return empty array for executive role (has access to all)', () => {
      const denied = getDeniedMCPServers(['executive'], testServers);

      expect(denied).toHaveLength(0);
    });

    it('should return all servers for user with no matching roles', () => {
      const denied = getDeniedMCPServers(['intern'], testServers);

      expect(denied).toHaveLength(3);
      expect(denied.map(s => s.name)).toEqual(['hr', 'finance', 'sales']);
    });

    it('should handle empty server list', () => {
      const denied = getDeniedMCPServers(['hr-read'], []);

      expect(denied).toHaveLength(0);
    });

    it('should handle empty user roles', () => {
      const denied = getDeniedMCPServers([], testServers);

      expect(denied).toHaveLength(3);
    });

    it('should complement getAccessibleMCPServers', () => {
      const userRoles = ['hr-read', 'finance-read'];
      const accessible = getAccessibleMCPServers(userRoles, testServers);
      const denied = getDeniedMCPServers(userRoles, testServers);

      // Together they should cover all servers exactly once
      expect(accessible.length + denied.length).toBe(testServers.length);

      // No overlap between accessible and denied
      const accessibleNames = accessible.map(s => s.name);
      const deniedNames = denied.map(s => s.name);
      const overlap = accessibleNames.filter(name => deniedNames.includes(name));
      expect(overlap).toHaveLength(0);
    });
  });

  describe('Integration: Role-based access patterns', () => {
    const servers = createDefaultMCPServers({
      hr: 'http://localhost:3001',
      finance: 'http://localhost:3002',
      sales: 'http://localhost:3003',
      support: 'http://localhost:3004',
    });

    it('should grant HR manager access to only HR server', () => {
      const hrManagerRoles = ['hr-read', 'hr-write'];
      const accessible = getAccessibleMCPServers(hrManagerRoles, servers);

      expect(accessible).toHaveLength(1);
      expect(accessible[0].name).toBe('hr');
    });

    it('should grant executive access to all servers', () => {
      const executiveRoles = ['executive'];
      const accessible = getAccessibleMCPServers(executiveRoles, servers);

      expect(accessible).toHaveLength(4);
      expect(accessible.map(s => s.name)).toEqual(['hr', 'finance', 'sales', 'support']);
    });

    it('should grant intern access to no servers (no employee role)', () => {
      const internRoles = ['intern'];
      const accessible = getAccessibleMCPServers(internRoles, servers);

      expect(accessible).toHaveLength(0);
    });

    it('should grant employee role access to all servers (self-access via RLS)', () => {
      const employeeRoles = ['employee'];
      const accessible = getAccessibleMCPServers(employeeRoles, servers);

      expect(accessible).toHaveLength(4);
      expect(accessible.map(s => s.name)).toEqual(['hr', 'finance', 'sales', 'support']);
    });

    it('should grant engineer (employee only) access to all servers for self-access', () => {
      // Marcus Johnson scenario - engineer with only employee role
      const engineerRoles = ['employee'];
      const accessible = getAccessibleMCPServers(engineerRoles, servers);

      expect(accessible).toHaveLength(4);
      expect(accessible.map(s => s.name)).toContain('hr');
      expect(accessible.map(s => s.name)).toContain('finance');
      expect(accessible.map(s => s.name)).toContain('sales');
      expect(accessible.map(s => s.name)).toContain('support');
    });

    it('should grant read-only user appropriate access', () => {
      const readOnlyRoles = ['hr-read', 'finance-read'];
      const accessible = getAccessibleMCPServers(readOnlyRoles, servers);

      expect(accessible).toHaveLength(2);
      expect(accessible.map(s => s.name)).toContain('hr');
      expect(accessible.map(s => s.name)).toContain('finance');
    });

    it('should handle multi-department manager', () => {
      const multiDeptRoles = ['hr-write', 'finance-write', 'sales-write'];
      const accessible = getAccessibleMCPServers(multiDeptRoles, servers);

      expect(accessible).toHaveLength(3);
      expect(accessible.map(s => s.name)).not.toContain('support');
    });
  });
});

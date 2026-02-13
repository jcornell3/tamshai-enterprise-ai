/**
 * Component Registry Tests - Phase 3.RED
 *
 * Tests for the component registry that maps domain:component pairs to
 * their definitions, MCP calls, transform functions, and narration generators.
 *
 * Expected to FAIL until Phase 3.GREEN implementation.
 */

import {
  getComponentDefinition,
  listComponents,
  ComponentDefinition,
} from '../component-registry';

describe('ComponentRegistry', () => {
  describe('Registry Contents', () => {
    it('contains hr:org_chart component', () => {
      const def = getComponentDefinition('hr', 'org_chart');
      expect(def).toBeDefined();
      expect(def?.type).toBe('OrgChartComponent');
    });

    it('contains sales:customer component', () => {
      const def = getComponentDefinition('sales', 'customer');
      expect(def).toBeDefined();
      expect(def?.type).toBe('CustomerDetailCard');
    });

    it('contains sales:leads component', () => {
      const def = getComponentDefinition('sales', 'leads');
      expect(def).toBeDefined();
      expect(def?.type).toBe('LeadsDataTable');
    });

    it('contains sales:forecast component', () => {
      const def = getComponentDefinition('sales', 'forecast');
      expect(def).toBeDefined();
      expect(def?.type).toBe('ForecastChart');
    });

    it('contains finance:budget component', () => {
      const def = getComponentDefinition('finance', 'budget');
      expect(def).toBeDefined();
      expect(def?.type).toBe('BudgetSummaryCard');
    });

    it('contains approvals:pending component', () => {
      const def = getComponentDefinition('approvals', 'pending');
      expect(def).toBeDefined();
      expect(def?.type).toBe('ApprovalsQueue');
    });

    it('contains finance:quarterly_report component', () => {
      const def = getComponentDefinition('finance', 'quarterly_report');
      expect(def).toBeDefined();
      expect(def?.type).toBe('QuarterlyReportDashboard');
    });

    it('has exactly 7 registered components', () => {
      const components = listComponents();
      expect(components.length).toBe(7);
    });
  });

  describe('Component Definition Structure', () => {
    it('each component has required type field', () => {
      for (const def of listComponents()) {
        expect(def.type).toBeDefined();
        expect(typeof def.type).toBe('string');
      }
    });

    it('each component has domain field', () => {
      for (const def of listComponents()) {
        expect(def.domain).toBeDefined();
        expect(typeof def.domain).toBe('string');
      }
    });

    it('each component has component field', () => {
      for (const def of listComponents()) {
        expect(def.component).toBeDefined();
        expect(typeof def.component).toBe('string');
      }
    });

    it('each component has mcpCalls array', () => {
      for (const def of listComponents()) {
        expect(def.mcpCalls).toBeInstanceOf(Array);
        expect(def.mcpCalls.length).toBeGreaterThan(0);
      }
    });

    it('each component has transform function', () => {
      for (const def of listComponents()) {
        expect(typeof def.transform).toBe('function');
      }
    });

    it('each component has generateNarration function', () => {
      for (const def of listComponents()) {
        expect(typeof def.generateNarration).toBe('function');
      }
    });
  });

  describe('MCP Calls Structure', () => {
    it('org_chart mcpCalls have server, tool, and paramMap', () => {
      const def = getComponentDefinition('hr', 'org_chart');
      expect(def?.mcpCalls[0]).toEqual({
        server: 'hr',
        tool: 'get_org_chart',
        paramMap: expect.any(Object),
      });
    });

    it('customer mcpCalls reference sales server', () => {
      const def = getComponentDefinition('sales', 'customer');
      expect(def?.mcpCalls[0].server).toBe('sales');
    });

    it('budget mcpCalls reference finance server', () => {
      const def = getComponentDefinition('finance', 'budget');
      expect(def?.mcpCalls[0].server).toBe('finance');
    });

    it('approvals mcpCalls reference multiple servers', () => {
      const def = getComponentDefinition('approvals', 'pending');
      const servers = def?.mcpCalls.map((c) => c.server) || [];
      // Approvals aggregates from hr, finance
      expect(servers.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Transform Functions', () => {
    it('org_chart transform extracts manager, self, peers, directReports', () => {
      const def = getComponentDefinition('hr', 'org_chart');
      const mockData = {
        manager: { id: '1', name: 'Alice Chen' },
        employee: { id: '2', name: 'Bob Smith' },
        peers: [{ id: '3', name: 'Carol' }],
        directReports: [{ id: '4', name: 'Dan' }],
      };
      const props = def?.transform(mockData);
      expect(props).toEqual({
        manager: mockData.manager,
        self: mockData.employee,
        peers: mockData.peers,
        directReports: mockData.directReports,
      });
    });

    it('customer transform extracts customer details', () => {
      const def = getComponentDefinition('sales', 'customer');
      const mockData = {
        customer: { id: 'c1', name: 'Acme Corp' },
        contacts: [{ id: 'ct1', name: 'John' }],
        opportunities: [{ id: 'o1', value: 10000 }],
      };
      const props = def?.transform(mockData);
      expect(props).toHaveProperty('customer');
      expect(props).toHaveProperty('contacts');
      expect(props).toHaveProperty('opportunities');
    });

    it('approvals transform extracts timeOffRequests, expenseReports, budgetAmendments', () => {
      const def = getComponentDefinition('approvals', 'pending');
      const mockData = {
        timeOffRequests: [{ id: 't1' }],
        expenseReports: [{ id: 'e1' }],
        budgetAmendments: [],
      };
      const props = def?.transform(mockData);
      expect(props).toHaveProperty('timeOffRequests');
      expect(props).toHaveProperty('expenseReports');
      expect(props).toHaveProperty('budgetAmendments');
    });
  });

  describe('Narration Generation', () => {
    it('org_chart narration mentions manager name', () => {
      const def = getComponentDefinition('hr', 'org_chart');
      const mockData = {
        manager: { name: 'Alice Chen' },
        directReports: [{ id: '1' }, { id: '2' }],
      };
      const narration = def?.generateNarration(mockData, {});
      expect(narration?.text).toContain('Alice Chen');
    });

    it('org_chart narration mentions direct report count', () => {
      const def = getComponentDefinition('hr', 'org_chart');
      const mockData = {
        manager: { name: 'Alice Chen' },
        directReports: [{ id: '1' }, { id: '2' }, { id: '3' }],
      };
      const narration = def?.generateNarration(mockData, {});
      expect(narration?.text).toContain('3');
    });

    it('approvals narration includes total count', () => {
      const def = getComponentDefinition('approvals', 'pending');
      const mockData = {
        timeOffRequests: [{}, {}],
        expenseReports: [{}],
        budgetAmendments: [{}, {}, {}],
      };
      const narration = def?.generateNarration(mockData, {});
      expect(narration?.text).toContain('6'); // 2+1+3
    });

    it('budget narration mentions department', () => {
      const def = getComponentDefinition('finance', 'budget');
      const mockData = {
        department: 'Engineering',
        budget: { total: 100000, spent: 75000 },
      };
      const narration = def?.generateNarration(mockData, {
        department: 'Engineering',
      });
      expect(narration?.text.toLowerCase()).toContain('engineering');
    });

    it('narration always returns object with text property', () => {
      for (const def of listComponents()) {
        const narration = def.generateNarration({}, {});
        expect(narration).toHaveProperty('text');
        expect(typeof narration.text).toBe('string');
      }
    });
  });

  describe('Unknown Components', () => {
    it('returns undefined for unknown domain', () => {
      expect(getComponentDefinition('unknown', 'chart')).toBeUndefined();
    });

    it('returns undefined for unknown component in valid domain', () => {
      expect(getComponentDefinition('hr', 'unknown')).toBeUndefined();
    });

    it('returns undefined for empty domain', () => {
      expect(getComponentDefinition('', 'chart')).toBeUndefined();
    });

    it('returns undefined for empty component', () => {
      expect(getComponentDefinition('hr', '')).toBeUndefined();
    });
  });
});

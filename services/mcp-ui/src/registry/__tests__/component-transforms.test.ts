/**
 * Component Registry Transform and Narration Tests
 *
 * Comprehensive tests for transform and generateNarration functions
 * across all registered components, focusing on edge cases and
 * uncovered code paths.
 */

import { getComponentDefinition, listComponents } from '../component-registry';

describe('ComponentRegistry - Transform Functions', () => {
  describe('sales:leads transform', () => {
    const def = getComponentDefinition('sales', 'leads');

    it('transforms leads data correctly', () => {
      const mockData = {
        leads: [{ id: 'l1', name: 'Lead 1' }, { id: 'l2', name: 'Lead 2' }],
        totalCount: 2,
        filters: { status: 'hot' },
      };
      const props = def?.transform(mockData);
      expect(props).toEqual({
        leads: mockData.leads,
        totalCount: 2,
        filters: { status: 'hot' },
      });
    });

    it('handles empty leads array', () => {
      const mockData = {
        leads: [],
        totalCount: 0,
        filters: {},
      };
      const props = def?.transform(mockData);
      expect(props).toEqual({
        leads: [],
        totalCount: 0,
        filters: {},
      });
    });

    it('handles missing fields with defaults', () => {
      const mockData = {};
      const props = def?.transform(mockData);
      expect(props).toEqual({
        leads: [],
        totalCount: 0,
        filters: {},
      });
    });

    it('handles null/undefined leads', () => {
      const mockData = { leads: undefined, totalCount: undefined };
      const props = def?.transform(mockData);
      expect(props?.leads).toEqual([]);
      expect(props?.totalCount).toBe(0);
    });
  });

  describe('sales:forecast transform', () => {
    const def = getComponentDefinition('sales', 'forecast');

    it('transforms forecast data correctly', () => {
      const mockData = {
        forecast: 1000000,
        actual: 850000,
        period: 'Q1 2026',
      };
      const props = def?.transform(mockData);
      expect(props).toEqual({
        forecast: 1000000,
        actual: 850000,
        period: 'Q1 2026',
      });
    });

    it('handles missing fields', () => {
      const mockData = {};
      const props = def?.transform(mockData);
      expect(props).toEqual({
        forecast: undefined,
        actual: undefined,
        period: undefined,
      });
    });

    it('handles zero values', () => {
      const mockData = { forecast: 0, actual: 0, period: 'Q1 2026' };
      const props = def?.transform(mockData);
      expect(props?.forecast).toBe(0);
      expect(props?.actual).toBe(0);
    });
  });

  describe('finance:budget transform', () => {
    const def = getComponentDefinition('finance', 'budget');

    it('transforms budget data correctly', () => {
      const mockData = {
        department: 'Engineering',
        budget: 1000000,
        spent: 750000,
        remaining: 250000,
      };
      const props = def?.transform(mockData);
      expect(props).toEqual({
        department: 'Engineering',
        budget: 1000000,
        spent: 750000,
        remaining: 250000,
      });
    });

    it('handles missing fields', () => {
      const mockData = {};
      const props = def?.transform(mockData);
      expect(props).toEqual({
        department: undefined,
        budget: undefined,
        spent: undefined,
        remaining: undefined,
      });
    });

    it('handles zero budget', () => {
      const mockData = {
        department: 'New Dept',
        budget: 0,
        spent: 0,
        remaining: 0,
      };
      const props = def?.transform(mockData);
      expect(props?.budget).toBe(0);
    });
  });

  describe('finance:quarterly_report transform', () => {
    const def = getComponentDefinition('finance', 'quarterly_report');

    it('transforms quarterly report data correctly', () => {
      const mockData = {
        quarter: 'Q1',
        year: 2026,
        revenue: 5000000,
        expenses: 4000000,
        profit: 1000000,
      };
      const props = def?.transform(mockData);
      expect(props).toEqual({
        quarter: 'Q1',
        year: 2026,
        revenue: 5000000,
        expenses: 4000000,
        profit: 1000000,
      });
    });

    it('handles missing fields', () => {
      const mockData = {};
      const props = def?.transform(mockData);
      expect(props).toEqual({
        quarter: undefined,
        year: undefined,
        revenue: undefined,
        expenses: undefined,
        profit: undefined,
      });
    });

    it('handles negative profit', () => {
      const mockData = {
        quarter: 'Q2',
        year: 2026,
        revenue: 3000000,
        expenses: 4000000,
        profit: -1000000,
      };
      const props = def?.transform(mockData);
      expect(props?.profit).toBe(-1000000);
    });
  });

  describe('hr:org_chart transform edge cases', () => {
    const def = getComponentDefinition('hr', 'org_chart');

    it('handles missing manager (CEO case)', () => {
      const mockData = {
        manager: null,
        employee: { id: '1', name: 'CEO' },
      };
      const props = def?.transform(mockData);
      expect(props?.manager).toBeNull();
    });

    it('handles empty organization', () => {
      const mockData = {};
      const props = def?.transform(mockData);
      expect(props?.self).toBeUndefined();
      expect(props?.peers).toEqual([]);
      expect(props?.directReports).toEqual([]);
    });
  });

  describe('sales:customer transform edge cases', () => {
    const def = getComponentDefinition('sales', 'customer');

    it('handles customer without contacts', () => {
      const mockData = {
        customer: { id: 'c1', name: 'New Corp' },
      };
      const props = def?.transform(mockData);
      expect(props?.contacts).toEqual([]);
      expect(props?.opportunities).toEqual([]);
    });

    it('handles missing customer', () => {
      const mockData = {};
      const props = def?.transform(mockData);
      expect(props?.customer).toBeUndefined();
    });
  });

  describe('approvals:pending transform edge cases', () => {
    const def = getComponentDefinition('approvals', 'pending');

    it('handles all empty arrays', () => {
      const mockData = {};
      const props = def?.transform(mockData);
      expect(props?.timeOffRequests).toEqual([]);
      expect(props?.expenseReports).toEqual([]);
      expect(props?.budgetAmendments).toEqual([]);
    });

    it('handles large lists', () => {
      const mockData = {
        timeOffRequests: Array(100).fill({ id: 't' }),
        expenseReports: Array(50).fill({ id: 'e' }),
        budgetAmendments: Array(25).fill({ id: 'b' }),
      };
      const props = def?.transform(mockData);
      expect((props?.timeOffRequests as unknown[]).length).toBe(100);
      expect((props?.expenseReports as unknown[]).length).toBe(50);
      expect((props?.budgetAmendments as unknown[]).length).toBe(25);
    });
  });
});

describe('ComponentRegistry - Narration Generation', () => {
  describe('sales:leads narration', () => {
    const def = getComponentDefinition('sales', 'leads');

    it('generates narration with lead count and status', () => {
      const mockData = {
        leads: [{ id: '1' }, { id: '2' }, { id: '3' }],
      };
      const narration = def?.generateNarration(mockData, { status: 'hot' });
      expect(narration?.text).toContain('3');
      expect(narration?.text).toContain('hot');
    });

    it('handles zero leads', () => {
      const mockData = { leads: [] };
      const narration = def?.generateNarration(mockData, { status: 'new' });
      expect(narration?.text).toContain('0');
    });

    it('uses "all" when status not specified', () => {
      const mockData = { leads: [{ id: '1' }] };
      const narration = def?.generateNarration(mockData, {});
      expect(narration?.text).toContain('all');
    });

    it('handles undefined leads', () => {
      const mockData = {};
      const narration = def?.generateNarration(mockData, { status: 'warm' });
      expect(narration?.text).toContain('0');
      expect(narration?.text).toContain('warm');
    });
  });

  describe('sales:forecast narration', () => {
    const def = getComponentDefinition('sales', 'forecast');

    it('generates narration with period', () => {
      const mockData = { forecast: 1000000 };
      const narration = def?.generateNarration(mockData, { period: 'Q2' });
      expect(narration?.text).toContain('Q2');
    });

    it('uses "current period" when period not specified', () => {
      const mockData = { forecast: 500000 };
      const narration = def?.generateNarration(mockData, {});
      expect(narration?.text).toContain('current period');
    });
  });

  describe('finance:budget narration', () => {
    const def = getComponentDefinition('finance', 'budget');

    it('generates narration with department from params', () => {
      const mockData = { department: 'Engineering' };
      const narration = def?.generateNarration(mockData, { department: 'Sales' });
      // Params take precedence
      expect(narration?.text.toLowerCase()).toContain('sales');
    });

    it('uses department from data when not in params', () => {
      const mockData = { department: 'Marketing' };
      const narration = def?.generateNarration(mockData, {});
      expect(narration?.text.toLowerCase()).toContain('marketing');
    });

    it('uses default when department not provided', () => {
      const mockData = {};
      const narration = def?.generateNarration(mockData, {});
      expect(narration?.text.toLowerCase()).toContain('department');
    });
  });

  describe('finance:quarterly_report narration', () => {
    const def = getComponentDefinition('finance', 'quarterly_report');

    it('generates narration with quarter and year', () => {
      const mockData = { quarter: 'Q3', year: 2026 };
      const narration = def?.generateNarration(mockData, { quarter: 'Q3', year: '2026' });
      expect(narration?.text).toContain('Q3');
      expect(narration?.text).toContain('2026');
    });

    it('uses defaults when quarter/year not specified', () => {
      const mockData = {};
      const narration = def?.generateNarration(mockData, {});
      expect(narration?.text).toContain('Q1');
      expect(narration?.text).toContain('2026');
    });
  });

  describe('hr:org_chart narration edge cases', () => {
    const def = getComponentDefinition('hr', 'org_chart');

    it('handles null manager', () => {
      const mockData = { manager: null, directReports: [] };
      const narration = def?.generateNarration(mockData, {});
      expect(narration?.text).toContain('no one');
    });

    it('handles undefined manager', () => {
      const mockData = { directReports: [{ id: '1' }] };
      const narration = def?.generateNarration(mockData, {});
      expect(narration?.text).toContain('no one');
      expect(narration?.text).toContain('1 direct reports');
    });

    it('handles undefined directReports', () => {
      const mockData = { manager: { name: 'Boss' } };
      const narration = def?.generateNarration(mockData, {});
      expect(narration?.text).toContain('0 direct reports');
    });
  });

  describe('sales:customer narration edge cases', () => {
    const def = getComponentDefinition('sales', 'customer');

    it('handles undefined customer', () => {
      const mockData = { opportunities: [{ id: '1' }] };
      const narration = def?.generateNarration(mockData, {});
      expect(narration?.text).toContain('Unknown');
    });

    it('handles customer with no name', () => {
      const mockData = { customer: { id: 'c1' } };
      const narration = def?.generateNarration(mockData, {});
      expect(narration?.text).toContain('Unknown');
    });

    it('handles undefined opportunities', () => {
      const mockData = { customer: { name: 'Acme' } };
      const narration = def?.generateNarration(mockData, {});
      expect(narration?.text).toContain('0 active opportunities');
    });
  });

  describe('approvals:pending narration edge cases', () => {
    const def = getComponentDefinition('approvals', 'pending');

    it('handles all undefined arrays', () => {
      const mockData = {};
      const narration = def?.generateNarration(mockData, {});
      expect(narration?.text).toContain('0 pending approvals');
    });

    it('handles mixed populated and empty arrays', () => {
      const mockData = {
        timeOffRequests: [{ id: '1' }],
        expenseReports: [],
        budgetAmendments: undefined,
      };
      const narration = def?.generateNarration(mockData, {});
      expect(narration?.text).toContain('1 pending approvals');
    });
  });
});

describe('ComponentRegistry - All Components Complete', () => {
  it('all components have working transform functions', () => {
    for (const def of listComponents()) {
      // Call with empty object should not throw
      expect(() => def.transform({})).not.toThrow();
      const result = def.transform({});
      expect(typeof result).toBe('object');
    }
  });

  it('all components have working generateNarration functions', () => {
    for (const def of listComponents()) {
      // Call with empty data and params should not throw
      expect(() => def.generateNarration({}, {})).not.toThrow();
      const result = def.generateNarration({}, {});
      expect(result).toHaveProperty('text');
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);
    }
  });
});

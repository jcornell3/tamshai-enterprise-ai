/**
 * Get Quarterly Report Tool Tests - MCP-Finance
 *
 * RED Phase: Tests for quarterly financial report retrieval.
 * Tests KPI aggregation, ARR waterfall calculation, and data formatting.
 */

import { getQuarterlyReport, GetQuarterlyReportInput, QuarterlyReport, KPI, WaterfallItem } from './get-quarterly-report';
import {
  createMockUserContext,
  createMockDbResult,
} from '../test-utils';
import { isSuccessResponse, isErrorResponse } from '../types/response';

// Mock the database connection
jest.mock('../database/connection', () => ({
  queryWithRLS: jest.fn(),
}));

import { queryWithRLS } from '../database/connection';

const mockQueryWithRLS = queryWithRLS as jest.MockedFunction<typeof queryWithRLS>;

// Sample quarterly data
const sampleQuarterlyData = {
  revenue: 1250000,
  expenses: 850000,
  profit: 400000,
  mrr: 416667,
  arr: 5000000,
  churn_rate: 2.5,
  nps: 45,
  previous_quarter_revenue: 1150000,
  previous_quarter_mrr: 383333,
  previous_quarter_churn: 3.0,
  previous_quarter_nps: 42,
  arr_beginning: 4800000,
  arr_new_business: 300000,
  arr_expansion: 150000,
  arr_contraction: 100000,
  arr_churn: 150000,
  arr_ending: 5000000,
};

describe('getQuarterlyReport', () => {
  const userContext = createMockUserContext({ roles: ['finance-read'] });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('successful queries', () => {
    it('should return quarterly report for valid quarter and year', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([sampleQuarterlyData]));

      const result = await getQuarterlyReport(
        { quarter: 'Q1', year: 2025 },
        userContext
      );

      expect(isSuccessResponse(result)).toBe(true);
      if (isSuccessResponse(result)) {
        expect(result.data.quarter).toBe('Q1');
        expect(result.data.year).toBe(2025);
        expect(result.data.revenue).toBe(1250000);
        expect(result.data.expenses).toBe(850000);
        expect(result.data.profit).toBe(400000);
      }
    });

    it('should calculate and include KPI metrics with changes', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([sampleQuarterlyData]));

      const result = await getQuarterlyReport(
        { quarter: 'Q1', year: 2025 },
        userContext
      );

      if (isSuccessResponse(result)) {
        expect(result.data.kpis).toBeDefined();
        expect(result.data.kpis.length).toBeGreaterThan(0);

        // Check Revenue KPI
        const revenueKPI = result.data.kpis.find((kpi: KPI) => kpi.name === 'Revenue');
        expect(revenueKPI).toBeDefined();
        expect(revenueKPI?.value).toBe(1250000);
        expect(revenueKPI?.unit).toBe('currency');
        expect(revenueKPI?.change).toBeCloseTo(8.7, 1); // (1250000 - 1150000) / 1150000 * 100

        // Check MRR KPI
        const mrrKPI = result.data.kpis.find((kpi: KPI) => kpi.name === 'MRR');
        expect(mrrKPI).toBeDefined();
        expect(mrrKPI?.value).toBe(416667);
        expect(mrrKPI?.unit).toBe('currency');

        // Check Churn KPI
        const churnKPI = result.data.kpis.find((kpi: KPI) => kpi.name === 'Churn');
        expect(churnKPI).toBeDefined();
        expect(churnKPI?.value).toBe(2.5);
        expect(churnKPI?.unit).toBe('percentage');

        // Check NPS KPI
        const npsKPI = result.data.kpis.find((kpi: KPI) => kpi.name === 'NPS');
        expect(npsKPI).toBeDefined();
        expect(npsKPI?.value).toBe(45);
        expect(npsKPI?.unit).toBe('number');
      }
    });

    it('should build ARR waterfall from beginning to ending', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([sampleQuarterlyData]));

      const result = await getQuarterlyReport(
        { quarter: 'Q1', year: 2025 },
        userContext
      );

      if (isSuccessResponse(result)) {
        expect(result.data.arrWaterfall).toBeDefined();
        expect(result.data.arrWaterfall.length).toBe(6);

        const waterfall = result.data.arrWaterfall;
        expect(waterfall[0]).toEqual({ label: 'Beginning ARR', value: 4800000, type: 'start' });
        expect(waterfall[1]).toEqual({ label: 'New Business', value: 300000, type: 'increase' });
        expect(waterfall[2]).toEqual({ label: 'Expansion', value: 150000, type: 'increase' });
        expect(waterfall[3]).toEqual({ label: 'Contraction', value: -100000, type: 'decrease' });
        expect(waterfall[4]).toEqual({ label: 'Churn', value: -150000, type: 'decrease' });
        expect(waterfall[5]).toEqual({ label: 'Ending ARR', value: 5000000, type: 'end' });
      }
    });

    it('should generate highlights from key metrics', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([sampleQuarterlyData]));

      const result = await getQuarterlyReport(
        { quarter: 'Q1', year: 2025 },
        userContext
      );

      if (isSuccessResponse(result)) {
        expect(result.data.highlights).toBeDefined();
        expect(result.data.highlights.length).toBeGreaterThan(0);
        expect(result.data.highlights.some((h: string) => h.includes('revenue'))).toBe(true);
      }
    });

    it('should default to current quarter if not specified', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([sampleQuarterlyData]));

      const now = new Date();
      const currentQuarter = `Q${Math.ceil((now.getMonth() + 1) / 3)}`;
      const currentYear = now.getFullYear();

      const result = await getQuarterlyReport({}, userContext);

      expect(isSuccessResponse(result)).toBe(true);
      if (isSuccessResponse(result)) {
        expect(result.data.quarter).toBe(currentQuarter);
        expect(result.data.year).toBe(currentYear);
      }
    });
  });

  describe('error handling', () => {
    it('should return error if no data found for quarter', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      const result = await getQuarterlyReport(
        { quarter: 'Q4', year: 2020 },
        userContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('REPORT_NOT_FOUND');
        expect(result.message).toContain('Q4 2020');
      }
    });

    it('should validate quarter format', async () => {
      const result = await getQuarterlyReport(
        { quarter: 'Q5' as any, year: 2025 },
        userContext
      );

      expect(isErrorResponse(result)).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      mockQueryWithRLS.mockRejectedValue(new Error('Database connection failed'));

      const result = await getQuarterlyReport(
        { quarter: 'Q1', year: 2025 },
        userContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });
  });

  describe('data transformations', () => {
    it('should calculate percentage changes correctly', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([sampleQuarterlyData]));

      const result = await getQuarterlyReport(
        { quarter: 'Q1', year: 2025 },
        userContext
      );

      if (isSuccessResponse(result)) {
        const revenueKPI = result.data.kpis.find((kpi: KPI) => kpi.name === 'Revenue');
        // (1250000 - 1150000) / 1150000 * 100 = 8.7%
        expect(revenueKPI?.change).toBeCloseTo(8.7, 1);
      }
    });

    it('should handle missing previous quarter data', async () => {
      const dataWithoutPrevious = {
        ...sampleQuarterlyData,
        previous_quarter_revenue: null,
        previous_quarter_mrr: null,
      };

      mockQueryWithRLS.mockResolvedValue(createMockDbResult([dataWithoutPrevious]));

      const result = await getQuarterlyReport(
        { quarter: 'Q1', year: 2025 },
        userContext
      );

      if (isSuccessResponse(result)) {
        const revenueKPI = result.data.kpis.find((kpi: KPI) => kpi.name === 'Revenue');
        expect(revenueKPI?.change).toBe(0);
      }
    });
  });
});

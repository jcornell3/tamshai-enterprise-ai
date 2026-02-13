import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import { Link } from 'react-router-dom';
import type { PayrollDashboardMetrics } from '../types';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function DashboardPage() {
  const { getAccessToken } = useAuth();

  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ['payroll-dashboard'],
    queryFn: async () => {
      const token = await getAccessToken();
      const response = await fetch(`${apiConfig.mcpGatewayUrl}/api/mcp/payroll/get_payroll_summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch dashboard metrics');
      const result = await response.json();
      // Map API response to expected UI format
      const data = result.data;
      return {
        next_pay_date: data.next_pay_date,
        days_until_payday: Math.ceil((new Date(data.next_pay_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        current_period_gross: data.total_gross_pay,
        employees_count: data.employee_count,
        ytd_payroll: data.ytd_totals?.gross_pay || data.total_gross_pay,
        ytd_payroll_change: 0, // API doesn't provide this
      } as PayrollDashboardMetrics;
    },
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll Dashboard</h1>
          <p className="text-gray-500 mt-1">Overview of payroll metrics and quick actions</p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Loading payroll data...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Error loading payroll data</p>
        </div>
      )}

      {!isLoading && !error && (
        <>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Next Pay Date */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Next Pay Date</h3>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {metrics ? formatDate(metrics.next_pay_date) : '-'}
          </p>
          <p className="text-sm text-primary-600 mt-1">
            {metrics?.days_until_payday} days
          </p>
        </div>

        {/* Total Payroll */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Total Payroll</h3>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {metrics ? formatCurrency(metrics.current_period_gross) : '-'}
          </p>
          <p className="text-sm text-gray-500 mt-1">Current period gross</p>
        </div>

        {/* Employees Paid */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Employees Paid</h3>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {metrics?.employees_count ?? '-'}
          </p>
          <p className="text-sm text-gray-500 mt-1">Active employees</p>
        </div>

        {/* YTD Payroll */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">YTD Payroll</h3>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {metrics ? formatCurrency(metrics.ytd_payroll) : '-'}
          </p>
          <p className={`text-sm mt-1 ${(metrics?.ytd_payroll_change ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {metrics && metrics.ytd_payroll_change >= 0 ? '+' : ''}{metrics?.ytd_payroll_change}%
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/pay-runs/new"
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <button type="button">Run Payroll</button>
          </Link>
          <button
            type="button"
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            View Pending Items
          </button>
          <button
            type="button"
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Generate Reports
          </button>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payroll by Month */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Payroll by Month</h2>
          <div className="h-64 flex items-center justify-center border border-dashed border-gray-300 rounded-lg">
            <p className="text-gray-400">Chart placeholder - 12-month payroll trend</p>
          </div>
        </div>

        {/* Tax Breakdown */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Tax Breakdown</h2>
          <div className="h-64 flex items-center justify-center border border-dashed border-gray-300 rounded-lg">
            <p className="text-gray-400">Chart placeholder - Federal, State, FICA breakdown</p>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

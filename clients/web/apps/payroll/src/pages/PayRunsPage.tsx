import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import { Link } from 'react-router-dom';
import type { PayRun, PayRunStatus } from '../types';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatPayPeriod(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const startStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startStr}-${endStr.split(',')[0]}, ${endDate.getFullYear()}`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const statusColors: Record<PayRunStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  processing: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function PayRunsPage() {
  const { getAccessToken } = useAuth();
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString());
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: payRuns, isLoading, error } = useQuery({
    queryKey: ['pay-runs', yearFilter, statusFilter],
    queryFn: async () => {
      const token = await getAccessToken();
      const params = new URLSearchParams({ year: yearFilter });
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const response = await fetch(`${apiConfig.mcpGatewayUrl}/api/mcp/payroll/list_pay_runs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch pay runs');
      const result = await response.json();
      // Map API response fields to expected UI format
      return (result.data || []).map((run: Record<string, unknown>) => ({
        pay_run_id: run.pay_run_id,
        period_start: run.pay_period_start,
        period_end: run.pay_period_end,
        pay_date: run.pay_date,
        employee_count: run.employee_count,
        gross_pay: parseFloat(String(run.total_gross)) || 0,
        net_pay: parseFloat(String(run.total_net)) || 0,
        status: String(run.status).toLowerCase() as PayRunStatus,
        created_at: run.created_at,
        updated_at: run.processed_at || run.created_at,
      })) as PayRun[];
    },
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pay Runs</h1>
          <p className="text-gray-500 mt-1">Manage payroll processing</p>
        </div>
        <Link
          to="/pay-runs/new"
          className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          New Pay Run
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div>
          <label htmlFor="year-filter" className="sr-only">Year</label>
          <select
            id="year-filter"
            aria-label="Year"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
          </select>
        </div>
        <div>
          <label htmlFor="status-filter" className="sr-only">Status</label>
          <select
            id="status-filter"
            aria-label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="review">Review</option>
            <option value="approved">Approved</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Loading pay runs...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Error loading pay runs</p>
        </div>
      )}

      {/* Pay Runs Table */}
      {!isLoading && !error && payRuns && payRuns.length > 0 ? (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pay Period
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pay Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Employees
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Gross Pay
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Net Pay
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {payRuns.map((run) => (
                <tr key={run.pay_run_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatPayPeriod(run.period_start, run.period_end)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(run.pay_date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {run.employee_count}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                    {formatCurrency(run.gross_pay)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                    {formatCurrency(run.net_pay)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[run.status]}`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-primary-600 hover:text-primary-800"
                      >
                        View
                      </button>
                      {run.status === 'draft' && (
                        <button
                          type="button"
                          className="text-green-600 hover:text-green-800"
                        >
                          Process
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !isLoading && !error ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500">No pay runs found</p>
        </div>
      ) : null}
    </div>
  );
}

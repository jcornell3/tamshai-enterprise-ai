import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import type { PayStub } from '../types';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
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

export default function PayStubsPage() {
  const { getAccessToken } = useAuth();
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString());

  const { data: payStubs, isLoading, error } = useQuery({
    queryKey: ['pay-stubs', yearFilter],
    queryFn: async () => {
      const token = await getAccessToken();
      const response = await fetch(`${apiConfig.mcpGatewayUrl}/api/mcp/payroll/list_pay_stubs?year=${yearFilter}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch pay stubs');
      const result = await response.json();
      return (result.data || []) as PayStub[];
    },
  });

  const latestStub = payStubs?.[0];
  const ytdGross = latestStub?.ytd_gross ?? 0;
  const ytdNet = latestStub?.ytd_net ?? 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pay Stubs</h1>
          <p className="text-gray-500 mt-1">View your earnings and deductions</p>
        </div>
      </div>

      {/* YTD Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">YTD Gross</h3>
          <p className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(ytdGross)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">YTD Net</h3>
          <p className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(ytdNet)}</p>
        </div>
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
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Loading pay stubs...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Error loading pay stubs</p>
        </div>
      )}

      {/* Pay Stubs Table */}
      {!isLoading && !error && payStubs && payStubs.length > 0 ? (
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
                  Gross Pay
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Deductions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Net Pay
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {payStubs.map((stub) => {
                const totalDeductions =
                  stub.federal_tax +
                  stub.state_tax +
                  stub.social_security +
                  stub.medicare +
                  stub.benefits_deductions +
                  stub.retirement_401k;

                return (
                  <tr key={stub.pay_stub_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatPayPeriod(stub.pay_period_start, stub.pay_period_end)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(stub.pay_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                      {formatCurrency(stub.gross_pay)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                      -{formatCurrency(totalDeductions)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                      {formatCurrency(stub.net_pay)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-primary-600 hover:text-primary-800"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="text-gray-600 hover:text-gray-800"
                        >
                          Download PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : !isLoading && !error ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500">No pay stubs found</p>
        </div>
      ) : null}
    </div>
  );
}

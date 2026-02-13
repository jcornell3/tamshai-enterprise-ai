import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import type { Contractor } from '../types';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-700',
};

const form1099StatusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  generated: 'bg-blue-100 text-blue-700',
  filed: 'bg-green-100 text-green-700',
};

export default function ContractorsPage() {
  const { getAccessToken } = useAuth();
  const [statusFilter, setStatusFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString());

  const { data: contractors, isLoading, error } = useQuery({
    queryKey: ['contractors', statusFilter, yearFilter],
    queryFn: async () => {
      const token = await getAccessToken();
      const params = new URLSearchParams({ year: yearFilter });
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const response = await fetch(`${apiConfig.mcpGatewayUrl}/api/mcp/payroll/list_contractors?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch contractors');
      const result = await response.json();
      return (result.data || []) as Contractor[];
    },
  });

  const contractors1099Required = contractors?.filter((c) => c.ytd_payments >= 600) ?? [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">1099 Contractors</h1>
          <p className="text-gray-500 mt-1">Manage contractor payments and 1099 forms</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Generate 1099s
          </button>
          <button
            type="button"
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Add Contractor
          </button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Loading contractors...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Error loading contractors</p>
        </div>
      )}

      {/* 1099 Summary */}
      {!isLoading && !error && contractors1099Required.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">
            <span className="font-medium">1099 Required</span> - {contractors1099Required.length} contractors require 1099
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4">
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
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
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

      {/* Contractors Table */}
      {!isLoading && !error && contractors && contractors.length > 0 ? (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Company
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tax ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  YTD Payments
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  1099 Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {contractors.map((contractor) => (
                <tr key={contractor.contractor_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                    {contractor.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {contractor.company_name || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                    {contractor.tax_id_masked}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                    {formatCurrency(contractor.ytd_payments)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[contractor.status]}`}>
                      {contractor.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${form1099StatusColors[contractor.form_1099_status]}`}>
                      {contractor.form_1099_status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      type="button"
                      className="text-primary-600 hover:text-primary-800"
                    >
                      Record Payment
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !isLoading && !error ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500">No contractors found</p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Quarterly Tax Estimates Page
 *
 * Shows quarterly federal and state tax estimates.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
// Using inline styling - @tamshai/ui doesn't have these components
import type { QuarterlyEstimate, TaxApiResponse } from '../types';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getQuarterLabel(year: number, quarter: number): string {
  return `Q${quarter} ${year}`;
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'paid':
      return 'Paid';
    case 'overdue':
      return 'Overdue';
    case 'partial':
      return 'Partial';
    default:
      return status;
  }
}

function getStatusClasses(status: string): string {
  switch (status) {
    case 'paid':
      return 'bg-green-100 text-green-800';
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'overdue':
      return 'bg-red-100 text-red-800';
    case 'partial':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function QuarterlyEstimatesPage() {
  const { getAccessToken } = useAuth();

  const { data: response, isLoading, error } = useQuery({
    queryKey: ['quarterly-estimates'],
    queryFn: async () => {
      const token = await getAccessToken();
      const fetchResponse = await fetch(`${apiConfig.mcpGatewayUrl}/api/tax/quarterly-estimates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result: TaxApiResponse<QuarterlyEstimate[]> = await fetchResponse.json();
      if (result.status === 'error') {
        throw new Error(result.message);
      }
      return result;
    },
  });

  const estimates = response?.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Quarterly Tax Estimates</h1>
        <p className="text-gray-500 mt-1">Federal and state quarterly estimated tax payments</p>
      </div>

      {isLoading && (<div className="flex flex-col items-center justify-center py-12"><div className="spinner mb-4"></div><p className="text-gray-500">Loading...</p></div>)}

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4"><p className="font-medium text-red-800">Error</p><p className="text-sm text-red-600 mt-1">{(error as Error).message}</p></div>}

      {!isLoading && !error && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quarter</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Federal</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">State</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {estimates.map((estimate) => (
                  <tr key={estimate.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {getQuarterLabel(estimate.year, estimate.quarter)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {formatCurrency(estimate.federalEstimate)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {formatCurrency(estimate.stateEstimate)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatCurrency(estimate.totalEstimate)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(estimate.dueDate)}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {estimate.paidDate ? formatDate(estimate.paidDate) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusClasses(estimate.status)}`}>
                        {getStatusLabel(estimate.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-sm">{estimate.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuarterlyEstimatesPage;

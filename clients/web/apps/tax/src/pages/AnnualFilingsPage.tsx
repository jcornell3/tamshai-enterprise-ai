/**
 * Annual Tax Filings Page
 *
 * Shows 1099s, W-2s, and other annual filings.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import type { AnnualFiling, TaxApiResponse } from '../types';

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

function getStatusLabel(status: string): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'filed':
      return 'Filed';
    case 'accepted':
      return 'Accepted';
    case 'rejected':
      return 'Rejected';
    case 'amended':
      return 'Amended';
    default:
      return status;
  }
}

function getStatusClasses(status: string): string {
  switch (status) {
    case 'accepted':
      return 'bg-green-100 text-green-800';
    case 'filed':
      return 'bg-blue-100 text-blue-800';
    case 'draft':
      return 'bg-yellow-100 text-yellow-800';
    case 'rejected':
      return 'bg-red-100 text-red-800';
    case 'amended':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function AnnualFilingsPage() {
  const { getAccessToken } = useAuth();

  const { data: response, isLoading, error } = useQuery({
    queryKey: ['annual-filings'],
    queryFn: async () => {
      const token = await getAccessToken();
      const fetchResponse = await fetch(`${apiConfig.mcpGatewayUrl}/api/tax/annual-filings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result: TaxApiResponse<AnnualFiling[]> = await fetchResponse.json();
      if (result.status === 'error') {
        throw new Error(result.message);
      }
      return result;
    },
  });

  const filings = response?.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Annual Tax Filings</h1>
        <p className="text-gray-500 mt-1">1099s, W-2s, and other annual tax filings</p>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="spinner mb-4"></div>
          <p className="text-gray-500">Loading filings...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="font-medium text-red-800">Error loading filings</p>
          <p className="text-sm text-red-600 mt-1">{(error as Error).message}</p>
        </div>
      )}

      {!isLoading && !error && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Year</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Filed Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confirmation</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filings.map((filing) => (
                  <tr key={filing.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">{filing.year}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                        {filing.filingType}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{filing.entityName}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatCurrency(filing.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(filing.dueDate)}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {filing.filingDate ? formatDate(filing.filingDate) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusClasses(filing.status)}`}>
                        {getStatusLabel(filing.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-sm font-mono">
                      {filing.confirmationNumber || '-'}
                    </td>
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

export default AnnualFilingsPage;

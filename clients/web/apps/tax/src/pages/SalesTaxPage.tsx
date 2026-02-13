/**
 * Sales Tax Rates Page
 *
 * Shows state-by-state sales tax rates.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import { TruncationWarning } from '@tamshai/ui';
import type { SalesTaxRate, TaxApiResponse } from '../types';

function formatPercent(rate: number): string {
  return `${rate.toFixed(2)}%`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function SalesTaxPage() {
  const { getAccessToken } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');

  const { data: response, isLoading, error } = useQuery({
    queryKey: ['sales-tax-rates'],
    queryFn: async () => {
      const token = await getAccessToken();
      const fetchResponse = await fetch(`${apiConfig.mcpGatewayUrl}/api/tax/sales-tax-rates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result: TaxApiResponse<SalesTaxRate[]> = await fetchResponse.json();
      if (result.status === 'error') {
        throw new Error(result.message);
      }
      return result;
    },
  });

  const allRates = response?.data || [];
  const truncated = response?.metadata?.truncated;
  const warning = response?.metadata?.warning;

  const rates = searchTerm
    ? allRates.filter(
        (rate) =>
          rate.state.toLowerCase().includes(searchTerm.toLowerCase()) ||
          rate.stateCode.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : allRates;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Sales Tax Rates</h1>
        <p className="text-gray-500 mt-1">State-by-state sales tax rates and jurisdiction information</p>
      </div>

      {isLoading && (<div className="flex flex-col items-center justify-center py-12"><div className="spinner mb-4"></div><p className="text-gray-500">Loading...</p></div>)}

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4"><p className="font-medium text-red-800">Error</p><p className="text-sm text-red-600 mt-1">{(error as Error).message}</p></div>}

      {!isLoading && !error && (
        <>
          {truncated && warning && <TruncationWarning message={warning} />}

          <div className="flex items-center gap-4">
            <input
              type="search"
              placeholder="Search states..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            {searchTerm && (
              <span className="text-sm text-gray-500">
                {rates.length} of {allRates.length} states
              </span>
            )}
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">State</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Base Rate</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Local Rate</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Combined Rate</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Effective Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {rates.map((rate) => (
                    <tr key={rate.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900 font-medium">{rate.state}</td>
                      <td className="px-4 py-3 text-gray-600">{rate.stateCode}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{formatPercent(rate.baseRate)}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{formatPercent(rate.localRate)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatPercent(rate.combinedRate)}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(rate.effectiveDate)}</td>
                      <td className="px-4 py-3 text-gray-500 text-sm">{rate.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default SalesTaxPage;

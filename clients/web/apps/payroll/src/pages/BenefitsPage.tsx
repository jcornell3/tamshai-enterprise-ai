import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import type { BenefitDeduction } from '../types';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

const benefitTypeLabels: Record<string, string> = {
  health: 'Health Insurance',
  dental: 'Dental Insurance',
  vision: 'Vision Insurance',
  '401k': '401(k) Retirement',
  hsa: 'Health Savings Account (HSA)',
  fsa: 'Flexible Spending Account (FSA)',
  life: 'Life Insurance',
  disability: 'Disability Insurance',
};

export default function BenefitsPage() {
  const { getAccessToken } = useAuth();

  const { data: benefits, isLoading, error } = useQuery({
    queryKey: ['benefits'],
    queryFn: async () => {
      const token = await getAccessToken();
      const response = await fetch(`${apiConfig.mcpGatewayUrl}/api/mcp/payroll/get_benefits`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch benefits');
      const result = await response.json();
      return (result.data || []) as BenefitDeduction[];
    },
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Benefits</h1>
        <p className="text-gray-500 mt-1">View your benefit elections and deductions</p>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Loading benefits...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Error loading benefits</p>
        </div>
      )}

      {/* Benefits List */}
      {!isLoading && !error && (
        <>
          {benefits && benefits.length > 0 ? (
            <div className="space-y-4">
              {benefits.map((benefit) => (
                <div
                  key={benefit.deduction_id}
                  className="bg-white rounded-lg shadow p-6"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {benefitTypeLabels[benefit.type] || benefit.name}
                      </h3>
                      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Your Contribution</span>
                          <p className="font-medium text-gray-900">{formatCurrency(benefit.amount)}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Employer Contribution</span>
                          <p className="font-medium text-gray-900">{formatCurrency(benefit.employer_contribution)}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Frequency</span>
                          <p className="font-medium text-gray-900 capitalize">
                            {benefit.frequency.replace(/_/g, ' ')}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-500">Tax Treatment</span>
                          <p className="font-medium text-gray-900">
                            {benefit.is_pretax ? 'Pre-Tax' : 'Post-Tax'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <p className="text-gray-500">No benefit elections found</p>
            </div>
          )}

          {/* Note */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-blue-700 text-sm">
              To make changes to your benefit elections, please contact HR or wait for the annual enrollment period.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import type { DirectDeposit } from '../types';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function DirectDepositPage() {
  const { getAccessToken } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: accounts, isLoading, error } = useQuery({
    queryKey: ['direct-deposit'],
    queryFn: async () => {
      const token = await getAccessToken();
      const response = await fetch(`${apiConfig.mcpGatewayUrl}/api/mcp/payroll/get_direct_deposit`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch direct deposit settings');
      const result = await response.json();
      return (result.data || []) as DirectDeposit[];
    },
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Direct Deposit</h1>
          <p className="text-gray-500 mt-1">Manage your bank account settings</p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          Add Account
        </button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Loading direct deposit settings...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Error loading direct deposit settings</p>
        </div>
      )}

      {/* Notice */}
      {!isLoading && !error && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-700 text-sm">
            Changes take effect for the next pay period. Allow 1-2 pay cycles for new accounts to be verified.
          </p>
        </div>
      )}

      {/* Bank Accounts */}
      {!isLoading && !error && accounts && accounts.length > 0 ? (
        <div className="space-y-4">
          {accounts.map((account) => (
            <div
              key={account.deposit_id}
              className="bg-white rounded-lg shadow p-6"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">🏦</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{account.bank_name}</h3>
                      {account.is_primary && (
                        <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs font-medium rounded-full">
                          Primary
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      <span className="capitalize">{account.account_type === 'checking' ? 'Checking' : 'Savings'}</span>
                      {' • '}
                      {account.account_number_masked}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      <span className="font-medium">Allocation: </span>
                      {account.allocation_type === 'remainder' ? (
                        <span>Remainder</span>
                      ) : account.allocation_type === 'percentage' ? (
                        <span>{account.allocation_amount}%</span>
                      ) : (
                        <span>{formatCurrency(account.allocation_amount)}</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                  {!account.is_primary && (
                    <button
                      type="button"
                      className="px-3 py-1.5 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : !isLoading && !error ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500">No bank accounts configured</p>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="mt-4 inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Add Your First Account
          </button>
        </div>
      ) : null}

      {/* Add Account Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Add Bank Account</h2>
            <form className="space-y-4">
              <div>
                <label htmlFor="bank-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Bank Name
                </label>
                <input
                  type="text"
                  id="bank-name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Enter bank name"
                />
              </div>
              <div>
                <label htmlFor="routing-number" className="block text-sm font-medium text-gray-700 mb-1">
                  Routing Number
                </label>
                <input
                  type="text"
                  id="routing-number"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="9 digits"
                  maxLength={9}
                />
              </div>
              <div>
                <label htmlFor="account-number" className="block text-sm font-medium text-gray-700 mb-1">
                  Account Number
                </label>
                <input
                  type="text"
                  id="account-number"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Enter account number"
                />
              </div>
              <div>
                <label htmlFor="account-type" className="block text-sm font-medium text-gray-700 mb-1">
                  Account Type
                </label>
                <select
                  id="account-type"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Add Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

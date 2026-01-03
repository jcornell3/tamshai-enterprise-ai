import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth, canModifySales, apiConfig } from '@tamshai/auth';
import { ApprovalCard, TruncationWarning } from '@tamshai/ui';
import CustomerDetail from '../components/CustomerDetail';
import type { Customer, Opportunity, APIResponse } from '../types';

/**
 * Customers Page
 *
 * Features:
 * - Customer table with search and industry filter
 * - Stats cards (total customers, total revenue, industry breakdown)
 * - Delete customer with v1.4 confirmation flow
 * - Truncation warnings for 50+ records
 * - Load More pagination
 * - View customer detail modal
 */
export default function CustomersPage() {
  const { userContext, getAccessToken } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    confirmationId: string;
    message: string;
    customer: Customer;
  } | null>(null);

  const canWrite = canModifySales(userContext);

  // Fetch customers
  const { data: customersResponse, isLoading, error, refetch } = useQuery({
    queryKey: ['customers', cursor],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const params = new URLSearchParams();
      if (cursor) params.append('cursor', cursor);

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/sales/list_customers${params.toString() ? '?' + params.toString() : ''}`
        : `/api/mcp/sales/list_customers${params.toString() ? '?' + params.toString() : ''}`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch customers');
      }

      return response.json() as Promise<APIResponse<Customer[]>>;
    },
  });

  // Fetch opportunities for revenue calculation
  const { data: opportunitiesResponse } = useQuery({
    queryKey: ['opportunities', 'for-customers'],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/sales/list_opportunities`
        : '/api/mcp/sales/list_opportunities';

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch opportunities');
      }

      return response.json() as Promise<APIResponse<Opportunity[]>>;
    },
  });

  // Delete customer mutation
  const deleteCustomerMutation = useMutation({
    mutationFn: async (customerId: string) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/sales/delete_customer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ customerId }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete customer');
      }

      return response.json() as Promise<APIResponse<any>>;
    },
    onSuccess: (data, customerId) => {
      if (data.status === 'pending_confirmation') {
        const customer = customers.find(c => c._id === customerId);
        setPendingConfirmation({
          confirmationId: data.confirmationId!,
          message: data.message || 'Delete customer?',
          customer: customer!,
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ['customers'] });
      }
    },
  });

  const customers = customersResponse?.data || [];
  const opportunities = opportunitiesResponse?.data || [];
  const isTruncated = customersResponse?.metadata?.truncated || false;
  const hasMore = customersResponse?.metadata?.hasMore || false;
  const nextCursor = customersResponse?.metadata?.nextCursor;

  // Calculate stats
  const stats = useMemo(() => {
    const totalRevenue = opportunities
      .filter(o => o.stage === 'CLOSED_WON')
      .reduce((sum, o) => sum + (o.value || 0), 0);

    const industryBreakdown = customers.reduce((acc, c) => {
      const industry = c.industry || 'Unknown';
      acc[industry] = (acc[industry] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalCustomers: customers.length,
      totalRevenue,
      industryBreakdown,
    };
  }, [customers, opportunities]);

  // Get unique industries for filter dropdown
  const industries = useMemo(() => {
    const unique = [...new Set(customers.map(c => c.industry).filter(Boolean))];
    return unique.sort();
  }, [customers]);

  // Filter customers
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchesSearch = !searchQuery ||
        c.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.primary_contact?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.primary_contact?.email?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesIndustry = !industryFilter || c.industry === industryFilter;

      return matchesSearch && matchesIndustry;
    });
  }, [customers, searchQuery, industryFilter]);

  const handleDelete = (customer: Customer) => {
    deleteCustomerMutation.mutate(customer._id);
  };

  const handleConfirmationComplete = (success: boolean) => {
    setPendingConfirmation(null);
    if (success) {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    }
  };

  const handleLoadMore = () => {
    if (nextCursor) {
      setCursor(nextCursor);
    }
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setIndustryFilter('');
  };

  const handleViewDetails = (customerId: string) => {
    setSelectedCustomerId(customerId);
  };

  const selectedCustomer = customers.find(c => c._id === selectedCustomerId);

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="py-12 text-center" data-testid="loading">
          <div className="spinner mb-4"></div>
          <p className="text-secondary-600">Loading customers...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <div className="alert-danger" data-testid="error">
          <p className="font-medium">Error loading customers</p>
          <p className="text-sm">{String(error)}</p>
          <button onClick={() => refetch()} className="btn-primary mt-4">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (customers.length === 0 && !searchQuery && !industryFilter) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h2 className="page-title">Customers</h2>
        </div>
        <div className="card py-12 text-center" data-testid="empty-state">
          <p className="text-secondary-600 mb-4">No customers found</p>
          <p className="text-sm text-secondary-500">
            Add your first customer to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Customers</h2>
        <p className="page-subtitle">
          Manage customer accounts
          {!canWrite && ' (read-only access)'}
        </p>
      </div>

      {/* Pending Confirmation */}
      {pendingConfirmation && (
        <div className="mb-6">
          <ApprovalCard
            confirmationId={pendingConfirmation.confirmationId}
            message={pendingConfirmation.message}
            confirmationData={{
              action: 'delete_customer',
              companyName: pendingConfirmation.customer.company_name,
              industry: pendingConfirmation.customer.industry,
            }}
            onComplete={handleConfirmationComplete}
          />
        </div>
      )}

      {/* Truncation Warning */}
      {isTruncated && customersResponse?.metadata && (
        <div className="mb-6">
          <TruncationWarning
            message="More customers exist than can be shown. Use search to find specific customers."
            returnedCount={customersResponse.metadata.returnedCount || 50}
            totalEstimate={customersResponse.metadata.totalCount || '50+'}
          />
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card" data-testid="total-customers-card">
          <h3 className="text-sm font-medium text-secondary-600">Total Customers</h3>
          <p className="text-2xl font-bold text-secondary-900">{stats.totalCustomers} Customers</p>
        </div>
        <div className="card" data-testid="total-revenue-card">
          <h3 className="text-sm font-medium text-secondary-600">Total Revenue (Won Deals)</h3>
          <p className="text-2xl font-bold text-green-600">${stats.totalRevenue.toLocaleString()}</p>
        </div>
        <div className="card" data-testid="industry-breakdown-card">
          <h3 className="text-sm font-medium text-secondary-600">Industry Breakdown</h3>
          <div className="mt-2 space-y-1">
            {Object.entries(stats.industryBreakdown).slice(0, 3).map(([industry, count]) => (
              <div key={industry} className="flex justify-between text-sm">
                <span className="text-secondary-600">{industry}:</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card mb-6">
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-secondary-700 mb-1">
              Search
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by company name, contact..."
              className="input"
              data-testid="search-input"
            />
          </div>
          <div className="w-48">
            <label className="block text-sm font-medium text-secondary-700 mb-1">
              Industry
            </label>
            <select
              value={industryFilter}
              onChange={(e) => setIndustryFilter(e.target.value)}
              className="input"
              data-testid="industry-filter"
            >
              <option value="">All Industries</option>
              {industries.map(industry => (
                <option key={industry} value={industry}>{industry}</option>
              ))}
            </select>
          </div>
          {(searchQuery || industryFilter) && (
            <button
              onClick={handleClearFilters}
              className="btn-secondary"
              data-testid="clear-filters"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Customers Table */}
      <div className="card overflow-hidden">
        {filteredCustomers.length === 0 ? (
          <div className="py-12 text-center text-secondary-600" data-testid="no-results">
            <p>No customers found matching your criteria</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="table-header">Company Name</th>
                  <th className="table-header">Industry</th>
                  <th className="table-header">Primary Contact</th>
                  <th className="table-header">Location</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-secondary-200">
                {filteredCustomers.map((customer) => (
                  <tr key={customer._id} className="table-row">
                    <td className="table-cell">
                      <button
                        onClick={() => handleViewDetails(customer._id)}
                        className="font-medium text-primary-600 hover:text-primary-700 hover:underline"
                        data-testid={`company-link-${customer._id}`}
                      >
                        {customer.company_name}
                      </button>
                    </td>
                    <td className="table-cell">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-secondary-100 text-secondary-800">
                        {customer.industry}
                      </span>
                    </td>
                    <td className="table-cell">
                      {customer.primary_contact ? (
                        <div>
                          <p className="text-secondary-900">{customer.primary_contact.name}</p>
                          <a
                            href={`mailto:${customer.primary_contact.email}`}
                            className="text-sm text-primary-600 hover:underline"
                          >
                            {customer.primary_contact.email}
                          </a>
                        </div>
                      ) : (
                        <span className="text-secondary-400">-</span>
                      )}
                    </td>
                    <td className="table-cell text-secondary-600">
                      {customer.address
                        ? `${customer.address.city}, ${customer.address.state}`
                        : '-'}
                    </td>
                    <td className="table-cell">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleViewDetails(customer._id)}
                          className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                          data-testid={`view-details-${customer._id}`}
                        >
                          View Details
                        </button>
                        {canWrite && (
                          <button
                            onClick={() => handleDelete(customer)}
                            disabled={deleteCustomerMutation.isPending}
                            className="text-danger-600 hover:text-danger-700 text-sm font-medium disabled:opacity-50"
                            data-testid={`delete-${customer._id}`}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={handleLoadMore}
            className="btn-secondary"
            data-testid="load-more"
          >
            Load More
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="mt-6 text-sm text-secondary-600 text-center">
        Showing {filteredCustomers.length} of {customers.length} customers
      </div>

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <CustomerDetail
          customer={selectedCustomer}
          onClose={() => setSelectedCustomerId(null)}
          canWrite={canWrite}
        />
      )}
    </div>
  );
}

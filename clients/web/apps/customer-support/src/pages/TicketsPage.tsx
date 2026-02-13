import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useCustomerAuth } from '../auth';
import { apiConfig } from '../auth/config';

interface Ticket {
  ticket_id: string;
  title: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  created_at: string;
  updated_at: string;
}

export default function TicketsPage() {
  const { accessToken, isLeadContact } = useCustomerAuth();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['customerTickets', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/support/tools/customer_list_tickets`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ status: statusFilter === 'all' ? undefined : statusFilter }),
        }
      );
      if (!response.ok) throw new Error('Failed to fetch tickets');
      const result = await response.json();
      return result.data as Ticket[];
    },
    enabled: !!accessToken,
  });

  const tickets = data || [];

  const statusColors: Record<string, string> = {
    open: 'bg-amber-100 text-amber-800',
    in_progress: 'bg-blue-100 text-blue-800',
    resolved: 'bg-green-100 text-green-800',
    closed: 'bg-gray-100 text-gray-800',
  };

  const priorityColors: Record<string, string> = {
    low: 'text-gray-500',
    medium: 'text-blue-600',
    high: 'text-amber-600',
    critical: 'text-red-600',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isLeadContact ? 'Organization Tickets' : 'My Tickets'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {isLeadContact
              ? 'View and manage all support tickets for your organization'
              : 'View and manage your support tickets'}
          </p>
        </div>
        <Link
          to="/tickets/new"
          className="inline-flex items-center px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Ticket
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
        <div className="flex flex-wrap gap-2">
          <FilterButton
            active={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
          >
            All
          </FilterButton>
          <FilterButton
            active={statusFilter === 'open'}
            onClick={() => setStatusFilter('open')}
          >
            Open
          </FilterButton>
          <FilterButton
            active={statusFilter === 'in_progress'}
            onClick={() => setStatusFilter('in_progress')}
          >
            In Progress
          </FilterButton>
          <FilterButton
            active={statusFilter === 'resolved'}
            onClick={() => setStatusFilter('resolved')}
          >
            Resolved
          </FilterButton>
          <FilterButton
            active={statusFilter === 'closed'}
            onClick={() => setStatusFilter('closed')}
          >
            Closed
          </FilterButton>
        </div>
      </div>

      {/* Tickets list */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-2 text-gray-500">Loading tickets...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">
            Failed to load tickets. Please try again.
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-8 text-center">
            <svg
              className="w-12 h-12 text-gray-400 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p className="text-gray-500">No tickets found</p>
            <Link
              to="/tickets/new"
              className="mt-4 inline-flex items-center text-primary-600 hover:text-primary-700"
            >
              Create your first ticket
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ticket
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tickets.map((ticket) => (
                <tr key={ticket.ticket_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link
                      to={`/tickets/${ticket.ticket_id}`}
                      className="text-primary-600 hover:text-primary-800 font-medium"
                    >
                      {ticket.title}
                    </Link>
                    <p className="text-xs text-gray-500 mt-1">{ticket.ticket_id}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        statusColors[ticket.status]
                      }`}
                    >
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-sm font-medium ${priorityColors[ticket.priority]}`}>
                      {ticket.priority}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{ticket.category}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(ticket.updated_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

interface FilterButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function FilterButton({ active, onClick, children }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active
          ? 'bg-primary-100 text-primary-700'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

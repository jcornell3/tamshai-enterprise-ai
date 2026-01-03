import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth, apiConfig } from '@tamshai/auth';
import type { Ticket, KBArticle, APIResponse } from '../types';

/**
 * Dashboard Page
 *
 * Features:
 * - Ticket metrics: open count, critical count, avg resolution time, SLA compliance
 * - Ticket distribution by status and priority
 * - Recent activity: urgent tickets and top KB articles
 * - Refresh functionality
 */
export default function DashboardPage() {
  const { getAccessToken } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  // Fetch tickets for dashboard metrics
  const {
    data: ticketsResponse,
    isLoading: ticketsLoading,
    error: ticketsError,
  } = useQuery({
    queryKey: ['dashboard-tickets'],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/support/search_tickets`
        : '/api/mcp/support/search_tickets';

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch tickets');
      }

      return response.json() as Promise<APIResponse<Ticket[]>>;
    },
  });

  // Fetch KB articles for top articles section
  const { data: articlesResponse, isLoading: articlesLoading } = useQuery({
    queryKey: ['dashboard-articles'],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/support/search_knowledge_base?query=*`
        : '/api/mcp/support/search_knowledge_base?query=*';

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch articles');
      }

      return response.json() as Promise<APIResponse<KBArticle[]>>;
    },
  });

  const tickets = ticketsResponse?.data || [];
  const articles = articlesResponse?.data || [];
  const isLoading = ticketsLoading || articlesLoading;
  const error = ticketsError;

  // Calculate metrics
  const openTickets = tickets.filter((t) => t.status === 'open').length;
  const criticalTickets = tickets.filter((t) => t.priority === 'critical').length;

  // Calculate average resolution time
  const closedTickets = tickets.filter((t) => t.closed_at && t.created_at);
  const avgResolutionTime = (() => {
    if (closedTickets.length === 0) return 'N/A';
    const totalMs = closedTickets.reduce((acc, t) => {
      const created = new Date(t.created_at).getTime();
      const closed = new Date(t.closed_at!).getTime();
      return acc + (closed - created);
    }, 0);
    const avgMs = totalMs / closedTickets.length;
    const avgHours = Math.round(avgMs / (1000 * 60 * 60));
    if (avgHours < 24) return `${avgHours}h`;
    const avgDays = Math.round(avgHours / 24);
    return `${avgDays}d`;
  })();

  // Calculate SLA compliance (placeholder calculation)
  // SLA: critical=24h, high=48h, medium=72h, low=120h
  const slaCompliance = (() => {
    if (closedTickets.length === 0) return 100;
    const slaLimits: Record<string, number> = {
      critical: 24 * 60 * 60 * 1000,
      high: 48 * 60 * 60 * 1000,
      medium: 72 * 60 * 60 * 1000,
      low: 120 * 60 * 60 * 1000,
    };
    const withinSla = closedTickets.filter((t) => {
      const created = new Date(t.created_at).getTime();
      const closed = new Date(t.closed_at!).getTime();
      const resolutionTime = closed - created;
      const limit = slaLimits[t.priority] || slaLimits.low;
      return resolutionTime <= limit;
    }).length;
    return Math.round((withinSla / closedTickets.length) * 100);
  })();

  // Calculate ticket distribution
  const ticketsByStatus: Record<string, number> = {
    open: tickets.filter((t) => t.status === 'open').length,
    in_progress: tickets.filter((t) => t.status === 'in_progress').length,
    resolved: tickets.filter((t) => t.status === 'resolved').length,
    closed: tickets.filter((t) => t.status === 'closed').length,
  };

  const ticketsByPriority: Record<string, number> = {
    critical: tickets.filter((t) => t.priority === 'critical').length,
    high: tickets.filter((t) => t.priority === 'high').length,
    medium: tickets.filter((t) => t.priority === 'medium').length,
    low: tickets.filter((t) => t.priority === 'low').length,
  };

  // Get urgent tickets (open + critical first, then by priority)
  const urgentTickets = [...tickets]
    .filter((t) => t.status === 'open' || t.priority === 'critical')
    .sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return (
        priorityOrder[a.priority] - priorityOrder[b.priority] ||
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    })
    .slice(0, 5);

  // Get top KB articles by views
  const topArticles = [...articles]
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 5);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['dashboard-tickets'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-articles'] });
  }, [queryClient]);

  const handleTicketClick = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    navigate(`/tickets/${ticket.id}`);
  };

  // Priority color mapping
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Status color mapping
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'resolved':
        return 'bg-green-100 text-green-800';
      case 'closed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="py-12 text-center" data-testid="loading-state">
          <div className="spinner mb-4"></div>
          <p className="text-secondary-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <div className="alert-danger" data-testid="error-state">
          <p className="font-medium">Error loading dashboard</p>
          <p className="text-sm">{String(error)}</p>
        </div>
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="page-container">
        <div className="page-header flex items-center justify-between">
          <div>
            <h2 className="page-title">Support Dashboard</h2>
            <p className="page-subtitle">Overview of support operations</p>
          </div>
          <button
            onClick={handleRefresh}
            className="btn-secondary"
            data-testid="refresh-button"
          >
            Refresh
          </button>
        </div>
        <div
          className="card py-12 text-center text-secondary-600"
          data-testid="empty-state"
        >
          <p>No tickets found. The queue is empty!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header flex items-center justify-between">
        <div>
          <h2 className="page-title">Support Dashboard</h2>
          <p className="page-subtitle">Overview of support operations</p>
        </div>
        <button
          onClick={handleRefresh}
          className="btn-secondary"
          data-testid="refresh-button"
        >
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card" data-testid="open-tickets-card">
          <h3 className="text-sm font-medium text-secondary-600">Open Tickets</h3>
          <p
            className="text-3xl font-bold text-blue-600"
            data-testid="open-tickets-count"
          >
            {openTickets}
          </p>
        </div>
        <div className="card" data-testid="critical-tickets-card">
          <h3 className="text-sm font-medium text-secondary-600">Critical Tickets</h3>
          <p
            className="text-3xl font-bold text-red-600"
            data-testid="critical-tickets-count"
          >
            {criticalTickets}
          </p>
        </div>
        <div className="card" data-testid="resolution-time-card">
          <h3 className="text-sm font-medium text-secondary-600">
            Avg Resolution Time
          </h3>
          <p
            className="text-3xl font-bold text-secondary-900"
            data-testid="avg-resolution-time"
          >
            {avgResolutionTime}
          </p>
        </div>
        <div className="card" data-testid="sla-compliance-card">
          <h3 className="text-sm font-medium text-secondary-600">SLA Compliance</h3>
          <p
            className="text-3xl font-bold text-green-600"
            data-testid="sla-compliance-rate"
          >
            {slaCompliance}%
          </p>
        </div>
      </div>

      {/* Distribution Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* By Status */}
        <div className="card" data-testid="status-distribution">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">
            Tickets by Status
          </h3>
          <div className="space-y-3">
            {Object.entries(ticketsByStatus).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                      status
                    )}`}
                  >
                    {status.replace('_', ' ')}
                  </span>
                </div>
                <span
                  className="font-semibold text-secondary-900"
                  data-testid={`status-${status}-count`}
                >
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* By Priority */}
        <div className="card" data-testid="priority-distribution">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">
            Tickets by Priority
          </h3>
          <div className="space-y-3">
            {Object.entries(ticketsByPriority).map(([priority, count]) => (
              <div key={priority} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${getPriorityColor(
                      priority
                    )}`}
                  >
                    {priority}
                  </span>
                </div>
                <span
                  className="font-semibold text-secondary-900"
                  data-testid={`priority-${priority}-count`}
                >
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Urgent Tickets */}
        <div className="card" data-testid="urgent-tickets">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">
            Urgent Tickets
          </h3>
          {urgentTickets.length === 0 ? (
            <p className="text-secondary-600">No urgent tickets</p>
          ) : (
            <div className="space-y-3">
              {urgentTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex items-center justify-between p-3 bg-secondary-50 rounded-lg cursor-pointer hover:bg-secondary-100 transition-colors"
                  onClick={() => handleTicketClick(ticket)}
                  data-testid={`urgent-ticket-${ticket.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-secondary-900 truncate">
                      {ticket.title}
                    </p>
                    <div className="flex gap-2 mt-1">
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs ${getStatusColor(
                          ticket.status
                        )}`}
                      >
                        {ticket.status}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs ${getPriorityColor(
                          ticket.priority
                        )}`}
                      >
                        {ticket.priority}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top KB Articles */}
        <div className="card" data-testid="top-articles">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">
            Top Knowledge Base Articles
          </h3>
          {topArticles.length === 0 ? (
            <p className="text-secondary-600">No articles found</p>
          ) : (
            <div className="space-y-3">
              {topArticles.map((article) => (
                <div
                  key={article.id}
                  className="flex items-center justify-between p-3 bg-secondary-50 rounded-lg"
                  data-testid={`top-article-${article.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-secondary-900 truncate">
                      {article.title}
                    </p>
                    <p className="text-xs text-secondary-500 mt-1">
                      {article.category} - {article.views || 0} views
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

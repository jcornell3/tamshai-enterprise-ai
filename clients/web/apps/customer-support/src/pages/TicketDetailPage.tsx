import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCustomerAuth } from '../auth';
import { apiConfig } from '../auth/config';

interface TicketNote {
  id: string;
  content: string;
  author: string;
  created_at: string;
}

interface TicketDetail {
  ticket_id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  created_at: string;
  updated_at: string;
  customer_visible_notes?: TicketNote[];
}

export default function TicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { accessToken } = useCustomerAuth();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState('');

  const { data: ticket, isLoading, error } = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: async () => {
      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/support/tools/customer_get_ticket`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ ticketId }),
        }
      );
      if (!response.ok) throw new Error('Failed to fetch ticket');
      const result = await response.json();
      return result.data as TicketDetail;
    },
    enabled: !!accessToken && !!ticketId,
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/support/tools/customer_add_comment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ ticketId, content }),
        }
      );
      if (!response.ok) throw new Error('Failed to add comment');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
      setNewComment('');
    },
  });

  const statusColors: Record<string, string> = {
    open: 'bg-amber-100 text-amber-800',
    in_progress: 'bg-blue-100 text-blue-800',
    resolved: 'bg-green-100 text-green-800',
    closed: 'bg-gray-100 text-gray-800',
  };

  const priorityColors: Record<string, string> = {
    low: 'bg-gray-100 text-gray-800',
    medium: 'bg-blue-100 text-blue-800',
    high: 'bg-amber-100 text-amber-800',
    critical: 'bg-red-100 text-red-800',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Failed to load ticket details.</p>
        <Link to="/tickets" className="text-primary-600 hover:underline mt-2 inline-block">
          Back to tickets
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center text-sm text-gray-500">
        <Link to="/tickets" className="hover:text-primary-600">
          Tickets
        </Link>
        <svg className="w-4 h-4 mx-2" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-gray-900">{ticket.ticket_id}</span>
      </nav>

      {/* Ticket header */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{ticket.title}</h1>
            <p className="text-sm text-gray-500 mt-1">{ticket.ticket_id}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[ticket.status]}`}>
              {ticket.status.replace('_', ' ')}
            </span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${priorityColors[ticket.priority]}`}>
              {ticket.priority} priority
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-200">
          <div>
            <p className="text-xs text-gray-500 uppercase">Category</p>
            <p className="text-sm font-medium text-gray-900">{ticket.category}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Created</p>
            <p className="text-sm font-medium text-gray-900">
              {new Date(ticket.created_at).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Last Updated</p>
            <p className="text-sm font-medium text-gray-900">
              {new Date(ticket.updated_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Description</h2>
        <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
          {ticket.description}
        </div>
      </div>

      {/* Comments section */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Comments</h2>

        {/* Comments list */}
        <div className="space-y-4 mb-6">
          {!ticket.customer_visible_notes || ticket.customer_visible_notes.length === 0 ? (
            <p className="text-gray-500 text-sm">No comments yet.</p>
          ) : (
            ticket.customer_visible_notes.map((note) => (
              <div key={note.id} className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900">{note.author}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(note.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
              </div>
            ))
          )}
        </div>

        {/* Add comment form */}
        {ticket.status !== 'closed' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newComment.trim()) {
                addCommentMutation.mutate(newComment);
              }
            }}
            className="space-y-4"
          >
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!newComment.trim() || addCommentMutation.isPending}
                className="px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addCommentMutation.isPending ? 'Adding...' : 'Add Comment'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

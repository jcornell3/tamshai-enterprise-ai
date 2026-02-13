import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth, canModifySupport, apiConfig } from '@tamshai/auth';
import type { Ticket, APIResponse } from '../types';

/**
 * Ticket Detail Page
 *
 * Shows full ticket details with comments and actions
 */
export default function TicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { userContext, getAccessToken } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = canModifySupport(userContext);
  const [newComment, setNewComment] = useState('');
  const [assignee, setAssignee] = useState('');
  const [newInternalNote, setNewInternalNote] = useState('');
  const [showInternalNotes, setShowInternalNotes] = useState(true);

  // Fetch ticket details
  const { data: ticketResponse, isLoading, error } = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/support/get_ticket?ticketId=${ticketId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error('Failed to fetch ticket');
      return response.json() as Promise<APIResponse<Ticket>>;
    },
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async (comment: string) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/support/add_comment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ ticketId, comment }),
        }
      );
      if (!response.ok) throw new Error('Failed to add comment');
      return response.json();
    },
    onSuccess: () => {
      setNewComment('');
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
    },
  });

  // Add internal note mutation
  const addInternalNoteMutation = useMutation({
    mutationFn: async (note: string) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/support/add_internal_note`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ ticketId, note }),
        }
      );
      if (!response.ok) throw new Error('Failed to add internal note');
      return response.json();
    },
    onSuccess: () => {
      setNewInternalNote('');
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
    },
  });

  // Fetch customer history (other tickets from same org)
  const { data: customerHistoryResponse } = useQuery({
    queryKey: ['customer-history', ticketResponse?.data?.organization_id],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token || !ticketResponse?.data?.organization_id) return null;

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/support/search_tickets?organization_id=${ticketResponse.data.organization_id}&limit=5`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) return null;
      return response.json() as Promise<APIResponse<Ticket[]>>;
    },
    enabled: !!ticketResponse?.data?.organization_id,
  });

  // Assign ticket mutation
  const assignMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/support/assign_ticket`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ ticketId, agentId }),
        }
      );
      if (!response.ok) throw new Error('Failed to assign ticket');
      return response.json();
    },
    onSuccess: () => {
      setAssignee('');
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
    },
  });

  const ticket = ticketResponse?.data;

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      case 'closed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="py-12 text-center">
          <div className="spinner mb-4"></div>
          <p className="text-secondary-600">Loading ticket...</p>
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="page-container">
        <div className="alert-danger">
          <p className="font-medium">Error loading ticket</p>
          <p className="text-sm">{error ? String(error) : 'Ticket not found'}</p>
          <Link to="/" className="btn-primary mt-4 inline-block">
            Back to Tickets
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link to="/" className="text-primary-600 hover:underline">
          ← Back to Tickets
        </Link>
      </div>

      {/* Ticket Header */}
      <div className="card mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-secondary-900 mb-2">
              {ticket.title}
            </h1>
            <div className="flex gap-2 items-center">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                {ticket.status.replace('_', ' ')}
              </span>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                {ticket.priority}
              </span>
              <span className="text-secondary-500 text-sm">
                Created {new Date(ticket.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-3">Description</h2>
            <p className="text-secondary-700 whitespace-pre-wrap">
              {ticket.description}
            </p>
          </div>

          {/* Comments */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-3">Comments</h2>

            {ticket.comments && ticket.comments.length > 0 ? (
              <div className="space-y-4 mb-4">
                {ticket.comments.map((comment, index) => (
                  <div key={index} className="border-l-2 border-secondary-200 pl-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-secondary-900">
                        {comment.author || 'Unknown'}
                      </span>
                      <span className="text-xs text-secondary-500">
                        {new Date(comment.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-secondary-700">{comment.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-secondary-500 mb-4">No comments yet</p>
            )}

            {canWrite && (
              <div className="border-t pt-4">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="input w-full mb-2"
                  rows={3}
                />
                <button
                  onClick={() => addCommentMutation.mutate(newComment)}
                  disabled={!newComment.trim() || addCommentMutation.isPending}
                  className="btn-primary"
                >
                  {addCommentMutation.isPending ? 'Adding...' : 'Add Comment'}
                </button>
              </div>
            )}
          </div>

          {/* Internal Notes (Staff Only) */}
          {canWrite && (
            <div className="card border-l-4 border-l-amber-500">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <span className="text-amber-600">🔒</span>
                  Internal Notes
                  <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                    Staff Only
                  </span>
                </h2>
                <button
                  onClick={() => setShowInternalNotes(!showInternalNotes)}
                  className="text-sm text-secondary-500 hover:text-secondary-700"
                >
                  {showInternalNotes ? 'Hide' : 'Show'}
                </button>
              </div>

              {showInternalNotes && (
                <>
                  {ticket.internal_notes && ticket.internal_notes.length > 0 ? (
                    <div className="space-y-3 mb-4">
                      {ticket.internal_notes.map((note, index) => (
                        <div key={note.id || index} className="bg-amber-50 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-secondary-900">
                              {note.author_name || 'Staff'}
                            </span>
                            <span className="text-xs text-secondary-500">
                              {new Date(note.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-secondary-700 text-sm">{note.text}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-secondary-500 mb-4 text-sm">
                      No internal notes yet. Add notes that are only visible to staff.
                    </p>
                  )}

                  <div className="border-t pt-4">
                    <textarea
                      value={newInternalNote}
                      onChange={(e) => setNewInternalNote(e.target.value)}
                      placeholder="Add internal note (hidden from customers)..."
                      className="input w-full mb-2 bg-amber-50 border-amber-200 focus:border-amber-400"
                      rows={2}
                    />
                    <button
                      onClick={() => addInternalNoteMutation.mutate(newInternalNote)}
                      disabled={!newInternalNote.trim() || addInternalNoteMutation.isPending}
                      className="btn-secondary text-amber-700 bg-amber-100 hover:bg-amber-200"
                    >
                      {addInternalNoteMutation.isPending ? 'Adding...' : 'Add Internal Note'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Customer Info */}
          {ticket.organization_name && (
            <div className="card border-l-4 border-l-primary-500">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span>🏢</span>
                Customer
              </h2>
              <dl className="space-y-2">
                <div>
                  <dt className="text-sm text-secondary-500">Organization</dt>
                  <dd className="font-medium">{ticket.organization_name}</dd>
                </div>
                {ticket.contact_name && (
                  <div>
                    <dt className="text-sm text-secondary-500">Contact</dt>
                    <dd>{ticket.contact_name}</dd>
                  </div>
                )}
                {ticket.contact_email && (
                  <div>
                    <dt className="text-sm text-secondary-500">Email</dt>
                    <dd>
                      <a
                        href={`mailto:${ticket.contact_email}`}
                        className="text-primary-600 hover:underline"
                      >
                        {ticket.contact_email}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Details */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-3">Details</h2>
            <dl className="space-y-2">
              <div>
                <dt className="text-sm text-secondary-500">Ticket ID</dt>
                <dd className="font-mono text-sm">{ticket.id}</dd>
              </div>
              <div>
                <dt className="text-sm text-secondary-500">Category</dt>
                <dd>{ticket.category || 'Uncategorized'}</dd>
              </div>
              <div>
                <dt className="text-sm text-secondary-500">Assigned To</dt>
                <dd>{ticket.assigned_to || 'Unassigned'}</dd>
              </div>
              <div>
                <dt className="text-sm text-secondary-500">Tags</dt>
                <dd className="flex flex-wrap gap-1 mt-1">
                  {ticket.tags?.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 bg-secondary-100 text-secondary-700 rounded text-xs">
                      {tag}
                    </span>
                  )) || 'None'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Customer History */}
          {customerHistoryResponse?.data && customerHistoryResponse.data.length > 1 && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span>📋</span>
                Customer History
              </h2>
              <p className="text-xs text-secondary-500 mb-3">
                Other tickets from {ticket.organization_name}
              </p>
              <div className="space-y-2">
                {customerHistoryResponse.data
                  .filter(t => t.id !== ticket.id)
                  .slice(0, 4)
                  .map(t => (
                    <Link
                      key={t.id}
                      to={`/tickets/${t.id}`}
                      className="block p-2 rounded hover:bg-secondary-50 border border-secondary-100"
                    >
                      <div className="font-medium text-sm text-secondary-900 truncate">
                        {t.title}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${getStatusColor(t.status)}`}>
                          {t.status}
                        </span>
                        <span className="text-xs text-secondary-500">
                          {new Date(t.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </Link>
                  ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {canWrite && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-3">Actions</h2>

              {/* Assign to Agent */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Assign to Agent
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    placeholder="Agent ID or name"
                    className="input flex-1"
                  />
                  <button
                    onClick={() => assignMutation.mutate(assignee)}
                    disabled={!assignee.trim() || assignMutation.isPending}
                    className="btn-primary"
                  >
                    Assign
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

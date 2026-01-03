import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth, canModifySupport, apiConfig } from '@tamshai/auth';
import type { Ticket, KBArticleSummary, APIResponse } from '../types';
import CloseTicketModal from './CloseTicketModal';

interface TicketDetailProps {
  ticket: Ticket;
  isOpen: boolean;
  onClose: () => void;
  onTicketUpdated?: () => void;
}

/**
 * Ticket Detail Component
 *
 * Features:
 * - Display ticket information (title, description, status, priority, dates, tags)
 * - Close ticket button (opens CloseTicketModal) for support-write role
 * - Reopen button for closed tickets
 * - Suggested KB articles based on ticket content
 * - Modal behavior (close on ESC, backdrop click, X button)
 */
export function TicketDetail({
  ticket,
  isOpen,
  onClose,
  onTicketUpdated,
}: TicketDetailProps) {
  const { userContext, getAccessToken } = useAuth();
  const navigate = useNavigate();
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showReopenConfirm, setShowReopenConfirm] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const canWrite = canModifySupport(userContext);

  // Fetch suggested KB articles based on ticket keywords
  const { data: suggestionsResponse } = useQuery({
    queryKey: ['kb-suggestions', ticket.id],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      // Build query from ticket title and tags
      const keywords = [ticket.title, ...(ticket.tags || [])].join(' ');
      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/support/search_knowledge_base?query=${encodeURIComponent(keywords)}`
        : `/api/mcp/support/search_knowledge_base?query=${encodeURIComponent(keywords)}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch suggestions');
      }

      return response.json() as Promise<APIResponse<KBArticleSummary[]>>;
    },
    enabled: isOpen,
  });

  const suggestions = suggestionsResponse?.data?.slice(0, 3) || [];

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !showCloseModal && !showReopenConfirm) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, showCloseModal, showReopenConfirm]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  const handleCloseTicket = () => {
    setShowCloseModal(true);
  };

  const handleCloseModalComplete = (success: boolean) => {
    setShowCloseModal(false);
    if (success) {
      onTicketUpdated?.();
      onClose();
    }
  };

  const handleReopenTicket = async () => {
    if (!showReopenConfirm) {
      setShowReopenConfirm(true);
      return;
    }

    const token = getAccessToken();
    if (!token) return;

    try {
      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/support/reopen_ticket`
        : '/api/mcp/support/reopen_ticket';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ticketId: ticket.id }),
      });

      if (response.ok) {
        onTicketUpdated?.();
        onClose();
      }
    } catch {
      // Handle error silently
    } finally {
      setShowReopenConfirm(false);
    }
  };

  const handleArticleClick = (articleId: string) => {
    navigate(`/knowledge-base/${articleId}`);
    onClose();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
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
        return 'bg-yellow-100 text-yellow-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'resolved':
        return 'bg-green-100 text-green-800';
      case 'closed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (!isOpen) return null;

  const isTicketClosed = ticket.status === 'closed';
  const canCloseTicket = !isTicketClosed && ticket.status !== 'resolved';

  return (
    <>
      {/* Modal Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4"
        onClick={handleBackdropClick}
        data-testid="ticket-detail-backdrop"
      >
        {/* Modal Content */}
        <div
          ref={modalRef}
          className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ticket-title"
          data-testid="ticket-detail-modal"
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-secondary-200 px-6 py-4 flex items-start justify-between">
            <div className="flex-1 min-w-0 pr-4">
              <h2
                id="ticket-title"
                className="text-xl font-bold text-secondary-900"
                data-testid="ticket-title"
              >
                {ticket.title}
              </h2>
              <div className="flex gap-2 mt-2">
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}
                  data-testid="ticket-status-badge"
                >
                  {ticket.status.replace('_', ' ')}
                </span>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}
                  data-testid="ticket-priority-badge"
                >
                  {ticket.priority}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-secondary-400 hover:text-secondary-600 transition-colors"
              aria-label="Close modal"
              data-testid="close-modal-button"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-4 space-y-6">
            {/* Description */}
            <div>
              <h3 className="text-sm font-semibold text-secondary-700 mb-2">Description</h3>
              <p className="text-secondary-600" data-testid="ticket-description">
                {ticket.description}
              </p>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-semibold text-secondary-700 mb-1">Created</h3>
                <p className="text-secondary-600 text-sm" data-testid="ticket-created-date">
                  {formatDate(ticket.created_at)}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-secondary-700 mb-1">Updated</h3>
                <p className="text-secondary-600 text-sm" data-testid="ticket-updated-date">
                  {formatDate(ticket.updated_at)}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-secondary-700 mb-1">Created By</h3>
                <p className="text-secondary-600 text-sm" data-testid="ticket-created-by">
                  {ticket.created_by}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-secondary-700 mb-1">Assigned To</h3>
                <p className="text-secondary-600 text-sm" data-testid="ticket-assigned-to">
                  {ticket.assigned_to || 'Unassigned'}
                </p>
              </div>
            </div>

            {/* Tags */}
            {ticket.tags && ticket.tags.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-secondary-700 mb-2">Tags</h3>
                <div className="flex flex-wrap gap-2" data-testid="ticket-tags">
                  {ticket.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 bg-secondary-100 text-secondary-700 rounded text-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Resolution (for closed tickets) */}
            {ticket.resolution && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-green-800 mb-2">Resolution</h3>
                <p className="text-green-700" data-testid="ticket-resolution">
                  {ticket.resolution}
                </p>
                {ticket.closed_at && (
                  <p
                    className="text-sm text-green-600 mt-2"
                    data-testid="ticket-closed-date"
                  >
                    Closed: {formatDate(ticket.closed_at)}
                  </p>
                )}
                {ticket.closed_by && (
                  <p
                    className="text-sm text-green-600"
                    data-testid="ticket-closed-by"
                  >
                    Closed by: {ticket.closed_by}
                  </p>
                )}
              </div>
            )}

            {/* Suggested KB Articles */}
            {suggestions.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-secondary-700 mb-2">
                  Related Knowledge Base Articles
                </h3>
                <div className="space-y-2" data-testid="kb-suggestions">
                  {suggestions.map((article) => (
                    <button
                      key={article.id}
                      onClick={() => handleArticleClick(article.id)}
                      className="w-full text-left p-3 bg-secondary-50 hover:bg-secondary-100 rounded-lg transition-colors"
                      data-testid={`kb-suggestion-${article.id}`}
                    >
                      <p className="font-medium text-secondary-900">{article.title}</p>
                      <p className="text-xs text-secondary-500">{article.category}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="sticky bottom-0 bg-white border-t border-secondary-200 px-6 py-4 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="btn-secondary"
              data-testid="close-button"
            >
              Close
            </button>

            {/* Reopen button for closed tickets */}
            {isTicketClosed && canWrite && (
              <button
                onClick={handleReopenTicket}
                className="btn-primary"
                data-testid="reopen-ticket-button"
              >
                {showReopenConfirm ? 'Confirm Reopen' : 'Reopen Ticket'}
              </button>
            )}

            {/* Close Ticket button for open/in_progress tickets */}
            {canCloseTicket && canWrite && (
              <button
                onClick={handleCloseTicket}
                className="btn-primary bg-red-600 hover:bg-red-700"
                data-testid="close-ticket-button"
              >
                Close Ticket
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Close Ticket Modal */}
      {showCloseModal && (
        <CloseTicketModal
          ticket={ticket}
          isOpen={showCloseModal}
          onClose={() => setShowCloseModal(false)}
          onConfirm={handleCloseModalComplete}
        />
      )}
    </>
  );
}

export default TicketDetail;

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import type { Ticket, KBArticleSummary, APIResponse, ResolutionTemplate } from '../types';

interface CloseTicketModalProps {
  ticket: Ticket;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (success: boolean) => void;
}

// Resolution templates
const resolutionTemplates: ResolutionTemplate[] = [
  { id: 'resolved-by-user', text: 'Issue resolved by user following provided instructions.' },
  { id: 'config-fix', text: 'Configuration issue identified and corrected.' },
  { id: 'password-reset', text: 'Password reset completed and verified.' },
  { id: 'escalated', text: 'Issue escalated to specialized team for further investigation.' },
  { id: 'duplicate', text: 'Duplicate of existing ticket. See linked ticket for resolution.' },
];

/**
 * Close Ticket Modal Component
 *
 * Features:
 * - Resolution templates dropdown
 * - Custom resolution textarea
 * - v1.4 confirmation flow (ApprovalCard)
 * - KB article linking
 * - Submit via MCP API
 */
export function CloseTicketModal({
  ticket,
  isOpen,
  onClose,
  onConfirm,
}: CloseTicketModalProps) {
  const { getAccessToken } = useAuth();
  const modalRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);
  const lastFocusableRef = useRef<HTMLButtonElement>(null);

  // State
  const [resolution, setResolution] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [linkedArticle, setLinkedArticle] = useState<KBArticleSummary | null>(null);
  const [showArticleSearch, setShowArticleSearch] = useState(false);
  const [articleSearchQuery, setArticleSearchQuery] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Confirmation flow state
  const [confirmationState, setConfirmationState] = useState<{
    pending: boolean;
    confirmationId: string | null;
    message: string | null;
  }>({
    pending: false,
    confirmationId: null,
    message: null,
  });

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch KB articles for linking
  const { data: articlesResponse } = useQuery({
    queryKey: ['kb-articles-search', articleSearchQuery],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const query = articleSearchQuery || '*';
      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/support/search_knowledge_base?query=${encodeURIComponent(query)}`
        : `/api/mcp/support/search_knowledge_base?query=${encodeURIComponent(query)}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch articles');
      }

      return response.json() as Promise<APIResponse<KBArticleSummary[]>>;
    },
    enabled: isOpen && showArticleSearch,
  });

  const articles = articlesResponse?.data || [];

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !confirmationState.pending) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, confirmationState.pending]);

  // Focus trap
  useEffect(() => {
    if (isOpen && firstFocusableRef.current) {
      firstFocusableRef.current.focus();
    }
  }, [isOpen]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget && !confirmationState.pending) {
        onClose();
      }
    },
    [onClose, confirmationState.pending]
  );

  // Handle template selection
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = resolutionTemplates.find((t) => t.id === templateId);
    if (template) {
      setResolution(template.text);
      setValidationError(null);
    }
  };

  // Handle article linking
  const handleLinkArticle = (article: KBArticleSummary) => {
    setLinkedArticle(article);
    setShowArticleSearch(false);
    setArticleSearchQuery('');
  };

  const handleRemoveArticle = () => {
    setLinkedArticle(null);
  };

  // Validate resolution
  const validateResolution = (): boolean => {
    if (!resolution.trim()) {
      setValidationError('Resolution is required');
      return false;
    }
    if (resolution.trim().length < 10) {
      setValidationError('Resolution must be at least 10 characters');
      return false;
    }
    setValidationError(null);
    return true;
  };

  // Handle initial close ticket request
  const handleCloseTicket = async () => {
    if (!validateResolution()) return;

    setIsSubmitting(true);
    setApiError(null);

    try {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      // Build resolution text with linked article
      let fullResolution = resolution;
      if (linkedArticle) {
        fullResolution += `\n\nSee KB article: ${linkedArticle.title}`;
      }

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/support/close_ticket`
        : '/api/mcp/support/close_ticket';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ticketId: ticket.id,
          resolution: fullResolution,
          linkedArticleId: linkedArticle?.id,
        }),
      });

      const data = (await response.json()) as APIResponse<Ticket>;

      if (data.status === 'pending_confirmation') {
        setConfirmationState({
          pending: true,
          confirmationId: data.confirmationId || null,
          message: data.message || `Please confirm closing ticket #${ticket.id}`,
        });
      } else if (data.status === 'success') {
        setSuccessMessage('Ticket closed successfully');
        setTimeout(() => {
          onConfirm(true);
        }, 1500);
      } else if (data.status === 'error') {
        setApiError(data.message || data.error || 'Failed to close ticket');
      }
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle confirmation approval
  const handleConfirmApproval = async () => {
    if (!confirmationState.confirmationId) return;

    setIsSubmitting(true);
    setApiError(null);

    try {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/confirm/${confirmationState.confirmationId}`
        : `/api/confirm/${confirmationState.confirmationId}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ approved: true }),
      });

      const data = (await response.json()) as APIResponse<Ticket>;

      if (!response.ok) {
        if (data.code === 'CONFIRMATION_EXPIRED') {
          setApiError('Confirmation expired. Please try again.');
          setConfirmationState({ pending: false, confirmationId: null, message: null });
        } else {
          setApiError(data.message || 'Failed to confirm');
        }
        return;
      }

      if (data.status === 'success') {
        setSuccessMessage('Ticket closed successfully');
        setTimeout(() => {
          onConfirm(true);
        }, 1500);
      }
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle confirmation cancellation
  const handleConfirmCancel = () => {
    setConfirmationState({ pending: false, confirmationId: null, message: null });
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

  const isConfirmDisabled = !resolution.trim() || resolution.trim().length < 10 || isSubmitting;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
      data-testid="close-ticket-modal-backdrop"
    >
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-ticket-title"
        data-testid="close-ticket-modal"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-secondary-200 px-6 py-4 flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-4">
            <h2
              id="close-ticket-title"
              className="text-xl font-bold text-secondary-900"
              data-testid="modal-title"
            >
              Close Ticket #{ticket.id.substring(0, 8)}
            </h2>
            <p className="text-secondary-600 mt-1" data-testid="ticket-title-summary">
              {ticket.title}
            </p>
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
            ref={firstFocusableRef}
            onClick={onClose}
            className="text-secondary-400 hover:text-secondary-600 transition-colors"
            aria-label="Close modal"
            data-testid="x-close-button"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Success Message */}
          {successMessage && (
            <div
              className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded"
              data-testid="success-message"
            >
              {successMessage}
            </div>
          )}

          {/* API Error */}
          {apiError && (
            <div
              className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded"
              data-testid="api-error"
            >
              {apiError}
            </div>
          )}

          {/* Confirmation Dialog */}
          {confirmationState.pending && (
            <div
              className="bg-yellow-50 border border-yellow-200 rounded-lg p-4"
              data-testid="confirmation-dialog"
            >
              <h3 className="font-semibold text-yellow-800 mb-2">Confirm Close Ticket</h3>
              <p className="text-yellow-700 mb-4" data-testid="confirmation-message">
                {confirmationState.message}
              </p>
              <p className="text-sm text-yellow-600 mb-4">
                Are you sure you want to close this ticket? This action will mark the ticket as closed.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleConfirmApproval}
                  disabled={isSubmitting}
                  className="btn-primary bg-yellow-600 hover:bg-yellow-700"
                  data-testid="confirm-yes-button"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <span className="spinner-sm"></span>
                      Confirming...
                    </span>
                  ) : (
                    'Yes, Close Ticket'
                  )}
                </button>
                <button
                  onClick={handleConfirmCancel}
                  disabled={isSubmitting}
                  className="btn-secondary"
                  data-testid="confirm-no-button"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Warning */}
          {!confirmationState.pending && !successMessage && (
            <>
              <div
                className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded flex items-start gap-3"
                data-testid="warning-message"
              >
                <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <p className="font-medium">This action is irreversible</p>
                  <p className="text-sm mt-1">
                    Closing this ticket will mark it as resolved. Please ensure you have provided a complete resolution.
                  </p>
                </div>
              </div>

              {/* Resolution Template Dropdown */}
              <div>
                <label
                  htmlFor="resolution-template"
                  className="block text-sm font-medium text-secondary-700 mb-1"
                >
                  Resolution Template
                </label>
                <select
                  id="resolution-template"
                  value={selectedTemplate}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="input w-full"
                  data-testid="resolution-template-select"
                >
                  <option value="">Select a template...</option>
                  {resolutionTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.text.substring(0, 50)}...
                    </option>
                  ))}
                </select>
              </div>

              {/* Resolution Textarea */}
              <div>
                <label
                  htmlFor="resolution"
                  className="block text-sm font-medium text-secondary-700 mb-1"
                >
                  Resolution <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="resolution"
                  value={resolution}
                  onChange={(e) => {
                    setResolution(e.target.value);
                    if (validationError) {
                      setValidationError(null);
                    }
                  }}
                  placeholder="Describe how the issue was resolved..."
                  rows={4}
                  className={`input w-full resize-none ${validationError ? 'border-red-500' : ''}`}
                  data-testid="resolution-textarea"
                  aria-describedby="resolution-error resolution-hint"
                />
                <p id="resolution-hint" className="text-xs text-secondary-500 mt-1">
                  Minimum 10 characters required
                </p>
                {validationError && (
                  <p
                    id="resolution-error"
                    className="text-sm text-red-600 mt-1"
                    data-testid="validation-error"
                  >
                    {validationError}
                  </p>
                )}
              </div>

              {/* Link KB Article */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Link to KB Article (Optional)
                </label>
                {linkedArticle ? (
                  <div
                    className="flex items-center justify-between bg-secondary-50 p-3 rounded"
                    data-testid="linked-article"
                  >
                    <div>
                      <p className="font-medium text-secondary-900">{linkedArticle.title}</p>
                      <p className="text-xs text-secondary-500">{linkedArticle.category}</p>
                    </div>
                    <button
                      onClick={handleRemoveArticle}
                      className="text-secondary-400 hover:text-secondary-600"
                      aria-label="Remove linked article"
                      data-testid="remove-article-button"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div>
                    <button
                      onClick={() => setShowArticleSearch(!showArticleSearch)}
                      className="btn-secondary text-sm"
                      data-testid="link-article-button"
                    >
                      <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                        />
                      </svg>
                      Link to KB Article
                    </button>

                    {showArticleSearch && (
                      <div className="mt-2" data-testid="article-search-dropdown">
                        <input
                          type="text"
                          value={articleSearchQuery}
                          onChange={(e) => setArticleSearchQuery(e.target.value)}
                          placeholder="Search KB articles..."
                          className="input w-full mb-2"
                          data-testid="article-search-input"
                        />
                        <div className="max-h-40 overflow-y-auto border border-secondary-200 rounded">
                          {articles.length === 0 ? (
                            <p className="p-3 text-secondary-500 text-sm">No articles found</p>
                          ) : (
                            articles.slice(0, 5).map((article) => (
                              <button
                                key={article.id}
                                onClick={() => handleLinkArticle(article)}
                                className="w-full text-left p-3 hover:bg-secondary-50 border-b border-secondary-100 last:border-b-0"
                                data-testid={`article-option-${article.id}`}
                              >
                                <p className="font-medium text-secondary-900 text-sm">{article.title}</p>
                                <p className="text-xs text-secondary-500">{article.category}</p>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        {!confirmationState.pending && !successMessage && (
          <div className="sticky bottom-0 bg-white border-t border-secondary-200 px-6 py-4 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="btn-secondary"
              data-testid="cancel-button"
            >
              Cancel
            </button>
            <button
              ref={lastFocusableRef}
              onClick={handleCloseTicket}
              disabled={isConfirmDisabled}
              className="btn-primary bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-describedby="confirm-button-description"
              data-testid="confirm-close-button"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="spinner-sm" data-testid="loading-spinner"></span>
                  Closing...
                </span>
              ) : (
                'Close Ticket'
              )}
            </button>
            <span id="confirm-button-description" className="sr-only">
              Closes the ticket with the provided resolution
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default CloseTicketModal;

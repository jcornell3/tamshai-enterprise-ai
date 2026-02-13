/**
 * Escalation Flow Modal
 *
 * Confirmation modal for escalating support tickets.
 * Includes target selection, reason, and SLA context.
 */
import { useState, useEffect, useRef } from 'react';
import { useAuth, apiConfig } from '@tamshai/auth';
import SLACountdown from './SLACountdown';
import type { SLAStatus, EscalationTarget, EscalationRecord } from '../types';

interface EscalationFlowModalProps {
  ticket: SLAStatus;
  targets: EscalationTarget[];
  onClose: () => void;
  onComplete: (record: EscalationRecord) => void;
}

type EscalationLevel = 'tier1' | 'tier2' | 'management';

const ESCALATION_REASONS = [
  { value: '', label: 'Select a reason...' },
  { value: 'sla_risk', label: 'SLA at risk' },
  { value: 'sla_breach', label: 'SLA breached' },
  { value: 'technical_expertise', label: 'Technical expertise needed' },
  { value: 'customer_request', label: 'Customer request' },
  { value: 'complex_issue', label: 'Complex issue requiring senior review' },
  { value: 'policy_exception', label: 'Policy exception needed' },
  { value: 'other', label: 'Other' },
];

export default function EscalationFlowModal({
  ticket,
  targets,
  onClose,
  onComplete,
}: EscalationFlowModalProps) {
  const { getAccessToken } = useAuth();
  const reasonSelectRef = useRef<HTMLSelectElement>(null);

  const [escalationLevel, setEscalationLevel] = useState<EscalationLevel>('tier2');
  const [selectedTarget, setSelectedTarget] = useState<string>(targets[0]?.id || '');
  const [reason, setReason] = useState<string>(ticket.is_breached ? 'sla_breach' : (ticket.is_at_risk ? 'sla_risk' : ''));
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Focus first input on mount
  useEffect(() => {
    reasonSelectRef.current?.focus();
  }, []);

  // Handle form submission
  const handleSubmit = async () => {
    // Validate
    if (!reason) {
      setValidationError('Reason is required');
      return;
    }
    setValidationError(null);

    setIsSubmitting(true);
    setError(null);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/support/escalate_ticket`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            ticketId: ticket.ticket_id,
            escalation_level: escalationLevel,
            target_id: escalationLevel !== 'management' ? selectedTarget : undefined,
            reason: ESCALATION_REASONS.find(r => r.value === reason)?.label || reason,
            notes: notes || undefined,
          }),
        }
      );

      const result = await response.json();

      if (result.status === 'error') {
        setError(result.message || 'Failed to escalate ticket');
        setIsSubmitting(false);
        return;
      }

      onComplete(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-labelledby="escalation-modal-title"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-secondary-200">
          <h2 id="escalation-modal-title" className="text-lg font-semibold text-secondary-900">
            Escalate Ticket
          </h2>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Ticket Summary */}
          <div className="bg-secondary-50 rounded-lg p-4">
            <div className="flex justify-between items-start mb-2">
              <span className="text-sm font-medium text-secondary-500">{ticket.ticket_id}</span>
              <SLACountdown
                timeRemainingMinutes={ticket.time_remaining_minutes}
                isAtRisk={ticket.is_at_risk}
                isBreached={ticket.is_breached}
              />
            </div>
            <h3 className="font-medium text-secondary-900 mb-2">{ticket.ticket_title}</h3>
            <div className="flex gap-2 text-sm">
              <span className="px-2 py-0.5 bg-primary-100 text-primary-800 rounded">
                {ticket.customer_tier}
              </span>
              <span className={`px-2 py-0.5 rounded ${
                ticket.priority === 'critical' ? 'bg-danger-100 text-danger-800' :
                ticket.priority === 'high' ? 'bg-warning-100 text-warning-800' :
                'bg-secondary-100 text-secondary-800'
              }`}>
                {ticket.priority}
              </span>
            </div>
          </div>

          {/* Breach Warning */}
          {(ticket.is_breached || ticket.time_remaining_minutes < 0) && (
            <div className="p-3 bg-danger-50 border border-danger-200 rounded-lg">
              <p className="text-sm text-danger-700 font-medium">
                SLA breached - Immediate escalation required
              </p>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-danger-50 border border-danger-200 rounded-lg">
              <p className="text-sm text-danger-700">{error}</p>
            </div>
          )}

          {/* Escalation Level */}
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-2">
              Escalation Level
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="level-tier2"
                onClick={() => setEscalationLevel('tier2')}
                className={`p-3 border rounded-lg text-left transition-colors ${
                  escalationLevel === 'tier2'
                    ? 'border-primary-500 bg-primary-50 selected'
                    : 'border-secondary-200 hover:border-primary-300'
                }`}
              >
                <div className="font-medium text-secondary-900">Tier 2 Support</div>
                <div className="text-sm text-secondary-500">Senior support engineer</div>
              </button>
              <button
                type="button"
                data-testid="level-management"
                onClick={() => setEscalationLevel('management')}
                className={`p-3 border rounded-lg text-left transition-colors ${
                  escalationLevel === 'management'
                    ? 'border-primary-500 bg-primary-50 selected'
                    : 'border-secondary-200 hover:border-primary-300'
                }`}
              >
                <div className="font-medium text-secondary-900">Management</div>
                <div className="text-sm text-secondary-500">Support manager review</div>
              </button>
            </div>
          </div>

          {/* Target Selection (for Tier 2) */}
          {escalationLevel === 'tier2' && (
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-2">
                Assign To
              </label>
              {targets.length === 0 ? (
                <p className="text-sm text-warning-600">No available agents for escalation</p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {targets.map((target) => (
                    <button
                      key={target.id}
                      type="button"
                      data-testid={`target-${target.id}`}
                      onClick={() => setSelectedTarget(target.id)}
                      className={`w-full p-3 border rounded-lg text-left transition-colors ${
                        selectedTarget === target.id
                          ? 'border-primary-500 bg-primary-50 selected'
                          : 'border-secondary-200 hover:border-primary-300'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-secondary-900">{target.name}</div>
                          <div className="text-sm text-secondary-500">{target.role}</div>
                        </div>
                        <div className="text-right text-sm">
                          <div className="text-secondary-500">{target.current_workload} tickets</div>
                          <div className="text-secondary-400">~{target.avg_resolution_minutes}m avg</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Reason Selection */}
          <div>
            <label htmlFor="reason" className="block text-sm font-medium text-secondary-700 mb-1">
              Reason for Escalation
            </label>
            <select
              ref={reasonSelectRef}
              id="reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setValidationError(null);
              }}
              className={`input w-full ${validationError ? 'border-danger-500' : ''}`}
            >
              {ESCALATION_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            {validationError && (
              <p className="mt-1 text-sm text-danger-600">{validationError}</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-secondary-700 mb-1">
              Additional Notes (optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input w-full"
              rows={3}
              placeholder="Provide context for the escalation..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-secondary-50 border-t border-secondary-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="btn-warning"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Escalating...' : 'Escalate Ticket'}
          </button>
        </div>
      </div>
    </div>
  );
}

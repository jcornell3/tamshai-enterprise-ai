/**
 * Time-Off Request Wizard
 *
 * Multi-step wizard for submitting time-off requests.
 * Follows Gusto-style time-off request flow with:
 * - Step 1: Select time-off type with balance info
 * - Step 2: Select dates with balance check
 * - Step 3: Conflict check with existing requests
 * - Step 4: Review and submit
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth, apiConfig } from '@tamshai/auth';
import { Wizard, type WizardStep, type WizardStepProps, type ValidationResult } from '@tamshai/ui';
import type { TimeOffBalance, TimeOffRequest, Employee } from '../types';

interface TimeOffRequestWizardProps {
  balances: TimeOffBalance[];
  existingRequests: TimeOffRequest[];
  manager: Pick<Employee, 'employee_id' | 'first_name' | 'last_name' | 'work_email'> | null;
  onClose: () => void;
  onComplete: (result: TimeOffRequest) => void;
}

// Shared data interface for wizard steps
interface RequestData {
  typeCode: string;
  typeName: string;
  availableBalance: number;
  startDate: string;
  endDate: string;
  halfDayStart: boolean;
  halfDayEnd: boolean;
  totalDays: number;
  notes: string;
  conflicts: TimeOffRequest[];
}

// Calculate business days between dates
function calculateBusinessDays(start: string, end: string, halfStart: boolean, halfEnd: boolean): number {
  if (!start || !end) return 0;

  const startDate = new Date(start + 'T12:00:00');
  const endDate = new Date(end + 'T12:00:00');

  if (endDate < startDate) return 0;

  let days = 0;
  const current = new Date(startDate);

  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days += 1;
    }
    current.setDate(current.getDate() + 1);
  }

  // Adjust for half days
  if (halfStart && days > 0) days -= 0.5;
  if (halfEnd && days > 0) days -= 0.5;

  return Math.max(0, days);
}

// Check for conflicts with existing requests
function findConflicts(start: string, end: string, existingRequests: TimeOffRequest[]): TimeOffRequest[] {
  if (!start || !end) return [];

  const requestStart = new Date(start);
  const requestEnd = new Date(end);

  return existingRequests.filter((req) => {
    if (req.status === 'cancelled' || req.status === 'rejected') return false;

    const existingStart = new Date(req.start_date);
    const existingEnd = new Date(req.end_date);

    // Check for overlap
    return requestStart <= existingEnd && requestEnd >= existingStart;
  });
}

export default function TimeOffRequestWizard({
  balances,
  existingRequests,
  manager,
  onClose,
  onComplete,
}: TimeOffRequestWizardProps) {
  const { getAccessToken } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  // Handle form submission
  const handleSubmit = async (data: Record<string, unknown>) => {
    setSubmitError(null);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/hr/create_time_off_request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            type_code: data.typeCode,
            start_date: data.startDate,
            end_date: data.endDate,
            half_day_start: data.halfDayStart,
            half_day_end: data.halfDayEnd,
            notes: data.notes || undefined,
          }),
        }
      );

      const result = await response.json();

      if (result.status === 'error') {
        setSubmitError(result.message || 'Failed to submit request');
        return; // Don't re-throw since we're displaying the error in UI
      }

      onComplete(result.data);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'An error occurred');
    }
  };

  // Create step components bound to this wizard's context
  const SelectTypeStepComponent = useMemo(() => {
    return function SelectTypeStep({ data, updateData }: WizardStepProps) {
      return (
        <div className="space-y-4">
          <p className="text-secondary-600">Select the type of time off you're requesting:</p>
          <div className="grid gap-3">
            {balances.map((balance) => {
              const available = Number(balance.available || 0);
              const entitlement = Number(balance.entitlement || balance.annual_entitlement || 0);
              const isDisabled = available <= 0;
              const isSelected = data.typeCode === balance.type_code;

              return (
                <button
                  key={balance.type_code}
                  data-testid={`type-option-${balance.type_code}`}
                  onClick={() => !isDisabled && updateData({
                    typeCode: balance.type_code,
                    typeName: balance.type_name,
                    availableBalance: available,
                  })}
                  disabled={isDisabled}
                  aria-disabled={isDisabled}
                  className={`p-4 border rounded-lg text-left transition-colors ${
                    isSelected
                      ? 'border-primary-500 bg-primary-50 selected'
                      : isDisabled
                      ? 'border-secondary-200 bg-secondary-50 opacity-50 cursor-not-allowed'
                      : 'border-secondary-200 hover:border-primary-300 hover:bg-primary-25'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-medium text-secondary-900">{balance.type_name}</h4>
                      <p className="text-sm text-secondary-500">
                        {available} days available of {entitlement}
                      </p>
                    </div>
                    {isSelected && (
                      <svg className="w-5 h-5 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <div
                    data-testid={`balance-progress-${balance.type_code}`}
                    className="w-full bg-secondary-200 rounded-full h-2"
                  >
                    <div
                      className={`h-2 rounded-full ${available > 0 ? 'bg-primary-500' : 'bg-secondary-400'}`}
                      style={{ width: `${Math.min(100, (available / (entitlement || 1)) * 100)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      );
    };
  }, [balances]);

  const SelectDatesStepComponent = useMemo(() => {
    return function SelectDatesStep({ data, updateData, errors }: WizardStepProps) {
      const typeName = data.typeName as string || 'Time Off';
      const availableBalance = data.availableBalance as number || 0;
      const startDate = data.startDate as string || '';
      const endDate = data.endDate as string || '';
      const halfDayStart = data.halfDayStart as boolean || false;
      const halfDayEnd = data.halfDayEnd as boolean || false;
      const notes = data.notes as string || '';

      // Calculate total days when dates change
      const totalDays = calculateBusinessDays(startDate, endDate, halfDayStart, halfDayEnd);
      const exceedsBalance = totalDays > availableBalance;

      // Update totalDays in wizard data
      useEffect(() => {
        if (totalDays !== data.totalDays) {
          updateData({ totalDays });
        }
      }, [totalDays]);

      const hasDateError = errors.some(e => e.field === 'dates');

      return (
        <div className="space-y-4">
          <div className="p-3 bg-primary-50 rounded-lg mb-4">
            <div className="flex justify-between items-center">
              <span className="font-medium text-primary-900">{typeName}</span>
              <span className="text-primary-700">{availableBalance} days available</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="start-date" className="block text-sm font-medium text-secondary-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                id="start-date"
                value={startDate}
                onChange={(e) => updateData({ startDate: e.target.value })}
                className="input w-full"
                required
              />
            </div>
            <div>
              <label htmlFor="end-date" className="block text-sm font-medium text-secondary-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                id="end-date"
                value={endDate}
                onChange={(e) => updateData({ endDate: e.target.value })}
                min={startDate}
                className="input w-full"
                required
              />
            </div>
          </div>

          {hasDateError && (
            <p className="text-sm text-danger-600">End date must be after start date</p>
          )}

          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                id="half-day-start"
                checked={halfDayStart}
                onChange={(e) => updateData({ halfDayStart: e.target.checked })}
                className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-secondary-700">Half day (start)</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                id="half-day-end"
                checked={halfDayEnd}
                onChange={(e) => updateData({ halfDayEnd: e.target.checked })}
                className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-secondary-700">Half day (end)</span>
            </label>
          </div>

          {startDate && endDate && (
            <div className={`p-3 rounded-lg ${exceedsBalance ? 'bg-warning-50' : 'bg-secondary-50'}`}>
              <div className="flex justify-between items-center">
                <span className="text-secondary-700">Total days:</span>
                <span
                  data-testid="total-days"
                  className={`font-bold ${exceedsBalance ? 'text-warning-700' : 'text-secondary-900'}`}
                >
                  {totalDays}
                </span>
              </div>
              {exceedsBalance && (
                <p className="text-sm text-warning-700 mt-2">
                  This request exceeds available balance ({availableBalance} days)
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-secondary-700 mb-1">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => updateData({ notes: e.target.value })}
              className="input w-full"
              rows={3}
              placeholder="Add any additional details..."
            />
          </div>
        </div>
      );
    };
  }, []);

  const ConflictCheckStepComponent = useMemo(() => {
    return function ConflictCheckStep({ data, updateData }: WizardStepProps) {
      const startDate = data.startDate as string || '';
      const endDate = data.endDate as string || '';

      // Calculate conflicts when entering this step
      useEffect(() => {
        const conflicts = findConflicts(startDate, endDate, existingRequests);
        updateData({ conflicts });
      }, [startDate, endDate]);

      const conflicts = (data.conflicts as TimeOffRequest[]) || [];
      const hasConflicts = conflicts.length > 0;
      const formatDate = (date: string) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      return (
        <div className="space-y-4">
          <h4 className="font-medium text-secondary-900">Conflict Check</h4>

          {hasConflicts ? (
            <div className="p-4 bg-warning-50 border border-warning-200 rounded-lg">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-warning-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="font-medium text-warning-800">Conflict Detected</p>
                  <p className="text-sm text-warning-700 mt-1">
                    Your request overlaps with existing time off:
                  </p>
                  <ul className="mt-2 space-y-1">
                    {conflicts.map((conflict) => (
                      <li key={conflict.request_id} className="text-sm text-warning-700">
                        {conflict.type_name}: {formatDate(conflict.start_date)} - {formatDate(conflict.end_date)} ({conflict.status})
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-success-50 border border-success-200 rounded-lg">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-success-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <p className="text-success-800">No conflicts found with your existing requests.</p>
              </div>
            </div>
          )}

          {existingRequests.length > 0 && (
            <div>
              <h5 className="text-sm font-medium text-secondary-700 mb-2">Your Existing Requests</h5>
              <div data-testid="existing-requests-list" className="space-y-2">
                {existingRequests
                  .filter((req) => req.status !== 'cancelled' && req.status !== 'rejected')
                  .slice(0, 5)
                  .map((req) => (
                    <div
                      key={req.request_id}
                      className="p-2 bg-secondary-50 rounded border border-secondary-200 text-sm"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{req.type_name}</span>
                        <span className={`badge-${req.status === 'approved' ? 'success' : 'warning'}`}>
                          {req.status}
                        </span>
                      </div>
                      <p className="text-secondary-600">
                        {formatDate(req.start_date)} - {formatDate(req.end_date)} ({req.total_days} days)
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      );
    };
  }, [existingRequests]);

  const ReviewStepComponent = useMemo(() => {
    return function ReviewStep({ data }: WizardStepProps) {
      const typeName = data.typeName as string || 'Time Off';
      const startDate = data.startDate as string || '';
      const endDate = data.endDate as string || '';
      const totalDays = data.totalDays as number || 0;
      const halfDayStart = data.halfDayStart as boolean || false;
      const halfDayEnd = data.halfDayEnd as boolean || false;
      const notes = data.notes as string || '';
      const conflicts = (data.conflicts as TimeOffRequest[]) || [];

      const formatDate = (date: string) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      return (
        <div className="space-y-4">
          <h4 className="font-medium text-secondary-900">Review Your Request</h4>

          {submitError && (
            <div className="p-4 bg-danger-50 border border-danger-200 rounded-lg">
              <p className="text-danger-700">{submitError}</p>
            </div>
          )}

          <div className="bg-secondary-50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-secondary-600">Type:</span>
              <span className="font-medium">{typeName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-secondary-600">Dates:</span>
              <span className="font-medium">
                {formatDate(startDate)} - {formatDate(endDate)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-secondary-600">Duration:</span>
              <span className="font-medium">{totalDays} days</span>
            </div>
            {(halfDayStart || halfDayEnd) && (
              <div className="flex justify-between">
                <span className="text-secondary-600">Half days:</span>
                <span className="font-medium">
                  {[
                    halfDayStart && 'Start',
                    halfDayEnd && 'End',
                  ].filter(Boolean).join(', ')}
                </span>
              </div>
            )}
            {notes && (
              <div className="pt-2 border-t border-secondary-200">
                <span className="text-secondary-600 block mb-1">Notes:</span>
                <p className="text-secondary-900">{notes}</p>
              </div>
            )}
          </div>

          {manager && (
            <div className="p-4 bg-primary-50 rounded-lg">
              <p className="text-sm text-primary-700">
                <span className="font-medium">{manager.first_name} {manager.last_name}</span> will review your request
              </p>
            </div>
          )}

          {conflicts.length > 0 && (
            <div className="p-4 bg-warning-50 rounded-lg">
              <p className="text-sm text-warning-700">
                Note: This request overlaps with {conflicts.length} existing request(s).
              </p>
            </div>
          )}
        </div>
      );
    };
  }, [manager, submitError]);

  // Wizard steps definition
  const wizardSteps: WizardStep[] = useMemo(() => [
    {
      id: 'select-type',
      title: 'Select Type',
      description: 'Choose time-off type',
      component: SelectTypeStepComponent,
      validate: (data): ValidationResult => {
        if (!data.typeCode) {
          return { valid: false, errors: [{ field: 'typeCode', message: 'Please select a time-off type' }] };
        }
        return { valid: true, errors: [] };
      },
    },
    {
      id: 'select-dates',
      title: 'Select Dates',
      description: 'Choose your dates',
      component: SelectDatesStepComponent,
      validate: (data): ValidationResult => {
        const errors = [];
        if (!data.startDate) {
          errors.push({ field: 'startDate', message: 'Start date is required' });
        }
        if (!data.endDate) {
          errors.push({ field: 'endDate', message: 'End date is required' });
        }
        if (data.startDate && data.endDate) {
          const start = new Date(data.startDate as string);
          const end = new Date(data.endDate as string);
          if (end < start) {
            errors.push({ field: 'dates', message: 'End date must be after start date' });
          }
        }
        return { valid: errors.length === 0, errors };
      },
    },
    {
      id: 'conflict-check',
      title: 'Conflict Check',
      description: 'Review scheduling conflicts',
      component: ConflictCheckStepComponent,
      validate: (): ValidationResult => ({ valid: true, errors: [] }),
    },
    {
      id: 'review',
      title: 'Review & Submit',
      description: 'Confirm your request',
      component: ReviewStepComponent,
      validate: (): ValidationResult => ({ valid: true, errors: [] }),
    },
  ], [SelectTypeStepComponent, SelectDatesStepComponent, ConflictCheckStepComponent, ReviewStepComponent]);

  // Initial data
  const initialData: Record<string, unknown> = {
    typeCode: '',
    typeName: '',
    availableBalance: 0,
    startDate: '',
    endDate: '',
    halfDayStart: false,
    halfDayEnd: false,
    totalDays: 0,
    notes: '',
    conflicts: [],
  };

  // Empty balances state
  if (balances.length === 0) {
    return (
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        role="dialog"
        aria-labelledby="wizard-title"
      >
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
          <h2 id="wizard-title" className="text-lg font-semibold mb-4">Request Time Off</h2>
          <p className="text-secondary-600 mb-6">No time-off types available. Please contact HR.</p>
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <Wizard
          steps={wizardSteps}
          title="Request Time Off"
          initialData={initialData}
          onComplete={handleSubmit}
          onCancel={onClose}
          showBreadcrumbs={true}
          submitLabel="Submit Request"
        />
      </div>
    </div>
  );
}

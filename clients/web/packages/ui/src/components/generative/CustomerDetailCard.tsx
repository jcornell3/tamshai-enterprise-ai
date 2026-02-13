/**
 * CustomerDetailCard Component
 *
 * Displays customer details including header info, contacts, and opportunities pipeline.
 * Generative UI component for enterprise AI-driven CRM workflows.
 *
 * Architecture v1.5 - Generative UI
 */

/**
 * Customer data
 */
export interface Customer {
  /** Unique identifier */
  id: string;
  /** Company name */
  name: string;
  /** Industry vertical */
  industry: string;
  /** Company website URL */
  website?: string;
  /** Physical address */
  address?: string;
  /** Annual revenue in dollars */
  annualRevenue?: number;
  /** Customer status */
  status: 'active' | 'inactive' | 'prospect';
}

/**
 * Contact data
 */
export interface Contact {
  /** Unique identifier */
  id: string;
  /** Full name */
  name: string;
  /** Email address */
  email: string;
  /** Phone number */
  phone?: string;
  /** Job title/role */
  role: string;
  /** Whether this is the primary contact */
  isPrimary: boolean;
}

/**
 * Opportunity data
 */
export interface Opportunity {
  /** Unique identifier */
  id: string;
  /** Opportunity name */
  name: string;
  /** Deal amount in dollars */
  amount: number;
  /** Sales stage */
  stage: string;
  /** Win probability percentage (0-100) */
  probability: number;
  /** Expected close date */
  closeDate: string;
}

/**
 * Quick action types
 */
export type QuickAction = 'call' | 'email' | 'schedule_meeting';

/**
 * Props for CustomerDetailCard component
 */
export interface CustomerDetailCardProps {
  /** Customer data */
  customer: Customer;
  /** List of contacts */
  contacts: Contact[];
  /** List of opportunities */
  opportunities: Opportunity[];
  /** Loading state */
  loading?: boolean;
  /** Error message */
  error?: string;
  /** Callback when contact is clicked */
  onContactClick?: (contactId: string) => void;
  /** Callback when opportunity is clicked */
  onOpportunityClick?: (opportunityId: string) => void;
  /** Callback for quick actions */
  onAction?: (action: QuickAction) => void;
  /** Callback to retry on error */
  onRetry?: () => void;
}

/**
 * Status styling configuration
 */
const STATUS_STYLES: Record<Customer['status'], string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-800',
  prospect: 'bg-blue-100 text-blue-800',
};

/**
 * Stage styling configuration
 */
const STAGE_STYLES: Record<string, string> = {
  'Qualification': 'bg-blue-100 text-blue-800',
  'Discovery': 'bg-cyan-100 text-cyan-800',
  'Proposal': 'bg-purple-100 text-purple-800',
  'Negotiation': 'bg-yellow-100 text-yellow-800',
  'Closed Won': 'bg-green-100 text-green-800',
  'Closed Lost': 'bg-red-100 text-red-800',
};

/**
 * Get stage styling class
 */
function getStageStyle(stage: string): string {
  return STAGE_STYLES[stage] || 'bg-gray-100 text-gray-800';
}

/**
 * Format currency for display
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format date for display
 */
function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * CustomerDetailCard Component
 */
export function CustomerDetailCard({
  customer,
  contacts,
  opportunities,
  loading = false,
  error,
  onContactClick,
  onOpportunityClick,
  onAction,
  onRetry,
}: CustomerDetailCardProps): JSX.Element {
  // Calculate pipeline values
  const totalPipelineValue = opportunities.reduce((sum, opp) => sum + opp.amount, 0);
  const weightedPipelineValue = opportunities.reduce(
    (sum, opp) => sum + opp.amount * (opp.probability / 100),
    0
  );

  // Render loading skeleton
  if (loading) {
    return (
      <div data-testid="customer-detail-skeleton" className="animate-pulse space-y-6 p-6">
        {/* Header skeleton */}
        <div className="space-y-3">
          <div className="h-8 bg-secondary-200 rounded w-1/3" />
          <div className="flex gap-2">
            <div className="h-6 bg-secondary-200 rounded w-24" />
            <div className="h-6 bg-secondary-200 rounded w-20" />
          </div>
          <div className="h-4 bg-secondary-100 rounded w-2/3" />
        </div>
        {/* Contacts skeleton */}
        <div className="space-y-2">
          <div className="h-6 bg-secondary-200 rounded w-1/4" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-secondary-100 rounded" />
            ))}
          </div>
        </div>
        {/* Opportunities skeleton */}
        <div className="space-y-2">
          <div className="h-6 bg-secondary-200 rounded w-1/4" />
          {[1, 2].map((i) => (
            <div key={i} className="h-16 bg-secondary-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div data-testid="error-state" className="text-center py-8">
        <div className="text-danger-500 mb-4">
          <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <p className="text-secondary-700 mb-4">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <article className="bg-white rounded-lg shadow-sm border border-secondary-200 p-6 space-y-6">
      {/* Customer Header */}
      <header className="space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-secondary-900">{customer.name}</h2>
            <div className="flex items-center gap-2">
              <span
                data-testid="industry-badge"
                className="px-2 py-1 bg-secondary-100 text-secondary-700 text-sm rounded"
              >
                {customer.industry}
              </span>
              <span
                data-testid="status-indicator"
                className={`px-2 py-1 text-sm rounded capitalize ${STATUS_STYLES[customer.status]}`}
              >
                {customer.status}
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onAction?.('call')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onAction?.('call');
                }
              }}
              disabled={!onAction}
              aria-label="Call"
              className="px-3 py-2 border border-secondary-300 rounded-lg text-secondary-700 hover:bg-secondary-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onAction?.('email')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onAction?.('email');
                }
              }}
              disabled={!onAction}
              aria-label="Email"
              className="px-3 py-2 border border-secondary-300 rounded-lg text-secondary-700 hover:bg-secondary-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onAction?.('schedule_meeting')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onAction?.('schedule_meeting');
                }
              }}
              disabled={!onAction}
              aria-label="Schedule Meeting"
              className="px-3 py-2 border border-secondary-300 rounded-lg text-secondary-700 hover:bg-secondary-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Customer Details */}
        <div className="text-sm text-secondary-600 space-y-1">
          {customer.website && (
            <div>
              <a
                href={customer.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-700 hover:underline"
              >
                {customer.website.replace(/^https?:\/\//, '')}
              </a>
            </div>
          )}
          {customer.address && <div>{customer.address}</div>}
          {customer.annualRevenue !== undefined && (
            <div className="font-medium text-secondary-700">
              Annual Revenue: {formatCurrency(customer.annualRevenue)}
            </div>
          )}
        </div>
      </header>

      {/* Contacts Section */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-secondary-800">Contacts</h3>
        {contacts.length === 0 ? (
          <p className="text-secondary-500 italic">No contacts available</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                data-testid={`contact-${contact.id}`}
                aria-label={`Contact: ${contact.name}${contact.isPrimary ? ' (Primary)' : ''}`}
                onClick={() => onContactClick?.(contact.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onContactClick?.(contact.id);
                  }
                }}
                tabIndex={onContactClick ? 0 : undefined}
                role={onContactClick ? 'button' : undefined}
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  contact.isPrimary
                    ? 'border-primary-500 bg-primary-50 hover:bg-primary-100'
                    : 'border-secondary-200 bg-white hover:bg-secondary-50'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-secondary-900">{contact.name}</span>
                    {contact.isPrimary && (
                      <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs rounded">
                        Primary
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-secondary-600">{contact.role}</div>
                  <div className="text-sm text-secondary-600">{contact.email}</div>
                  {contact.phone && (
                    <div className="text-sm text-secondary-600">{contact.phone}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Opportunities Pipeline Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-secondary-800">Opportunities Pipeline</h3>
          {opportunities.length > 0 && (
            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-secondary-500">Total: </span>
                <span data-testid="total-pipeline-value" className="font-semibold text-secondary-900">
                  {formatCurrency(totalPipelineValue)}
                </span>
              </div>
              <div>
                <span className="text-secondary-500">Weighted: </span>
                <span data-testid="weighted-pipeline-value" className="font-semibold text-secondary-900">
                  {formatCurrency(weightedPipelineValue)}
                </span>
              </div>
            </div>
          )}
        </div>

        {opportunities.length === 0 ? (
          <p className="text-secondary-500 italic">No opportunities available</p>
        ) : (
          <div className="space-y-2">
            {opportunities.map((opportunity) => (
              <div
                key={opportunity.id}
                data-testid={`opportunity-${opportunity.id}`}
                aria-label={`Opportunity: ${opportunity.name}`}
                onClick={() => onOpportunityClick?.(opportunity.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpportunityClick?.(opportunity.id);
                  }
                }}
                tabIndex={onOpportunityClick ? 0 : undefined}
                role={onOpportunityClick ? 'button' : undefined}
                className="p-4 bg-white border border-secondary-200 rounded-lg hover:bg-secondary-50 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-secondary-900">{opportunity.name}</span>
                      <span
                        data-testid={`stage-badge-${opportunity.id}`}
                        className={`px-2 py-0.5 text-xs rounded ${getStageStyle(opportunity.stage)}`}
                      >
                        {opportunity.stage}
                      </span>
                    </div>
                    <div className="text-sm text-secondary-600">
                      Close Date: {formatDate(opportunity.closeDate)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-secondary-900">
                      {formatCurrency(opportunity.amount)}
                    </div>
                    <div className="text-sm text-secondary-500">{opportunity.probability}%</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </article>
  );
}

export default CustomerDetailCard;

/**
 * Lead Conversion Wizard
 *
 * Multi-step wizard for converting qualified leads to opportunities.
 * Follows Salesforce-style lead conversion pattern.
 *
 * Steps:
 * 1. Verify Lead - Confirm lead details before conversion
 * 2. Create Opportunity - Set opportunity details (title, value, stage)
 * 3. Customer Selection - Create new or link to existing customer
 * 4. Review & Convert - Summary and confirmation
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import { Wizard, type WizardStep, type WizardStepProps, type ValidationResult } from '@tamshai/ui';
import type { Lead, Customer, APIResponse } from '../types';

interface LeadConversionWizardProps {
  lead: Lead;
  onClose: () => void;
  onComplete: (result: ConversionResult) => void;
}

interface ConversionResult {
  leadId: string;
  opportunityId: string;
  customerId: string;
}

interface ConversionData {
  // Step 1: Lead verification
  leadVerified: boolean;

  // Step 2: Opportunity details
  opportunityTitle: string;
  opportunityValue: number;
  opportunityStage: string;
  expectedCloseDate: string;
  probability: number;

  // Step 3: Customer selection
  customerAction: 'create' | 'link';
  newCustomerName: string;
  newCustomerIndustry: string;
  newCustomerWebsite: string;
  selectedCustomerId: string;

  // Step 4: Review
  conversionNotes: string;
}

// Default conversion data from lead
function getDefaultData(lead: Lead): ConversionData {
  return {
    leadVerified: false,
    opportunityTitle: `${lead.company_name} - New Business`,
    opportunityValue: 0,
    opportunityStage: 'LEAD',
    expectedCloseDate: '',
    probability: 10,
    customerAction: 'create',
    newCustomerName: lead.company_name,
    newCustomerIndustry: lead.industry || '',
    newCustomerWebsite: '',
    selectedCustomerId: '',
    conversionNotes: '',
  };
}

// Step 1: Verify Lead
function VerifyLeadStep({ data, updateData }: WizardStepProps & { lead: Lead }) {
  const lead = (data as unknown as { __lead: Lead }).__lead;

  const getScoreColor = (score: number): string => {
    if (score >= 70) return 'text-success-600';
    if (score >= 40) return 'text-warning-600';
    return 'text-danger-600';
  };

  const getScoreBarColor = (score: number): string => {
    if (score >= 70) return 'bg-success-500';
    if (score >= 40) return 'bg-warning-500';
    return 'bg-danger-500';
  };

  return (
    <div className="space-y-6" data-testid="verify-lead-step">
      {/* Lead Summary Card */}
      <div className="bg-secondary-50 rounded-lg p-4">
        <h3 className="font-semibold text-lg mb-4">Lead Information</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-secondary-500">Company</p>
            <p className="font-medium">{lead.company_name}</p>
          </div>
          <div>
            <p className="text-sm text-secondary-500">Industry</p>
            <p className="font-medium">{lead.industry || 'Not specified'}</p>
          </div>
          <div>
            <p className="text-sm text-secondary-500">Contact Name</p>
            <p className="font-medium">{lead.contact_name}</p>
          </div>
          <div>
            <p className="text-sm text-secondary-500">Contact Email</p>
            <p className="font-medium">{lead.contact_email}</p>
          </div>
          {lead.contact_phone && (
            <div>
              <p className="text-sm text-secondary-500">Phone</p>
              <p className="font-medium">{lead.contact_phone}</p>
            </div>
          )}
          <div>
            <p className="text-sm text-secondary-500">Source</p>
            <p className="font-medium">{lead.source}</p>
          </div>
        </div>
      </div>

      {/* Lead Score */}
      <div className="bg-secondary-50 rounded-lg p-4">
        <h3 className="font-semibold text-lg mb-4">Lead Score</h3>

        <div className="flex items-center gap-4 mb-4">
          <div className="w-24">
            <div className="h-3 bg-secondary-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${getScoreBarColor(lead.score.total)} transition-all`}
                style={{ width: `${lead.score.total}%` }}
              />
            </div>
          </div>
          <span className={`text-2xl font-bold ${getScoreColor(lead.score.total)}`}>
            {lead.score.total}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-secondary-600">Company Size</span>
            <span className="font-medium">{lead.score.factors.company_size}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary-600">Industry Fit</span>
            <span className="font-medium">{lead.score.factors.industry_fit}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary-600">Engagement</span>
            <span className="font-medium">{lead.score.factors.engagement}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary-600">Timing</span>
            <span className="font-medium">{lead.score.factors.timing}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {lead.notes && (
        <div className="bg-secondary-50 rounded-lg p-4">
          <h3 className="font-semibold text-lg mb-2">Notes</h3>
          <p className="text-secondary-700">{lead.notes}</p>
        </div>
      )}

      {/* Verification Checkbox */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="verified"
          checked={Boolean(data.leadVerified)}
          onChange={(e) => updateData({ leadVerified: e.target.checked })}
          className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
        />
        <label htmlFor="verified" className="text-secondary-700">
          I have verified the lead information is accurate and ready for conversion
        </label>
      </div>
    </div>
  );
}

// Step 2: Create Opportunity
function CreateOpportunityStep({ data, updateData, errors }: WizardStepProps) {
  const typedData = data as unknown as ConversionData;

  const stages = [
    { value: 'LEAD', label: 'Lead', probability: 10 },
    { value: 'QUALIFIED', label: 'Qualified', probability: 25 },
    { value: 'PROPOSAL', label: 'Proposal', probability: 50 },
    { value: 'NEGOTIATION', label: 'Negotiation', probability: 75 },
  ];

  const handleStageChange = (stage: string) => {
    const stageInfo = stages.find((s) => s.value === stage);
    updateData({
      opportunityStage: stage,
      probability: stageInfo?.probability || 10,
    });
  };

  return (
    <div className="space-y-4" data-testid="create-opportunity-step">
      <div>
        <label htmlFor="opportunityTitle" className="block text-sm font-medium text-secondary-700 mb-1">
          Opportunity Title *
        </label>
        <input
          type="text"
          id="opportunityTitle"
          data-testid="account-name"
          value={typedData.opportunityTitle || ''}
          onChange={(e) => updateData({ opportunityTitle: e.target.value })}
          className="input"
          placeholder="e.g., Acme Corp - Enterprise License"
        />
        {errors.find((e) => e.field === 'opportunityTitle') && (
          <p className="text-sm text-danger-600 mt-1">
            {errors.find((e) => e.field === 'opportunityTitle')?.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="opportunityValue" className="block text-sm font-medium text-secondary-700 mb-1">
            Opportunity Value ($)
          </label>
          <input
            type="number"
            id="opportunityValue"
            value={typedData.opportunityValue || ''}
            onChange={(e) => updateData({ opportunityValue: Number(e.target.value) })}
            className="input"
            placeholder="50000"
            min="0"
          />
        </div>

        <div>
          <label htmlFor="stage" className="block text-sm font-medium text-secondary-700 mb-1">
            Stage
          </label>
          <select
            id="stage"
            value={typedData.opportunityStage || 'LEAD'}
            onChange={(e) => handleStageChange(e.target.value)}
            className="input"
          >
            {stages.map((stage) => (
              <option key={stage.value} value={stage.value}>
                {stage.label} ({stage.probability}%)
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="expectedCloseDate" className="block text-sm font-medium text-secondary-700 mb-1">
            Expected Close Date
          </label>
          <input
            type="date"
            id="expectedCloseDate"
            value={typedData.expectedCloseDate || ''}
            onChange={(e) => updateData({ expectedCloseDate: e.target.value })}
            className="input"
          />
        </div>

        <div>
          <label htmlFor="probability" className="block text-sm font-medium text-secondary-700 mb-1">
            Probability (%)
          </label>
          <input
            type="number"
            id="probability"
            value={typedData.probability || 10}
            onChange={(e) => updateData({ probability: Number(e.target.value) })}
            className="input"
            min="0"
            max="100"
          />
        </div>
      </div>
    </div>
  );
}

// Step 3: Customer Selection
function CustomerSelectionStep({ data, updateData }: WizardStepProps) {
  const typedData = data as unknown as ConversionData;
  const { getAccessToken } = useAuth();

  // Fetch existing customers
  const { data: customersResponse, isLoading } = useQuery({
    queryKey: ['customers-for-conversion'],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/sales/list_customers`
        : '/api/mcp/sales/list_customers';

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch customers');
      return response.json() as Promise<APIResponse<Customer[]>>;
    },
  });

  const customers = customersResponse?.data || [];

  return (
    <div className="space-y-6" data-testid="customer-selection-step">
      {/* Customer Action Selection */}
      <div className="space-y-4">
        <div
          className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
            typedData.customerAction === 'create'
              ? 'border-primary-500 bg-primary-50'
              : 'border-secondary-200 hover:border-secondary-300'
          }`}
          onClick={() => updateData({ customerAction: 'create' })}
        >
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="customerAction"
              value="create"
              checked={typedData.customerAction === 'create'}
              onChange={() => updateData({ customerAction: 'create' })}
              aria-label="Create new customer"
              className="w-4 h-4 text-primary-600"
            />
            <div>
              <p className="font-medium">Create new customer</p>
              <p className="text-sm text-secondary-600">Create a new customer record from this lead</p>
            </div>
          </label>
        </div>

        <div
          className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
            typedData.customerAction === 'link'
              ? 'border-primary-500 bg-primary-50'
              : 'border-secondary-200 hover:border-secondary-300'
          }`}
          onClick={() => updateData({ customerAction: 'link' })}
        >
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="customerAction"
              value="link"
              checked={typedData.customerAction === 'link'}
              onChange={() => updateData({ customerAction: 'link' })}
              aria-label="Link to existing customer"
              className="w-4 h-4 text-primary-600"
            />
            <div>
              <p className="font-medium">Link to existing customer</p>
              <p className="text-sm text-secondary-600">Associate this lead with an existing customer</p>
            </div>
          </label>
        </div>
      </div>

      {/* Create New Customer Form */}
      {typedData.customerAction === 'create' && (
        <div className="bg-secondary-50 rounded-lg p-4 space-y-4">
          <h4 className="font-medium">New Customer Details</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="newCustomerName" className="block text-sm font-medium text-secondary-700 mb-1">
                Company Name
              </label>
              <input
                type="text"
                id="newCustomerName"
                value={typedData.newCustomerName || ''}
                onChange={(e) => updateData({ newCustomerName: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="newCustomerIndustry" className="block text-sm font-medium text-secondary-700 mb-1">
                Industry
              </label>
              <input
                type="text"
                id="newCustomerIndustry"
                value={typedData.newCustomerIndustry || ''}
                onChange={(e) => updateData({ newCustomerIndustry: e.target.value })}
                className="input"
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="newCustomerWebsite" className="block text-sm font-medium text-secondary-700 mb-1">
                Website
              </label>
              <input
                type="text"
                id="newCustomerWebsite"
                value={typedData.newCustomerWebsite || ''}
                onChange={(e) => updateData({ newCustomerWebsite: e.target.value })}
                className="input"
                placeholder="https://..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Select Existing Customer */}
      {typedData.customerAction === 'link' && (
        <div className="bg-secondary-50 rounded-lg p-4">
          <h4 className="font-medium mb-4">Select Existing Customer</h4>
          {isLoading ? (
            <div className="text-center py-4">
              <div className="spinner w-6 h-6 mx-auto"></div>
              <p className="text-secondary-600 mt-2">Loading customers...</p>
            </div>
          ) : customers.length === 0 ? (
            <p className="text-secondary-600">No existing customers found.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {customers.map((customer) => (
                <div
                  key={customer._id}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    typedData.selectedCustomerId === customer._id
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-secondary-200 hover:border-secondary-300'
                  }`}
                  onClick={() => updateData({ selectedCustomerId: customer._id })}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{customer.company_name}</p>
                      <p className="text-sm text-secondary-600">{customer.industry}</p>
                    </div>
                    {customer.primary_contact && (
                      <p className="text-sm text-secondary-500">{customer.primary_contact.email}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Step 4: Review & Convert
function ReviewStep({ data }: WizardStepProps & { lead: Lead }) {
  const typedData = data as unknown as ConversionData;
  const lead = (data as unknown as { __lead: Lead }).__lead;

  return (
    <div className="space-y-6" data-testid="review-step">
      <div className="bg-success-50 border border-success-200 rounded-lg p-4">
        <h3 className="font-semibold text-success-800 mb-2">Ready to Convert</h3>
        <p className="text-success-700 text-sm">
          Review the conversion details below. Clicking "Convert" will create the opportunity
          and customer records, and mark the lead as converted.
        </p>
      </div>

      {/* Lead Summary */}
      <div className="bg-secondary-50 rounded-lg p-4">
        <h4 className="font-medium mb-3">Lead</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-secondary-600">Company:</span>
            <span className="ml-2 font-medium">{lead.company_name}</span>
          </div>
          <div>
            <span className="text-secondary-600">Contact:</span>
            <span className="ml-2 font-medium">{lead.contact_name}</span>
          </div>
        </div>
      </div>

      {/* Opportunity Summary */}
      <div className="bg-secondary-50 rounded-lg p-4">
        <h4 className="font-medium mb-3">Opportunity</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-secondary-600">Title:</span>
            <span className="ml-2 font-medium">{typedData.opportunityTitle}</span>
          </div>
          <div>
            <span className="text-secondary-600">Value:</span>
            <span className="ml-2 font-medium">
              ${(typedData.opportunityValue || 0).toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-secondary-600">Stage:</span>
            <span className="ml-2 font-medium">{typedData.opportunityStage}</span>
          </div>
          <div>
            <span className="text-secondary-600">Probability:</span>
            <span className="ml-2 font-medium">{typedData.probability}%</span>
          </div>
        </div>
      </div>

      {/* Customer Summary */}
      <div className="bg-secondary-50 rounded-lg p-4">
        <h4 className="font-medium mb-3">Customer</h4>
        {typedData.customerAction === 'create' ? (
          <div className="text-sm">
            <p className="text-secondary-600 mb-1">Creating new customer:</p>
            <p className="font-medium">{typedData.newCustomerName}</p>
            {typedData.newCustomerIndustry && (
              <p className="text-secondary-600">{typedData.newCustomerIndustry}</p>
            )}
          </div>
        ) : (
          <div className="text-sm">
            <p className="text-secondary-600 mb-1">Linking to existing customer:</p>
            <p className="font-medium">Customer ID: {typedData.selectedCustomerId}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LeadConversionWizard({
  lead,
  onClose,
  onComplete,
}: LeadConversionWizardProps) {
  const { getAccessToken } = useAuth();
  const [conversionError, setConversionError] = useState<string | null>(null);

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

  // Define wizard steps
  const steps: WizardStep[] = useMemo(
    () => [
      {
        id: 'verify',
        title: 'Lead Selection',
        description: 'Review and confirm lead information',
        component: (props: WizardStepProps) => (
          <VerifyLeadStep {...props} lead={lead} />
        ),
      },
      {
        id: 'opportunity',
        title: 'Account Creation',
        description: 'Set up the new opportunity',
        component: CreateOpportunityStep,
        validate: (data: Record<string, unknown>): ValidationResult => {
          const errors = [];
          if (!data.opportunityTitle) {
            errors.push({ field: 'opportunityTitle', message: 'Opportunity title is required' });
          }
          return { valid: errors.length === 0, errors };
        },
      },
      {
        id: 'customer',
        title: 'Contact Creation',
        description: 'Create or select customer',
        component: CustomerSelectionStep,
        validate: (data: Record<string, unknown>): ValidationResult => {
          const typedData = data as unknown as ConversionData;
          const errors = [];
          if (typedData.customerAction === 'link' && !typedData.selectedCustomerId) {
            errors.push({ field: 'selectedCustomerId', message: 'Please select an existing customer' });
          }
          return { valid: errors.length === 0, errors };
        },
      },
      {
        id: 'review',
        title: 'Review',
        description: 'Review and convert',
        component: (props: WizardStepProps) => <ReviewStep {...props} lead={lead} />,
      },
    ],
    [lead]
  );

  // Handle conversion
  const handleComplete = useCallback(
    async (data: Record<string, unknown>) => {
      const typedData = data as unknown as ConversionData;
      setConversionError(null);

      try {
        const token = getAccessToken();
        if (!token) throw new Error('Not authenticated');

        const url = apiConfig.mcpGatewayUrl
          ? `${apiConfig.mcpGatewayUrl}/api/mcp/sales/convert_lead`
          : '/api/mcp/sales/convert_lead';

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            leadId: lead._id,
            opportunity: {
              title: typedData.opportunityTitle,
              value: typedData.opportunityValue,
              stage: typedData.opportunityStage,
              expectedCloseDate: typedData.expectedCloseDate || null,
              probability: typedData.probability,
            },
            customer:
              typedData.customerAction === 'create'
                ? {
                    action: 'create',
                    companyName: typedData.newCustomerName,
                    industry: typedData.newCustomerIndustry,
                    website: typedData.newCustomerWebsite || null,
                    contact: {
                      name: lead.contact_name,
                      email: lead.contact_email,
                      phone: lead.contact_phone || null,
                    },
                  }
                : {
                    action: 'link',
                    customerId: typedData.selectedCustomerId,
                  },
          }),
        });

        const result = (await response.json()) as APIResponse<ConversionResult>;

        if (result.status === 'error') {
          setConversionError(result.message || 'Failed to convert lead');
          return; // Don't re-throw since we're displaying the error in UI
        }

        if (result.status === 'success' && result.data) {
          onComplete(result.data);
        }
      } catch (error) {
        if (error instanceof Error) {
          setConversionError(error.message);
        } else {
          setConversionError('An unexpected error occurred');
        }
        // Don't re-throw since we're displaying the error in UI
      }
    },
    [lead, getAccessToken, onComplete]
  );

  // Inject lead into data for step components
  const initialData = useMemo(() => {
    const defaultData = getDefaultData(lead);
    return { ...defaultData, __lead: lead };
  }, [lead]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {conversionError && (
          <div className="mb-4 p-3 bg-danger-50 border border-danger-200 rounded-lg">
            <p className="text-danger-700">{conversionError}</p>
          </div>
        )}
        <Wizard
          steps={steps}
          initialStep={0}
          initialData={initialData}
          onComplete={handleComplete}
          onCancel={onClose}
          title="Convert Lead"
          showBreadcrumbs={true}
          submitLabel="Convert"
          submittingLabel="Converting..."
        />
      </div>
    </div>
  );
}

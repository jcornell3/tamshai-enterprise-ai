import { useCallback } from 'react';
import { SSEQueryClient, ComponentRenderer, useAIQuery } from '@tamshai/ui';
import { apiConfig } from '@tamshai/auth';

/**
 * Universal AI Query Page with Generative UI Support
 *
 * Supports ALL domains and directives (hr, finance, sales, support, payroll, tax, approvals)
 *
 * Uses domain='\\w+' so the hook's regex becomes display:\w+:(\w+):([^\s]*)
 * which matches ANY domain directive.
 */

const exampleQueries = [
  // HR queries
  'Show me my org chart',
  'List employees in Engineering',
  // Finance queries
  'Show Q1 budget summary',
  'Display quarterly report for Q4 2025',
  // Sales queries
  'Show hot leads',
  'List customer details',
  // Support queries
  'Show critical tickets',
  'Search knowledge base for VPN',
  // Payroll queries
  'Show my last pay stub',
  'List pay runs this month',
  // Tax queries
  'Show quarterly estimate for Q1',
  'List pending tax filings',
  // Approvals (cross-domain)
  'Show pending approvals',
  'List items awaiting my approval',
];

export default function AIQueryPage() {
  // Use \w+ as domain to match ANY domain in directives
  const ai = useAIQuery({ domain: '\\w+' });

  /**
   * Portal-specific component action handler with approval logic.
   * Handles approve, reject, and drilldown actions across all domains.
   */
  const handleComponentAction = useCallback(async (action: any) => {
    console.log('Component action:', action);

    try {
      const token = ai.getAccessToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Handle approve action
      if (action.type === 'approve' && action.params) {
        const { approvalType, id } = action.params;
        console.log(`Approving ${approvalType}:`, id);

        let mcpEndpoint: string;
        let requestBody: any;

        if (approvalType === 'budget') {
          mcpEndpoint = `${apiConfig.mcpGatewayUrl}/api/mcp/finance/approve_budget`;
          requestBody = { budgetId: id };
        } else if (approvalType === 'expense') {
          mcpEndpoint = `${apiConfig.mcpGatewayUrl}/api/mcp/finance/approve_expense_report`;
          requestBody = { reportId: id };
        } else if (approvalType === 'time-off') {
          mcpEndpoint = `${apiConfig.mcpGatewayUrl}/api/mcp/hr/approve_time_off_request`;
          requestBody = { requestId: id, approved: true };
        } else {
          console.error('Unknown approval type:', approvalType);
          return;
        }

        const response = await fetch(mcpEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: response.statusText }));
          throw new Error(`Failed to approve: ${errorData.message || response.statusText}`);
        }

        const result = await response.json();
        console.log('Approve result:', result);

        // Auto-confirm pending_confirmation (user already clicked Approve in UI)
        if (result.status === 'pending_confirmation' && result.confirmationId) {
          console.log('Auto-confirming (user already approved via UI button)');

          const confirmResponse = await fetch(`${apiConfig.mcpGatewayUrl}/api/confirm/${result.confirmationId}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ approved: true }),
          });

          if (!confirmResponse.ok) {
            const errorData = await confirmResponse.json().catch(() => ({ message: confirmResponse.statusText }));
            throw new Error(`Failed to confirm approval: ${errorData.message || confirmResponse.statusText}`);
          }

          const confirmResult = await confirmResponse.json();
          console.log('Confirmation result:', confirmResult);
        }

        alert(`Successfully approved ${approvalType}!`);
      }

      // Handle reject action
      if (action.type === 'reject' && action.params) {
        const { approvalType, id, reason } = action.params;
        console.log(`Rejecting ${approvalType}:`, id, 'Reason:', reason);

        let mcpEndpoint: string;
        let requestBody: any;

        if (approvalType === 'budget') {
          mcpEndpoint = `${apiConfig.mcpGatewayUrl}/api/mcp/finance/reject_budget`;
          requestBody = { budgetId: id, rejectionReason: reason || 'No reason provided' };
        } else if (approvalType === 'expense') {
          mcpEndpoint = `${apiConfig.mcpGatewayUrl}/api/mcp/finance/reject_expense_report`;
          requestBody = { reportId: id, rejectionReason: reason || 'No reason provided' };
        } else if (approvalType === 'time-off') {
          mcpEndpoint = `${apiConfig.mcpGatewayUrl}/api/mcp/hr/approve_time_off_request`;
          requestBody = { requestId: id, approved: false, approverNotes: reason || 'No reason provided' };
        } else {
          console.error('Unknown approval type:', approvalType);
          return;
        }

        const response = await fetch(mcpEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: response.statusText }));
          throw new Error(`Failed to reject: ${errorData.message || response.statusText}`);
        }

        const result = await response.json();
        console.log('Reject result:', result);

        // Auto-confirm pending_confirmation (user already clicked Reject in UI)
        if (result.status === 'pending_confirmation' && result.confirmationId) {
          console.log('Auto-confirming reject (user already rejected via UI button)');

          const confirmResponse = await fetch(`${apiConfig.mcpGatewayUrl}/api/confirm/${result.confirmationId}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ approved: true }),
          });

          if (!confirmResponse.ok) {
            const errorData = await confirmResponse.json().catch(() => ({ message: confirmResponse.statusText }));
            throw new Error(`Failed to confirm rejection: ${errorData.message || confirmResponse.statusText}`);
          }

          const confirmResult = await confirmResponse.json();
          console.log('Confirmation result:', confirmResult);
        }

        alert(`Successfully rejected ${approvalType}!`);
      }

      // Handle drilldown action (view details)
      if (action.type === 'drilldown' && action.params) {
        const { approvalType, id } = action.params;
        console.log(`View details for ${approvalType}:`, id);
        // TODO: Navigate to detail page or open modal
      }
    } catch (error) {
      console.error('Action handler error:', error);
      alert(error instanceof Error ? error.message : 'Failed to execute action');
    }
  }, [ai.getAccessToken]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="page-title">AI Assistant</h2>
            <p className="page-subtitle">
              Ask questions across all domains: HR, Finance, Sales, Support, Payroll, Tax, and Approvals
            </p>
          </div>
          {/* Voice Output Toggle */}
          <div className="flex items-center gap-2">
            <label htmlFor="voice-toggle" className="text-sm font-medium text-secondary-700">
              Voice Output
            </label>
            <button
              id="voice-toggle"
              type="button"
              onClick={() => {
                const newVoiceEnabled = !ai.voiceEnabled;
                ai.setVoiceEnabled(newVoiceEnabled);
                if (!newVoiceEnabled) ai.stopSpeaking();
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                ai.voiceEnabled ? 'bg-primary-600' : 'bg-secondary-300'
              }`}
              data-testid="voice-toggle"
              aria-label="Toggle voice output"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  ai.voiceEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            {ai.isSpeaking && (
              <svg className="w-5 h-5 text-primary-600 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="alert-info mb-6">
        <h4 className="font-semibold mb-1">Universal AI Assistant - Architecture v1.5</h4>
        <p className="text-sm mb-2">
          This assistant supports queries across ALL domains with Server-Sent Events (SSE) streaming.
          Ask about HR, Finance, Sales, Support, Payroll, Tax, or Approvals data.
        </p>
        <p className="text-sm">
          <strong>Features:</strong> Voice input (microphone) and output (toggle above), real-time streaming,
          cross-domain generative UI components.
        </p>
      </div>

      {/* Query Input */}
      <div className="card mb-6">
        <form onSubmit={ai.handleSubmit}>
          <label className="block text-sm font-medium text-secondary-700 mb-2">
            Ask anything across all domains
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={ai.query}
              onChange={(e) => ai.setQuery(e.target.value)}
              placeholder="e.g., Show pending approvals or Show my org chart"
              className="input flex-1"
            />
            {/* Voice Input Button */}
            <button
              type="button"
              onClick={ai.isListening ? ai.stopListening : ai.startListening}
              className={`btn-secondary ${ai.isListening ? 'bg-red-100 border-red-300 text-red-700' : ''}`}
              title={ai.isListening ? 'Stop listening' : 'Start voice input'}
              data-testid="voice-input"
            >
              <svg
                className={`w-5 h-5 ${ai.isListening ? 'animate-pulse' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </button>
            <button
              type="submit"
              disabled={!ai.query.trim()}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                className="w-5 h-5 inline mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Query
            </button>
          </div>

          {/* Voice Status */}
          {ai.isListening && (
            <div className="mt-2 text-sm text-primary-600 flex items-center gap-2" data-testid="listening-indicator">
              <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              Listening... Speak your query
            </div>
          )}
          {ai.voiceInputError && (
            <div className="mt-2 text-sm text-red-600">
              Voice input error: {ai.voiceInputError}
            </div>
          )}
        </form>

        {/* Example Queries */}
        <div className="mt-4">
          <p className="text-sm font-medium text-secondary-700 mb-2">
            Example queries across all domains:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {exampleQueries.map((example) => (
              <button
                key={example}
                onClick={() => ai.handleExampleClick(example)}
                className="text-xs px-3 py-2 bg-secondary-100 hover:bg-secondary-200 text-secondary-700 rounded-lg transition-colors text-left"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SSE Query Client */}
      {ai.activeQuery && (
        <div className="mb-6">
          <SSEQueryClient
            query={ai.activeQuery}
            autoStart={true}
            onComplete={ai.handleQueryComplete}
            onError={(error) => {
              console.error('Query error:', error);
              ai.setComponentResponse(null);
            }}
          />
        </div>
      )}

      {/* Component Renderer - Display generative UI components */}
      {ai.componentResponse && (
        <div className="mb-6" data-testid="generative-ui-container">
          <div className="card bg-primary-50 border-primary-200">
            <div className="flex items-center gap-2 mb-4">
              <svg
                className="w-5 h-5 text-primary-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <h3 className="text-lg font-semibold text-primary-900">
                Generative UI Component
              </h3>
            </div>
            <ComponentRenderer
              component={ai.componentResponse}
              onAction={handleComponentAction}
              voiceEnabled={ai.voiceEnabled}
            />
          </div>
        </div>
      )}

      {/* Directive Error */}
      {ai.directiveError && (
        <div className="mb-6" data-testid="directive-error">
          <div className="alert-danger">
            <p className="font-medium">Failed to render component</p>
            <p className="text-sm mt-1">{ai.directiveError}</p>
          </div>
        </div>
      )}

      {/* Help Section */}
      <div className="card bg-secondary-50">
        <h3 className="text-lg font-semibold text-secondary-900 mb-3">
          Cross-Domain Query Tips
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-semibold text-sm text-secondary-800 mb-2">HR Domain</h4>
            <ul className="space-y-1 text-sm text-secondary-700">
              <li>Org charts, employee data</li>
              <li>Department information</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-secondary-800 mb-2">Finance Domain</h4>
            <ul className="space-y-1 text-sm text-secondary-700">
              <li>Budget summaries</li>
              <li>Quarterly reports</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-secondary-800 mb-2">Sales Domain</h4>
            <ul className="space-y-1 text-sm text-secondary-700">
              <li>Customer details</li>
              <li>Lead pipeline (hot/warm/cold)</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-secondary-800 mb-2">Support Domain</h4>
            <ul className="space-y-1 text-sm text-secondary-700">
              <li>Ticket status (open/critical)</li>
              <li>Knowledge base articles</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-secondary-800 mb-2">Payroll Domain</h4>
            <ul className="space-y-1 text-sm text-secondary-700">
              <li>Pay stubs and pay runs</li>
              <li>Tax withholdings, 1099s</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-secondary-800 mb-2">Tax Domain</h4>
            <ul className="space-y-1 text-sm text-secondary-700">
              <li>Quarterly estimates</li>
              <li>Tax filings and deadlines</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-secondary-800 mb-2">Approvals (Cross-Domain)</h4>
            <ul className="space-y-1 text-sm text-secondary-700">
              <li>Pending time-off requests</li>
              <li>Expense and budget approvals</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-secondary-800 mb-2">Access Control</h4>
            <ul className="space-y-1 text-sm text-secondary-700">
              <li>Results respect your roles</li>
              <li>50-record limit with warnings</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

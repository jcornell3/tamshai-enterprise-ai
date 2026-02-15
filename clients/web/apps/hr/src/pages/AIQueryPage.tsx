import { SSEQueryClient, ComponentRenderer, useAIQuery } from '@tamshai/ui';

const exampleQueries = [
  'List all employees in Engineering department',
  'Who are the managers in the company?',
  'Show employees hired in the last 6 months',
  'What is the average salary by department?',
  'List all employees reporting to Alice Chen',
];

export default function AIQueryPage() {
  const ai = useAIQuery({ domain: 'hr' });

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="page-title">AI-Powered HR Query</h2>
            <p className="page-subtitle">
              Ask natural language questions about employee data with SSE streaming
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
        <h4 className="font-semibold mb-1">Architecture v1.5: Generative UI + Voice</h4>
        <p className="text-sm mb-2">
          This page uses Server-Sent Events (SSE) to stream AI responses in
          real-time, preventing timeouts during Claude's 30-60 second reasoning
          process.
        </p>
        <p className="text-sm">
          <strong>New:</strong> Voice input (microphone button) and voice output (toggle in header).
          Try: "Show me my org chart" for interactive visualizations.
        </p>
      </div>

      {/* Query Input */}
      <div className="card mb-6">
        <form onSubmit={ai.handleSubmit}>
          <label className="block text-sm font-medium text-secondary-700 mb-2">
            Enter your query
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={ai.query}
              onChange={(e) => ai.setQuery(e.target.value)}
              placeholder="e.g., List all employees in Engineering department"
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
              <svg className="w-5 h-5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
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
          <p className="text-sm font-medium text-secondary-700 mb-2">Example queries:</p>
          <div className="flex flex-wrap gap-2">
            {exampleQueries.map((example) => (
              <button
                key={example}
                onClick={() => ai.handleExampleClick(example)}
                className="text-xs px-3 py-1 bg-secondary-100 hover:bg-secondary-200 text-secondary-700 rounded-full transition-colors"
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
              <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <h3 className="text-lg font-semibold text-primary-900">Generative UI Component</h3>
            </div>
            <ComponentRenderer
              component={ai.componentResponse}
              onAction={ai.handleComponentAction}
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
        <h3 className="text-lg font-semibold text-secondary-900 mb-3">Query Tips</h3>
        <ul className="space-y-2 text-sm text-secondary-700">
          {[
            { bold: 'Be specific:', text: 'Include department, job title, or date ranges for better results' },
            { bold: 'Role-based access:', text: 'Results respect your access level and permissions' },
            { bold: '50-record limit:', text: "If results exceed 50 records, you'll see a truncation warning" },
            { bold: 'Streaming:', text: 'Watch responses appear in real-time as Claude processes your query' },
          ].map((tip) => (
            <li key={tip.bold} className="flex items-start gap-2">
              <svg className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span><strong>{tip.bold}</strong> {tip.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

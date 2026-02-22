import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth, apiConfig } from '@tamshai/auth';
import { useVoiceInput } from './useVoiceInput';
import { useVoiceOutput } from './useVoiceOutput';
import type { ComponentResponse } from '../components/generative/types';

export interface UseAIQueryOptions {
  /** Domain prefix for directive detection (e.g., 'hr', 'finance', 'sales') */
  domain: string;
}

export interface UseAIQueryReturn {
  // Query state
  query: string;
  setQuery: (query: string) => void;
  activeQuery: string;
  handleSubmit: (e: React.FormEvent) => void;
  handleExampleClick: (example: string) => void;

  // Component rendering state
  componentResponse: ComponentResponse | null;
  setComponentResponse: (response: ComponentResponse | null) => void;
  directiveError: string | null;
  handleQueryComplete: (response: string) => Promise<void>;
  handleComponentAction: (action: unknown) => void;

  // Voice state
  voiceEnabled: boolean;
  setVoiceEnabled: (enabled: boolean) => void;
  isListening: boolean;
  transcript: string;
  voiceInputError: string | null;
  startListening: () => void;
  stopListening: () => void;
  isSpeaking: boolean;
  speak: (text: string) => void;
  stopSpeaking: () => void;

  // Auth
  getAccessToken: () => string | null;
}

/**
 * Shared AI Query hook for all MCP domain apps.
 *
 * Extracts the common logic from AIQueryPage implementations:
 * - Directive detection (display:{domain}:{component}:{params})
 * - MCP UI component fetching
 * - Voice input/output integration
 * - Query state management
 *
 * Usage:
 * ```tsx
 * const ai = useAIQuery({ domain: 'hr' });
 * // ai.query, ai.handleSubmit, ai.handleQueryComplete, etc.
 * ```
 */
export function useAIQuery({ domain }: UseAIQueryOptions): UseAIQueryReturn {
  const { getAccessToken } = useAuth();
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [componentResponse, setComponentResponse] = useState<ComponentResponse | null>(null);
  const [directiveError, setDirectiveError] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  // Track previous listening state for auto-submit detection
  const wasListeningRef = useRef(false);

  // Voice input hook — always enabled (independent of voice output toggle)
  const { isListening, transcript, error: voiceInputError, startListening, stopListening } = useVoiceInput({
    language: 'en-US',
    interimResults: false,
    enabled: true, // Voice INPUT is always available, separate from voice OUTPUT
    onResult: (recognizedText: string) => {
      setQuery(recognizedText);
    },
  });

  // Voice output hook — lazy: only initializes speechSynthesis when voice is enabled
  const { speak, stop: stopSpeaking, isSpeaking } = useVoiceOutput({
    language: 'en-US',
    rate: 1.0,
    pitch: 1.0,
    enabled: voiceEnabled,
  });

  // Update query input when transcript changes
  useEffect(() => {
    if (transcript) {
      setQuery(transcript);
    }
  }, [transcript]);

  // Auto-submit when voice recognition ends with a valid query
  // Detects transition from isListening=true to isListening=false
  useEffect(() => {
    // If we were listening and now we're not, auto-submit if there's a query
    if (wasListeningRef.current && !isListening && query.trim()) {
      // Use setTimeout to ensure the query state has fully updated
      setTimeout(() => {
        setActiveQuery(query);
        setComponentResponse(null);
        setDirectiveError(null);
      }, 100);
    }
    // Update ref for next render
    wasListeningRef.current = isListening;
  }, [isListening, query]);

  /**
   * Detect display directives in AI response
   * Format: display:{domain}:{component}:{params}
   */
  const detectDirective = useCallback((text: string): string | null => {
    const directiveRegex = new RegExp(`display:${domain}:(\\w+):([^\\s]*)`);
    const match = text.match(directiveRegex);
    return match ? match[0] : null;
  }, [domain]);

  /**
   * Call MCP UI Service to render directive
   */
  const fetchComponentResponse = useCallback(async (directive: string): Promise<void> => {
    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      let mcpUiUrl: string;
      if (apiConfig.mcpUiUrl) {
        mcpUiUrl = `${apiConfig.mcpUiUrl}/api/display`;
      } else {
        mcpUiUrl = '/mcp-ui/api/display';
      }

      const response = await fetch(mcpUiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ directive }),
      });

      if (!response.ok) {
        throw new Error(`MCP UI Service error: ${response.status}`);
      }

      const result = await response.json();

      if (!result || !result.component) {
        throw new Error('Invalid response from MCP UI: missing component data');
      }

      const componentData: ComponentResponse = {
        type: result.component.type,
        props: result.component.props || {},
        actions: result.component.actions || [],
        narration: result.narration,
      };

      setComponentResponse(componentData);
      setDirectiveError(null);
    } catch (error) {
      console.error('Failed to fetch component response:', error);
      setDirectiveError(error instanceof Error ? error.message : 'Unknown error');
      setComponentResponse(null);
    }
  }, [getAccessToken]);

  /**
   * Handle SSE/stream response completion.
   * Detects directives and fetches component if found.
   */
  const handleQueryComplete = useCallback(async (response: string) => {
    setComponentResponse(null);
    setDirectiveError(null);

    const directive = detectDirective(response);
    if (directive) {
      await fetchComponentResponse(directive);
    }
  }, [detectDirective, fetchComponentResponse]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setActiveQuery(query);
      setComponentResponse(null);
      setDirectiveError(null);
    }
  }, [query]);

  const handleExampleClick = useCallback((example: string) => {
    setQuery(example);
    setActiveQuery(example);
    setComponentResponse(null);
    setDirectiveError(null);
  }, []);

  /**
   * Handle component actions (approve/reject/drilldown)
   * Routes to appropriate MCP gateway endpoints
   */
  const handleComponentAction = useCallback(async (action: unknown) => {
    console.log('Component action:', action);

    // Type guard for action object
    if (!action || typeof action !== 'object') return;
    const typedAction = action as { type: string; params?: Record<string, unknown> };
    if (!typedAction.type || !typedAction.params) return;

    const { type, params } = typedAction;
    const { approvalType, id, reason } = params as { approvalType?: string; id?: string; reason?: string };

    if (!approvalType || !id) return;

    const token = getAccessToken();
    if (!token) {
      console.error('Not authenticated for action');
      return;
    }

    // Map approval type to API endpoint and request body
    let endpoint: string;
    let body: Record<string, unknown>;

    switch (approvalType) {
      case 'time-off':
        endpoint = `${apiConfig.mcpGatewayUrl}/api/mcp/hr/tools/approve_time_off_request`;
        body = { requestId: id, approved: type === 'approve' };
        break;
      case 'expense':
        endpoint = `${apiConfig.mcpGatewayUrl}/api/mcp/finance/tools/approve_expense_report`;
        body = { reportId: id, approved: type === 'approve' };
        break;
      case 'budget':
        endpoint = `${apiConfig.mcpGatewayUrl}/api/mcp/finance/tools/approve_budget`;
        body = { budgetId: id, approved: type === 'approve' };
        break;
      default:
        console.warn('Unknown approval type:', approvalType);
        return;
    }

    // Add rejection reason if provided
    if (type === 'reject' && reason) {
      body.rejectionReason = reason;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Approval action failed:', errorData);
        alert(`Action failed: ${errorData.message || response.statusText}`);
        return;
      }

      const result = await response.json();
      console.log('Approval action result:', result);

      // Show success message
      alert(result.message || `${type === 'approve' ? 'Approved' : 'Rejected'} successfully`);

      // Could trigger a refresh of the approvals queue here if needed
    } catch (error) {
      console.error('Error performing approval action:', error);
      alert('Failed to perform action. Please try again.');
    }
  }, [getAccessToken]);

  return {
    query,
    setQuery,
    activeQuery,
    handleSubmit,
    handleExampleClick,
    componentResponse,
    setComponentResponse,
    directiveError,
    handleQueryComplete,
    handleComponentAction,
    voiceEnabled,
    setVoiceEnabled,
    isListening,
    transcript,
    voiceInputError,
    startListening,
    stopListening,
    isSpeaking,
    speak,
    stopSpeaking,
    getAccessToken,
  };
}

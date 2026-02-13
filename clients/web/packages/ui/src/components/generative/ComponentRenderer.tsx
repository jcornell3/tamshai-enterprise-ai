/**
 * ComponentRenderer - Dynamic Component Switcher
 *
 * Renders the appropriate component based on the ComponentResponse type.
 * Supports:
 * - Mapping component types to React components
 * - Rendering UnknownComponentFallback for unknown types
 * - Passing props and onAction to child components
 * - Voice output via speech synthesis when voiceEnabled
 * - Accessibility wrapper with aria-live and aria-label
 */

import React, { useEffect, useRef, useMemo } from 'react';
import type {
  ComponentRendererProps,
  ComponentResponse,
  ComponentAction,
  KnownComponentType,
} from './types';

// Import child components
import { OrgChartComponent } from './OrgChartComponent';
import { ApprovalsQueue } from './ApprovalsQueue';
import { CustomerDetailCard } from './CustomerDetailCard';
import { LeadsDataTable } from './LeadsDataTable';
import { ForecastChart } from './ForecastChart';
import { BudgetSummaryCard } from './BudgetSummaryCard';
import { QuarterlyReportDashboard } from './QuarterlyReportDashboard';
import { UnknownComponentFallback } from './UnknownComponentFallback';

/**
 * Props for child components that support actions
 */
interface ChildComponentProps {
  onAction?: (action: ComponentAction) => void;
  [key: string]: unknown;
}

/**
 * Component type to React component mapping
 */
const COMPONENT_MAP: Record<
  KnownComponentType,
  React.ComponentType<ChildComponentProps>
> = {
  OrgChartComponent: OrgChartComponent as React.ComponentType<ChildComponentProps>,
  ApprovalsQueue: ApprovalsQueue as React.ComponentType<ChildComponentProps>,
  CustomerDetailCard: CustomerDetailCard as React.ComponentType<ChildComponentProps>,
  LeadsDataTable: LeadsDataTable as React.ComponentType<ChildComponentProps>,
  ForecastChart: ForecastChart as React.ComponentType<ChildComponentProps>,
  BudgetSummaryCard: BudgetSummaryCard as React.ComponentType<ChildComponentProps>,
  QuarterlyReportDashboard: QuarterlyReportDashboard as React.ComponentType<ChildComponentProps>,
};

/**
 * Get human-readable aria-label from component type
 */
function getAriaLabel(componentType: string): string {
  // Convert PascalCase to space-separated words
  // e.g., 'OrgChartComponent' -> 'Org Chart Component'
  if (!componentType) {
    return 'Unknown Component';
  }
  return componentType
    .replace(/([A-Z])/g, ' $1')
    .trim();
}

/**
 * Check if a component type is known
 */
function isKnownComponentType(type: string): type is KnownComponentType {
  return type in COMPONENT_MAP;
}

/**
 * ComponentRenderer - Renders dynamic components based on type
 */
export function ComponentRenderer({
  component,
  onAction,
  voiceEnabled,
}: ComponentRendererProps): JSX.Element {
  const previousNarrationRef = useRef<string | null>(null);
  const previousVoiceEnabledRef = useRef<boolean>(voiceEnabled);

  // Extract component data safely
  const componentType = component?.type ?? '';
  const componentProps = component?.props ?? {};
  const narration = component?.narration;
  const narrationText = narration?.text ?? '';

  // Memoize the aria-label to avoid recalculation
  const ariaLabel = useMemo(() => getAriaLabel(componentType), [componentType]);

  // Handle speech synthesis
  useEffect(() => {
    const shouldSpeak = voiceEnabled && narrationText && narrationText.trim().length > 0;
    const narrationChanged = narrationText !== previousNarrationRef.current;
    const voiceJustEnabled = voiceEnabled && !previousVoiceEnabledRef.current;

    // Cancel previous speech if voice is disabled or narration changed
    if (
      (!voiceEnabled && previousVoiceEnabledRef.current) ||
      (voiceEnabled && narrationChanged && previousNarrationRef.current !== null)
    ) {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }

    // Speak new narration
    if (shouldSpeak && (narrationChanged || voiceJustEnabled)) {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(narrationText);
        window.speechSynthesis.speak(utterance);
      }
    }

    // Update refs
    previousNarrationRef.current = narrationText;
    previousVoiceEnabledRef.current = voiceEnabled;

    // Cleanup on unmount
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [voiceEnabled, narrationText]);

  // Determine which component to render
  const renderContent = (): JSX.Element => {
    // Handle unknown/empty types
    if (!componentType || !isKnownComponentType(componentType)) {
      return <UnknownComponentFallback componentType={componentType || 'null'} />;
    }

    // Get the component from the map
    const Component = COMPONENT_MAP[componentType];

    // Prepare props for the child component
    const childProps: ChildComponentProps = {
      ...componentProps,
      onAction,
    };

    // Special handling for ApprovalsQueue - convert onAction to specific callbacks
    if (componentType === 'ApprovalsQueue') {
      childProps.onApprove = (type: string, id: string) => {
        onAction({
          type: 'approve',
          params: { approvalType: type, id },
        });
      };
      childProps.onReject = (type: string, id: string, reason?: string) => {
        onAction({
          type: 'reject',
          params: { approvalType: type, id, reason: reason || '' },
        });
      };
      childProps.onViewDetails = (type: string, id: string) => {
        onAction({
          type: 'drilldown',
          params: { approvalType: type, id },
        });
      };
    }

    return <Component {...childProps} />;
  };

  return (
    <div
      data-testid="component-renderer"
      data-component-type={componentType}
      role="region"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      {renderContent()}
    </div>
  );
}

export default ComponentRenderer;

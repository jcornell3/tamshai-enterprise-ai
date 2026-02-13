/**
 * @tamshai/ui
 *
 * Shared UI components for Tamshai Enterprise AI web applications
 *
 * Architecture v1.4 Components:
 * - ApprovalCard: Human-in-the-loop confirmations (Section 5.6)
 * - TruncationWarning: 50-record limit alerts (Section 5.3)
 * - SSEQueryClient: Server-Sent Events streaming (Section 6.1)
 *
 * Architecture v1.5 Components (Enterprise UX Hardening):
 * - DataTable: Enterprise data table with bulk actions, sorting, pagination
 * - Wizard: Multi-step wizard with validation and breadcrumb navigation
 * - AuditTrail: Change history timeline for compliance (S-OX)
 */

// v1.4 Components
export { ApprovalCard } from './ApprovalCard';
export type { ConfirmationData } from './ApprovalCard';

export { TruncationWarning } from './TruncationWarning';

export { SSEQueryClient } from './SSEQueryClient';

// v1.5 Enterprise UX Components
export { DataTable } from './components/DataTable';
export type {
  DataTableProps,
  ColumnDef,
  BulkAction,
  PaginationConfig
} from './components/DataTable';

export { Wizard } from './components/Wizard';
export type {
  WizardProps,
  WizardStep,
  WizardStepProps,
  ValidationResult,
  ValidationError
} from './components/Wizard';

export { AuditTrail, AuditEntry } from './components/AuditTrail';
export type {
  AuditTrailProps,
  EntityType,
  AuditEntryProps,
  AuditEntryData
} from './components/AuditTrail';

export { ConfirmDialog } from './components/ConfirmDialog';
export type { ConfirmDialogProps } from './components/ConfirmDialog';

// Generative UI Components (v1.5)
export * from './components/generative';

// Voice Hooks (v1.5)
export { useVoiceInput } from './hooks/useVoiceInput';
export { useVoiceOutput } from './hooks/useVoiceOutput';

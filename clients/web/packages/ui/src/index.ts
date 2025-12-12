/**
 * @tamshai/ui
 *
 * Shared UI components for Tamshai Enterprise AI web applications
 *
 * Architecture v1.4 Components:
 * - ApprovalCard: Human-in-the-loop confirmations (Section 5.6)
 * - TruncationWarning: 50-record limit alerts (Section 5.3)
 * - SSEQueryClient: Server-Sent Events streaming (Section 6.1)
 */

// v1.4 Components
export { ApprovalCard } from './ApprovalCard';
export type { ConfirmationData } from './ApprovalCard';

export { TruncationWarning } from './TruncationWarning';

export { SSEQueryClient } from './SSEQueryClient';

/**
 * Tax App Test Setup
 *
 * Provides mocks for shared packages and test utilities.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { vi } from 'vitest';

// Mock @tamshai/auth
vi.mock('@tamshai/auth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    userContext: {
      userId: 'test-user-id',
      username: 'test.user',
      firstName: 'Test',
      lastName: 'User',
      email: 'test.user@tamshai.com',
      roles: ['tax-read', 'tax-write'],
    },
    getAccessToken: () => 'mock-access-token',
    signIn: vi.fn(),
    signOut: vi.fn(),
    error: null,
  }),
  PrivateRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  canModifyTax: () => true,
  apiConfig: {
    mcpGatewayUrl: 'http://localhost:3100',
  },
}));

// Mock @tamshai/ui
vi.mock('@tamshai/ui', () => ({
  TruncationWarning: ({ message }: { message: string }) => (
    <div data-testid="truncation-warning">{message}</div>
  ),
  ApprovalCard: ({
    message,
    onComplete,
  }: {
    message: string;
    onComplete: (approved: boolean) => void;
  }) => (
    <div data-testid="approval-card">
      <p>{message}</p>
      <button onClick={() => onComplete(true)}>Approve</button>
      <button onClick={() => onComplete(false)}>Reject</button>
    </div>
  ),
  LoadingSpinner: () => <div data-testid="loading-spinner">Loading...</div>,
  ErrorMessage: ({ message }: { message: string }) => (
    <div data-testid="error-message">{message}</div>
  ),
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className} data-testid="card">{children}</div>
  ),
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>{children}</span>
  ),
  Modal: ({
    isOpen,
    onClose,
    title,
    children,
  }: {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
  }) =>
    isOpen ? (
      <div data-testid="modal" role="dialog">
        <h2>{title}</h2>
        {children}
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
  DataTable: ({ data, columns, emptyState }: { data: any[]; columns: any[]; emptyState?: React.ReactNode }) => (
    <div data-testid="data-table">
      {data.length === 0 ? (
        emptyState
      ) : (
        <table>
          <thead>
            <tr>
              {columns.map((col: any) => (
                <th key={col.id}>{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row: any, i: number) => (
              <tr key={row.id || i}>
                {columns.map((col: any) => (
                  <td key={col.id}>
                    {col.cell ? col.cell({ row: { original: row } }) : col.accessorFn?.(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  ),
  ConfirmDialog: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => (
    isOpen ? <div role="dialog" data-testid="confirm-dialog">{children}</div> : null
  ),
  Wizard: ({ children, isOpen, onClose, title, steps, currentStep, onNext, onPrevious, showBreadcrumbs, canProceed, isLastStep }: any) => (
    isOpen ? (
      <div role="dialog" className="wizard" aria-labelledby="wizard-title">
        <h2 id="wizard-title">{title}</h2>
        {showBreadcrumbs && (
          <nav aria-label="Wizard progress">
            <ul>
              {steps.map((step: any, index: number) => (
                <li key={step.id} aria-current={index === currentStep ? 'step' : undefined}>
                  {step.title}
                </li>
              ))}
            </ul>
          </nav>
        )}
        <main role="main">
          <p>Step {currentStep + 1} of {steps.length}</p>
          <h2>{steps[currentStep].title}</h2>
          {children}
        </main>
        <div>
          {currentStep > 0 && <button onClick={onPrevious}>Previous</button>}
          {!isLastStep && <button onClick={onNext} disabled={!canProceed}>Next</button>}
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    ) : null
  ),
  WizardStep: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AuditTrail: ({ entries, compact }: { entries: any[]; compact?: boolean }) => (
    <div data-testid="audit-trail">
      {entries.map((entry: any) => (
        <div key={entry.id}>{entry.action} - {entry.user}</div>
      ))}
    </div>
  ),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn();

// Reset mocks before each test
beforeEach(() => {
  mockFetch.mockReset();
});

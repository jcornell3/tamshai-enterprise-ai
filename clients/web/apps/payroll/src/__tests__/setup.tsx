/**
 * Payroll App Test Setup
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
      roles: ['payroll-read', 'payroll-write'],
    },
    getAccessToken: () => 'mock-access-token',
    signIn: vi.fn(),
    signOut: vi.fn(),
    error: null,
  }),
  PrivateRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  canModifyPayroll: () => true,
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
  // Wizard component mock for PayRunWizard tests
  Wizard: ({
    steps,
    onComplete,
    onCancel,
    title,
    showBreadcrumbs,
    submitLabel,
    submittingLabel,
    initialData = {},
  }: any) => {
    const [currentStep, setCurrentStep] = React.useState(0);
    const [data, setData] = React.useState(initialData);
    const [errors, setErrors] = React.useState<any[]>([]);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [completedSteps, setCompletedSteps] = React.useState<Set<number>>(new Set());

    const visibleSteps = steps.filter((step: any) => !step.showIf || step.showIf(data));
    const step = visibleSteps[currentStep];
    const isLastStep = currentStep === visibleSteps.length - 1;
    const nextStepTitle = !isLastStep ? visibleSteps[currentStep + 1]?.title : null;

    const updateData = (updates: Record<string, unknown>) => {
      setData((prev: any) => ({ ...prev, ...updates }));
      const updatedFields = Object.keys(updates);
      setErrors((prev: any[]) => prev.filter((err: any) => !updatedFields.includes(err.field)));
    };

    const handleNext = async () => {
      if (step?.validate) {
        const result = step.validate(data);
        if (!result.valid) {
          setErrors(result.errors);
          return;
        }
      }
      setErrors([]);
      setCompletedSteps((prev) => new Set([...prev, currentStep]));

      if (isLastStep) {
        setIsSubmitting(true);
        try {
          await onComplete(data);
        } finally {
          setIsSubmitting(false);
        }
      } else {
        setCurrentStep((prev) => prev + 1);
      }
    };

    const StepComponent = step?.component;

    return (
      <div role="dialog">
        {title && <h1>{title}</h1>}
        {showBreadcrumbs && (
          <nav aria-label="Wizard progress">
            <ol>
              {visibleSteps.map((s: any, i: number) => {
                const isCompleted = completedSteps.has(i);
                const isCurrent = i === currentStep;
                const isFuture = i > currentStep && !completedSteps.has(i);
                return (
                  <li
                    key={s.id}
                    aria-current={isCurrent ? 'step' : undefined}
                    aria-disabled={isFuture ? 'true' : undefined}
                    data-completed={isCompleted ? 'true' : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => i <= currentStep && setCurrentStep(i)}
                      disabled={isFuture}
                    >
                      {s.title}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        <main>
          <p>Step {currentStep + 1} of {visibleSteps.length}</p>
          <h2>{step?.title}</h2>
          {step?.description && <p>{step.description}</p>}
          {errors.length > 0 && (
            <div>
              {errors.map((err: any, i: number) => (
                <p key={i}>{err.message}</p>
              ))}
            </div>
          )}
          {StepComponent && (
            <StepComponent data={data} updateData={updateData} errors={errors} isActive={true} />
          )}
        </main>
        <footer role="navigation" aria-label="Wizard navigation">
          {onCancel && <button type="button" onClick={onCancel}>Cancel</button>}
          {currentStep > 0 && (
            <button type="button" onClick={() => setCurrentStep((prev) => prev - 1)}>
              Previous
            </button>
          )}
          <button type="button" onClick={handleNext} disabled={isSubmitting}>
            {isSubmitting
              ? submittingLabel || 'Processing...'
              : isLastStep
              ? submitLabel || 'Submit'
              : `Next: ${nextStepTitle}`}
          </button>
        </footer>
      </div>
    );
  },
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

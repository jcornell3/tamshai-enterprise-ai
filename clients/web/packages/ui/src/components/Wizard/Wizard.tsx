import React, { useState, useCallback, useMemo, useId } from 'react';

// Types
export interface ValidationError {
  field: string;
  message: string;
  severity?: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface WizardStepProps {
  data: Record<string, unknown>;
  updateData: (updates: Record<string, unknown>) => void;
  errors: ValidationError[];
  isActive: boolean;
}

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  component: React.ComponentType<WizardStepProps>;
  validate?: (data: Record<string, unknown>) => ValidationResult;
  isOptional?: boolean;
  showIf?: (data: Record<string, unknown>) => boolean;
}

export interface WizardProps {
  steps: WizardStep[];
  initialStep?: number;
  initialData?: Record<string, unknown>;
  onComplete: (data: Record<string, unknown>) => Promise<void>;
  onCancel?: () => void;
  title?: string;
  showBreadcrumbs?: boolean;
  submitLabel?: string;
  submittingLabel?: string;
  submitDisabled?: boolean;
}

export function Wizard({
  steps,
  initialStep = 0,
  initialData = {},
  onComplete,
  onCancel,
  title,
  showBreadcrumbs = false,
  submitLabel = 'Submit',
  submittingLabel = 'Processing...',
  submitDisabled = false,
}: WizardProps) {
  const wizardId = useId();
  const titleId = `${wizardId}-title`;

  // State
  const [currentStepIndex, setCurrentStepIndex] = useState(initialStep);
  const [data, setData] = useState<Record<string, unknown>>(initialData);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get visible steps based on conditions
  const visibleSteps = useMemo(() => {
    return steps.filter((step) => {
      if (!step.showIf) return true;
      return step.showIf(data);
    });
  }, [steps, data]);

  // Current step
  const currentStep = visibleSteps[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === visibleSteps.length - 1;
  const nextStep = !isLastStep ? visibleSteps[currentStepIndex + 1] : null;

  // Data update handler
  const updateData = useCallback((updates: Record<string, unknown>) => {
    setData((prev) => ({ ...prev, ...updates }));
    // Clear errors for updated fields
    const updatedFields = Object.keys(updates);
    setErrors((prev) => prev.filter((err) => !updatedFields.includes(err.field)));
  }, []);

  // Validation
  const validateCurrentStep = useCallback((): boolean => {
    if (!currentStep?.validate) return true;

    const result = currentStep.validate(data);
    if (!result.valid) {
      setErrors(result.errors);
      return false;
    }
    setErrors([]);
    return true;
  }, [currentStep, data]);

  // Navigation handlers
  const goToNext = useCallback(async () => {
    // Validate current step
    if (!validateCurrentStep()) {
      return;
    }

    // Mark current step as completed
    setCompletedSteps((prev) => new Set([...prev, currentStepIndex]));

    // Handle submit on last step
    if (isLastStep) {
      setIsSubmitting(true);
      try {
        await onComplete(data);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Move to next step
    setCurrentStepIndex((prev) => prev + 1);
    setErrors([]);
  }, [currentStepIndex, isLastStep, validateCurrentStep, onComplete, data]);

  const goToPrevious = useCallback(() => {
    if (isFirstStep) return;
    setCurrentStepIndex((prev) => prev - 1);
    setErrors([]); // Clear errors when going back
  }, [isFirstStep]);

  const goToStep = useCallback(
    (stepIndex: number) => {
      // Only allow going to completed steps or current step
      if (stepIndex > currentStepIndex && !completedSteps.has(stepIndex)) {
        return;
      }
      setCurrentStepIndex(stepIndex);
      setErrors([]);
    },
    [currentStepIndex, completedSteps]
  );

  // Step component props
  const stepProps: WizardStepProps = {
    data,
    updateData,
    errors,
    isActive: true,
  };

  const StepComponent = currentStep?.component;

  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      className="wizard bg-white rounded-lg shadow-lg"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-secondary-200">
        {title && (
          <h1 id={titleId} className="text-xl font-semibold text-secondary-900">
            {title}
          </h1>
        )}

        {/* Breadcrumbs */}
        {showBreadcrumbs && (
          <nav aria-label="Wizard progress" className="mt-4">
            <ol className="flex items-center">
              {visibleSteps.map((step, index) => {
                const isCompleted = completedSteps.has(index);
                const isCurrent = index === currentStepIndex;
                const isFuture = index > currentStepIndex && !completedSteps.has(index);

                return (
                  <li
                    key={step.id}
                    aria-current={isCurrent ? 'step' : undefined}
                    aria-disabled={isFuture ? 'true' : undefined}
                    data-completed={isCompleted ? 'true' : undefined}
                    className={`flex items-center ${index > 0 ? 'ml-4' : ''}`}
                  >
                    {/* Connector line */}
                    {index > 0 && (
                      <div
                        className={`w-8 h-0.5 mr-4 ${
                          isCompleted || isCurrent ? 'bg-primary-500' : 'bg-secondary-200'
                        }`}
                      />
                    )}

                    {/* Step indicator */}
                    <button
                      type="button"
                      onClick={() => goToStep(index)}
                      disabled={isFuture}
                      className={`flex items-center ${
                        isFuture ? 'cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      <span
                        className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold ${
                          isCompleted
                            ? 'bg-success-500 text-white'
                            : isCurrent
                            ? 'bg-primary-500 text-white'
                            : 'border-2 border-secondary-300 text-secondary-400'
                        }`}
                      >
                        {isCompleted ? (
                          <CheckIcon className="w-4 h-4" />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <span
                        className={`ml-2 text-sm font-medium ${
                          isCurrent
                            ? 'text-primary-600'
                            : isCompleted
                            ? 'text-secondary-900'
                            : 'text-secondary-400'
                        }`}
                      >
                        {step.title}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
      </div>

      {/* Content */}
      <main role="main" aria-live="polite" className="px-6 py-6">
        {/* Step header */}
        <div className="mb-6">
          <p className="text-sm text-secondary-500 mb-1">
            Step {currentStepIndex + 1} of {visibleSteps.length}
          </p>
          <h2 className="text-lg font-semibold text-secondary-900" data-testid="wizard-step-title">
            {currentStep?.title}
          </h2>
          {currentStep?.description && (
            <p className="mt-1 text-secondary-600">{currentStep.description}</p>
          )}
        </div>

        {/* Validation errors */}
        {errors.length > 0 && (
          <div className="mb-4 p-3 bg-danger-50 border border-danger-200 rounded-lg">
            <ul className="list-disc list-inside space-y-1">
              {errors.map((error, i) => (
                <li key={i} className="text-sm text-danger-700">
                  {error.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Step component */}
        {StepComponent && <StepComponent {...stepProps} />}
      </main>

      {/* Footer */}
      <footer
        role="navigation"
        aria-label="Wizard navigation"
        className="px-6 py-4 border-t border-secondary-200 flex items-center justify-between"
      >
        <div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-secondary-600 hover:text-secondary-800
                       hover:bg-secondary-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {!isFirstStep && (
            <button
              type="button"
              onClick={goToPrevious}
              className="px-4 py-2 border border-secondary-300 rounded-lg
                       text-secondary-700 hover:bg-secondary-50 transition-colors
                       inline-flex items-center gap-2"
            >
              <ChevronLeftIcon className="w-4 h-4" />
              Previous
            </button>
          )}

          <button
            type="button"
            onClick={goToNext}
            disabled={isSubmitting || (isLastStep && submitDisabled)}
            data-testid={isLastStep ? 'wizard-submit-button' : 'wizard-next-button'}
            className={`px-4 py-2 rounded-lg font-medium transition-colors
                      inline-flex items-center gap-2 ${
                        isLastStep
                          ? 'bg-success-500 text-white hover:bg-success-600'
                          : 'bg-primary-500 text-white hover:bg-primary-600'
                      } ${isSubmitting ? 'opacity-75 cursor-wait' : ''}`}
          >
            {isSubmitting ? (
              <>
                <SpinnerIcon className="w-4 h-4 animate-spin" />
                {submittingLabel}
              </>
            ) : isLastStep ? (
              <>
                <CheckIcon className="w-4 h-4" />
                {submitLabel}
              </>
            ) : (
              <>
                Next: {nextStep?.title}
                <ChevronRightIcon className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}

// Icon components
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export default Wizard;

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Wizard, WizardStep } from './Wizard';

// Mock step components
const Step1 = ({ data, updateData }: { data: Record<string, unknown>; updateData: (d: Record<string, unknown>) => void }) => (
  <div data-testid="step-1">
    <input
      data-testid="step1-input"
      value={String(data.field1 || '')}
      onChange={(e) => updateData({ field1: e.target.value })}
    />
  </div>
);

const Step2 = ({ data, updateData }: { data: Record<string, unknown>; updateData: (d: Record<string, unknown>) => void }) => (
  <div data-testid="step-2">
    <input
      data-testid="step2-input"
      value={String(data.field2 || '')}
      onChange={(e) => updateData({ field2: e.target.value })}
    />
  </div>
);

const Step3 = ({ data }: { data: Record<string, unknown> }) => (
  <div data-testid="step-3">
    <p>Review: {String(data.field1)}, {String(data.field2)}</p>
  </div>
);

const testSteps: WizardStep[] = [
  {
    id: 'step1',
    title: 'Step One',
    description: 'First step description',
    component: Step1,
  },
  {
    id: 'step2',
    title: 'Step Two',
    description: 'Second step description',
    component: Step2,
  },
  {
    id: 'step3',
    title: 'Review',
    description: 'Review and submit',
    component: Step3,
  },
];

describe('Wizard', () => {
  describe('Basic Rendering', () => {
    it('renders the wizard title', () => {
      render(
        <Wizard
          steps={testSteps}
          title="Test Wizard"
          onComplete={jest.fn()}
        />
      );

      expect(screen.getByText('Test Wizard')).toBeInTheDocument();
    });

    it('renders first step by default', () => {
      render(<Wizard steps={testSteps} onComplete={jest.fn()} />);

      expect(screen.getByTestId('step-1')).toBeInTheDocument();
      expect(screen.queryByTestId('step-2')).not.toBeInTheDocument();
    });

    it('renders step header with title and description', () => {
      render(<Wizard steps={testSteps} onComplete={jest.fn()} />);

      expect(screen.getByText('Step One')).toBeInTheDocument();
      expect(screen.getByText('First step description')).toBeInTheDocument();
    });

    it('renders step indicator showing current position', () => {
      render(<Wizard steps={testSteps} onComplete={jest.fn()} />);

      expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    });
  });

  describe('Breadcrumb Navigation', () => {
    it('renders breadcrumbs when showBreadcrumbs is true', () => {
      render(
        <Wizard steps={testSteps} onComplete={jest.fn()} showBreadcrumbs={true} />
      );

      expect(screen.getByRole('navigation', { name: /wizard progress/i })).toBeInTheDocument();
      // Step names appear in both breadcrumb and step header, so use getAllByText
      expect(screen.getAllByText('Step One').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Step Two').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Review').length).toBeGreaterThan(0);
    });

    it('marks current step as active', () => {
      render(
        <Wizard steps={testSteps} onComplete={jest.fn()} showBreadcrumbs={true} />
      );

      const breadcrumbs = screen.getAllByRole('listitem');
      expect(breadcrumbs[0]).toHaveAttribute('aria-current', 'step');
    });

    it('marks completed steps with checkmark', async () => {
      render(
        <Wizard steps={testSteps} onComplete={jest.fn()} showBreadcrumbs={true} />
      );

      // Complete step 1
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        const breadcrumbs = screen.getAllByRole('listitem');
        expect(breadcrumbs[0]).toHaveAttribute('data-completed', 'true');
      });
    });

    it('allows clicking on completed steps to navigate back', async () => {
      render(
        <Wizard steps={testSteps} onComplete={jest.fn()} showBreadcrumbs={true} />
      );

      // Go to step 2
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByTestId('step-2')).toBeInTheDocument();
      });

      // Click the button inside the first breadcrumb (Step One)
      // The breadcrumb nav contains buttons for navigation
      const breadcrumbNav = screen.getByRole('navigation', { name: /wizard progress/i });
      const breadcrumbButtons = breadcrumbNav.querySelectorAll('button');
      fireEvent.click(breadcrumbButtons[0]);

      await waitFor(() => {
        expect(screen.getByTestId('step-1')).toBeInTheDocument();
      });
    });

    it('does not allow clicking on future steps', () => {
      render(
        <Wizard steps={testSteps} onComplete={jest.fn()} showBreadcrumbs={true} />
      );

      const breadcrumbs = screen.getAllByRole('listitem');
      // Future step should not be clickable
      expect(breadcrumbs[2]).toHaveAttribute('aria-disabled', 'true');
    });
  });

  describe('Navigation Controls', () => {
    it('hides Previous button on first step', () => {
      render(<Wizard steps={testSteps} onComplete={jest.fn()} />);

      expect(screen.queryByRole('button', { name: /previous/i })).not.toBeInTheDocument();
    });

    it('shows Previous button on subsequent steps', async () => {
      render(<Wizard steps={testSteps} onComplete={jest.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
      });
    });

    it('navigates to next step on Next button click', async () => {
      render(<Wizard steps={testSteps} onComplete={jest.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByTestId('step-2')).toBeInTheDocument();
      });
    });

    it('navigates to previous step on Previous button click', async () => {
      render(<Wizard steps={testSteps} onComplete={jest.fn()} />);

      // Go to step 2
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByTestId('step-2')).toBeInTheDocument();
      });

      // Go back
      fireEvent.click(screen.getByRole('button', { name: /previous/i }));

      await waitFor(() => {
        expect(screen.getByTestId('step-1')).toBeInTheDocument();
      });
    });

    it('shows Submit button on final step', async () => {
      render(<Wizard steps={testSteps} onComplete={jest.fn()} />);

      // Navigate to last step
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
      });
    });

    it('shows next step name in Next button label', () => {
      render(<Wizard steps={testSteps} onComplete={jest.fn()} />);

      expect(screen.getByRole('button', { name: /next: step two/i })).toBeInTheDocument();
    });
  });

  describe('Data Management', () => {
    it('preserves data when navigating between steps', async () => {
      render(<Wizard steps={testSteps} onComplete={jest.fn()} />);

      // Enter data in step 1
      fireEvent.change(screen.getByTestId('step1-input'), { target: { value: 'test value' } });

      // Go to step 2
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByTestId('step-2')).toBeInTheDocument();
      });

      // Go back to step 1
      fireEvent.click(screen.getByRole('button', { name: /previous/i }));

      await waitFor(() => {
        expect(screen.getByTestId('step1-input')).toHaveValue('test value');
      });
    });

    it('passes all data to onComplete when submitted', async () => {
      const onComplete = jest.fn().mockResolvedValue(undefined);
      render(<Wizard steps={testSteps} onComplete={onComplete} />);

      // Enter data in step 1
      fireEvent.change(screen.getByTestId('step1-input'), { target: { value: 'value1' } });
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      // Enter data in step 2
      await waitFor(() => {
        fireEvent.change(screen.getByTestId('step2-input'), { target: { value: 'value2' } });
      });
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      // Submit
      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      });

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledWith({
          field1: 'value1',
          field2: 'value2',
        });
      });
    });
  });

  describe('Validation', () => {
    const stepsWithValidation: WizardStep[] = [
      {
        id: 'step1',
        title: 'Step One',
        component: Step1,
        validate: (data) => {
          if (!data.field1) {
            return {
              valid: false,
              errors: [{ field: 'field1', message: 'Field 1 is required' }],
            };
          }
          return { valid: true, errors: [] };
        },
      },
      {
        id: 'step2',
        title: 'Step Two',
        component: Step2,
      },
    ];

    it('prevents navigation when validation fails', async () => {
      render(<Wizard steps={stepsWithValidation} onComplete={jest.fn()} />);

      // Try to go next without entering data
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        // Should still be on step 1
        expect(screen.getByTestId('step-1')).toBeInTheDocument();
      });
    });

    it('displays validation errors', async () => {
      render(<Wizard steps={stepsWithValidation} onComplete={jest.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText('Field 1 is required')).toBeInTheDocument();
      });
    });

    it('allows navigation when validation passes', async () => {
      render(<Wizard steps={stepsWithValidation} onComplete={jest.fn()} />);

      // Enter valid data
      fireEvent.change(screen.getByTestId('step1-input'), { target: { value: 'valid' } });
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByTestId('step-2')).toBeInTheDocument();
      });
    });

    it('allows navigating back without validation', async () => {
      render(<Wizard steps={stepsWithValidation} onComplete={jest.fn()} />);

      // Enter valid data and go to step 2
      fireEvent.change(screen.getByTestId('step1-input'), { target: { value: 'valid' } });
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByTestId('step-2')).toBeInTheDocument();
      });

      // Go back (should always work)
      fireEvent.click(screen.getByRole('button', { name: /previous/i }));

      await waitFor(() => {
        expect(screen.getByTestId('step-1')).toBeInTheDocument();
      });
    });
  });

  describe('Cancel Functionality', () => {
    it('renders Cancel button when onCancel provided', () => {
      const onCancel = jest.fn();
      render(<Wizard steps={testSteps} onComplete={jest.fn()} onCancel={onCancel} />);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('calls onCancel when Cancel clicked', () => {
      const onCancel = jest.fn();
      render(<Wizard steps={testSteps} onComplete={jest.fn()} onCancel={onCancel} />);

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('Loading State', () => {
    it('shows loading state during submission', async () => {
      const onComplete = jest.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );
      render(<Wizard steps={testSteps} onComplete={onComplete} />);

      // Navigate to last step
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      });

      expect(screen.getByRole('button', { name: /processing/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA attributes on wizard container', () => {
      render(
        <Wizard
          steps={testSteps}
          title="Test Wizard"
          onComplete={jest.fn()}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby');
    });

    it('breadcrumb navigation has proper role', () => {
      render(
        <Wizard steps={testSteps} onComplete={jest.fn()} showBreadcrumbs={true} />
      );

      expect(screen.getByRole('navigation', { name: /wizard progress/i })).toBeInTheDocument();
    });

    it('step content has live region for updates', async () => {
      render(<Wizard steps={testSteps} onComplete={jest.fn()} />);

      const main = screen.getByRole('main');
      expect(main).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('Conditional Steps', () => {
    const conditionalSteps: WizardStep[] = [
      {
        id: 'step1',
        title: 'Step One',
        component: Step1,
      },
      {
        id: 'step2',
        title: 'Step Two',
        component: Step2,
        showIf: (data) => data.field1 === 'show-step-2',
      },
      {
        id: 'step3',
        title: 'Review',
        component: Step3,
      },
    ];

    it('skips conditional step when condition is false', async () => {
      render(<Wizard steps={conditionalSteps} onComplete={jest.fn()} />);

      // Enter data that doesn't trigger step 2
      fireEvent.change(screen.getByTestId('step1-input'), { target: { value: 'other' } });
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        // Should skip to step 3
        expect(screen.getByTestId('step-3')).toBeInTheDocument();
      });
    });

    it('shows conditional step when condition is true', async () => {
      render(<Wizard steps={conditionalSteps} onComplete={jest.fn()} />);

      // Enter data that triggers step 2
      fireEvent.change(screen.getByTestId('step1-input'), { target: { value: 'show-step-2' } });
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByTestId('step-2')).toBeInTheDocument();
      });
    });
  });
});

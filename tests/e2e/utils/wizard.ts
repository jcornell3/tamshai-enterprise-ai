/**
 * E2E Wizard Utilities
 *
 * Provides helpers for testing multi-step Wizard component patterns.
 * Implements navigation, validation, and state management test utilities.
 *
 * Architecture v1.5 - Enterprise UX Hardening
 */

import { Page, expect, Locator } from '@playwright/test';

// Default selectors following the Wizard component conventions
const SELECTORS = {
  // Wizard container
  wizard: '[role="dialog"].wizard',

  // Navigation
  breadcrumbs: 'nav[aria-label="Wizard progress"]',
  breadcrumbItem: 'nav[aria-label="Wizard progress"] li',
  breadcrumbButton: 'nav[aria-label="Wizard progress"] button',

  // Step indicators
  currentStep: '[aria-current="step"]',
  completedStep: '[data-completed="true"]',
  disabledStep: '[aria-disabled="true"]',

  // Navigation buttons
  previousButton: 'button:has-text("Previous")',
  nextButton: '[data-testid="wizard-next-button"]',
  submitButton: '[data-testid="wizard-submit-button"]',
  cancelButton: 'button:has-text("Cancel")',

  // Step content
  stepContent: 'main[role="main"]',
  stepTitle: '[data-testid="wizard-step-title"]',
  stepDescription: 'main p',
  stepIndicator: 'main p:has-text("Step")',

  // Validation
  errorContainer: '.bg-danger-50',
  errorMessage: '.text-danger-700',

  // Loading state
  processingButton: 'button:has-text("Processing")',
};

/**
 * Assert that a specific step is currently active
 *
 * Verifies both breadcrumb state and step content.
 *
 * @param page - Playwright Page instance
 * @param stepName - The expected step title
 */
export async function expectWizardStepActive(page: Page, stepName: string): Promise<void> {
  // Verify step title in content area (primary assertion)
  const stepTitle = page.locator(SELECTORS.stepTitle);
  await expect(stepTitle).toContainText(stepName);

  // If breadcrumbs are present, verify current step is highlighted
  const currentBreadcrumb = page.locator(SELECTORS.currentStep);
  if (await currentBreadcrumb.count() > 0) {
    await expect(currentBreadcrumb).toBeVisible();
  }
}

/**
 * Assert that a step is marked as completed
 *
 * @param page - Playwright Page instance
 * @param stepName - The step title to check
 */
export async function expectStepCompleted(page: Page, stepName: string): Promise<void> {
  const completedSteps = page.locator(SELECTORS.completedStep);
  const stepWithName = completedSteps.filter({ hasText: stepName });
  await expect(stepWithName).toBeVisible();
}

/**
 * Assert that a step is disabled (cannot be clicked)
 *
 * @param page - Playwright Page instance
 * @param stepName - The step title to check
 */
export async function expectStepDisabled(page: Page, stepName: string): Promise<void> {
  const disabledSteps = page.locator(SELECTORS.disabledStep);
  const stepWithName = disabledSteps.filter({ hasText: stepName });
  await expect(stepWithName).toBeVisible();
}

/**
 * Navigate to the next step using the Next button
 *
 * @param page - Playwright Page instance
 */
export async function goToNextStep(page: Page): Promise<void> {
  const nextButton = page.locator(SELECTORS.nextButton);
  await expect(nextButton).toBeVisible();
  await expect(nextButton).toBeEnabled();
  await nextButton.click();
}

/**
 * Navigate to the previous step using the Previous button
 *
 * @param page - Playwright Page instance
 */
export async function goToPreviousStep(page: Page): Promise<void> {
  const previousButton = page.locator(SELECTORS.previousButton);
  await expect(previousButton).toBeVisible();
  await expect(previousButton).toBeEnabled();
  await previousButton.click();
}

/**
 * Submit the wizard from the final step
 *
 * @param page - Playwright Page instance
 */
export async function submitWizard(page: Page): Promise<void> {
  const submitButton = page.locator(SELECTORS.submitButton);
  await expect(submitButton).toBeVisible();
  await expect(submitButton).toBeEnabled();
  await submitButton.click();
}

/**
 * Cancel the wizard
 *
 * @param page - Playwright Page instance
 */
export async function cancelWizard(page: Page): Promise<void> {
  const cancelButton = page.locator(SELECTORS.cancelButton);
  await expect(cancelButton).toBeVisible();
  await cancelButton.click();
}

/**
 * Navigate to a specific step by clicking its breadcrumb
 *
 * Only works for completed steps or the current step.
 *
 * @param page - Playwright Page instance
 * @param stepName - The step title to navigate to
 */
export async function goToStepByBreadcrumb(page: Page, stepName: string): Promise<void> {
  const breadcrumbButtons = page.locator(SELECTORS.breadcrumbButton);
  const stepButton = breadcrumbButtons.filter({ hasText: stepName });

  await expect(stepButton).toBeVisible();
  await expect(stepButton).toBeEnabled();
  await stepButton.click();
}

/**
 * Get the current step number (1-based)
 *
 * @param page - Playwright Page instance
 * @returns Current step number
 */
export async function getCurrentStepNumber(page: Page): Promise<number> {
  const stepIndicator = page.locator(SELECTORS.stepIndicator);
  const text = await stepIndicator.textContent() || '';

  // Parse "Step X of Y" format
  const match = text.match(/Step (\d+) of/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Get the total number of steps
 *
 * @param page - Playwright Page instance
 * @returns Total number of steps
 */
export async function getTotalSteps(page: Page): Promise<number> {
  const stepIndicator = page.locator(SELECTORS.stepIndicator);
  const text = await stepIndicator.textContent() || '';

  // Parse "Step X of Y" format
  const match = text.match(/of (\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Assert that validation errors are displayed
 *
 * @param page - Playwright Page instance
 * @param expectedErrors - Array of expected error messages (partial matches)
 */
export async function expectValidationErrors(page: Page, expectedErrors: string[]): Promise<void> {
  const errorContainer = page.locator(SELECTORS.errorContainer);
  await expect(errorContainer).toBeVisible();

  for (const errorText of expectedErrors) {
    const errorMessage = page.locator(SELECTORS.errorMessage, { hasText: errorText });
    await expect(errorMessage).toBeVisible();
  }
}

/**
 * Assert that no validation errors are displayed
 *
 * @param page - Playwright Page instance
 */
export async function expectNoValidationErrors(page: Page): Promise<void> {
  const errorContainer = page.locator(SELECTORS.errorContainer);
  await expect(errorContainer).not.toBeVisible();
}

/**
 * Assert that the wizard is in a loading/processing state
 *
 * @param page - Playwright Page instance
 */
export async function expectWizardProcessing(page: Page): Promise<void> {
  const processingButton = page.locator(SELECTORS.processingButton);
  await expect(processingButton).toBeVisible();
  await expect(processingButton).toBeDisabled();
}

/**
 * Wait for the wizard to finish processing
 *
 * @param page - Playwright Page instance
 * @param timeout - Maximum wait time in milliseconds (default: 30000)
 */
export async function waitForWizardComplete(page: Page, timeout: number = 30000): Promise<void> {
  const processingButton = page.locator(SELECTORS.processingButton);
  await expect(processingButton).not.toBeVisible({ timeout });
}

/**
 * Assert that the Previous button is hidden (first step)
 *
 * @param page - Playwright Page instance
 */
export async function expectPreviousButtonHidden(page: Page): Promise<void> {
  const previousButton = page.locator(SELECTORS.previousButton);
  await expect(previousButton).not.toBeVisible();
}

/**
 * Assert that the Submit button is visible (last step)
 *
 * @param page - Playwright Page instance
 */
export async function expectSubmitButtonVisible(page: Page): Promise<void> {
  const submitButton = page.locator(SELECTORS.submitButton);
  await expect(submitButton).toBeVisible();
}

/**
 * Assert that the Next button shows the upcoming step name
 *
 * @param page - Playwright Page instance
 * @param nextStepName - Expected name of the next step
 */
export async function expectNextButtonShowsStep(page: Page, nextStepName: string): Promise<void> {
  const nextButton = page.locator(SELECTORS.nextButton);
  await expect(nextButton).toContainText(nextStepName);
}

/**
 * Fill a form field within the wizard step
 *
 * @param page - Playwright Page instance
 * @param fieldId - The data-testid or input name of the field
 * @param value - The value to enter
 */
export async function fillWizardField(page: Page, fieldId: string, value: string): Promise<void> {
  const field = page.locator(`[data-testid="${fieldId}"], [name="${fieldId}"], #${fieldId}`);
  await field.fill(value);
}

/**
 * Select a value in a wizard select/dropdown field
 *
 * @param page - Playwright Page instance
 * @param fieldId - The data-testid or select name
 * @param value - The value to select
 */
export async function selectWizardOption(page: Page, fieldId: string, value: string): Promise<void> {
  const select = page.locator(`[data-testid="${fieldId}"], [name="${fieldId}"], #${fieldId}`);
  await select.selectOption(value);
}

/**
 * Get the current step's title
 *
 * @param page - Playwright Page instance
 * @returns The step title text
 */
export async function getStepTitle(page: Page): Promise<string> {
  const stepTitle = page.locator(SELECTORS.stepTitle);
  return await stepTitle.textContent() || '';
}

/**
 * Get the current step's description
 *
 * @param page - Playwright Page instance
 * @returns The step description text (or empty string if none)
 */
export async function getStepDescription(page: Page): Promise<string> {
  const stepContent = page.locator(SELECTORS.stepContent);
  const description = stepContent.locator('p').nth(1); // Second p tag after step indicator
  return await description.textContent() || '';
}

/**
 * Assert wizard breadcrumbs are visible
 *
 * @param page - Playwright Page instance
 */
export async function expectBreadcrumbsVisible(page: Page): Promise<void> {
  const breadcrumbs = page.locator(SELECTORS.breadcrumbs);
  await expect(breadcrumbs).toBeVisible();
}

/**
 * Assert wizard breadcrumbs are hidden
 *
 * @param page - Playwright Page instance
 */
export async function expectBreadcrumbsHidden(page: Page): Promise<void> {
  const breadcrumbs = page.locator(SELECTORS.breadcrumbs);
  await expect(breadcrumbs).not.toBeVisible();
}

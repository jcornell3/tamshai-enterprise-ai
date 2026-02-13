/**
 * Quarterly Filing Review Wizard
 *
 * Multi-step wizard for reviewing and filing quarterly tax returns.
 * Implements Quaderno-compatible export and S-OX compliant audit trail.
 *
 * Flow:
 * 1. Review Summary - View jurisdiction breakdown
 * 2. Export Reports - Generate CSV/PDF for records
 * 3. Mark Reviewed - Acknowledge review with signature
 * 4. File & Confirm - Enter confirmation number after filing
 *
 * Architecture v1.5 - Enterprise UX Hardening
 */
import { useState, useCallback } from 'react';
import { Wizard, WizardStep } from '@tamshai/ui';
import { AuditTrail } from '@tamshai/ui';
import type { QuarterlyFiling, JurisdictionSummary, FilingTotals } from '../types';

interface QuarterlyFilingReviewWizardProps {
  filing: QuarterlyFiling;
  onComplete: (confirmationNumber: string) => void;
  onCancel: () => void;
  onExport: (format: 'csv' | 'pdf' | 'json') => Promise<void>;
  onMarkReviewed: (reviewerName: string) => Promise<void>;
  onMarkFiled: (confirmationNumber: string) => Promise<void>;
  isOpen: boolean;
}

// Formatting utilities
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

function getQuarterLabel(year: number, quarter: number): string {
  return `Q${quarter} ${year}`;
}

// Step 1: Review Summary Component
function ReviewSummaryStep({
  filing,
}: {
  filing: QuarterlyFiling;
}) {
  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-900">
          {getQuarterLabel(filing.year, filing.quarter)} Tax Filing Summary
        </h3>
        <p className="text-sm text-blue-700 mt-1">
          Review all jurisdictions with sales tax activity before proceeding.
        </p>
      </div>

      {/* Totals Summary */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard label="Gross Sales" value={formatCurrency(filing.totals.grossSales)} />
        <SummaryCard label="Taxable Sales" value={formatCurrency(filing.totals.taxableSales)} />
        <SummaryCard label="Exempt Sales" value={formatCurrency(filing.totals.exemptSales)} />
        <SummaryCard
          label="Tax Collected"
          value={formatCurrency(filing.totals.taxCollected)}
          highlight
        />
      </div>

      {/* Jurisdiction Breakdown */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200" data-testid="jurisdiction-table">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Jurisdiction
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Gross Sales
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Taxable Sales
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Tax Rate
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Tax Collected
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Transactions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {filing.jurisdictions.map((jurisdiction) => (
              <JurisdictionRow key={jurisdiction.stateCode} jurisdiction={jurisdiction} />
            ))}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td className="px-4 py-3 font-semibold text-gray-900">Total</td>
              <td className="px-4 py-3 text-right font-semibold text-gray-900">
                {formatCurrency(filing.totals.grossSales)}
              </td>
              <td className="px-4 py-3 text-right font-semibold text-gray-900">
                {formatCurrency(filing.totals.taxableSales)}
              </td>
              <td className="px-4 py-3 text-right text-gray-500">-</td>
              <td className="px-4 py-3 text-right font-semibold text-gray-900">
                {formatCurrency(filing.totals.taxCollected)}
              </td>
              <td className="px-4 py-3 text-right font-semibold text-gray-900">
                {filing.jurisdictions.reduce((sum, j) => sum + j.transactionCount, 0)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-4 ${
        highlight ? 'bg-primary-50 border border-primary-200' : 'bg-gray-50'
      }`}
    >
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-xl font-semibold ${highlight ? 'text-primary-700' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}

function JurisdictionRow({ jurisdiction }: { jurisdiction: JurisdictionSummary }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <div className="flex items-center">
          <span className="font-medium text-gray-900">{jurisdiction.state}</span>
          <span className="ml-2 text-xs text-gray-500">({jurisdiction.stateCode})</span>
        </div>
      </td>
      <td className="px-4 py-3 text-right text-gray-900">
        {formatCurrency(jurisdiction.grossSales)}
      </td>
      <td className="px-4 py-3 text-right text-gray-900">
        {formatCurrency(jurisdiction.taxableSales)}
      </td>
      <td className="px-4 py-3 text-right text-gray-600">{formatPercent(jurisdiction.taxRate)}</td>
      <td className="px-4 py-3 text-right font-medium text-gray-900">
        {formatCurrency(jurisdiction.taxCollected)}
      </td>
      <td className="px-4 py-3 text-right text-gray-600">{jurisdiction.transactionCount}</td>
    </tr>
  );
}

// Step 2: Export Reports Component
function ExportReportsStep({
  filing,
  onExport,
}: {
  filing: QuarterlyFiling;
  onExport: (format: 'csv' | 'pdf' | 'json') => Promise<void>;
}) {
  const [exporting, setExporting] = useState<string | null>(null);
  const [exported, setExported] = useState<Set<string>>(new Set());

  const handleExport = async (format: 'csv' | 'pdf' | 'json') => {
    setExporting(format);
    try {
      await onExport(format);
      setExported((prev) => new Set([...prev, format]));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="font-medium text-yellow-900">Export Reports for Records</h3>
        <p className="text-sm text-yellow-700 mt-1">
          Download detailed reports before filing. These serve as your permanent records.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <ExportCard
          format="csv"
          title="CSV Export"
          description="Quaderno-compatible spreadsheet format for accounting software"
          icon="📊"
          onExport={() => handleExport('csv')}
          isExporting={exporting === 'csv'}
          isExported={exported.has('csv')}
        />
        <ExportCard
          format="pdf"
          title="PDF Report"
          description="Formatted report for filing records and audits"
          icon="📄"
          onExport={() => handleExport('pdf')}
          isExporting={exporting === 'pdf'}
          isExported={exported.has('pdf')}
        />
        <ExportCard
          format="json"
          title="JSON Data"
          description="Machine-readable format for API integrations"
          icon="🔧"
          onExport={() => handleExport('json')}
          isExporting={exporting === 'json'}
          isExported={exported.has('json')}
        />
      </div>

      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-2">Export Contents</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• Period: {getQuarterLabel(filing.year, filing.quarter)}</li>
          <li>• Jurisdictions: {filing.jurisdictions.length} states with activity</li>
          <li>• Total Tax Collected: {formatCurrency(filing.totals.taxCollected)}</li>
          <li>• Transaction Count: {filing.jurisdictions.reduce((s, j) => s + j.transactionCount, 0)}</li>
        </ul>
      </div>
    </div>
  );
}

function ExportCard({
  format,
  title,
  description,
  icon,
  onExport,
  isExporting,
  isExported,
}: {
  format: string;
  title: string;
  description: string;
  icon: string;
  onExport: () => void;
  isExporting: boolean;
  isExported: boolean;
}) {
  return (
    <div className="bg-white border rounded-lg p-4 flex flex-col">
      <div className="text-3xl mb-2">{icon}</div>
      <h4 className="font-medium text-gray-900">{title}</h4>
      <p className="text-sm text-gray-500 mt-1 flex-grow">{description}</p>
      <button
        onClick={onExport}
        disabled={isExporting}
        className={`mt-4 w-full px-4 py-2 rounded-md text-sm font-medium ${
          isExported
            ? 'bg-green-100 text-green-800 cursor-default'
            : 'bg-primary-500 text-white hover:bg-primary-600'
        } disabled:opacity-50`}
        data-testid={`export-${format}`}
      >
        {isExporting ? 'Exporting...' : isExported ? 'Downloaded' : `Export ${format.toUpperCase()}`}
      </button>
    </div>
  );
}

// Step 3: Mark Reviewed Component
function MarkReviewedStep({
  filing,
  onMarkReviewed,
}: {
  filing: QuarterlyFiling;
  onMarkReviewed: (reviewerName: string) => Promise<void>;
}) {
  const [reviewerName, setReviewerName] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReviewed, setIsReviewed] = useState(filing.status !== 'draft');

  const handleMarkReviewed = async () => {
    if (!reviewerName.trim() || !acknowledged) return;
    setIsSubmitting(true);
    try {
      await onMarkReviewed(reviewerName);
      setIsReviewed(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isReviewed) {
    return (
      <div className="space-y-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <div className="text-4xl mb-2">✓</div>
          <h3 className="font-medium text-green-900 text-lg">Filing Reviewed</h3>
          <p className="text-sm text-green-700 mt-2">
            Reviewed by: {filing.reviewedBy || reviewerName}
          </p>
          <p className="text-sm text-green-600">
            {filing.reviewedAt
              ? new Date(filing.reviewedAt).toLocaleString()
              : new Date().toLocaleString()}
          </p>
        </div>
        <p className="text-center text-gray-500">
          Proceed to file with your state tax portal.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
        <h3 className="font-medium text-orange-900">Acknowledge Review</h3>
        <p className="text-sm text-orange-700 mt-1">
          Confirm that you have reviewed all jurisdiction data and exported necessary reports.
        </p>
      </div>

      <div className="bg-white border rounded-lg p-6 space-y-4">
        <div>
          <label htmlFor="reviewer-name" className="block text-sm font-medium text-gray-700 mb-1">
            Reviewer Name
          </label>
          <input
            id="reviewer-name"
            type="text"
            value={reviewerName}
            onChange={(e) => setReviewerName(e.target.value)}
            placeholder="Enter your full name"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            data-testid="reviewer-name"
          />
        </div>

        <div className="flex items-start">
          <input
            id="acknowledge-checkbox"
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded mt-1"
            data-testid="acknowledge-checkbox"
          />
          <label htmlFor="acknowledge-checkbox" className="ml-3 text-sm text-gray-700">
            I confirm that I have reviewed the {getQuarterLabel(filing.year, filing.quarter)} tax
            filing summary, verified the jurisdiction data is accurate, and exported the necessary
            reports for our records.
          </label>
        </div>

        <button
          onClick={handleMarkReviewed}
          disabled={!reviewerName.trim() || !acknowledged || isSubmitting}
          className="w-full px-4 py-2 bg-primary-500 text-white rounded-md font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="mark-reviewed-btn"
        >
          {isSubmitting ? 'Saving...' : 'Mark as Reviewed'}
        </button>
      </div>

      <div className="text-sm text-gray-500">
        <p className="font-medium">Note:</p>
        <p>Once marked as reviewed, this action is recorded in the audit trail and cannot be undone.</p>
      </div>
    </div>
  );
}

// Step 4: File & Confirm Component
function FileConfirmStep({
  filing,
  onMarkFiled,
  onComplete,
}: {
  filing: QuarterlyFiling;
  onMarkFiled: (confirmationNumber: string) => Promise<void>;
  onComplete: (confirmationNumber: string) => void;
}) {
  const [confirmationNumber, setConfirmationNumber] = useState(filing.confirmationNumber || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFiled, setIsFiled] = useState(filing.status === 'filed');

  const handleMarkFiled = async () => {
    if (!confirmationNumber.trim()) return;
    setIsSubmitting(true);
    try {
      await onMarkFiled(confirmationNumber);
      setIsFiled(true);
      onComplete(confirmationNumber);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isFiled) {
    return (
      <div className="space-y-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <div className="text-4xl mb-2">🎉</div>
          <h3 className="font-medium text-green-900 text-lg">Filing Complete!</h3>
          <p className="text-sm text-green-700 mt-2">
            Confirmation Number: <span className="font-mono font-bold">{confirmationNumber}</span>
          </p>
          <p className="text-sm text-green-600">
            Filed: {filing.filedAt ? new Date(filing.filedAt).toLocaleString() : new Date().toLocaleString()}
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-2">What's Next?</h4>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Your filing is now locked and cannot be modified</li>
            <li>• The audit trail has been updated with the filing confirmation</li>
            <li>• Access exported reports from the Audit Log page</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <h3 className="font-medium text-purple-900">File with State Portal</h3>
        <p className="text-sm text-purple-700 mt-1">
          Complete filing through each state's tax portal, then enter the confirmation numbers below.
        </p>
      </div>

      {/* State Portal Links */}
      <div className="bg-white border rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-3">State Tax Portals</h4>
        <div className="space-y-2">
          {filing.jurisdictions.map((j) => (
            <div key={j.stateCode} className="flex items-center justify-between py-2 border-b last:border-0">
              <span className="font-medium">{j.state}</span>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">{formatCurrency(j.taxCollected)}</span>
                <a
                  href={`https://www.${j.stateCode.toLowerCase()}.gov/tax`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary-600 hover:underline"
                >
                  Open Portal →
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Confirmation Number Input */}
      <div className="bg-white border rounded-lg p-6">
        <label htmlFor="confirmation-number" className="block text-sm font-medium text-gray-700 mb-1">
          Filing Confirmation Number
        </label>
        <input
          id="confirmation-number"
          type="text"
          value={confirmationNumber}
          onChange={(e) => setConfirmationNumber(e.target.value)}
          placeholder="e.g., ST-2026-Q1-12345"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 font-mono"
          data-testid="confirmation-number"
        />
        <p className="text-sm text-gray-500 mt-2">
          Enter the confirmation number received after filing with the state portal.
        </p>

        <button
          onClick={handleMarkFiled}
          disabled={!confirmationNumber.trim() || isSubmitting}
          className="mt-4 w-full px-4 py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="mark-filed-btn"
        >
          {isSubmitting ? 'Recording...' : 'Mark as Filed'}
        </button>
      </div>

      <div className="text-sm text-gray-500">
        <p className="font-medium">S-OX Compliance Notice:</p>
        <p>Once filed, this record becomes immutable per Sarbanes-Oxley requirements. Ensure all data is correct before proceeding.</p>
      </div>
    </div>
  );
}

// Main Wizard Component
export function QuarterlyFilingReviewWizard({
  filing,
  onComplete,
  onCancel,
  onExport,
  onMarkReviewed,
  onMarkFiled,
  isOpen,
}: QuarterlyFilingReviewWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps: WizardStep[] = [
    {
      id: 'review',
      title: 'Review Summary',
      description: 'Review jurisdiction breakdown',
    },
    {
      id: 'export',
      title: 'Export Reports',
      description: 'Download CSV/PDF for records',
    },
    {
      id: 'acknowledge',
      title: 'Mark Reviewed',
      description: 'Acknowledge review completion',
    },
    {
      id: 'file',
      title: 'File & Confirm',
      description: 'Enter filing confirmation',
    },
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return <ReviewSummaryStep filing={filing} />;
      case 1:
        return <ExportReportsStep filing={filing} onExport={onExport} />;
      case 2:
        return <MarkReviewedStep filing={filing} onMarkReviewed={onMarkReviewed} />;
      case 3:
        return (
          <FileConfirmStep
            filing={filing}
            onMarkFiled={onMarkFiled}
            onComplete={onComplete}
          />
        );
      default:
        return null;
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return true; // Can always proceed from review
      case 1:
        return true; // Export is optional
      case 2:
        return filing.status !== 'draft'; // Must be reviewed
      case 3:
        return false; // Final step - use complete button
      default:
        return true;
    }
  };

  if (!isOpen) return null;

  return (
    <Wizard
      isOpen={isOpen}
      onClose={onCancel}
      title={`${getQuarterLabel(filing.year, filing.quarter)} Quarterly Filing Review`}
      steps={steps}
      currentStep={currentStep}
      onNext={handleNext}
      onPrevious={handlePrevious}
      showBreadcrumbs
      canProceed={canProceed()}
      isLastStep={currentStep === steps.length - 1}
    >
      {renderStepContent()}

      {/* Audit Trail Section */}
      {filing.auditTrail.length > 0 && (
        <div className="mt-6 pt-6 border-t">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Audit Trail</h4>
          <AuditTrail
            entries={filing.auditTrail.map((entry) => ({
              id: entry.id,
              timestamp: entry.timestamp,
              action: entry.action,
              user: entry.userName,
              details: entry.details,
            }))}
            compact
          />
        </div>
      )}
    </Wizard>
  );
}

export default QuarterlyFilingReviewWizard;

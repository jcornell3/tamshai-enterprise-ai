/**
 * Pay Run Wizard Component - Gusto/ADP-style Payroll Processing
 *
 * Multi-step wizard for creating and processing pay runs.
 * Steps: Pay Period -> Earnings -> Deductions -> Review & Submit
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import { Wizard, type WizardStep, type WizardStepProps, type ValidationResult } from '@tamshai/ui';

// Types for wizard data
interface PayRunWizardData {
  periodStart: string;
  periodEnd: string;
  payDate: string;
  employees: EmployeeEarnings[];
  deductions: DeductionsSummary;
}

interface EmployeeEarnings {
  employee_id: string;
  first_name: string;
  last_name: string;
  department: string;
  salary: number;
  hourly_rate?: number;
  pay_type: 'salary' | 'hourly';
  hours_worked: number;
  overtime_hours?: number;
  gross_pay: number;
}

interface DeductionsSummary {
  federalTax: number;
  stateTax: number;
  socialSecurity: number;
  medicare: number;
  healthInsurance: number;
  retirement401k: number;
  employerContributions: number;
}

// Utility functions
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  const startStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = endDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${startStr} - ${endStr}`;
}

// Step 1: Pay Period Selection
function PayPeriodStep({ data, updateData, errors }: WizardStepProps) {
  const today = new Date();
  const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const defaultEnd = new Date(today.getFullYear(), today.getMonth(), 15)
    .toISOString()
    .split('T')[0];
  const defaultPayDate = new Date(today.getFullYear(), today.getMonth(), 20)
    .toISOString()
    .split('T')[0];

  const periodStart = (data.periodStart as string) ?? defaultStart;
  const periodEnd = (data.periodEnd as string) ?? defaultEnd;
  const payDate = (data.payDate as string) ?? defaultPayDate;

  useEffect(() => {
    if (data.periodStart === undefined) {
      updateData({
        periodStart: defaultStart,
        periodEnd: defaultEnd,
        payDate: defaultPayDate,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getFieldError = (field: string) => errors.find((e) => e.field === field)?.message;

  return (
    <div className="space-y-6">
      <p className="text-secondary-600">
        Select the pay period dates and when employees will be paid.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label
            htmlFor="period-start"
            className="block text-sm font-medium text-secondary-700 mb-1"
          >
            Period Start
          </label>
          <input
            id="period-start"
            data-testid="pay-period-start"
            type="date"
            value={periodStart}
            onChange={(e) => updateData({ periodStart: e.target.value })}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 ${
              getFieldError('periodStart') ? 'border-danger-500' : 'border-secondary-300'
            }`}
          />
          {getFieldError('periodStart') && (
            <p className="mt-1 text-sm text-danger-600">{getFieldError('periodStart')}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="period-end"
            className="block text-sm font-medium text-secondary-700 mb-1"
          >
            Period End
          </label>
          <input
            id="period-end"
            data-testid="pay-period-end"
            type="date"
            value={periodEnd}
            onChange={(e) => updateData({ periodEnd: e.target.value })}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 ${
              getFieldError('periodEnd') ? 'border-danger-500' : 'border-secondary-300'
            }`}
          />
          {getFieldError('periodEnd') && (
            <p className="mt-1 text-sm text-danger-600">{getFieldError('periodEnd')}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="pay-date"
            className="block text-sm font-medium text-secondary-700 mb-1"
          >
            Pay Date
          </label>
          <input
            id="pay-date"
            type="date"
            value={payDate}
            onChange={(e) => updateData({ payDate: e.target.value })}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 ${
              getFieldError('payDate') ? 'border-danger-500' : 'border-secondary-300'
            }`}
          />
          {getFieldError('payDate') && (
            <p className="mt-1 text-sm text-danger-600">{getFieldError('payDate')}</p>
          )}
        </div>
      </div>

      <div className="bg-secondary-50 rounded-lg p-4">
        <h3 className="font-medium text-secondary-900 mb-2">Pay Period Summary</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-secondary-600">Duration:</span>{' '}
            <span className="text-secondary-900">
              {periodStart && periodEnd
                ? `${Math.ceil((new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / (1000 * 60 * 60 * 24)) + 1} days`
                : '-'}
            </span>
          </div>
          <div>
            <span className="text-secondary-600">Pay Date:</span>{' '}
            <span className="text-secondary-900">{payDate ? formatDate(payDate) : '-'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Step 2: Earnings Review
function EarningsStep({ data, updateData }: WizardStepProps) {
  const { getAccessToken } = useAuth();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const { data: employeesData, isLoading } = useQuery({
    queryKey: ['payroll-employees', data.periodStart, data.periodEnd],
    queryFn: async () => {
      const token = await getAccessToken();
      const params = new URLSearchParams({
        period_start: data.periodStart as string,
        period_end: data.periodEnd as string,
      });
      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/payroll/calculate_earnings?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error('Failed to fetch employees');
      const result = await response.json();
      return (result.data as EmployeeEarnings[]) || [];
    },
    enabled: Boolean(data.periodStart && data.periodEnd),
  });

  const resolvedEmployees = employeesData && employeesData.length > 0
    ? employeesData
    : (data.employees as EmployeeEarnings[]) || [];

  // Only update when resolved employees change
  const currentEmployeesJson = JSON.stringify(data.employees || []);
  const resolvedJson = JSON.stringify(resolvedEmployees);

  useEffect(() => {
    if (resolvedJson !== currentEmployeesJson) {
      updateData({ employees: resolvedEmployees });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedJson]);

  const employees = (data.employees as EmployeeEarnings[]) || resolvedEmployees;
  const totalGross = employees.reduce((sum, emp) => sum + emp.gross_pay, 0);

  const editingEmployee = editingIndex !== null ? employees[editingIndex] : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-secondary-500">Loading employee earnings...</p>
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-warning-50 border border-warning-200 rounded-lg p-4 text-center" data-testid="no-earnings-data">
          <p className="font-medium text-warning-800">No employee earnings data available</p>
          <p className="text-sm text-warning-700 mt-1">
            Ensure the payroll service is running and employee data has been loaded for this pay period.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-secondary-600">
        Review employee earnings for this pay period. Verify hours and gross pay are correct.
      </p>

      <div className="bg-white rounded-lg border border-secondary-200 overflow-hidden">
        <table className="min-w-full divide-y divide-secondary-200" data-testid="earnings-table">
          <thead className="bg-secondary-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary-500 uppercase">
                Employee
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary-500 uppercase">
                Department
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary-500 uppercase">
                Type
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-secondary-500 uppercase">
                Hours
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-secondary-500 uppercase">
                Gross Pay
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-secondary-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary-200">
            {employees.map((emp, index) => (
              <tr key={emp.employee_id} className="hover:bg-secondary-50">
                <td className="px-4 py-3 text-sm text-secondary-900">
                  {emp.first_name} {emp.last_name}
                </td>
                <td className="px-4 py-3 text-sm text-secondary-600">{emp.department}</td>
                <td className="px-4 py-3 text-sm text-secondary-600 capitalize">{emp.pay_type}</td>
                <td className="px-4 py-3 text-sm text-secondary-900 text-right">
                  {emp.hours_worked}
                  {emp.overtime_hours ? (
                    <span className="text-warning-600 ml-1">
                      (+{emp.overtime_hours} overtime)
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-secondary-900 text-right">
                  {formatCurrency(emp.gross_pay)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    data-testid={`edit-earnings-${index}`}
                    onClick={() => setEditingIndex(index)}
                    className="text-sm text-primary-600 hover:text-primary-800"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-secondary-100">
            <tr data-testid="total-gross-pay">
              <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-secondary-900">
                Total Gross Pay
              </td>
              <td className="px-4 py-3 text-sm font-bold text-secondary-900 text-right">
                {formatCurrency(totalGross)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-primary-50 rounded-lg p-4">
          <p className="text-sm text-primary-600">Employees</p>
          <p className="text-2xl font-bold text-primary-900">{employees.length}</p>
        </div>
        <div className="bg-success-50 rounded-lg p-4">
          <p className="text-sm text-success-600">Salaried</p>
          <p className="text-2xl font-bold text-success-900">
            {employees.filter((e) => e.pay_type === 'salary').length}
          </p>
        </div>
        <div className="bg-warning-50 rounded-lg p-4">
          <p className="text-sm text-warning-600">Hourly</p>
          <p className="text-2xl font-bold text-warning-900">
            {employees.filter((e) => e.pay_type === 'hourly').length}
          </p>
        </div>
      </div>

      {/* Edit Earnings Dialog */}
      {editingEmployee && (
        <div
          data-testid="edit-earnings-dialog"
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        >
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-secondary-900 mb-4">
              Edit Earnings — {editingEmployee.first_name} {editingEmployee.last_name}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Hours Worked
                </label>
                <input
                  type="number"
                  defaultValue={editingEmployee.hours_worked}
                  className="w-full px-3 py-2 border border-secondary-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Overtime Hours
                </label>
                <input
                  type="number"
                  defaultValue={editingEmployee.overtime_hours || 0}
                  className="w-full px-3 py-2 border border-secondary-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditingIndex(null)}
                className="px-4 py-2 text-secondary-600 hover:bg-secondary-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => setEditingIndex(null)}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Step 3: Deductions & Taxes
function DeductionsStep({ data, updateData }: WizardStepProps) {
  const employees = (data.employees as EmployeeEarnings[]) || [];
  const totalGross = employees.reduce((sum, emp) => sum + emp.gross_pay, 0);

  // Calculate estimated deductions (simplified calculation)
  const deductions: DeductionsSummary = {
    federalTax: totalGross * 0.22, // 22% federal bracket
    stateTax: totalGross * 0.05, // 5% average state
    socialSecurity: Math.min(totalGross * 0.062, 10453), // 6.2% up to cap
    medicare: totalGross * 0.0145, // 1.45%
    healthInsurance: employees.length * 250, // $250 per employee avg
    retirement401k: totalGross * 0.06, // 6% average contribution
    employerContributions: totalGross * 0.0765 + employees.length * 125, // Employer FICA + 401k match
  };

  // Only update deductions when gross/count changes
  const deductionsKey = `${totalGross}-${employees.length}`;
  useEffect(() => {
    updateData({ deductions });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deductionsKey]);

  const totalDeductions =
    deductions.federalTax +
    deductions.stateTax +
    deductions.socialSecurity +
    deductions.medicare +
    deductions.healthInsurance +
    deductions.retirement401k;

  return (
    <div className="space-y-6">
      <p className="text-secondary-600">
        Review tax withholdings and benefit deductions for this pay period.
      </p>

      {/* Tax Withholdings */}
      <div className="bg-white rounded-lg border border-secondary-200 p-4" data-testid="tax-withholdings-table">
        <h3 className="font-semibold text-secondary-900 mb-4">Tax Withholdings</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-secondary-100">
            <span className="text-secondary-700">Federal Income Tax</span>
            <span className="font-medium text-secondary-900">
              {formatCurrency(deductions.federalTax)}
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-secondary-100">
            <span className="text-secondary-700">State Income Tax</span>
            <span className="font-medium text-secondary-900">
              {formatCurrency(deductions.stateTax)}
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-secondary-100">
            <span className="text-secondary-700">FICA — Social Security (6.2%)</span>
            <span className="font-medium text-secondary-900">
              {formatCurrency(deductions.socialSecurity)}
            </span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-secondary-700">FICA — Medicare (1.45%)</span>
            <span className="font-medium text-secondary-900">
              {formatCurrency(deductions.medicare)}
            </span>
          </div>
        </div>
      </div>

      {/* Benefits Deductions */}
      <div className="bg-white rounded-lg border border-secondary-200 p-4">
        <h3 className="font-semibold text-secondary-900 mb-4">Benefits Deductions</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-secondary-100">
            <span className="text-secondary-700">Health Insurance</span>
            <span className="font-medium text-secondary-900">
              {formatCurrency(deductions.healthInsurance)}
            </span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-secondary-700">401(k) Contributions</span>
            <span className="font-medium text-secondary-900">
              {formatCurrency(deductions.retirement401k)}
            </span>
          </div>
        </div>
      </div>

      {/* Employer Contributions */}
      <div className="bg-primary-50 rounded-lg border border-primary-200 p-4">
        <h3 className="font-semibold text-primary-900 mb-4">Employer Contributions</h3>
        <p className="text-sm text-primary-600 mb-2">
          In addition to employee deductions, the company contributes:
        </p>
        <div className="flex justify-between items-center py-2">
          <span className="text-primary-700">FICA Match + 401(k) Match</span>
          <span className="font-bold text-primary-900">
            {formatCurrency(deductions.employerContributions)}
          </span>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-secondary-100 rounded-lg p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-semibold text-secondary-900">Total Employee Deductions</span>
          <span className="font-bold text-xl text-secondary-900">
            {formatCurrency(totalDeductions)}
          </span>
        </div>
        <div className="flex justify-between items-center pt-3 border-t border-secondary-300" data-testid="total-net-pay">
          <span className="font-semibold text-secondary-900">Estimated Net Pay</span>
          <span className="font-bold text-xl text-primary-900">
            {formatCurrency(totalGross - totalDeductions)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Step 4: Review & Submit
function ReviewStep({ data }: WizardStepProps) {
  const periodStart = data.periodStart as string;
  const periodEnd = data.periodEnd as string;
  const payDate = data.payDate as string;
  const employees = (data.employees as EmployeeEarnings[]) || [];
  const deductions = (data.deductions as DeductionsSummary) || {
    federalTax: 0,
    stateTax: 0,
    socialSecurity: 0,
    medicare: 0,
    healthInsurance: 0,
    retirement401k: 0,
    employerContributions: 0,
  };

  const totalGross = employees.reduce((sum, emp) => sum + emp.gross_pay, 0);
  const totalDeductions =
    deductions.federalTax +
    deductions.stateTax +
    deductions.socialSecurity +
    deductions.medicare +
    deductions.healthInsurance +
    deductions.retirement401k;
  const totalNet = totalGross - totalDeductions;

  return (
    <div className="space-y-6" data-testid="payroll-summary">
      <p className="text-secondary-600">
        Review the pay run summary before processing. Once submitted, payroll will be processed.
      </p>

      {employees.length === 0 && (
        <div className="bg-warning-50 border border-warning-200 rounded-lg p-4" data-testid="no-employees-warning">
          <p className="font-medium text-warning-800">No employee earnings data available</p>
          <p className="text-sm text-warning-700">
            Ensure the payroll service is running and employee data has been loaded.
          </p>
        </div>
      )}

      {/* Pay Period Info */}
      <div className="bg-white rounded-lg border border-secondary-200 p-4">
        <h3 className="font-semibold text-secondary-900 mb-4">Pay Period</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-secondary-600">Period</p>
            <p className="font-medium text-secondary-900">
              {periodStart && periodEnd ? formatDateRange(periodStart, periodEnd) : '-'}
            </p>
          </div>
          <div>
            <p className="text-sm text-secondary-600">Pay Date</p>
            <p className="font-medium text-secondary-900">
              {payDate ? formatDate(payDate) : '-'}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-secondary-50 rounded-lg p-4">
          <p className="text-sm text-secondary-600">Employees</p>
          <p className="text-2xl font-bold text-secondary-900">{employees.length} employees</p>
        </div>
        <div className="bg-success-50 rounded-lg p-4">
          <p className="text-sm text-success-600">Gross Pay</p>
          <p className="text-2xl font-bold text-success-900">{formatCurrency(totalGross)}</p>
        </div>
        <div className="bg-warning-50 rounded-lg p-4">
          <p className="text-sm text-warning-600">Total Deductions</p>
          <p className="text-2xl font-bold text-warning-900">{formatCurrency(totalDeductions)}</p>
        </div>
        <div className="bg-primary-50 rounded-lg p-4">
          <p className="text-sm text-primary-600">Net Pay</p>
          <p className="text-2xl font-bold text-primary-900">{formatCurrency(totalNet)}</p>
        </div>
      </div>

      {/* Deductions Breakdown */}
      <div className="bg-white rounded-lg border border-secondary-200 p-4">
        <h3 className="font-semibold text-secondary-900 mb-4">Deductions Breakdown</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex justify-between">
            <span className="text-secondary-600">Federal Tax:</span>
            <span className="text-secondary-900">{formatCurrency(deductions.federalTax)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary-600">State Tax:</span>
            <span className="text-secondary-900">{formatCurrency(deductions.stateTax)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary-600">Social Security:</span>
            <span className="text-secondary-900">{formatCurrency(deductions.socialSecurity)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary-600">Medicare:</span>
            <span className="text-secondary-900">{formatCurrency(deductions.medicare)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary-600">Health Insurance:</span>
            <span className="text-secondary-900">{formatCurrency(deductions.healthInsurance)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary-600">401(k):</span>
            <span className="text-secondary-900">{formatCurrency(deductions.retirement401k)}</span>
          </div>
        </div>
      </div>

      {/* Warning */}
      <div className="bg-warning-50 border border-warning-200 rounded-lg p-4 flex items-start gap-3">
        <svg
          className="w-5 h-5 text-warning-500 flex-shrink-0 mt-0.5"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        <div>
          <p className="font-medium text-warning-800">Confirm before processing</p>
          <p className="text-sm text-warning-700">
            Once you click "Submit Payroll", the pay run will be submitted for processing. Direct
            deposits will be initiated on the pay date.
          </p>
        </div>
      </div>
    </div>
  );
}

// Validation functions
function validatePayPeriod(data: Record<string, unknown>): ValidationResult {
  const errors: { field: string; message: string }[] = [];

  if (!data.periodStart) {
    errors.push({ field: 'periodStart', message: 'Pay period start date is required' });
  }
  if (!data.periodEnd) {
    errors.push({ field: 'periodEnd', message: 'Pay period end date is required' });
  }
  if (!data.payDate) {
    errors.push({ field: 'payDate', message: 'Pay date is required' });
  }

  if (data.periodStart && data.periodEnd) {
    const start = new Date(data.periodStart as string);
    const end = new Date(data.periodEnd as string);
    if (end <= start) {
      errors.push({ field: 'periodEnd', message: 'End date must be after start date' });
    }
  }

  return { valid: errors.length === 0, errors };
}

// Main Wizard Component
export default function PayRunWizard() {
  const navigate = useNavigate();
  const { getAccessToken } = useAuth();
  const [searchParams] = useSearchParams();
  const [showConfirmation, setShowConfirmation] = useState(false);
  const confirmResolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const simulateMissingSsn = searchParams.get('simulate') === 'missing-ssn';

  const steps: WizardStep[] = [
    {
      id: 'pay-period',
      title: 'Pay Period',
      description: 'Select the pay period dates',
      component: PayPeriodStep,
      validate: validatePayPeriod,
    },
    {
      id: 'earnings',
      title: 'Earnings',
      description: 'Review employee earnings',
      component: EarningsStep,
    },
    {
      id: 'deductions',
      title: 'Deductions',
      description: 'Review taxes and deductions',
      component: DeductionsStep,
    },
    {
      id: 'review',
      title: 'Review',
      description: 'Review and submit pay run',
      component: ReviewStep,
    },
  ];

  const handleComplete = useCallback(
    async (data: Record<string, unknown>) => {
      // Show confirmation dialog and wait for user response
      setShowConfirmation(true);

      const confirmed = await new Promise<boolean>((resolve) => {
        confirmResolveRef.current = resolve;
      });

      setShowConfirmation(false);

      if (!confirmed) return;

      // User confirmed — submit the pay run
      const token = await getAccessToken();

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/payroll/create_pay_run`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            period_start: data.periodStart,
            period_end: data.periodEnd,
            pay_date: data.payDate,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to create pay run');
      }

      navigate('/pay-runs');
    },
    [getAccessToken, navigate]
  );

  const handleCancel = useCallback(() => {
    navigate('/pay-runs');
  }, [navigate]);

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Critical error for simulation */}
      {simulateMissingSsn && (
        <div
          data-testid="critical-error"
          className="mb-4 p-4 bg-danger-50 border border-danger-200 rounded-lg"
        >
          <p className="font-medium text-danger-800">Missing SSN</p>
          <p className="text-sm text-danger-700">
            Some employees are missing Social Security numbers. Resolve before processing payroll.
          </p>
        </div>
      )}

      <Wizard
        steps={steps}
        title="New Pay Run"
        showBreadcrumbs
        onComplete={handleComplete}
        onCancel={handleCancel}
        submitLabel="Submit Payroll"
        submittingLabel="Processing..."
        submitDisabled={simulateMissingSsn}
      />

      {/* Confirmation Dialog */}
      {showConfirmation && (
        <div
          data-testid="confirm-payroll-dialog"
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        >
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-secondary-900 mb-2">Confirm Payroll</h3>
            <p className="text-secondary-600 mb-6">
              Are you sure you want to process this payroll? Direct deposits will be initiated
              on the scheduled pay date.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => confirmResolveRef.current?.(false)}
                className="px-4 py-2 text-secondary-600 hover:bg-secondary-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                data-testid="confirm-submit"
                onClick={() => confirmResolveRef.current?.(true)}
                className="px-4 py-2 bg-success-500 text-white rounded-lg hover:bg-success-600"
              >
                Confirm &amp; Process
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth, canModifyHR, apiConfig } from '@tamshai/auth';
import { ApprovalCard, TruncationWarning } from '@tamshai/ui';
import type { Employee, APIResponse } from '../types';

/**
 * Employee Directory Page
 *
 * Features:
 * - Employee table with role-based field masking
 * - Salary column visible only to hr-write users
 * - Delete employee with v1.4 confirmation flow
 * - Truncation warnings for 50+ records
 * - Search/filter by department
 */
export default function EmployeeDirectoryPage() {
  const { userContext, getAccessToken } = useAuth();
  const queryClient = useQueryClient();
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    confirmationId: string;
    message: string;
    employee: Employee;
  } | null>(null);

  const canWrite = canModifyHR(userContext);

  // Fetch all employees (auto-paginate to get complete results)
  const { data: employeesResponse, isLoading, error } = useQuery({
    queryKey: ['employees', departmentFilter],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      // Helper to build URL with cursor support
      const buildUrl = (cursor?: string): string => {
        const params = new URLSearchParams();
        if (departmentFilter) params.append('department', departmentFilter);
        if (cursor) params.append('cursor', cursor);

        const queryString = params.toString();
        if (apiConfig.mcpGatewayUrl) {
          return `${apiConfig.mcpGatewayUrl}/api/mcp/hr/list_employees${queryString ? '?' + queryString : ''}`;
        } else {
          return `/api/mcp/hr/list_employees${queryString ? '?' + queryString : ''}`;
        }
      };

      // Fetch all pages automatically
      const allEmployees: Employee[] = [];
      let cursor: string | undefined = undefined;
      let pageCount = 0;
      const maxPages = 10; // Safety limit to prevent infinite loops

      do {
        const response = await fetch(buildUrl(cursor), {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch employees');
        }

        const pageData = await response.json() as APIResponse<Employee[]>;

        if (pageData.data) {
          allEmployees.push(...pageData.data);
        }

        // Get next cursor if more pages exist
        cursor = pageData.metadata?.hasMore ? pageData.metadata.nextCursor : undefined;
        pageCount++;

      } while (cursor && pageCount < maxPages);

      // Return combined results (no truncation for UI)
      return {
        status: 'success' as const,
        data: allEmployees,
        metadata: {
          hasMore: false, // All data fetched
          returnedCount: allEmployees.length,
          totalEstimate: allEmployees.length.toString(),
        }
      } as APIResponse<Employee[]>;
    },
  });

  // Delete employee mutation
  const deleteEmployeeMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/hr/delete_employee`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ employeeId }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete employee');
      }

      return response.json() as Promise<APIResponse<any>>;
    },
    onSuccess: (data) => {
      if (data.status === 'pending_confirmation') {
        // Show approval card
        const employee = employeesResponse?.data?.find(
          (e) => e.employee_id === data.confirmationId
        );
        setPendingConfirmation({
          confirmationId: data.confirmationId!,
          message: data.message || 'Delete employee?',
          employee: employee!,
        });
      } else {
        // Success - refresh list
        queryClient.invalidateQueries({ queryKey: ['employees'] });
      }
    },
  });

  const handleDelete = (employee: Employee) => {
    if (confirm(`Delete employee ${employee.first_name} ${employee.last_name}?`)) {
      deleteEmployeeMutation.mutate(employee.employee_id);
    }
  };

  const handleConfirmationComplete = (success: boolean) => {
    setPendingConfirmation(null);
    if (success) {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    }
  };

  const employees = employeesResponse?.data || [];
  // Use hasMore from cursor-based pagination (or legacy truncated field)
  const isTruncated = employeesResponse?.metadata?.hasMore || employeesResponse?.metadata?.truncated || false;

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Employee Directory</h2>
        <p className="page-subtitle">
          View and manage employee information
          {!canWrite && ' (read-only access)'}
        </p>
      </div>

      {/* Pending Confirmation */}
      {pendingConfirmation && (
        <div className="mb-6">
          <ApprovalCard
            confirmationId={pendingConfirmation.confirmationId}
            message={pendingConfirmation.message}
            confirmationData={{
              action: 'delete_employee',
              employeeName: `${pendingConfirmation.employee.first_name} ${pendingConfirmation.employee.last_name}`,
              employeeEmail: pendingConfirmation.employee.work_email,
              department: pendingConfirmation.employee.department,
            }}
            onComplete={handleConfirmationComplete}
          />
        </div>
      )}

      {/* Pagination Info (More Records Available) */}
      {isTruncated && employeesResponse?.metadata && (
        <div className="mb-6">
          <TruncationWarning
            message="More employees exist in the database than can be shown on one page."
            returnedCount={employeesResponse.metadata.returnedCount || 50}
            totalEstimate={employeesResponse.metadata.totalEstimate || employeesResponse.metadata.totalCount || '50+'}
          />
        </div>
      )}

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-secondary-700 mb-1">
              Filter by Department
            </label>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="input"
            >
              <option value="">All Departments</option>
              <option value="Engineering">Engineering</option>
              <option value="Sales">Sales</option>
              <option value="Marketing">Marketing</option>
              <option value="Finance">Finance</option>
              <option value="HR">HR</option>
            </select>
          </div>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['employees'] })}
            className="btn-secondary"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Employee Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center">
            <div className="spinner mb-4"></div>
            <p className="text-secondary-600">Loading employees...</p>
          </div>
        ) : error ? (
          <div className="alert-danger">
            <p className="font-medium">Error loading employees</p>
            <p className="text-sm">{String(error)}</p>
          </div>
        ) : employees.length === 0 ? (
          <div className="py-12 text-center text-secondary-600">
            <p>No employees found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="table-header">Name</th>
                  <th className="table-header">Email</th>
                  <th className="table-header">Department</th>
                  <th className="table-header">Title</th>
                  <th className="table-header">Status</th>
                  {canWrite && <th className="table-header">Salary</th>}
                  {canWrite && <th className="table-header">Actions</th>}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-secondary-200">
                {employees.map((employee) => (
                  <tr key={employee.id} className="table-row">
                    <td className="table-cell font-medium">
                      {employee.first_name} {employee.last_name}
                    </td>
                    <td className="table-cell text-secondary-600">
                      {employee.work_email}
                    </td>
                    <td className="table-cell">
                      <span className="badge-primary">{employee.department}</span>
                    </td>
                    <td className="table-cell text-secondary-600">
                      {employee.job_title}
                    </td>
                    <td className="table-cell">
                      <span
                        className={
                          employee.employment_status === 'active'
                            ? 'badge-success'
                            : 'badge-danger'
                        }
                      >
                        {employee.employment_status}
                      </span>
                    </td>
                    {canWrite && (
                      <td className="table-cell font-medium">
                        {employee.salary
                          ? `$${employee.salary.toLocaleString()}`
                          : '***'}
                      </td>
                    )}
                    {canWrite && (
                      <td className="table-cell">
                        <button
                          onClick={() => handleDelete(employee)}
                          disabled={deleteEmployeeMutation.isPending}
                          className="text-danger-600 hover:text-danger-700 text-sm font-medium disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="mt-6 text-sm text-secondary-600 text-center">
        Showing {employees.length} employee{employees.length !== 1 ? 's' : ''}
        {departmentFilter && ` in ${departmentFilter}`}
      </div>
    </div>
  );
}

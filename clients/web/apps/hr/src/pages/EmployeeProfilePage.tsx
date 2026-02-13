import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig, canModifyHR } from '@tamshai/auth';
import type { Employee, TimeOffBalance, TimeOffRequest, APIResponse } from '../types';

/**
 * Employee Profile Page
 *
 * Features:
 * - Detailed employee information with tabs
 * - Overview, Employment, Time Off, Documents tabs
 * - Self-service for own profile
 * - Edit capabilities for hr-write users
 */
export default function EmployeeProfilePage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { userContext, getAccessToken } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'employment' | 'timeoff' | 'documents'>('overview');

  const canWrite = canModifyHR(userContext);
  const isOwnProfile = userContext?.userId === employeeId;

  // Fetch employee data
  const { data: employeeResponse, isLoading, error } = useQuery({
    queryKey: ['employee', employeeId],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/hr/get_employee?employeeId=${employeeId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (!response.ok) throw new Error('Failed to fetch employee');
      return response.json() as Promise<APIResponse<Employee>>;
    },
    enabled: !!employeeId,
  });

  // Fetch time-off balances (for own profile or hr users)
  const { data: balancesResponse } = useQuery({
    queryKey: ['employee-balances', employeeId],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/hr/get_time_off_balances?employeeId=${employeeId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (!response.ok) throw new Error('Failed to fetch balances');
      return response.json() as Promise<APIResponse<TimeOffBalance[]>>;
    },
    enabled: !!employeeId && (isOwnProfile || canWrite) && activeTab === 'timeoff',
  });

  // Fetch time-off requests
  const { data: requestsResponse } = useQuery({
    queryKey: ['employee-requests', employeeId],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/hr/list_time_off_requests?employeeId=${employeeId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (!response.ok) throw new Error('Failed to fetch requests');
      return response.json() as Promise<APIResponse<TimeOffRequest[]>>;
    },
    enabled: !!employeeId && (isOwnProfile || canWrite) && activeTab === 'timeoff',
  });

  const employee = employeeResponse?.data;
  const balances = balancesResponse?.data || [];
  const requests = requestsResponse?.data || [];

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="py-12 text-center">
          <div className="spinner mb-4"></div>
          <p className="text-secondary-600">Loading employee profile...</p>
        </div>
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="page-container">
        <div className="alert-danger">
          <p className="font-medium">Error loading employee</p>
          <p className="text-sm">{error ? String(error) : 'Employee not found'}</p>
        </div>
        <Link to="/" className="btn-secondary mt-4">
          Back to Directory
        </Link>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm mb-6">
        <Link to="/" className="text-secondary-500 hover:text-primary-600">
          Employee Directory
        </Link>
        <svg className="w-4 h-4 text-secondary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-secondary-900 font-medium">{employee.first_name} {employee.last_name}</span>
      </nav>

      {/* Profile Header */}
      <div className="card mb-6">
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="w-24 h-24 rounded-full bg-secondary-200 flex items-center justify-center overflow-hidden flex-shrink-0">
            {employee.profile_photo_url ? (
              <img
                src={employee.profile_photo_url}
                alt={`${employee.first_name} ${employee.last_name}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-4xl font-bold text-secondary-400">
                {employee.first_name.charAt(0)}{employee.last_name.charAt(0)}
              </span>
            )}
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-secondary-900">
                  {employee.first_name} {employee.last_name}
                </h2>
                <p className="text-lg text-secondary-600">{employee.job_title}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="badge-primary">{employee.department}</span>
                  <span className={`badge-${employee.employment_status === 'active' ? 'success' : 'danger'}`}>
                    {employee.employment_status}
                  </span>
                </div>
              </div>
              {canWrite && (
                <button className="btn-secondary">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
              )}
            </div>

            {/* Quick Info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-secondary-200">
              <div>
                <p className="text-xs text-secondary-500 uppercase tracking-wide">Email</p>
                <a href={`mailto:${employee.work_email}`} className="text-primary-600 hover:underline">
                  {employee.work_email}
                </a>
              </div>
              {employee.phone && (
                <div>
                  <p className="text-xs text-secondary-500 uppercase tracking-wide">Phone</p>
                  <p className="text-secondary-900">{employee.phone}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-secondary-500 uppercase tracking-wide">Location</p>
                <p className="text-secondary-900">{employee.location || employee.state || 'Not specified'}</p>
              </div>
              <div>
                <p className="text-xs text-secondary-500 uppercase tracking-wide">Hire Date</p>
                <p className="text-secondary-900">{new Date(employee.hire_date).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-secondary-200">
        {(['overview', 'employment', 'timeoff', 'documents'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-medium text-sm border-b-2 -mb-px capitalize ${
              activeTab === tab
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-secondary-600 hover:text-secondary-900'
            }`}
            disabled={tab === 'timeoff' && !isOwnProfile && !canWrite}
          >
            {tab === 'timeoff' ? 'Time Off' : tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Basic Info */}
          <div className="card">
            <h3 className="text-lg font-semibold text-secondary-900 mb-4">Basic Information</h3>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-secondary-500">Full Name</dt>
                <dd className="text-secondary-900 font-medium">{employee.first_name} {employee.last_name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-secondary-500">Employee ID</dt>
                <dd className="text-secondary-900 font-mono">{employee.employee_id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-secondary-500">Email</dt>
                <dd className="text-secondary-900">{employee.work_email}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-secondary-500">Phone</dt>
                <dd className="text-secondary-900">{employee.phone || 'Not provided'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-secondary-500">Location</dt>
                <dd className="text-secondary-900">{employee.location || employee.state || 'Not specified'}</dd>
              </div>
            </dl>
          </div>

          {/* Work Info */}
          <div className="card">
            <h3 className="text-lg font-semibold text-secondary-900 mb-4">Work Information</h3>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-secondary-500">Job Title</dt>
                <dd className="text-secondary-900 font-medium">{employee.job_title}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-secondary-500">Department</dt>
                <dd className="text-secondary-900">{employee.department}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-secondary-500">Status</dt>
                <dd>
                  <span className={`badge-${employee.employment_status === 'active' ? 'success' : 'danger'}`}>
                    {employee.employment_status}
                  </span>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-secondary-500">Hire Date</dt>
                <dd className="text-secondary-900">{new Date(employee.hire_date).toLocaleDateString()}</dd>
              </div>
              {employee.manager_id && (
                <div className="flex justify-between">
                  <dt className="text-secondary-500">Manager</dt>
                  <dd>
                    <Link to={`/employees/${employee.manager_id}`} className="text-primary-600 hover:underline">
                      View Manager
                    </Link>
                  </dd>
                </div>
              )}
              {canWrite && employee.salary && (
                <div className="flex justify-between">
                  <dt className="text-secondary-500">Salary</dt>
                  <dd className="text-secondary-900 font-medium">${employee.salary.toLocaleString()}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}

      {activeTab === 'employment' && (
        <div className="card">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">Employment History</h3>
          <p className="text-secondary-500">Employment history timeline will be displayed here.</p>
          {/* Placeholder for employment history */}
          <div className="mt-4 border-l-2 border-secondary-200 pl-4 space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-primary-500 -ml-[1.4rem]" />
                <p className="font-medium text-secondary-900">{employee.job_title}</p>
              </div>
              <p className="text-sm text-secondary-500 ml-1">
                {new Date(employee.hire_date).toLocaleDateString()} - Present
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'timeoff' && (isOwnProfile || canWrite) && (
        <div className="space-y-6">
          {/* Balances */}
          <div className="card">
            <h3 className="text-lg font-semibold text-secondary-900 mb-4">Time-Off Balances</h3>
            {balances.length === 0 ? (
              <p className="text-secondary-500">No balance data available.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {balances.map((balance) => (
                  <div key={balance.type_code} className="p-4 bg-secondary-50 rounded-lg">
                    <p className="text-sm font-medium text-secondary-500 uppercase tracking-wide">
                      {balance.type_name}
                    </p>
                    <p className="text-2xl font-bold text-secondary-900 mt-1">
                      {balance.available} days
                    </p>
                    <div className="mt-2 w-full bg-secondary-200 rounded-full h-2">
                      <div
                        className="bg-primary-500 h-2 rounded-full"
                        style={{ width: `${Math.min(100, (balance.available / (balance.entitlement || balance.annual_entitlement || 1)) * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-secondary-500 mt-1">
                      of {balance.entitlement || balance.annual_entitlement} annual days
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Requests */}
          <div className="card">
            <h3 className="text-lg font-semibold text-secondary-900 mb-4">Recent Requests</h3>
            {requests.length === 0 ? (
              <p className="text-secondary-500">No requests found.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th className="table-header">Type</th>
                    <th className="table-header">Dates</th>
                    <th className="table-header text-center">Days</th>
                    <th className="table-header">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-secondary-200">
                  {requests.slice(0, 5).map((request) => (
                    <tr key={request.request_id} className="table-row">
                      <td className="table-cell">{request.type_name}</td>
                      <td className="table-cell">
                        {new Date(request.start_date).toLocaleDateString()} - {new Date(request.end_date).toLocaleDateString()}
                      </td>
                      <td className="table-cell text-center">{request.total_days}</td>
                      <td className="table-cell">
                        <span className={`badge-${
                          request.status === 'approved' ? 'success' :
                          request.status === 'rejected' ? 'danger' :
                          request.status === 'pending' ? 'warning' :
                          'secondary'
                        }`}>
                          {request.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="card">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">Documents</h3>
          <p className="text-secondary-500">Employee documents (W-4, I-9, offer letter, etc.) will be displayed here.</p>
          {/* Placeholder for document list */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between p-3 bg-secondary-50 rounded-lg">
              <div className="flex items-center gap-3">
                <svg className="w-8 h-8 text-secondary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div>
                  <p className="font-medium text-secondary-900">W-4 Tax Withholding</p>
                  <p className="text-sm text-secondary-500">Last updated: Jan 15, 2024</p>
                </div>
              </div>
              <button className="btn-secondary text-sm">View</button>
            </div>
            <div className="flex items-center justify-between p-3 bg-secondary-50 rounded-lg">
              <div className="flex items-center gap-3">
                <svg className="w-8 h-8 text-secondary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div>
                  <p className="font-medium text-secondary-900">I-9 Employment Verification</p>
                  <p className="text-sm text-secondary-500">Completed: {new Date(employee.hire_date).toLocaleDateString()}</p>
                </div>
              </div>
              <button className="btn-secondary text-sm">View</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

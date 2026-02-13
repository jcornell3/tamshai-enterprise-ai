import { useCustomerAuth } from '../auth';

export default function SettingsPage() {
  const { customerProfile, organizationName, isLeadContact } = useCustomerAuth();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* Profile section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h2>
        <div className="space-y-4">
          <div className="flex items-center">
            <div className="h-16 w-16 rounded-full bg-primary-100 flex items-center justify-center">
              <span className="text-xl font-medium text-primary-700">
                {customerProfile?.firstName?.[0]}
                {customerProfile?.lastName?.[0]}
              </span>
            </div>
            <div className="ml-4">
              <p className="text-lg font-medium text-gray-900">{customerProfile?.name}</p>
              <p className="text-sm text-gray-500">{customerProfile?.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
            <div>
              <p className="text-xs text-gray-500 uppercase">Organization</p>
              <p className="text-sm font-medium text-gray-900">{organizationName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Role</p>
              <p className="text-sm font-medium text-gray-900">
                {isLeadContact ? 'Lead Contact' : 'Basic Contact'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Organization ID</p>
              <p className="text-sm font-mono text-gray-600">
                {customerProfile?.organizationId}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">User ID</p>
              <p className="text-sm font-mono text-gray-600 truncate">
                {customerProfile?.userId}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Notification preferences placeholder */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Notification Preferences</h2>
        <div className="space-y-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              defaultChecked
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 rounded"
            />
            <span className="ml-3 text-sm text-gray-700">
              Email me when a ticket is updated
            </span>
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              defaultChecked
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 rounded"
            />
            <span className="ml-3 text-sm text-gray-700">
              Email me when a ticket is resolved
            </span>
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 rounded"
            />
            <span className="ml-3 text-sm text-gray-700">
              Weekly summary of open tickets
            </span>
          </label>
        </div>
        <p className="mt-4 text-xs text-gray-500">
          Notification preferences coming soon.
        </p>
      </div>

      {/* Security section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Security</h2>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-900">Change Password</h3>
            <p className="text-sm text-gray-500 mt-1">
              To change your password, please use the "Forgot Password" option on the login page.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-900">Two-Factor Authentication</h3>
            <p className="text-sm text-gray-500 mt-1">
              Two-factor authentication can be enabled from your account security settings.
            </p>
          </div>
        </div>
      </div>

      {/* Help section */}
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <h2 className="text-lg font-semibold text-gray-900">Need Help?</h2>
        <p className="mt-2 text-gray-600">
          If you have questions about your account settings, contact support.
        </p>
        <a
          href="/tickets/new"
          className="mt-4 inline-flex items-center px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700"
        >
          Contact Support
        </a>
      </div>
    </div>
  );
}

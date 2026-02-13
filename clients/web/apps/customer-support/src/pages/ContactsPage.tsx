import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCustomerAuth } from '../auth';
import { apiConfig } from '../auth/config';

interface Contact {
  contact_id: string;
  keycloak_user_id: string;
  organization_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: 'lead' | 'basic';
  title?: string;
  status?: string;
  created_at: string;
}

export default function ContactsPage() {
  const { accessToken, organizationName, customerProfile } = useCustomerAuth();
  const queryClient = useQueryClient();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [transferTarget, setTransferTarget] = useState<Contact | null>(null);

  const { data: contacts, isLoading, error } = useQuery({
    queryKey: ['orgContacts'],
    queryFn: async () => {
      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/support/tools/customer_list_contacts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({}),
        }
      );
      if (!response.ok) throw new Error('Failed to fetch contacts');
      const result = await response.json();
      return result.data as Contact[];
    },
    enabled: !!accessToken,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organization Contacts</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage contacts for {organizationName}
          </p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="inline-flex items-center px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Invite Contact
        </button>
      </div>

      {/* Contacts list */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">
            Failed to load contacts. Please try again.
          </div>
        ) : !contacts || contacts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No contacts found
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {contacts.map((contact) => (
                <tr key={contact.contact_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="h-10 w-10 flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                          <span className="text-sm font-medium text-primary-700">
                            {contact.first_name[0]}{contact.last_name[0]}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {contact.first_name} {contact.last_name}
                          {contact.keycloak_user_id === customerProfile?.userId && (
                            <span className="ml-2 text-xs text-gray-500">(You)</span>
                          )}
                        </div>
                        {contact.title && (
                          <div className="text-sm text-gray-500">{contact.title}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {contact.email}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        contact.role === 'lead'
                          ? 'bg-primary-100 text-primary-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {contact.role === 'lead' ? 'Lead Contact' : 'Basic'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        contact.status === 'invited'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {contact.status || 'Active'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {contact.keycloak_user_id !== customerProfile?.userId &&
                      contact.role !== 'lead' && (
                        <button
                          className="text-sm text-primary-600 hover:text-primary-800"
                          onClick={() => setTransferTarget(contact)}
                        >
                          Make Lead
                        </button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <InviteContactModal
          accessToken={accessToken || ''}
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => {
            setShowInviteModal(false);
            queryClient.invalidateQueries({ queryKey: ['orgContacts'] });
          }}
        />
      )}

      {/* Transfer Lead Modal */}
      {transferTarget && (
        <TransferLeadModal
          accessToken={accessToken || ''}
          targetContact={transferTarget}
          currentUserName={`${customerProfile?.firstName || ''} ${customerProfile?.lastName || ''}`.trim() || 'You'}
          onClose={() => setTransferTarget(null)}
          onSuccess={() => {
            setTransferTarget(null);
            queryClient.invalidateQueries({ queryKey: ['orgContacts'] });
          }}
        />
      )}
    </div>
  );
}

interface InviteModalProps {
  accessToken: string;
  onClose: () => void;
  onSuccess: () => void;
}

// Transfer Lead Modal Component
interface TransferLeadModalProps {
  accessToken: string;
  targetContact: Contact;
  currentUserName: string;
  onClose: () => void;
  onSuccess: () => void;
}

function TransferLeadModal({
  accessToken,
  targetContact,
  currentUserName,
  onClose,
  onSuccess,
}: TransferLeadModalProps) {
  const [step, setStep] = useState<'confirm' | 'pending' | 'success' | 'error'>('confirm');
  const [confirmationId, setConfirmationId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Step 1: Initiate transfer (returns pending_confirmation)
  const initiateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/support/tools/customer_transfer_lead`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            newLeadUserId: targetContact.keycloak_user_id,
          }),
        }
      );
      if (!response.ok) throw new Error('Failed to initiate transfer');
      return response.json();
    },
    onSuccess: (data) => {
      if (data.status === 'pending_confirmation') {
        setConfirmationId(data.confirmationId);
        setStep('pending');
      } else if (data.status === 'success') {
        setStep('success');
        setTimeout(onSuccess, 1500);
      } else {
        setError(data.message || 'Transfer failed');
        setStep('error');
      }
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to initiate transfer');
      setStep('error');
    },
  });

  // Step 2: Confirm the transfer
  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!confirmationId) throw new Error('No confirmation ID');
      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/confirm/${confirmationId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ approved: true }),
        }
      );
      if (!response.ok) throw new Error('Failed to confirm transfer');
      return response.json();
    },
    onSuccess: () => {
      setStep('success');
      setTimeout(onSuccess, 1500);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to confirm transfer');
      setStep('error');
    },
  });

  // Cancel the pending transfer
  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!confirmationId) return;
      await fetch(`${apiConfig.mcpGatewayUrl}/api/confirm/${confirmationId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ approved: false }),
      });
    },
    onSettled: () => {
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black opacity-30" onClick={onClose}></div>
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          {/* Confirmation Step */}
          {step === 'confirm' && (
            <>
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full bg-amber-100">
                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
                Transfer Lead Contact Role
              </h2>
              <p className="text-gray-600 text-center mb-6">
                Are you sure you want to transfer the Lead Contact role to{' '}
                <span className="font-semibold">
                  {targetContact.first_name} {targetContact.last_name}
                </span>
                ?
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-amber-800 mb-2">What will happen:</h3>
                <ul className="text-sm text-amber-700 space-y-1">
                  <li>• You ({currentUserName}) will become a Basic Contact</li>
                  <li>• {targetContact.first_name} {targetContact.last_name} will become the Lead Contact</li>
                  <li>• You will lose access to this Contacts page</li>
                  <li>• This action requires confirmation</li>
                </ul>
              </div>
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  onClick={() => initiateMutation.mutate()}
                  disabled={initiateMutation.isPending}
                  className="px-4 py-2 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  {initiateMutation.isPending ? 'Processing...' : 'Transfer Role'}
                </button>
              </div>
            </>
          )}

          {/* Pending Confirmation Step */}
          {step === 'pending' && (
            <>
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full bg-primary-100">
                <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
                Confirm Transfer
              </h2>
              <p className="text-gray-600 text-center mb-6">
                Please confirm that you want to transfer the Lead Contact role to{' '}
                <span className="font-semibold">
                  {targetContact.first_name} {targetContact.last_name}
                </span>
                .
              </p>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-600">
                  <strong>Note:</strong> This action cannot be undone. The new Lead Contact
                  would need to transfer the role back to you.
                </p>
              </div>
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending || confirmMutation.isPending}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => confirmMutation.mutate()}
                  disabled={confirmMutation.isPending || cancelMutation.isPending}
                  className="px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {confirmMutation.isPending ? 'Confirming...' : 'Confirm Transfer'}
                </button>
              </div>
            </>
          )}

          {/* Success Step */}
          {step === 'success' && (
            <>
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full bg-green-100">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
                Transfer Complete!
              </h2>
              <p className="text-gray-600 text-center">
                {targetContact.first_name} {targetContact.last_name} is now the Lead Contact.
                The page will refresh shortly.
              </p>
            </>
          )}

          {/* Error Step */}
          {step === 'error' && (
            <>
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full bg-red-100">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
                Transfer Failed
              </h2>
              <p className="text-red-600 text-center mb-4">{error}</p>
              <div className="flex justify-center">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InviteContactModal({ accessToken, onClose, onSuccess }: InviteModalProps) {
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    title: '',
  });
  const [error, setError] = useState('');

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/support/tools/customer_invite_contact`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(formData),
        }
      );
      if (!response.ok) throw new Error('Failed to invite contact');
      return response.json();
    },
    onSuccess: () => {
      onSuccess();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to invite contact');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.firstName || !formData.lastName) {
      setError('Please fill in all required fields');
      return;
    }
    inviteMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black opacity-30" onClick={onClose}></div>
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Invite New Contact</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="e.g., Developer, Manager"
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex justify-end space-x-4 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={inviteMutation.isPending}
                className="px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {inviteMutation.isPending ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

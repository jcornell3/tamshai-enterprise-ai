import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useCustomerAuth } from '../auth';
import { apiConfig } from '../auth/config';

type Category = 'technical' | 'billing' | 'general' | 'feature_request' | 'bug_report';
type Priority = 'low' | 'medium' | 'high';
type Visibility = 'private' | 'organization';

interface TicketFormData {
  title: string;
  description: string;
  category: Category;
  priority: Priority;
  visibility: Visibility;
}

export default function NewTicketPage() {
  const navigate = useNavigate();
  const { accessToken, isLeadContact } = useCustomerAuth();
  const [formData, setFormData] = useState<TicketFormData>({
    title: '',
    description: '',
    category: 'general',
    priority: 'medium',
    visibility: 'private',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof TicketFormData, string>>>({});

  const submitTicketMutation = useMutation({
    mutationFn: async (data: TicketFormData) => {
      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/support/tools/customer_submit_ticket`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(data),
        }
      );
      if (!response.ok) throw new Error('Failed to submit ticket');
      return response.json();
    },
    onSuccess: (data) => {
      navigate(`/tickets/${data.data.ticketId}`);
    },
  });

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof TicketFormData, string>> = {};

    if (formData.title.length < 5) {
      newErrors.title = 'Title must be at least 5 characters';
    }
    if (formData.title.length > 200) {
      newErrors.title = 'Title must be less than 200 characters';
    }
    if (formData.description.length < 20) {
      newErrors.description = 'Description must be at least 20 characters';
    }
    if (formData.description.length > 5000) {
      newErrors.description = 'Description must be less than 5000 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      submitTicketMutation.mutate(formData);
    }
  };

  const categories: { value: Category; label: string; description: string }[] = [
    { value: 'technical', label: 'Technical Issue', description: 'System errors, bugs, or technical problems' },
    { value: 'billing', label: 'Billing', description: 'Invoices, payments, or subscription questions' },
    { value: 'general', label: 'General Inquiry', description: 'General questions or information requests' },
    { value: 'feature_request', label: 'Feature Request', description: 'Suggest new features or improvements' },
    { value: 'bug_report', label: 'Bug Report', description: 'Report a bug or unexpected behavior' },
  ];

  return (
    <div className="max-w-2xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center text-sm text-gray-500 mb-6">
        <Link to="/tickets" className="hover:text-primary-600">
          Tickets
        </Link>
        <svg className="w-4 h-4 mx-2" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-gray-900">New Ticket</span>
      </nav>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Create New Support Ticket</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Brief summary of your issue"
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 ${
                errors.title ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.title && <p className="mt-1 text-sm text-red-500">{errors.title}</p>}
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {categories.map((cat) => (
                <label
                  key={cat.value}
                  className={`relative flex cursor-pointer rounded-lg border p-4 focus:outline-none ${
                    formData.category === cat.value
                      ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="category"
                    value={cat.value}
                    checked={formData.category === cat.value}
                    onChange={() => setFormData({ ...formData, category: cat.value })}
                    className="sr-only"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900">{cat.label}</span>
                    <p className="text-xs text-gray-500 mt-1">{cat.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={6}
              placeholder="Please provide detailed information about your issue..."
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 ${
                errors.description ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            <div className="flex justify-between mt-1">
              {errors.description ? (
                <p className="text-sm text-red-500">{errors.description}</p>
              ) : (
                <p className="text-sm text-gray-500">Minimum 20 characters</p>
              )}
              <p className="text-sm text-gray-500">{formData.description.length}/5000</p>
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
            <div className="flex space-x-4">
              {(['low', 'medium', 'high'] as Priority[]).map((p) => (
                <label key={p} className="flex items-center">
                  <input
                    type="radio"
                    name="priority"
                    value={p}
                    checked={formData.priority === p}
                    onChange={() => setFormData({ ...formData, priority: p })}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 capitalize">{p}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Visibility (Lead only) */}
          {isLeadContact && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Visibility</label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="visibility"
                    value="private"
                    checked={formData.visibility === 'private'}
                    onChange={() => setFormData({ ...formData, visibility: 'private' })}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Private (Only you)</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="visibility"
                    value="organization"
                    checked={formData.visibility === 'organization'}
                    onChange={() => setFormData({ ...formData, visibility: 'organization' })}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Organization (All contacts)</span>
                </label>
              </div>
            </div>
          )}

          {/* Submit buttons */}
          <div className="flex items-center justify-end space-x-4 pt-4 border-t border-gray-200">
            <Link
              to="/tickets"
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitTicketMutation.isPending}
              className="px-6 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitTicketMutation.isPending ? 'Submitting...' : 'Submit Ticket'}
            </button>
          </div>

          {submitTicketMutation.isError && (
            <p className="text-red-600 text-sm">
              Failed to submit ticket. Please try again.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

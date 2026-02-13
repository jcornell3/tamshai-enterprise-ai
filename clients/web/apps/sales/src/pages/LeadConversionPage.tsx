import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import LeadConversionWizard from '../components/LeadConversionWizard';
import type { Lead, APIResponse } from '../types';

export default function LeadConversionPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const navigate = useNavigate();
  const { getAccessToken } = useAuth();

  const { data: response, isLoading, error } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/sales/get_lead?leadId=${leadId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('Failed to fetch lead');
      return res.json() as Promise<APIResponse<Lead>>;
    },
    enabled: !!leadId,
  });

  const lead = response?.data;

  if (isLoading && !lead) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="spinner mb-4"></div>
          <p className="text-secondary-600">Loading lead...</p>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-danger-600 mb-4">
            {error ? (error as Error).message : 'Lead not found'}
          </p>
          <button onClick={() => navigate('/leads')} className="btn-primary">
            Back to Leads
          </button>
        </div>
      </div>
    );
  }

  return (
    <LeadConversionWizard
      lead={lead}
      onClose={() => navigate('/leads')}
      onComplete={() => {
        navigate('/opportunities');
      }}
    />
  );
}

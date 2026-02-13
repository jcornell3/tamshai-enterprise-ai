import { Link } from 'react-router-dom';
import { useCustomerAuth } from '../auth';
import { useQuery } from '@tanstack/react-query';
import { apiConfig } from '../auth/config';

interface TicketSummary {
  open: number;
  inProgress: number;
  resolved: number;
  total: number;
}

export default function DashboardPage() {
  const { customerProfile, accessToken, isLeadContact, organizationName } = useCustomerAuth();

  // Fetch ticket summary
  const { data: ticketSummary, isLoading: ticketsLoading } = useQuery<TicketSummary>({
    queryKey: ['ticketSummary'],
    queryFn: async () => {
      const response = await fetch(`${apiConfig.mcpGatewayUrl}/api/customer/tickets/summary`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch ticket summary');
      return response.json();
    },
    enabled: !!accessToken,
  });

  const summary = ticketSummary || { open: 0, inProgress: 0, resolved: 0, total: 0 };

  return (
    <div className="space-y-8">
      {/* Welcome section */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {customerProfile?.firstName || 'Customer'}!
        </h1>
        <p className="mt-1 text-gray-600">
          {organizationName} - Customer Support Portal
        </p>
        {isLeadContact && (
          <span className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
            Lead Contact
          </span>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Open Tickets"
          value={ticketsLoading ? '-' : summary.open.toString()}
          color="amber"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <StatCard
          title="In Progress"
          value={ticketsLoading ? '-' : summary.inProgress.toString()}
          color="blue"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          }
        />
        <StatCard
          title="Resolved (30d)"
          value={ticketsLoading ? '-' : summary.resolved.toString()}
          color="green"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <StatCard
          title="Total Tickets"
          value={ticketsLoading ? '-' : summary.total.toString()}
          color="gray"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          }
        />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <QuickActionCard
          title="Create New Ticket"
          description="Submit a new support request"
          href="/tickets/new"
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          }
        />
        <QuickActionCard
          title="View My Tickets"
          description="Check status of your support requests"
          href="/tickets"
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          }
        />
        <QuickActionCard
          title="Knowledge Base"
          description="Find answers in our documentation"
          href="/knowledge-base"
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          }
        />
      </div>

      {/* Recent activity - placeholder */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
        <p className="text-gray-500 text-sm">Your recent ticket updates will appear here.</p>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  color: 'amber' | 'blue' | 'green' | 'gray';
  icon: React.ReactNode;
}

function StatCard({ title, value, color, icon }: StatCardProps) {
  const colorClasses = {
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    gray: 'bg-gray-50 text-gray-600',
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`p-3 rounded-full ${colorClasses[color]}`}>{icon}</div>
      </div>
    </div>
  );
}

interface QuickActionCardProps {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}

function QuickActionCard({ title, description, href, icon }: QuickActionCardProps) {
  return (
    <Link
      to={href}
      className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 hover:shadow-md hover:border-primary-200 transition-all group"
    >
      <div className="flex items-start space-x-4">
        <div className="p-3 rounded-lg bg-primary-50 text-primary-600 group-hover:bg-primary-100">
          {icon}
        </div>
        <div>
          <h3 className="text-lg font-medium text-gray-900 group-hover:text-primary-600">
            {title}
          </h3>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
      </div>
    </Link>
  );
}

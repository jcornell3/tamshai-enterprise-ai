import { Link } from 'react-router-dom';
import {
  useAuth,
  canAccessHR,
  canAccessFinance,
  canAccessSales,
  canAccessSupport,
  canAccessPayroll,
  canAccessTax,
  getUserDisplayName,
  getRoleBadges,
} from '@tamshai/auth';

/**
 * Landing Page - Portal Application
 *
 * Main launchpad with role-based app navigation
 *
 * Features:
 * - Tamshai Corp branding
 * - Role-based navigation cards (HR, Finance, Sales, Support)
 * - User profile dropdown with logout
 * - Responsive grid layout
 */

interface AppCard {
  name: string;
  description: string;
  icon: JSX.Element;
  url: string;
  canAccess: boolean;
  color: string;
}

/**
 * Check if the current hostname indicates a deployed environment
 * (dev with Caddy, stage VPS, or production)
 */
function isDeployedEnvironment(hostname: string): boolean {
  // Known deployed hostnames
  const deployedHosts = [
    'tamshai-playground.local',
    'www.tamshai-playground.local',
    'tamshai.com',
    'www.tamshai.com',
    'vps.tamshai.com',
  ];

  // Check known hosts
  if (deployedHosts.some(h => hostname.includes(h))) {
    return true;
  }

  // Check for VPS IP via environment variable (set at build time)
  // This allows stage builds to recognize the VPS IP without hardcoding
  const stageHost = import.meta.env.VITE_STAGE_HOST;
  if (stageHost && hostname.includes(stageHost)) {
    return true;
  }

  return false;
}

/**
 * Get environment-aware app URLs
 * - Local dev (localhost): Use separate ports
 * - Deployed (Caddy): Use path-based routing
 */
function getAppUrls() {
  const hostname = window.location.hostname;

  // Deployed environment (Caddy routing)
  if (isDeployedEnvironment(hostname)) {
    return {
      hr: '/hr/',
      finance: '/finance/',
      sales: '/sales/',
      support: '/support/',
      payroll: '/payroll/',
      tax: '/tax/',
    };
  }

  // Local development (separate dev servers)
  return {
    hr: 'http://localhost:4001',
    finance: 'http://localhost:4002',
    sales: 'http://localhost:4003',
    support: 'http://localhost:4004',
    payroll: 'http://localhost:4005',
    tax: 'http://localhost:4006',
  };
}

export default function LandingPage() {
  const { userContext, signOut } = useAuth();
  const appUrls = getAppUrls();

  const apps: AppCard[] = [
    {
      name: 'HR Application',
      description: 'Employee directory, org chart, and HR data',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      ),
      url: appUrls.hr,
      canAccess: canAccessHR(userContext),
      color: 'primary',
    },
    {
      name: 'Finance Application',
      description: 'Budgets, expenses, and financial reports',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
      url: appUrls.finance,
      canAccess: canAccessFinance(userContext),
      color: 'success',
    },
    {
      name: 'Sales Application',
      description: 'CRM, opportunities, and customer data',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      ),
      url: appUrls.sales,
      canAccess: canAccessSales(userContext),
      color: 'warning',
    },
    {
      name: 'Support Application',
      description: 'Support tickets and knowledge base',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ),
      url: appUrls.support,
      canAccess: canAccessSupport(userContext),
      color: 'secondary',
    },
    {
      name: 'Payroll Application',
      description: 'Pay runs, pay stubs, and contractor management',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      ),
      url: appUrls.payroll,
      canAccess: canAccessPayroll(userContext),
      color: 'primary',
    },
    {
      name: 'Tax Application',
      description: 'Tax compliance, filings, and quarterly estimates',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z"
          />
        </svg>
      ),
      url: appUrls.tax,
      canAccess: canAccessTax(userContext),
      color: 'success',
    },
  ];

  const accessibleApps = apps.filter((app) => app.canAccess);

  return (
    <div className="min-h-screen bg-secondary-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="page-container">
          <div className="flex items-center justify-between py-4">
            {/* Logo and Title */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">T</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-secondary-900">
                  Tamshai Corp
                </h1>
                <p className="text-sm text-secondary-600">
                  Enterprise Application Portal
                </p>
              </div>
            </div>

            {/* User Profile */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="font-medium text-secondary-900">
                  {getUserDisplayName(userContext)}
                </p>
                <div className="flex gap-1 justify-end mt-1">
                  {getRoleBadges(userContext).slice(0, 2).map((badge) => (
                    <span key={badge} className="badge-primary text-xs">
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => signOut()}
                className="btn-outline text-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="page-container">
        <div className="page-header">
          <h2 className="page-title">Available Applications</h2>
          <p className="page-subtitle">
            Select an application to access enterprise data and AI-powered insights
          </p>
        </div>

        {/* AI Assistant - Always visible, uses internal routing */}
        <div className="mb-8">
          <Link
            to="/ai-query"
            className="card-hover group block"
          >
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-700 rounded-xl flex items-center justify-center text-white shadow-lg shrink-0">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-secondary-900 mb-1 flex items-center gap-2">
                  Universal AI Assistant
                  <span className="badge-primary text-xs">New</span>
                </h3>
                <p className="text-sm text-secondary-600 mb-2">
                  Ask questions across all domains with generative UI components - HR, Finance, Sales, Support, Payroll, Tax, and Approvals
                </p>
                <div className="flex items-center gap-4 text-xs text-secondary-500">
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    SSE Streaming
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    Voice I/O
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Generative UI
                  </span>
                </div>
              </div>
              <svg
                className="w-6 h-6 text-purple-600 group-hover:translate-x-1 transition-transform shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </Link>
        </div>

        {/* Domain Applications */}
        <h2 className="text-xl font-bold text-secondary-900 mb-4">Domain Applications</h2>

        {accessibleApps.length === 0 ? (
          // No Access
          <div className="card text-center py-12">
            <svg
              className="w-16 h-16 mx-auto text-secondary-400 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <h3 className="text-xl font-semibold text-secondary-900 mb-2">
              No Applications Available
            </h3>
            <p className="text-secondary-600 mb-4">
              You do not have access to any applications.
            </p>
            <p className="text-sm text-secondary-500">
              Your roles: {userContext?.roles.join(', ') || 'None'}
            </p>
            <p className="text-sm text-secondary-500 mt-2">
              Contact your administrator to request access.
            </p>
          </div>
        ) : (
          // App Grid
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {accessibleApps.map((app) => (
              <a
                key={app.name}
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                className="card-hover group"
              >
                <div className={`w-12 h-12 bg-${app.color}-100 rounded-lg flex items-center justify-center mb-4 text-${app.color}-600 group-hover:bg-${app.color}-200 transition-colors`}>
                  {app.icon}
                </div>
                <h3 className="text-lg font-semibold text-secondary-900 mb-2">
                  {app.name}
                </h3>
                <p className="text-sm text-secondary-600 mb-4">
                  {app.description}
                </p>
                <div className="flex items-center text-primary-600 text-sm font-medium">
                  Open Application
                  <svg
                    className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </a>
            ))}
          </div>
        )}

        {/* Downloads Section */}
        <div className="mt-12">
          <h2 className="text-xl font-bold text-secondary-900 mb-4">Desktop & Mobile Apps</h2>
          <Link
            to="/downloads"
            className="card-hover group flex items-center gap-6 p-6"
          >
            <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center text-white shadow-lg">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-secondary-900 mb-1">
                Tamshai AI Desktop & Mobile Clients
              </h3>
              <p className="text-sm text-secondary-600 mb-2">
                Download native apps for Windows, macOS, iOS, and Android for the best AI experience
              </p>
              <div className="flex items-center text-primary-600 text-sm font-medium">
                View Downloads
                <svg
                  className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </div>
          </Link>
        </div>

      </main>
    </div>
  );
}

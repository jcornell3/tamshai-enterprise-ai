import { useAuth } from '@tamshai/auth';

/**
 * Welcome Page - Public Entry Point
 *
 * Public landing page with login options for:
 * - Employees (internal tamshai realm)
 * - Customers (tamshai-customers realm via customer-support app)
 */

/**
 * Get customer portal URL based on environment
 */
// Allowlist of valid hostnames for customer portal URL generation
const CUSTOMER_PORTAL_HOSTS: Record<string, string> = {
  'www.tamshai-playground.local': 'https://customers.tamshai-playground.local',
  'tamshai-playground.local': 'https://customers.tamshai-playground.local',
  'www.tamshai.com': 'https://customers.tamshai.com',
  'tamshai.com': 'https://customers.tamshai.com',
};

function getCustomerPortalUrl(): string {
  const hostname = window.location.hostname;
  const port = window.location.port;
  const mapped = CUSTOMER_PORTAL_HOSTS[hostname];
  if (mapped) {
    // Preserve non-standard port (e.g. :8443 for dev)
    if (port && port !== '443' && port !== '80') {
      try {
        const url = new URL(mapped);
        url.port = port;
        return url.toString().replace(/\/$/, '');
      } catch {
        return mapped;
      }
    }
    return mapped;
  }

  // Local development
  return 'http://localhost:4017';
}

export default function WelcomePage() {
  const { signIn, isLoading } = useAuth();
  const customerPortalUrl = getCustomerPortalUrl();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-50">
        <div className="text-center">
          <div className="spinner mb-4"></div>
          <p className="text-secondary-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary-50 to-secondary-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">T</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-secondary-900">Tamshai Corp</h1>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => signIn()}
                className="text-sm text-secondary-600 hover:text-secondary-900"
              >
                Employee Login
              </button>
              <a
                href={customerPortalUrl}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                Customer Portal
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-secondary-900 mb-4">
            Welcome to Tamshai Enterprise AI
          </h2>
          <p className="text-xl text-secondary-600 max-w-2xl mx-auto">
            Secure AI-powered enterprise solutions for your business needs
          </p>
        </div>

        {/* Login Options */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Employee Login Card */}
          <div className="bg-white rounded-xl shadow-lg p-8 border border-secondary-200 hover:shadow-xl transition-shadow">
            <div className="w-16 h-16 bg-primary-100 rounded-xl flex items-center justify-center mb-6 mx-auto">
              <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <h3 className="text-2xl font-semibold text-secondary-900 text-center mb-4">
              Employee Portal
            </h3>
            <p className="text-secondary-600 text-center mb-6">
              Access internal applications including HR, Finance, Sales, Support, and Payroll
            </p>
            <button
              onClick={() => signIn()}
              className="w-full py-3 px-6 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              Employee Login
            </button>
          </div>

          {/* Customer Login Card */}
          <div className="bg-white rounded-xl shadow-lg p-8 border border-secondary-200 hover:shadow-xl transition-shadow">
            <div className="w-16 h-16 bg-success-100 rounded-xl flex items-center justify-center mb-6 mx-auto">
              <svg className="w-8 h-8 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            </div>
            <h3 className="text-2xl font-semibold text-secondary-900 text-center mb-4">
              Customer Support Portal
            </h3>
            <p className="text-secondary-600 text-center mb-6">
              Submit support tickets, search knowledge base, and manage your organization contacts
            </p>
            <a
              href={customerPortalUrl}
              className="block w-full py-3 px-6 bg-success-600 text-white font-medium rounded-lg hover:bg-success-700 transition-colors text-center"
            >
              Customer Login
            </a>
          </div>
        </div>

        {/* Features Section */}
        <div className="mt-20">
          <h3 className="text-2xl font-bold text-secondary-900 text-center mb-10">
            Enterprise AI Features
          </h3>
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              }
              title="Enterprise Security"
              description="Role-based access control with Keycloak SSO and multi-factor authentication"
            />
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              }
              title="AI-Powered Insights"
              description="Claude AI integration for intelligent data analysis and natural language queries"
            />
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                  />
                </svg>
              }
              title="Unified Platform"
              description="Access all enterprise applications from a single, integrated portal"
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-secondary-200 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-center text-secondary-500 text-sm">
            &copy; {new Date().getFullYear()} Tamshai Corp. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-secondary-200">
      <div className="w-12 h-12 bg-primary-50 rounded-lg flex items-center justify-center mb-4 text-primary-600">
        {icon}
      </div>
      <h4 className="text-lg font-semibold text-secondary-900 mb-2">{title}</h4>
      <p className="text-secondary-600 text-sm">{description}</p>
    </div>
  );
}

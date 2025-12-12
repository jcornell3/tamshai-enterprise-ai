import { Routes, Route, useNavigate } from 'react-router-dom';
import { PrivateRoute } from '@tamshai/auth';
import { useAuth, getUserDisplayName, getRoleBadges } from '@tamshai/auth';
import { useEffect } from 'react';

/**
 * Finance Application
 *
 * Simplified dashboard showing:
 * - Budget overview
 * - v1.4 feature showcase
 */
function DashboardPage() {
  const { userContext, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-secondary-50">
      <header className="bg-white shadow-sm">
        <div className="page-container">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-success-600 rounded-lg flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-secondary-900">
                  Finance Application
                </h1>
                <p className="text-sm text-secondary-600">Budget & Financial Data</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="font-medium text-secondary-900">
                  {getUserDisplayName(userContext)}
                </p>
                <div className="flex gap-1 justify-end mt-1">
                  {getRoleBadges(userContext).slice(0, 2).map((badge) => (
                    <span key={badge} className="badge-success text-xs">
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
              <button onClick={() => signOut()} className="btn-outline text-sm">
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="page-container">
        <div className="page-header">
          <h2 className="page-title">Finance Dashboard</h2>
          <p className="page-subtitle">Budget overview and financial reports</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="card">
            <h3 className="text-sm font-medium text-secondary-600 mb-1">
              Total Budget
            </h3>
            <p className="text-3xl font-bold text-secondary-900">$2.5M</p>
            <p className="text-sm text-success-600 mt-1">+12% from last quarter</p>
          </div>
          <div className="card">
            <h3 className="text-sm font-medium text-secondary-600 mb-1">
              Total Spent
            </h3>
            <p className="text-3xl font-bold text-secondary-900">$1.8M</p>
            <p className="text-sm text-secondary-600 mt-1">72% of budget</p>
          </div>
          <div className="card">
            <h3 className="text-sm font-medium text-secondary-600 mb-1">
              Remaining
            </h3>
            <p className="text-3xl font-bold text-secondary-900">$700K</p>
            <p className="text-sm text-warning-600 mt-1">28% remaining</p>
          </div>
        </div>

        <div className="alert-info">
          <h4 className="font-semibold mb-1">Architecture v1.4 Ready</h4>
          <p className="text-sm">
            This application is configured with SSE streaming, human-in-the-loop
            confirmations, and truncation warnings. Full budget dashboard coming
            soon.
          </p>
        </div>
      </main>
    </div>
  );
}

function CallbackPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, error } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        // Redirect to dashboard after successful auth
        navigate('/');
      } else if (error) {
        console.error('Authentication error:', error);
        // Could show error page or redirect to login
      }
    }
  }, [isAuthenticated, isLoading, error, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary-50">
      <div className="text-center">
        <div className="spinner mb-4"></div>
        <p className="text-secondary-600">Completing sign in...</p>
      </div>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <PrivateRoute requiredRoles={['finance-read', 'finance-write', 'executive']}>
            <DashboardPage />
          </PrivateRoute>
        }
      />
      <Route path="/callback" element={<CallbackPage />} />
    </Routes>
  );
}

export default App;

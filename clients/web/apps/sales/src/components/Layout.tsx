import { Outlet, NavLink } from 'react-router-dom';
import { useAuth, getUserDisplayName, getRoleBadges } from '@tamshai/auth';

/**
 * Layout Component
 *
 * Provides navigation and header for Sales application
 */
export default function Layout() {
  const { userContext, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-secondary-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="page-container">
          <div className="flex items-center justify-between py-4">
            {/* Logo and Title */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
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
                    d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-secondary-900">
                  Sales Application
                </h1>
                <p className="text-sm text-secondary-600">
                  CRM & Opportunities Management
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
              <button onClick={() => signOut()} className="btn-outline text-sm">
                Sign Out
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex gap-2 pb-4 border-b border-secondary-200">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive ? 'nav-link-active' : 'nav-link'
              }
            >
              <svg
                className="w-4 h-4 inline mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
              Opportunities
            </NavLink>
            <NavLink
              to="/ai-query"
              className={({ isActive }) =>
                isActive ? 'nav-link-active' : 'nav-link'
              }
            >
              <svg
                className="w-4 h-4 inline mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
              AI Query (SSE)
            </NavLink>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main>
        <Outlet />
      </main>
    </div>
  );
}

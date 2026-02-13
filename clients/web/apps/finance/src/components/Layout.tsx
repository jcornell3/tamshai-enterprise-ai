import { Outlet, NavLink } from 'react-router-dom';
import {
  useAuth,
  getUserDisplayName,
  getRoleBadges,
  canModifyFinance,
  canAccessFinanceExpenses,
  canAccessFinanceBudgets,
  canAccessFinanceDashboard,
} from '@tamshai/auth';

/**
 * Layout Component
 *
 * Provides navigation and header for Finance application.
 * Navigation tabs are conditionally shown based on user roles (v1.5 tiered access):
 * - TIER 1 (Expenses): All employees - Expense Reports, AI Query
 * - TIER 2 (Budgets): Managers+ - Budgets (adds 1 tab)
 * - TIER 3 (Dashboard): Finance/Executive - Dashboard, ARR, Invoices (all 6 tabs)
 */
export default function Layout() {
  const { userContext, signOut } = useAuth();
  const canWrite = canModifyFinance(userContext);

  // Tiered access checks for navigation visibility
  const showExpenses = canAccessFinanceExpenses(userContext);
  const showBudgets = canAccessFinanceBudgets(userContext);
  const showDashboard = canAccessFinanceDashboard(userContext);

  return (
    <div className="min-h-screen bg-secondary-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="page-container">
          <div className="flex items-center justify-between py-4">
            {/* Logo and Title */}
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
                <p className="text-sm text-secondary-600">
                  Budget & Financial Management
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
                    <span key={badge} className="badge-success text-xs">
                      {badge}
                    </span>
                  ))}
                  {canWrite && (
                    <span className="badge-primary text-xs">Write Access</span>
                  )}
                </div>
              </div>
              <button onClick={() => signOut()} className="btn-outline text-sm">
                Sign Out
              </button>
            </div>
          </div>

          {/* Navigation - Role-based visibility (v1.5 tiered access) */}
          <nav className="flex gap-2 pb-4 border-b border-secondary-200">
            {/* TIER 3: Dashboard - Finance/Executive only */}
            {showDashboard && (
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
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
                Dashboard
              </NavLink>
            )}

            {/* TIER 3: ARR - Finance/Executive only */}
            {showDashboard && (
              <NavLink
                to="/arr"
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
                ARR
              </NavLink>
            )}

            {/* TIER 2: Budgets - Managers and above */}
            {showBudgets && (
              <NavLink
                to="/budgets"
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
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                Budgets
              </NavLink>
            )}

            {/* TIER 3: Invoices - Finance/Executive only */}
            {showDashboard && (
              <NavLink
                to="/invoices"
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
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Invoices
              </NavLink>
            )}

            {/* TIER 1: Expense Reports - All employees */}
            {showExpenses && (
              <NavLink
                to="/expense-reports"
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
                    d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                Expense Reports
              </NavLink>
            )}

            {/* TIER 1: AI Query - All employees (queries limited by their permissions) */}
            {showExpenses && (
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
            )}
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

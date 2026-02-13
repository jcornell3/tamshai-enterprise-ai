import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '@tamshai/auth';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/sales-tax', label: 'Sales Tax Rates', icon: '🏷️' },
  { path: '/quarterly', label: 'Quarterly Estimates', icon: '📅' },
  { path: '/quarterly-filings', label: 'Filing Review', icon: '✅' },
  { path: '/filings', label: 'Annual Filings', icon: '📋' },
  { path: '/registrations', label: 'State Registrations', icon: '📍' },
  { path: '/audit-log', label: 'Audit Log', icon: '📜' },
  { path: '/ai-query', label: 'AI Query', icon: '🤖' },
];

export default function Layout() {
  const { userContext, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-sm border-r border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-primary-600">Tamshai Tax</h1>
        </div>
        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div />
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {userContext?.firstName} {userContext?.lastName}
              </span>
              <button
                onClick={() => signOut()}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Sign Out
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

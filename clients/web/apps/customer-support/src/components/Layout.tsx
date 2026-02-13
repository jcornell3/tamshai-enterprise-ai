import { Outlet, NavLink } from 'react-router-dom';
import { useCustomerAuth } from '../auth';

export default function Layout() {
  const { customerProfile, logout, isLeadContact } = useCustomerAuth();

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? 'bg-primary-100 text-primary-700'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and company name */}
            <div className="flex items-center">
              <NavLink to="/" className="flex items-center space-x-2">
                <span className="text-xl font-bold text-primary-600">Tamshai</span>
                <span className="text-xl font-light text-gray-600">Support</span>
              </NavLink>
            </div>

            {/* Navigation */}
            <nav className="hidden md:flex items-center space-x-1">
              <NavLink to="/" end className={navLinkClass}>
                Dashboard
              </NavLink>
              <NavLink to="/tickets" className={navLinkClass}>
                My Tickets
              </NavLink>
              <NavLink to="/knowledge-base" className={navLinkClass}>
                Knowledge Base
              </NavLink>
              {isLeadContact && (
                <NavLink to="/contacts" className={navLinkClass}>
                  Contacts
                </NavLink>
              )}
            </nav>

            {/* User menu */}
            <div className="flex items-center space-x-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-900">{customerProfile?.name}</p>
                <p className="text-xs text-gray-500">{customerProfile?.organizationName}</p>
              </div>
              <div className="flex items-center space-x-2">
                {isLeadContact && (
                  <span className="px-2 py-1 text-xs font-medium bg-primary-100 text-primary-700 rounded-full">
                    Lead
                  </span>
                )}
                <NavLink
                  to="/settings"
                  className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"
                  title="Settings"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </NavLink>
                <button
                  onClick={() => logout()}
                  className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
                >
                  Log out
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile navigation */}
      <nav className="md:hidden bg-white border-b border-gray-200 px-4 py-2">
        <div className="flex space-x-2 overflow-x-auto">
          <NavLink to="/" end className={navLinkClass}>
            Dashboard
          </NavLink>
          <NavLink to="/tickets" className={navLinkClass}>
            Tickets
          </NavLink>
          <NavLink to="/knowledge-base" className={navLinkClass}>
            KB
          </NavLink>
          {isLeadContact && (
            <NavLink to="/contacts" className={navLinkClass}>
              Contacts
            </NavLink>
          )}
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-gray-500">
            &copy; {new Date().getFullYear()} Tamshai Corp. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

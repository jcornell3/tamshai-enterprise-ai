import { Routes, Route, useNavigate } from 'react-router-dom';
import { PrivateRoute } from '@tamshai/auth';
import { useAuth } from '@tamshai/auth';
import { useEffect } from 'react';
import Layout from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { ARRDashboardPage } from './pages/ARRDashboardPage';
import { BudgetsPage } from './pages/BudgetsPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { ExpenseReportsPage } from './pages/ExpenseReportsPage';
import { AIQueryPage } from './pages/AIQueryPage';

/**
 * Finance Application
 *
 * Routes:
 * - / - Dashboard with budget overview
 * - /budgets - Budget management
 * - /invoices - Invoice management
 * - /expense-reports - Expense report management
 * - /ai-query - AI-powered finance queries with SSE
 * - /callback - OAuth callback handler
 */

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
      {/* Protected routes with Layout
       * v1.5: Relaxed to allow all employees (tiered access enforced by MCP server + nav visibility)
       * - Employees: Can access Expense Reports and AI Query
       * - Managers: Can also access Budgets
       * - Finance/Executive: Full access to Dashboard, ARR, Invoices
       */}
      <Route
        path="/"
        element={
          <PrivateRoute requiredRoles={['employee', 'manager', 'finance-read', 'finance-write', 'executive']}>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="arr" element={<ARRDashboardPage />} />
        <Route path="budgets" element={<BudgetsPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="expense-reports" element={<ExpenseReportsPage />} />
        <Route path="ai-query" element={<AIQueryPage />} />
      </Route>

      {/* Public callback route */}
      <Route path="/callback" element={<CallbackPage />} />
    </Routes>
  );
}

export default App;

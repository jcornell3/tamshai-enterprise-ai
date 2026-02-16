import { Routes, Route } from 'react-router-dom';
import { PrivateRoute } from '@tamshai/auth';
import { CallbackPage } from '@tamshai/ui';
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

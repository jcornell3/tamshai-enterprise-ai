import { Routes, Route } from 'react-router-dom';
import { PrivateRoute } from '@tamshai/auth';
import { CallbackPage } from '@tamshai/ui';
import Layout from './components/Layout';
import {
  DashboardPage,
  SalesTaxPage,
  QuarterlyEstimatesPage,
  QuarterlyFilingReviewPage,
  AnnualFilingsPage,
  StateRegistrationsPage,
  AuditLogPage,
  AIQueryPage,
} from './pages';

function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <PrivateRoute requiredRoles={['tax-read', 'tax-write', 'executive']}>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="sales-tax" element={<SalesTaxPage />} />
        <Route path="quarterly" element={<QuarterlyEstimatesPage />} />
        <Route path="quarterly-filings" element={<QuarterlyFilingReviewPage />} />
        <Route path="filings" element={<AnnualFilingsPage />} />
        <Route path="registrations" element={<StateRegistrationsPage />} />
        <Route path="audit-log" element={<AuditLogPage />} />
        <Route path="ai-query" element={<AIQueryPage />} />
      </Route>
      <Route path="/callback" element={<CallbackPage />} />
    </Routes>
  );
}

export default App;

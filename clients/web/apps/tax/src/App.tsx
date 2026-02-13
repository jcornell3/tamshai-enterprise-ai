import { Routes, Route, useNavigate } from 'react-router-dom';
import { PrivateRoute } from '@tamshai/auth';
import { useAuth } from '@tamshai/auth';
import { useEffect } from 'react';
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

function CallbackPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, error } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        navigate('/');
      } else if (error) {
        console.error('Authentication error:', error);
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

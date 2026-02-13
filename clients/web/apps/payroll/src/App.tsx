import { Routes, Route, useNavigate } from 'react-router-dom';
import { PrivateRoute } from '@tamshai/auth';
import { useAuth } from '@tamshai/auth';
import { useEffect } from 'react';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import PayRunsPage from './pages/PayRunsPage';
import NewPayRunPage from './pages/NewPayRunPage';
import PayStubsPage from './pages/PayStubsPage';
import DirectDepositPage from './pages/DirectDepositPage';
import ContractorsPage from './pages/ContractorsPage';
import TaxWithholdingsPage from './pages/TaxWithholdingsPage';
import BenefitsPage from './pages/BenefitsPage';
import AIQueryPage from './pages/AIQueryPage';

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
          <PrivateRoute requiredRoles={['payroll-read', 'payroll-write', 'executive']}>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="pay-runs" element={<PayRunsPage />} />
        <Route path="pay-runs/new" element={<NewPayRunPage />} />
        <Route path="pay-stubs" element={<PayStubsPage />} />
        <Route path="direct-deposit" element={<DirectDepositPage />} />
        <Route path="1099" element={<ContractorsPage />} />
        <Route path="tax" element={<TaxWithholdingsPage />} />
        <Route path="benefits" element={<BenefitsPage />} />
        <Route path="ai-query" element={<AIQueryPage />} />
      </Route>
      <Route path="/callback" element={<CallbackPage />} />
    </Routes>
  );
}

export default App;

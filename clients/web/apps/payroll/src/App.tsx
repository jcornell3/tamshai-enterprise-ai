import { Routes, Route } from 'react-router-dom';
import { PrivateRoute } from '@tamshai/auth';
import { CallbackPage } from '@tamshai/ui';
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

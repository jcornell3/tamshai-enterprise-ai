import { Routes, Route } from 'react-router-dom';
import { PrivateRoute } from '@tamshai/auth';
import DashboardPage from './pages/DashboardPage';
import OpportunitiesPage from './pages/OpportunitiesPage';
import CustomersPage from './pages/CustomersPage';
import LeadsPage from './pages/LeadsPage';
import LeadConversionPage from './pages/LeadConversionPage';
import ForecastingPage from './pages/ForecastingPage';
import AIQueryPage from './pages/AIQueryPage';
import CallbackPage from './pages/CallbackPage';
import Layout from './components/Layout';

function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <PrivateRoute requiredRoles={['sales-read', 'sales-write', 'executive']}>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="opportunities" element={<OpportunitiesPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="leads/convert/:leadId" element={<LeadConversionPage />} />
        <Route path="forecast" element={<ForecastingPage />} />
        <Route path="ai-query" element={<AIQueryPage />} />
      </Route>
      <Route path="/callback" element={<CallbackPage />} />
    </Routes>
  );
}

export default App;

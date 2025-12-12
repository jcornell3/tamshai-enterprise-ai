import { Routes, Route } from 'react-router-dom';
import { PrivateRoute } from '@tamshai/auth';
import OpportunitiesPage from './pages/OpportunitiesPage';
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
        <Route index element={<OpportunitiesPage />} />
        <Route path="ai-query" element={<AIQueryPage />} />
      </Route>
      <Route path="/callback" element={<CallbackPage />} />
    </Routes>
  );
}

export default App;

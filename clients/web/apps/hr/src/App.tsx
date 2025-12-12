import { Routes, Route } from 'react-router-dom';
import { PrivateRoute } from '@tamshai/auth';
import EmployeeDirectoryPage from './pages/EmployeeDirectoryPage';
import AIQueryPage from './pages/AIQueryPage';
import CallbackPage from './pages/CallbackPage';
import Layout from './components/Layout';

function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <PrivateRoute requiredRoles={['hr-read', 'hr-write', 'executive']}>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<EmployeeDirectoryPage />} />
        <Route path="ai-query" element={<AIQueryPage />} />
      </Route>
      <Route path="/callback" element={<CallbackPage />} />
    </Routes>
  );
}

export default App;

import { Routes, Route } from 'react-router-dom';
import { PrivateRoute } from '@tamshai/auth';
import TicketsPage from './pages/TicketsPage';
import KnowledgeBasePage from './pages/KnowledgeBasePage';
import AIQueryPage from './pages/AIQueryPage';
import CallbackPage from './pages/CallbackPage';
import Layout from './components/Layout';

function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <PrivateRoute requiredRoles={['support-read', 'support-write', 'executive']}>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<TicketsPage />} />
        <Route path="knowledge-base" element={<KnowledgeBasePage />} />
        <Route path="ai-query" element={<AIQueryPage />} />
      </Route>
      <Route path="/callback" element={<CallbackPage />} />
    </Routes>
  );
}

export default App;

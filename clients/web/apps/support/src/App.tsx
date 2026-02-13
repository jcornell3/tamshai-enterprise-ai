import { Routes, Route } from 'react-router-dom';
import { PrivateRoute } from '@tamshai/auth';
import TicketsPage from './pages/TicketsPage';
import TicketDetailPage from './pages/TicketDetailPage';
import KnowledgeBasePage from './pages/KnowledgeBasePage';
import AIQueryPage from './pages/AIQueryPage';
import CallbackPage from './pages/CallbackPage';
import DashboardPage from './pages/DashboardPage';
import ArticleDetailPage from './pages/ArticleDetailPage';
import SLAPage from './pages/SLAPage';
import AgentMetricsPage from './pages/AgentMetricsPage';
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
        <Route path="tickets/:ticketId" element={<TicketDetailPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="knowledge-base" element={<KnowledgeBasePage />} />
        <Route path="knowledge-base/:articleId" element={<ArticleDetailPage />} />
        <Route path="sla" element={<SLAPage />} />
        <Route path="performance" element={<AgentMetricsPage />} />
        <Route path="ai-query" element={<AIQueryPage />} />
      </Route>
      <Route path="/callback" element={<CallbackPage />} />
    </Routes>
  );
}

export default App;

import { Routes, Route } from 'react-router-dom';
import { CustomerPrivateRoute } from './auth';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import TicketsPage from './pages/TicketsPage';
import TicketDetailPage from './pages/TicketDetailPage';
import NewTicketPage from './pages/NewTicketPage';
import KnowledgeBasePage from './pages/KnowledgeBasePage';
import ArticleDetailPage from './pages/ArticleDetailPage';
import ContactsPage from './pages/ContactsPage';
import SettingsPage from './pages/SettingsPage';
import CallbackPage from './pages/CallbackPage';

function App() {
  return (
    <Routes>
      {/* Protected routes with customer authentication */}
      <Route
        path="/"
        element={
          <CustomerPrivateRoute>
            <Layout />
          </CustomerPrivateRoute>
        }
      >
        {/* Dashboard - default landing page */}
        <Route index element={<DashboardPage />} />

        {/* Tickets */}
        <Route path="tickets" element={<TicketsPage />} />
        <Route path="tickets/new" element={<NewTicketPage />} />
        <Route path="tickets/:ticketId" element={<TicketDetailPage />} />

        {/* Knowledge Base */}
        <Route path="knowledge-base" element={<KnowledgeBasePage />} />
        <Route path="knowledge-base/:articleId" element={<ArticleDetailPage />} />

        {/* Lead-only: Contact Management */}
        <Route
          path="contacts"
          element={
            <CustomerPrivateRoute requireLead>
              <ContactsPage />
            </CustomerPrivateRoute>
          }
        />

        {/* Settings - profile and preferences */}
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* OIDC callback - handles auth redirect */}
      <Route path="/callback" element={<CallbackPage />} />
    </Routes>
  );
}

export default App;

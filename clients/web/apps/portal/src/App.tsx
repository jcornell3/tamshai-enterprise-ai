import { Routes, Route, Navigate } from 'react-router-dom';
import { PrivateRoute } from '@tamshai/auth';
import LandingPage from './pages/LandingPage';
import CallbackPage from './pages/CallbackPage';
import DownloadsPage from './pages/DownloadsPage';
import AIQueryPage from './pages/AIQueryPage';

function App() {
  return (
    <Routes>
      {/* Root redirects to /portal — PrivateRoute handles auth */}
      <Route path="/" element={<Navigate to="/portal" replace />} />

      {/* Protected portal routes */}
      <Route
        path="/portal"
        element={
          <PrivateRoute>
            <LandingPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/downloads"
        element={
          <PrivateRoute>
            <DownloadsPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/ai-query"
        element={
          <PrivateRoute>
            <AIQueryPage />
          </PrivateRoute>
        }
      />

      {/* OIDC callback */}
      <Route path="/callback" element={<CallbackPage />} />
    </Routes>
  );
}

export default App;

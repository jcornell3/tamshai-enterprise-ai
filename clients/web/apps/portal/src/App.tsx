import { Routes, Route } from 'react-router-dom';
import { PrivateRoute } from '@tamshai/auth';
import LandingPage from './pages/LandingPage';
import CallbackPage from './pages/CallbackPage';
import DownloadsPage from './pages/DownloadsPage';

function App() {
  return (
    <Routes>
      <Route
        path="/"
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
      <Route path="/callback" element={<CallbackPage />} />
    </Routes>
  );
}

export default App;

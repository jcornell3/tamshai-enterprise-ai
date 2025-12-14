/**
 * Tamshai AI Desktop - Main App Component
 *
 * Routes between login and main chat interface based on auth state
 */

import { useEffect, useState } from 'react';
import { LoginScreen } from './components/LoginScreen';
import { ChatWindow } from './components/ChatWindow';

interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [tokens, setTokens] = useState<Tokens | null>(null);

  // Check for existing tokens on mount
  useEffect(() => {
    console.log('[App] Setting up auth listeners...');
    checkAuth();

    // Listen for auth success from OAuth callback
    window.electronAPI.onAuthSuccess((tokens) => {
      console.log('[App] *** AUTH SUCCESS EVENT RECEIVED ***');
      console.log('[App] Tokens:', tokens);
      setTokens(tokens);
      setIsAuthenticated(true);
    });

    // Listen for auth errors
    window.electronAPI.onAuthError((error) => {
      console.error('[App] *** AUTH ERROR EVENT RECEIVED ***:', error);
      setIsAuthenticated(false);
    });

    console.log('[App] Auth listeners registered');

    // Cleanup listeners on unmount
    return () => {
      console.log('[App] Cleaning up auth listeners...');
      window.electronAPI.removeAuthSuccessListener();
      window.electronAPI.removeAuthErrorListener();
    };
  }, []);

  const checkAuth = async () => {
    try {
      const result = await window.electronAPI.getTokens();

      if (result.success && result.tokens) {
        setTokens(result.tokens);
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('[App] Failed to check auth:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    try {
      const result = await window.electronAPI.login();

      if (!result.success) {
        console.error('[App] Login failed:', result.error);
      }
    } catch (error) {
      console.error('[App] Login error:', error);
    }
  };

  const handleLogout = async () => {
    try {
      const result = await window.electronAPI.logout();

      if (result.success) {
        setIsAuthenticated(false);
        setTokens(null);
      } else {
        console.error('[App] Logout failed:', result.error);
      }
    } catch (error) {
      console.error('[App] Logout error:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return <ChatWindow tokens={tokens!} onLogout={handleLogout} />;
}

export default App;

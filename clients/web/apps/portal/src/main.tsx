import { StrictMode, Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@tamshai/auth';
import './index.css';
import App from './App';

// Error boundary to catch and display React errors
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Portal Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'red', fontFamily: 'monospace' }}>
          <h1>Portal Error</h1>
          <pre>{this.state.error?.message}</pre>
          <pre>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// Show loading indicator while app initializes
const root = document.getElementById('root');
if (root) {
  root.innerHTML = '<div style="padding:20px;text-align:center">Loading portal...</div>';
}

try {
  // Portal app is always served at /app/ path in all environments
  const basename = '/app';

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <AuthProvider>
          <BrowserRouter basename={basename}>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </ErrorBoundary>
    </StrictMode>
  );
} catch (error) {
  console.error('Fatal initialization error:', error);
  document.getElementById('root')!.innerHTML = `
    <div style="padding:20px;color:red;font-family:monospace">
      <h1>Initialization Error</h1>
      <pre>${error}</pre>
    </div>
  `;
}

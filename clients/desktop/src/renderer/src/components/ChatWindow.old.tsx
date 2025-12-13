/**
 * Tamshai AI Desktop - Chat Window
 *
 * Main chat interface (placeholder for Phase 3)
 */

interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface ChatWindowProps {
  tokens: Tokens;
  onLogout: () => void;
}

export function ChatWindow({ tokens, onLogout }: ChatWindowProps) {
  // Decode JWT to get user info (basic base64 decode)
  const getUserInfo = () => {
    try {
      const payload = tokens.accessToken.split('.')[1];
      const decoded = JSON.parse(atob(payload));
      return {
        username: decoded.preferred_username || 'User',
        roles: decoded.realm_access?.roles || [],
      };
    } catch {
      return { username: 'User', roles: [] };
    }
  };

  const user = getUserInfo();

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Tamshai AI Assistant</h1>
          <p style={styles.subtitle}>Welcome, {user.username}</p>
        </div>
        <button onClick={onLogout} style={styles.logoutButton}>
          Logout
        </button>
      </header>

      <div style={styles.content}>
        <div style={styles.placeholder}>
          <div style={styles.placeholderIcon}>💬</div>
          <h2 style={styles.placeholderTitle}>Chat Interface Coming Soon</h2>
          <p style={styles.placeholderText}>
            Phase 1 (Electron Foundation) complete!
          </p>
          <p style={styles.placeholderText}>
            Next: Phase 3 (Chat UI) and Phase 4 (SSE Streaming)
          </p>
          <div style={styles.debugInfo}>
            <p style={styles.debugTitle}>Debug Info:</p>
            <p style={styles.debugText}>Username: {user.username}</p>
            <p style={styles.debugText}>Roles: {user.roles.join(', ')}</p>
            <p style={styles.debugText}>Token expires: {new Date(tokens.expiresAt).toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    background: '#f9fafb',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    background: 'white',
    borderBottom: '1px solid #e5e7eb',
  },
  title: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#1f2937',
    margin: '0 0 4px 0',
  },
  subtitle: {
    fontSize: '14px',
    color: '#6b7280',
    margin: 0,
  },
  logoutButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#ef4444',
    background: 'white',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  content: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  placeholder: {
    textAlign: 'center' as const,
    maxWidth: '500px',
  },
  placeholderIcon: {
    fontSize: '64px',
    marginBottom: '16px',
  },
  placeholderTitle: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#1f2937',
    marginBottom: '12px',
  },
  placeholderText: {
    fontSize: '16px',
    color: '#6b7280',
    marginBottom: '8px',
  },
  debugInfo: {
    marginTop: '32px',
    padding: '16px',
    background: '#f3f4f6',
    borderRadius: '8px',
    textAlign: 'left' as const,
  },
  debugTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#1f2937',
    marginBottom: '8px',
  },
  debugText: {
    fontSize: '12px',
    color: '#4b5563',
    fontFamily: 'monospace',
    marginBottom: '4px',
  },
};

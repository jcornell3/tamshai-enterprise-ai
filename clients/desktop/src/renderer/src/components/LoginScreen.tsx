/**
 * Tamshai AI Desktop - Login Screen
 *
 * Simple login interface that triggers OAuth flow in system browser
 */

interface LoginScreenProps {
  onLogin: () => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logoContainer}>
          <h1 style={styles.logo}>🤖</h1>
          <h2 style={styles.title}>Tamshai AI Assistant</h2>
          <p style={styles.subtitle}>Enterprise AI Access System</p>
        </div>

        <div style={styles.buttonContainer}>
          <button onClick={onLogin} style={styles.button}>
            Sign in with SSO
          </button>
        </div>

        <p style={styles.info}>
          Your browser will open for secure authentication
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  card: {
    background: 'white',
    borderRadius: '12px',
    padding: '48px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
    maxWidth: '400px',
    width: '90%',
  },
  logoContainer: {
    textAlign: 'center' as const,
    marginBottom: '32px',
  },
  logo: {
    fontSize: '64px',
    margin: '0 0 16px 0',
  },
  title: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#1f2937',
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontSize: '14px',
    color: '#6b7280',
    margin: 0,
  },
  buttonContainer: {
    marginBottom: '24px',
  },
  button: {
    width: '100%',
    padding: '14px 24px',
    fontSize: '16px',
    fontWeight: 600,
    color: 'white',
    background: '#2563eb',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  info: {
    fontSize: '12px',
    color: '#9ca3af',
    textAlign: 'center' as const,
    margin: 0,
  },
};

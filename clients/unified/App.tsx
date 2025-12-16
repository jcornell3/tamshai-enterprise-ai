/**
 * Tamshai AI - Unified Client
 *
 * React Native application supporting Windows, macOS, iOS, and Android.
 * Provides secure AI assistant interface to enterprise data via MCP Gateway.
 *
 * Article V Compliance:
 * - V.1: No authorization logic in client (backend enforces all access control)
 * - V.2: Tokens stored in platform-native secure storage
 * - V.3: PKCE authentication via system browser (or WebView2 modal on Windows localhost)
 */

import React, { useEffect } from 'react';
import {
  StatusBar,
  StyleSheet,
  useColorScheme,
  View,
  Text,
  ActivityIndicator,
  Platform,
  Pressable,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { useAuthStore, needsModalOAuth } from './src/stores';
import { OAuthModal } from './src/components';
import { useOAuthModal } from './src/hooks';
import { DEFAULT_CONFIG } from './src/services/auth';

// Initialize Windows OAuth listener (for browser-based callback handling)
if (Platform.OS === 'windows') {
  // Lazy import to avoid bundling on other platforms
  const { initializeOAuthListener } = require('./src/services/auth/auth.windows');
  initializeOAuthListener();
}

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent isDarkMode={isDarkMode} />
    </SafeAreaProvider>
  );
}

interface AppContentProps {
  isDarkMode: boolean;
}

function AppContent({ isDarkMode }: AppContentProps) {
  const {
    isAuthenticated,
    isLoading,
    user,
    error,
    checkAuth,
    login,
    logout,
    completeOAuthLogin,
  } = useAuthStore();

  // OAuth modal hook for Windows localhost
  const oauthModal = useOAuthModal({
    config: DEFAULT_CONFIG,
    onTokens: (tokens) => {
      console.log('[App] OAuth modal completed, storing tokens');
      completeOAuthLogin(tokens);
    },
    onError: (errorMsg) => {
      console.error('[App] OAuth modal error:', errorMsg);
      // Clear the special error state
      useAuthStore.setState({ error: errorMsg });
    },
  });

  // Check for existing auth on mount
  useEffect(() => {
    checkAuth();
  }, []);

  // Handle the special modal trigger error
  useEffect(() => {
    if (error === '__NEEDS_OAUTH_MODAL__' && needsModalOAuth()) {
      console.log('[App] Detected modal OAuth trigger, starting OAuth modal flow');
      // Clear the trigger error
      useAuthStore.setState({ error: null });
      // Start the modal OAuth flow
      oauthModal.startAuth();
    }
  }, [error]);

  const backgroundColor = isDarkMode ? '#1a1a2e' : '#ffffff';
  const textColor = isDarkMode ? '#ffffff' : '#1a1a2e';

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={[styles.loadingText, { color: textColor }]}>
            Loading...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Not authenticated - show login
  if (!isAuthenticated) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor }]}>
        <View style={styles.centered}>
          <Text style={[styles.title, { color: textColor }]}>
            Tamshai AI
          </Text>
          <Text style={[styles.subtitle, { color: textColor }]}>
            Enterprise AI Assistant
          </Text>
          <View style={styles.spacer} />
          <Pressable
            style={styles.loginButton}
            onPress={login}
            disabled={oauthModal.isLoading}
          >
            <Text style={styles.loginButtonText}>
              {oauthModal.isLoading ? 'Signing in...' : 'Sign in with SSO'}
            </Text>
          </Pressable>
          <Text style={[styles.helpText, { color: textColor }]}>
            Uses your company Keycloak credentials
          </Text>
          {error && error !== '__NEEDS_OAUTH_MODAL__' && (
            <Text style={styles.errorText}>{error}</Text>
          )}
        </View>

        {/* OAuth Modal for Windows localhost */}
        <OAuthModal
          visible={oauthModal.visible}
          authUrl={oauthModal.authUrl}
          callbackScheme="com.tamshai.ai"
          onSuccess={oauthModal.handleSuccess}
          onCancel={oauthModal.handleCancel}
          onError={oauthModal.handleError}
        />
      </SafeAreaView>
    );
  }

  // Authenticated - show chat interface
  return (
    <SafeAreaView style={[styles.container, { backgroundColor }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: textColor }]}>
          Tamshai AI
        </Text>
        <Pressable onPress={logout}>
          <Text style={styles.logoutButton}>Logout</Text>
        </Pressable>
      </View>

      <View style={styles.userInfo}>
        <Text style={[styles.userName, { color: textColor }]}>
          Welcome, {user?.name || 'User'}
        </Text>
        {user?.roles && user.roles.length > 0 && (
          <Text style={[styles.userRoles, { color: textColor }]}>
            Roles: {user.roles.join(', ')}
          </Text>
        )}
      </View>

      <View style={styles.chatPlaceholder}>
        <Text style={[styles.placeholderText, { color: textColor }]}>
          Chat interface coming soon...
        </Text>
        <Text style={[styles.helpText, { color: textColor }]}>
          Ask questions about HR, Finance, Sales, or Support data
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    opacity: 0.7,
    marginBottom: 48,
  },
  spacer: {
    height: 24,
  },
  loginButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 8,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  helpText: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 16,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#FF3B30',
    marginTop: 16,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  logoutButton: {
    color: '#007AFF',
    fontSize: 16,
  },
  userInfo: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
  },
  userRoles: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 4,
  },
  chatPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  placeholderText: {
    fontSize: 18,
    opacity: 0.5,
  },
});

export default App;

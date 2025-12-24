/**
 * Tamshai AI - Unified Client
 *
 * React Native application supporting Windows, macOS, iOS, and Android.
 * Provides secure AI assistant interface to enterprise data via MCP Gateway.
 *
 * Article V Compliance:
 * - V.1: No authorization logic in client (backend enforces all access control)
 * - V.2: Tokens stored in platform-native secure storage
 * - V.3: PKCE authentication via system browser (WebAuthenticationBroker on Windows)
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
import { useAuthStore } from './src/stores';
import { ChatScreen } from './src/components';

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
  } = useAuthStore();

  // Check for existing auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

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
          >
            <Text style={styles.loginButtonText}>
              Sign in with SSO
            </Text>
          </Pressable>
          <Text style={[styles.helpText, { color: textColor }]}>
            Uses your company Keycloak credentials
          </Text>
          {error && (
            <Text style={styles.errorText}>{error}</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Authenticated - show chat interface
  return (
    <SafeAreaView style={[styles.container, { backgroundColor }]}>
      <View style={[styles.header, { borderBottomColor: isDarkMode ? '#3d3d54' : '#e0e0e0' }]}>
        <Text style={[styles.headerTitle, { color: textColor }]}>
          Tamshai AI
        </Text>
        <View style={styles.headerRight}>
          <Text style={[styles.userName, { color: textColor }]}>
            {user?.name || 'User'}
          </Text>
          <Pressable onPress={logout}>
            <Text style={styles.logoutButton}>Logout</Text>
          </Pressable>
        </View>
      </View>

      <ChatScreen isDarkMode={isDarkMode} />
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  logoutButton: {
    color: '#007AFF',
    fontSize: 16,
  },
  userName: {
    fontSize: 14,
    opacity: 0.8,
  },
});

export default App;

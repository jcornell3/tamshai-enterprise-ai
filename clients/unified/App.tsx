/**
 * Tamshai AI - Unified Client
 *
 * React Native application supporting Windows, macOS, iOS, and Android.
 * Provides secure AI assistant interface to enterprise data via MCP Gateway.
 *
 * Article V Compliance:
 * - V.1: No authorization logic in client (backend enforces all access control)
 * - V.2: Tokens stored in platform-native secure storage
 * - V.3: PKCE authentication via system browser
 */

import React, { useEffect } from 'react';
import {
  StatusBar,
  StyleSheet,
  useColorScheme,
  View,
  Text,
  ActivityIndicator,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { useAuthStore } from './src/stores';

// Screens (to be implemented)
// import LoginScreen from './src/screens/LoginScreen';
// import ChatScreen from './src/screens/ChatScreen';

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
  const { isAuthenticated, isLoading, user, checkAuth, login, logout } = useAuthStore();

  // Check for existing auth on mount
  useEffect(() => {
    checkAuth();
  }, []);

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
          <Text
            style={styles.loginButton}
            onPress={login}
          >
            Sign in with SSO
          </Text>
          <Text style={[styles.helpText, { color: textColor }]}>
            Uses your company Keycloak credentials
          </Text>
        </View>
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
        <Text
          style={styles.logoutButton}
          onPress={logout}
        >
          Logout
        </Text>
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
    color: '#ffffff',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 8,
    fontSize: 18,
    fontWeight: '600',
    overflow: 'hidden',
  },
  helpText: {
    fontSize: 14,
    opacity: 0.6,
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

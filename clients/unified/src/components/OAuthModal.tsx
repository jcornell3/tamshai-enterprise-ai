/**
 * OAuthModal - WebView2-based modal OAuth dialog
 *
 * This component provides a modal dialog containing a WebView2 for OAuth authentication.
 * It solves two critical problems:
 * 1. WebAuthenticationBroker cannot access localhost due to Windows network isolation
 * 2. We must use a modal dialog (not a browser tab) per the UX spec requirement
 *
 * WebView2 (Chromium-based) can access localhost and is displayed in an app-owned modal.
 *
 * Usage:
 *   <OAuthModal
 *     visible={showAuth}
 *     authUrl="http://localhost:8180/realms/..."
 *     callbackScheme="com.tamshai.ai"
 *     onSuccess={(url) => handleOAuthCallback(url)}
 *     onCancel={() => setShowAuth(false)}
 *     onError={(error) => console.error(error)}
 *   />
 */

import React, { useRef, useCallback } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';

interface OAuthModalProps {
  visible: boolean;
  authUrl: string;
  callbackScheme: string;
  onSuccess: (callbackUrl: string) => void;
  onCancel: () => void;
  onError: (error: string) => void;
}

export function OAuthModal({
  visible,
  authUrl,
  callbackScheme,
  onSuccess,
  onCancel,
  onError,
}: OAuthModalProps): React.ReactElement {
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [pageTitle, setPageTitle] = React.useState('Sign In');

  // Detect OAuth callback in navigation
  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      console.log('[OAuthModal] Navigation:', navState.url);

      // Update title from page
      if (navState.title) {
        setPageTitle(navState.title);
      }

      // Check if this is the OAuth callback URL
      if (navState.url.startsWith(`${callbackScheme}://`)) {
        console.log('[OAuthModal] Detected callback URL:', navState.url);
        onSuccess(navState.url);
        return;
      }
    },
    [callbackScheme, onSuccess]
  );

  // Also check URL on request (before navigation completes)
  const handleShouldStartLoadWithRequest = useCallback(
    (request: { url: string }) => {
      console.log('[OAuthModal] Request URL:', request.url);

      // Intercept callback scheme URL
      if (request.url.startsWith(`${callbackScheme}://`)) {
        console.log('[OAuthModal] Intercepted callback URL:', request.url);
        // Don't load this URL in WebView, handle it in app
        onSuccess(request.url);
        return false;
      }

      return true;
    },
    [callbackScheme, onSuccess]
  );

  const handleError = useCallback(
    (syntheticEvent: { nativeEvent: { description: string } }) => {
      const { description } = syntheticEvent.nativeEvent;
      console.error('[OAuthModal] WebView error:', description);
      onError(description);
    },
    [onError]
  );

  const handleHttpError = useCallback(
    (syntheticEvent: { nativeEvent: { statusCode: number; description: string } }) => {
      const { statusCode, description } = syntheticEvent.nativeEvent;
      console.error('[OAuthModal] HTTP error:', statusCode, description);
      // Don't treat HTTP errors as fatal - OAuth flows often have redirects
      if (statusCode >= 500) {
        onError(`Server error: ${statusCode}`);
      }
    },
    [onError]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            {pageTitle}
          </Text>
          <View style={styles.placeholder} />
        </View>

        {/* WebView */}
        <View style={styles.webViewContainer}>
          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          )}
          <WebView
            ref={webViewRef}
            source={{ uri: authUrl }}
            style={styles.webView}
            onNavigationStateChange={handleNavigationStateChange}
            onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
            onError={handleError}
            onHttpError={handleHttpError}
            onLoadStart={() => setIsLoading(true)}
            onLoadEnd={() => setIsLoading(false)}
            // WebView2 specific settings for Windows
            // @ts-ignore - Windows-specific prop
            useWebView2={Platform.OS === 'windows'}
            // Security settings
            javaScriptEnabled={true}
            domStorageEnabled={true}
            // Allow localhost for development
            originWhitelist={['http://*', 'https://*', `${callbackScheme}://*`]}
            // User agent to ensure compatibility
            userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            // iOS/macOS specific
            allowsBackForwardNavigationGestures={false}
            // Prevent external app launches
            setSupportMultipleWindows={false}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  cancelButton: {
    minWidth: 60,
  },
  cancelText: {
    fontSize: 16,
    color: '#007AFF',
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    color: '#000000',
    marginHorizontal: 8,
  },
  placeholder: {
    minWidth: 60,
  },
  webViewContainer: {
    flex: 1,
    position: 'relative',
  },
  webView: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666666',
  },
});

export default OAuthModal;

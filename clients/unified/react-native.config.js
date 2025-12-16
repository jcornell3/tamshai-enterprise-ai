/**
 * React Native Configuration
 *
 * Configures auto-linking behavior for native modules.
 * ReactNativeWebView is manually added to the solution to prevent duplicates.
 */
module.exports = {
  dependencies: {
    // Disable auto-linking for react-native-webview on Windows
    // It's manually added to the solution file to prevent duplicate entries
    'react-native-webview': {
      platforms: {
        windows: null, // Disable Windows auto-linking
      },
    },
  },
};

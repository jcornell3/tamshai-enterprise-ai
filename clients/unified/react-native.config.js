/**
 * React Native Configuration
 *
 * Disables auto-linking for Windows native modules that are incompatible
 * with React Native Windows 0.80 Composition/New Architecture.
 */
module.exports = {
  dependencies: {
    // Disable Windows auto-linking for async-storage (built for RN Windows 0.74, not compatible with 0.80)
    '@react-native-async-storage/async-storage': {
      platforms: {
        windows: null, // Disable on Windows
      },
    },
    // Disable Windows auto-linking for webview (already removed from package.json but may still be in node_modules)
    'react-native-webview': {
      platforms: {
        windows: null, // Disable on Windows
      },
    },
  },
};

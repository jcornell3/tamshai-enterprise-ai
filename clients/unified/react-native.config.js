/**
 * React Native Configuration
 *
 * Disables auto-linking for Windows native modules that are incompatible
 * with React Native Windows 0.80 Composition/New Architecture.
 */
module.exports = {
  dependencies: {
    // Disable Windows auto-linking for async-storage
    // The native module is built for RN Windows 0.74 and not compatible with 0.80 Composition
    // Windows auth uses in-memory storage fallback which works correctly
    '@react-native-async-storage/async-storage': {
      platforms: {
        windows: null, // Disable on Windows
      },
    },
  },
};

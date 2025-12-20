/**
 * globalThis polyfill for Chakra (ES2020 feature not supported)
 *
 * This must run BEFORE any other code in the bundle.
 * Configured via Metro's serializer.getPolyfills() in metro.config.js
 */

(function() {
  if (typeof globalThis === 'undefined') {
    if (typeof global !== 'undefined') {
      global.globalThis = global;
    } else if (typeof window !== 'undefined') {
      window.globalThis = window;
    } else if (typeof self !== 'undefined') {
      self.globalThis = self;
    } else {
      // Last resort - create a new global
      (function() {
        Object.defineProperty(this, 'globalThis', {
          value: this,
          writable: true,
          enumerable: false,
          configurable: true
        });
      })();
    }
  }
})();

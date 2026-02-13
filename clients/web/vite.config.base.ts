/**
 * Vite Configuration Factory
 *
 * Creates consistent Vite configurations for all web apps.
 * Reduces config duplication from 190+ lines across 8 apps to one shared factory.
 *
 * Usage in app's vite.config.ts:
 *   import { createViteConfig } from '../../vite.config.base';
 *   export default createViteConfig({ basePath: '/finance/', port: 4002 });
 */
import { defineConfig, UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export interface ViteConfigOptions {
  /** Base path for deployment (e.g., '/finance/', '/hr/') */
  basePath: string;
  /** Development server port */
  port: number;
  /** Enable source maps in production build (default: false) */
  sourcemap?: boolean;
  /** Additional Vite plugins */
  plugins?: UserConfig['plugins'];
  /** Additional build options */
  build?: UserConfig['build'];
}

/**
 * Create a Vite configuration with shared defaults
 */
export function createViteConfig(options: ViteConfigOptions): UserConfig {
  const { basePath, port, sourcemap = false, plugins = [], build = {} } = options;

  return defineConfig({
    plugins: [react(), ...plugins],
    base: basePath,
    server: {
      port,
      host: true,
    },
    preview: {
      port,
      host: true,
    },
    build: {
      outDir: 'dist',
      sourcemap,
      // Code splitting optimization
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-query': ['@tanstack/react-query'],
          },
        },
      },
      ...build,
    },
    resolve: {
      alias: {
        '@tamshai/ui': path.resolve(__dirname, 'packages/ui/src'),
        '@tamshai/auth': path.resolve(__dirname, 'packages/auth/src'),
        '@tamshai/tailwind-config': path.resolve(__dirname, 'packages/tailwind-config'),
      },
    },
  });
}

/**
 * App configuration registry - documents all app configs in one place
 */
export const APP_CONFIGS = {
  portal: { basePath: '/app/', port: 4000 },
  hr: { basePath: '/hr/', port: 4001 },
  finance: { basePath: '/finance/', port: 4002 },
  sales: { basePath: '/sales/', port: 4003 },
  support: { basePath: '/support/', port: 4004 },
  payroll: { basePath: '/payroll/', port: 4005 },
  'customer-support': { basePath: '/customer-support/', port: 4006 },
  tax: { basePath: '/tax/', port: 4007 },
} as const;

export type AppName = keyof typeof APP_CONFIGS;

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // Base path for when deployed at /sales/
  base: '/sales/',
  server: {
    port: 4003,
    host: true,
  },
  preview: {
    port: 4003,
    host: true,
  },
  resolve: {
    alias: {
      '@tamshai/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@tamshai/auth': path.resolve(__dirname, '../../packages/auth/src'),
      '@tamshai/tailwind-config': path.resolve(__dirname, '../../packages/tailwind-config'),
    },
  },
});

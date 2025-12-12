import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4001,
    host: true,
  },
  preview: {
    port: 4001,
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

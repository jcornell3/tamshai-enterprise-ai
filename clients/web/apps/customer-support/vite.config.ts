import { createViteConfig } from '../../vite.config.base';

// Customer support portal - external customer-facing app
// Uses basePath '/' because this app is served on its own subdomain
// (customers.tamshai-playground.local) rather than a shared domain path
export default createViteConfig({
  basePath: '/',
  port: 4016,
  sourcemap: true,
});

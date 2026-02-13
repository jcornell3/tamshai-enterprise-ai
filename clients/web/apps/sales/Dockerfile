# Multi-stage build for Sales app
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace configuration
COPY package*.json ./
COPY turbo.json ./
COPY tsconfig.json ./
COPY vite.config.base.ts ./

# Copy all workspace packages
COPY packages/ ./packages/
COPY apps/sales/ ./apps/sales/

# Install dependencies from lockfile (faster and more reliable)
RUN npm ci
# Install platform-specific rollup binary (workaround for npm optional deps issue on Alpine/musl)
RUN npm install @rollup/rollup-linux-x64-musl --save-optional || true

# Build the Sales app
WORKDIR /app/apps/sales
RUN npm run build

# Stage 2: Production with Nginx
FROM nginx:alpine

# Install wget for healthcheck
RUN apk add --no-cache wget

# Copy built assets
COPY --from=builder /app/apps/sales/dist /usr/share/nginx/html

# Copy Nginx configuration
COPY apps/sales/nginx.conf /etc/nginx/conf.d/default.conf

# Security: Set proper ownership and run as non-root user
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]

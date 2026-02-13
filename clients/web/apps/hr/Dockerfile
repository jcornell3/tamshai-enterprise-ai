# Multi-stage build for HR app
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Build arguments for Vite environment variables
ARG VITE_KEYCLOAK_URL
ARG VITE_KEYCLOAK_CLIENT_ID
ARG VITE_API_GATEWAY_URL
ARG VITE_MCP_GATEWAY_URL
ARG VITE_MCP_UI_URL

# Set as environment variables for Vite build
ENV VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL
ENV VITE_KEYCLOAK_CLIENT_ID=$VITE_KEYCLOAK_CLIENT_ID
ENV VITE_API_GATEWAY_URL=$VITE_API_GATEWAY_URL
ENV VITE_MCP_GATEWAY_URL=$VITE_MCP_GATEWAY_URL
ENV VITE_MCP_UI_URL=$VITE_MCP_UI_URL

# Copy workspace configuration
COPY package*.json ./
COPY turbo.json ./
COPY tsconfig.json ./
COPY vite.config.base.ts ./

# Copy all workspace packages
COPY packages/ ./packages/
COPY apps/hr/ ./apps/hr/

# Install dependencies from lockfile (faster and more reliable)
RUN npm ci
# Install platform-specific rollup binary (workaround for npm optional deps issue on Alpine/musl)
RUN npm install @rollup/rollup-linux-x64-musl --save-optional || true

# Build the HR app
WORKDIR /app/apps/hr
RUN npm run build

# Stage 2: Production with Nginx
FROM nginx:alpine

# Install wget for healthcheck
RUN apk add --no-cache wget

# Copy built assets
COPY --from=builder /app/apps/hr/dist /usr/share/nginx/html

# Copy Nginx configuration
COPY apps/hr/nginx.conf /etc/nginx/conf.d/default.conf

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

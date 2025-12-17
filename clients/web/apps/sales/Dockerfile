# Multi-stage build for Sales app
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace configuration
COPY package*.json ./
COPY turbo.json ./
COPY tsconfig.json ./

# Copy all workspace packages
COPY packages/ ./packages/
COPY apps/sales/ ./apps/sales/

# Install dependencies
RUN npm install

# Build the Sales app
WORKDIR /app/apps/sales
RUN npm run build

# Stage 2: Production with Nginx (unprivileged)
FROM nginxinc/nginx-unprivileged:alpine

# Install wget for healthcheck (as root before switching)
USER root
RUN apk add --no-cache wget

# Copy built assets
COPY --from=builder /app/apps/sales/dist /usr/share/nginx/html

# Copy Nginx configuration
COPY apps/sales/nginx.conf /etc/nginx/conf.d/default.conf

# Fix permissions for nginx user
RUN chown -R nginx:nginx /usr/share/nginx/html

# Switch to non-root nginx user
USER nginx

# Expose port 8080 (unprivileged nginx uses 8080 by default)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]

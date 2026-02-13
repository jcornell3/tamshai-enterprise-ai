# Tamshai Corp MCP Tax Server
# Multi-stage build for minimal production image
#
# Build context: Repository root (for access to services/shared)
# Usage: docker build -f services/mcp-tax/Dockerfile .

# =============================================================================
# BUILD STAGE
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy shared package first (dependency)
COPY services/shared ./shared

# Copy mcp-tax package files
COPY services/mcp-tax/package*.json ./

# Update shared dependency to use local path in container
RUN sed -i 's|"file:../shared"|"file:./shared"|' package.json

# Build shared package first (required dependency)
RUN cd shared && npm ci && npm run build

# Install dependencies (regenerates lock file with correct shared path)
RUN npm install --package-lock-only && npm ci

# Copy source code
COPY services/mcp-tax/tsconfig.json ./
COPY services/mcp-tax/src ./src

# Build TypeScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# =============================================================================
# PRODUCTION STAGE
# =============================================================================
FROM node:20-alpine AS production

# Security: Apply Alpine security patches
RUN apk update && apk upgrade --no-cache

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy built files and production dependencies
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
# Copy shared package (referenced via file: link in node_modules)
COPY --from=builder --chown=nodejs:nodejs /app/shared ./shared

# Set environment (PORT set by docker-compose from GitHub variables)
ENV NODE_ENV=production

# Switch to non-root user
USER nodejs

# Health check (PORT from environment)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

# Start server
CMD ["node", "dist/index.js"]

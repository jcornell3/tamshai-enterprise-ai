#!/bin/bash
set -e

# Tamshai Enterprise AI - Manual VPS Deployment Script
# For deploying to existing VPS (ubuntu-8gb-hil-2 at 5.78.159.29)
# Run this script as root on the VPS

echo "=========================================="
echo "Tamshai Enterprise AI - VPS Deployment"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "ERROR: Please run as root (sudo su)"
  exit 1
fi

# Verify environment variables
if [ -z "$CLAUDE_API_KEY" ]; then
  echo "ERROR: CLAUDE_API_KEY environment variable not set"
  echo "Run: export CLAUDE_API_KEY='your-key-here'"
  exit 1
fi

echo "✓ Running as root"
echo "✓ CLAUDE_API_KEY is set"
echo ""

# Update system
echo "[1/8] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# Install Docker
echo "[2/8] Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo "✓ Docker installed"
else
  echo "✓ Docker already installed"
fi

# Install Docker Compose
echo "[3/8] Installing Docker Compose..."
if ! command -v docker compose &> /dev/null; then
  apt-get install -y docker-compose-plugin
  echo "✓ Docker Compose installed"
else
  echo "✓ Docker Compose already installed"
fi

# Generate random passwords
echo "[4/8] Generating secure passwords..."
POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
MONGODB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
KEYCLOAK_DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
KEYCLOAK_ADMIN_PASSWORD=$(openssl rand -base64 20)
MINIO_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
JWT_SECRET=$(openssl rand -base64 64 | tr -d '/+=')
echo "✓ Passwords generated"

# Create application directory
echo "[5/8] Creating application directory..."
mkdir -p /opt/tamshai
cd /opt/tamshai

# Create .env file
echo "[6/8] Creating environment configuration..."
cat > .env << EOF
# Tamshai Enterprise AI - Environment Configuration
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

# Claude API Key (from environment variable)
CLAUDE_API_KEY=${CLAUDE_API_KEY}

# Database Passwords (auto-generated)
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
MONGODB_PASSWORD=${MONGODB_PASSWORD}
KEYCLOAK_DB_PASSWORD=${KEYCLOAK_DB_PASSWORD}
KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD}
MINIO_ROOT_PASSWORD=${MINIO_PASSWORD}
JWT_SECRET=${JWT_SECRET}

# Service Configuration
DOMAIN=vps.tamshai.com
EMAIL=johncornell@tamshai.com

# Network
SUBNET=172.30.0.0/16
EOF

chmod 600 .env
echo "✓ Environment file created: /opt/tamshai/.env"

# Save passwords for user reference
echo "[7/8] Saving credentials..."
cat > /root/tamshai-credentials.txt << EOF
Tamshai Enterprise AI - Credentials
Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

IMPORTANT: Store these credentials securely!

Keycloak Admin:
  URL: https://vps.tamshai.com/auth
  Username: admin
  Password: ${KEYCLOAK_ADMIN_PASSWORD}

Database Passwords:
  PostgreSQL: ${POSTGRES_PASSWORD}
  MongoDB: ${MONGODB_PASSWORD}
  Keycloak DB: ${KEYCLOAK_DB_PASSWORD}
  MinIO: ${MINIO_PASSWORD}

JWT Secret: ${JWT_SECRET}

Claude API Key: ${CLAUDE_API_KEY}
EOF

chmod 600 /root/tamshai-credentials.txt
echo "✓ Credentials saved to: /root/tamshai-credentials.txt"

# Create Caddyfile for reverse proxy
echo "[8/8] Creating Caddy reverse proxy configuration..."
cat > /opt/tamshai/Caddyfile << 'CADDYEOF'
# Caddyfile for reverse proxy behind Cloudflare
{
  # Disable automatic HTTPS (Cloudflare handles TLS)
  auto_https off

  # Trust Cloudflare proxy headers
  servers {
    trusted_proxies static 173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22 2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32
  }
}

# Listen on HTTP only (port 80) - Cloudflare proxies to this
:80 {
  encode gzip

  # Main portal - redirect to Keycloak for now
  handle / {
    redir /auth permanent
  }

  # Keycloak SSO
  handle_path /auth* {
    reverse_proxy keycloak:8080
  }

  # MCP Gateway API
  handle_path /api* {
    reverse_proxy mcp-gateway:3100
  }

  # Future: Sample applications
  handle_path /hr* {
    respond "HR App - Coming Soon" 200
  }
  handle_path /finance* {
    respond "Finance App - Coming Soon" 200
  }
  handle_path /sales* {
    respond "Sales App - Coming Soon" 200
  }
  handle_path /support* {
    respond "Support App - Coming Soon" 200
  }

  # Health check endpoint
  handle /health {
    respond "OK" 200
  }

  # 404 for everything else
  handle {
    respond "Not Found" 404
  }
}
CADDYEOF

echo "✓ Caddyfile created"
echo ""

echo "=========================================="
echo "Deployment preparation complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Review credentials: cat /root/tamshai-credentials.txt"
echo "2. Upload docker-compose.yml to /opt/tamshai/"
echo "3. Start services: cd /opt/tamshai && docker compose up -d"
echo ""
echo "Files created:"
echo "  - /opt/tamshai/.env (environment variables)"
echo "  - /opt/tamshai/Caddyfile (reverse proxy config)"
echo "  - /root/tamshai-credentials.txt (credentials)"
echo ""

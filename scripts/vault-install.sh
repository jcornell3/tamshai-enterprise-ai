#!/bin/bash
#
# HashiCorp Vault Installation Script for Hetzner VPS
# Tamshai Enterprise AI - Secrets Management
#
# This script installs and configures Vault on Ubuntu 22.04
# Run as root or with sudo privileges
#
# Usage: sudo bash vault-install.sh

set -e  # Exit on error
set -u  # Exit on undefined variable
set -o pipefail  # Exit on pipe failure

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
VAULT_VERSION="1.15.4"
VAULT_USER="vault"
VAULT_GROUP="vault"
VAULT_HOME="/opt/vault"
VAULT_CONFIG_DIR="/etc/vault.d"
VAULT_DATA_DIR="/opt/vault/data"
VAULT_TLS_DIR="/etc/vault.d/tls"
VAULT_LOG_DIR="/var/log/vault"
DOMAIN="vault.tamshai.internal"  # Change this to your domain

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then 
        print_error "Please run as root or with sudo"
        exit 1
    fi
}

# Install dependencies
install_dependencies() {
    print_info "Installing dependencies..."
    
    apt-get update
    apt-get install -y \
        wget \
        curl \
        unzip \
        jq \
        gpg \
        lsb-release
    
    print_info "Dependencies installed"
}

# Create vault user and directories
create_vault_user() {
    print_info "Creating vault user and directories..."
    
    # Create vault user
    if ! id "$VAULT_USER" &>/dev/null; then
        useradd --system --home "$VAULT_HOME" --shell /bin/false "$VAULT_USER"
        print_info "Created vault user"
    else
        print_warn "Vault user already exists"
    fi
    
    # Create directories
    mkdir -p "$VAULT_HOME"
    mkdir -p "$VAULT_CONFIG_DIR"
    mkdir -p "$VAULT_DATA_DIR"
    mkdir -p "$VAULT_TLS_DIR"
    mkdir -p "$VAULT_LOG_DIR"
    
    # Set permissions
    chown -R "$VAULT_USER":"$VAULT_GROUP" "$VAULT_HOME"
    chown -R "$VAULT_USER":"$VAULT_GROUP" "$VAULT_CONFIG_DIR"
    chown -R "$VAULT_USER":"$VAULT_GROUP" "$VAULT_DATA_DIR"
    chown -R "$VAULT_USER":"$VAULT_GROUP" "$VAULT_TLS_DIR"
    chown -R "$VAULT_USER":"$VAULT_GROUP" "$VAULT_LOG_DIR"
    
    chmod 750 "$VAULT_CONFIG_DIR"
    chmod 750 "$VAULT_DATA_DIR"
    chmod 700 "$VAULT_TLS_DIR"
    
    print_info "Directories created"
}

# Download and install Vault
install_vault() {
    print_info "Downloading Vault ${VAULT_VERSION}..."
    
    cd /tmp
    
    # Download Vault
    wget "https://releases.hashicorp.com/vault/${VAULT_VERSION}/vault_${VAULT_VERSION}_linux_amd64.zip"
    
    # Download checksums
    wget "https://releases.hashicorp.com/vault/${VAULT_VERSION}/vault_${VAULT_VERSION}_SHA256SUMS"
    wget "https://releases.hashicorp.com/vault/${VAULT_VERSION}/vault_${VAULT_VERSION}_SHA256SUMS.sig"
    
    # Import HashiCorp GPG key
    gpg --recv-keys 0xC874011F0AB405110D02105534365D9472D7468F || \
        gpg --keyserver keyserver.ubuntu.com --recv-keys 0xC874011F0AB405110D02105534365D9472D7468F
    
    # Verify signature
    gpg --verify "vault_${VAULT_VERSION}_SHA256SUMS.sig" "vault_${VAULT_VERSION}_SHA256SUMS"
    
    # Verify checksum
    grep "vault_${VAULT_VERSION}_linux_amd64.zip" "vault_${VAULT_VERSION}_SHA256SUMS" | sha256sum -c -
    
    # Extract and install
    unzip "vault_${VAULT_VERSION}_linux_amd64.zip"
    mv vault /usr/local/bin/
    chmod +x /usr/local/bin/vault
    
    # Verify installation
    vault --version
    
    # Set capabilities (allow mlock without running as root)
    setcap cap_ipc_lock=+ep /usr/local/bin/vault
    
    # Cleanup
    rm -f "vault_${VAULT_VERSION}_linux_amd64.zip" \
          "vault_${VAULT_VERSION}_SHA256SUMS" \
          "vault_${VAULT_VERSION}_SHA256SUMS.sig"
    
    print_info "Vault installed successfully"
}

# Generate self-signed TLS certificates
generate_tls_certs() {
    print_info "Generating self-signed TLS certificates..."
    
    # Generate private key
    openssl genrsa -out "${VAULT_TLS_DIR}/vault-key.pem" 2048
    
    # Generate certificate
    openssl req -new -x509 -days 3650 \
        -key "${VAULT_TLS_DIR}/vault-key.pem" \
        -out "${VAULT_TLS_DIR}/vault-cert.pem" \
        -subj "/C=US/ST=State/L=City/O=Tamshai/CN=${DOMAIN}"
    
    # Set permissions
    chown "$VAULT_USER":"$VAULT_GROUP" "${VAULT_TLS_DIR}/vault-key.pem"
    chown "$VAULT_USER":"$VAULT_GROUP" "${VAULT_TLS_DIR}/vault-cert.pem"
    chmod 600 "${VAULT_TLS_DIR}/vault-key.pem"
    chmod 644 "${VAULT_TLS_DIR}/vault-cert.pem"
    
    print_info "TLS certificates generated"
    print_warn "Using self-signed certificates. Replace with proper certificates in production!"
}

# Create Vault configuration
create_vault_config() {
    print_info "Creating Vault configuration..."
    
    cat > "${VAULT_CONFIG_DIR}/vault.hcl" <<EOF
# Vault Configuration for Tamshai Enterprise AI
# Documentation: https://developer.hashicorp.com/vault/docs/configuration

# Storage backend - File storage (simple, for single server)
storage "file" {
  path = "${VAULT_DATA_DIR}"
}

# Listener - HTTPS API
listener "tcp" {
  address       = "0.0.0.0:8200"
  tls_cert_file = "${VAULT_TLS_DIR}/vault-cert.pem"
  tls_key_file  = "${VAULT_TLS_DIR}/vault-key.pem"
  
  # TLS configuration
  tls_min_version = "tls12"
  
  # Security headers
  tls_disable = false
}

# API address
api_addr = "https://${DOMAIN}:8200"

# Cluster address (for future HA setup)
cluster_addr = "https://127.0.0.1:8201"

# UI
ui = true

# Disable mlock (already handled by setcap)
disable_mlock = false

# Log level
log_level = "info"

# Telemetry (optional - disable in production if not using)
telemetry {
  disable_hostname = false
  prometheus_retention_time = "30s"
}
EOF
    
    chown "$VAULT_USER":"$VAULT_GROUP" "${VAULT_CONFIG_DIR}/vault.hcl"
    chmod 640 "${VAULT_CONFIG_DIR}/vault.hcl"
    
    print_info "Configuration created"
}

# Create systemd service
create_systemd_service() {
    print_info "Creating systemd service..."
    
    cat > /etc/systemd/system/vault.service <<EOF
[Unit]
Description=HashiCorp Vault - A tool for managing secrets
Documentation=https://developer.hashicorp.com/vault/docs
Requires=network-online.target
After=network-online.target
ConditionFileNotEmpty=${VAULT_CONFIG_DIR}/vault.hcl

[Service]
Type=notify
User=${VAULT_USER}
Group=${VAULT_GROUP}
ProtectSystem=full
ProtectHome=read-only
PrivateTmp=yes
PrivateDevices=yes
SecureBits=keep-caps
AmbientCapabilities=CAP_IPC_LOCK
CapabilityBoundingSet=CAP_SYSLOG CAP_IPC_LOCK
NoNewPrivileges=yes
ExecStart=/usr/local/bin/vault server -config=${VAULT_CONFIG_DIR}/vault.hcl
ExecReload=/bin/kill --signal HUP \$MAINPID
KillMode=process
KillSignal=SIGINT
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
LimitNOFILE=65536
LimitMEMLOCK=infinity

[Install]
WantedBy=multi-user.target
EOF
    
    # Reload systemd
    systemctl daemon-reload
    
    print_info "Systemd service created"
}

# Configure firewall
configure_firewall() {
    print_info "Configuring firewall..."
    
    # Check if ufw is installed
    if command -v ufw &> /dev/null; then
        # Allow Vault port
        ufw allow 8200/tcp comment 'Vault API'
        ufw allow 8201/tcp comment 'Vault Cluster'
        
        print_info "Firewall configured"
    else
        print_warn "ufw not found. Please configure firewall manually to allow ports 8200 and 8201"
    fi
}

# Start Vault service
start_vault() {
    print_info "Starting Vault service..."
    
    # Enable service
    systemctl enable vault
    
    # Start service
    systemctl start vault
    
    # Wait for Vault to start
    sleep 3
    
    # Check status
    if systemctl is-active --quiet vault; then
        print_info "Vault service started successfully"
    else
        print_error "Failed to start Vault service"
        systemctl status vault --no-pager
        exit 1
    fi
}

# Set environment variables
setup_environment() {
    print_info "Setting up environment variables..."
    
    # Create environment file
    cat > /etc/profile.d/vault.sh <<EOF
# Vault environment variables
export VAULT_ADDR='https://127.0.0.1:8200'
export VAULT_SKIP_VERIFY=1  # Remove this in production with proper certs
EOF
    
    # Make executable
    chmod +x /etc/profile.d/vault.sh
    
    # Source for current session
    export VAULT_ADDR='https://127.0.0.1:8200'
    export VAULT_SKIP_VERIFY=1
    
    print_info "Environment variables set"
}

# Initialize Vault
initialize_vault() {
    print_info "Initializing Vault..."
    print_warn "This is a one-time operation. SAVE THE OUTPUT!"
    
    # Wait for Vault to be ready
    sleep 2
    
    # Initialize
    vault operator init -key-shares=5 -key-threshold=3 > /root/vault-init.txt
    
    # Set permissions
    chmod 600 /root/vault-init.txt
    
    print_info "Vault initialized"
    print_info "Initialization keys saved to: /root/vault-init.txt"
    print_warn "IMPORTANT: Copy this file to a secure location and DELETE it from the server!"
    
    echo ""
    echo "======================================"
    cat /root/vault-init.txt
    echo "======================================"
    echo ""
}

# Unseal Vault
unseal_vault() {
    print_info "Unsealing Vault..."
    
    if [ ! -f /root/vault-init.txt ]; then
        print_error "Initialization file not found"
        return 1
    fi
    
    # Extract unseal keys
    KEY1=$(grep 'Unseal Key 1:' /root/vault-init.txt | awk '{print $NF}')
    KEY2=$(grep 'Unseal Key 2:' /root/vault-init.txt | awk '{print $NF}')
    KEY3=$(grep 'Unseal Key 3:' /root/vault-init.txt | awk '{print $NF}')
    
    # Unseal (requires 3 keys by default)
    vault operator unseal "$KEY1"
    vault operator unseal "$KEY2"
    vault operator unseal "$KEY3"
    
    print_info "Vault unsealed successfully"
}

# Login to Vault
login_vault() {
    print_info "Logging in to Vault..."
    
    if [ ! -f /root/vault-init.txt ]; then
        print_error "Initialization file not found"
        return 1
    fi
    
    # Extract root token
    ROOT_TOKEN=$(grep 'Initial Root Token:' /root/vault-init.txt | awk '{print $NF}')
    
    # Login
    vault login "$ROOT_TOKEN"
    
    print_info "Logged in successfully"
}

# Create initial policies and secrets
setup_initial_config() {
    print_info "Setting up initial configuration..."
    
    # Enable KV v2 secrets engine
    vault secrets enable -version=2 kv
    
    # Create admin policy
    vault policy write admin - <<EOF
# Admin policy - full access
path "*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}
EOF
    
    # Create developer policy
    vault policy write developer - <<EOF
# Developer policy - read secrets
path "kv/data/production/*" {
  capabilities = ["read", "list"]
}

path "kv/data/development/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
EOF
    
    # Create example secrets
    vault kv put kv/production/database \
        host="localhost" \
        port="5432" \
        username="tamshai" \
        password="CHANGEME"
    
    vault kv put kv/production/keycloak \
        client_id="tamshai-flutter-client" \
        client_secret="CHANGEME"
    
    print_info "Initial configuration complete"
}

# Print completion message
print_completion() {
    echo ""
    echo "=========================================="
    print_info "Vault installation completed!"
    echo "=========================================="
    echo ""
    echo "Next steps:"
    echo "1. Copy /root/vault-init.txt to a secure location"
    echo "2. Delete the initialization file: rm /root/vault-init.txt"
    echo "3. Replace self-signed certificates with proper SSL certs"
    echo "4. Configure auto-unseal (optional)"
    echo "5. Set up backups for $VAULT_DATA_DIR"
    echo ""
    print_warn "SECURITY: Harden SSH access immediately!"
    echo "6. Disable password authentication: Edit /etc/ssh/sshd_config"
    echo "   - Set 'PasswordAuthentication no'"
    echo "   - Set 'PermitRootLogin prohibit-password' or 'no'"
    echo "   - Restart SSH: systemctl restart sshd"
    echo "7. Use key-based authentication only"
    echo "8. Consider fail2ban for brute-force protection"
    echo ""
    echo "Vault API: https://${DOMAIN}:8200"
    echo "Vault UI:  https://${DOMAIN}:8200/ui"
    echo ""
    echo "Environment variables:"
    echo "  export VAULT_ADDR='https://127.0.0.1:8200'"
    echo "  export VAULT_SKIP_VERIFY=1  # Only for self-signed certs"
    echo ""
    echo "To unseal Vault after restart:"
    echo "  vault operator unseal <key1>"
    echo "  vault operator unseal <key2>"
    echo "  vault operator unseal <key3>"
    echo ""
    print_warn "IMPORTANT: Store unseal keys and root token securely!"
    echo "=========================================="
}

# Main installation function
main() {
    print_info "Starting Vault installation..."
    
    check_root
    install_dependencies
    create_vault_user
    install_vault
    generate_tls_certs
    create_vault_config
    create_systemd_service
    configure_firewall
    start_vault
    setup_environment
    
    # Interactive initialization
    echo ""
    read -p "Do you want to initialize Vault now? (y/n) " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        initialize_vault
        unseal_vault
        login_vault
        setup_initial_config
    else
        print_info "Skipping initialization. Run 'vault operator init' manually."
    fi
    
    print_completion
}

# Run main function
main

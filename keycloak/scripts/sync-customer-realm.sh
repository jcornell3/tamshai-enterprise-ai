#!/bin/bash
# =============================================================================
# Keycloak Customer Realm Synchronization Script
# =============================================================================
#
# This script synchronizes the tamshai-customers realm configuration for
# external customer authentication in the Customer Support Portal.
#
# Usage:
#   ./sync-customer-realm.sh [environment]
#
# Environments:
#   dev    - Local development (default)
#   stage  - VPS staging
#   prod   - Production
#
# Examples:
#   ./sync-customer-realm.sh           # Sync to local dev
#   ./sync-customer-realm.sh stage     # Sync to VPS stage
#
# Requirements:
#   - Keycloak must be running and accessible
#   - Admin credentials must be available
#   - For Docker: run inside container or with docker exec
#
# =============================================================================

set -euo pipefail
set +H  # Disable history expansion for passwords with special characters

# =============================================================================
# Script Configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CUSTOMER_REALM="tamshai-customers"
ENV="${1:-dev}"

# =============================================================================
# Source Library Modules
# =============================================================================

source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/auth.sh"

# =============================================================================
# Customer Realm Configuration
# =============================================================================

# Configure environment based on target
configure_customer_environment() {
    case "$ENV" in
        dev)
            KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080/auth}"
            ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
            ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
            CUSTOMER_PORTAL_URL="http://localhost:4006"
            ;;
        stage|staging)
            KEYCLOAK_URL="${KEYCLOAK_URL:-https://www.tamshai.com}"
            ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
            ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:?Stage requires KEYCLOAK_ADMIN_PASSWORD}"
            CUSTOMER_PORTAL_URL="https://customers.tamshai.com"
            ;;
        prod|production)
            KEYCLOAK_URL="${KEYCLOAK_URL:-https://keycloak.tamshai.com}"
            ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
            ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:?Prod requires KEYCLOAK_ADMIN_PASSWORD}"
            CUSTOMER_PORTAL_URL="https://customers.tamshai.com"
            ;;
        *)
            log_error "Unknown environment: $ENV"
            exit 1
            ;;
    esac

    log_info "Environment: $ENV"
    log_info "Keycloak URL: $KEYCLOAK_URL"
    log_info "Customer Realm: $CUSTOMER_REALM"
}

# Login to Keycloak admin
kcadm_customer_login() {
    log_info "Authenticating to Keycloak..."

    _kcadm config credentials \
        --server "$KEYCLOAK_URL" \
        --realm master \
        --user "$ADMIN_USER" \
        --password "$ADMIN_PASSWORD" 2>/dev/null || {
            log_error "Failed to authenticate to Keycloak"
            exit 1
        }

    log_info "Authentication successful"
}

# =============================================================================
# Realm Creation
# =============================================================================

create_customer_realm() {
    log_info "Checking if customer realm exists..."

    if _kcadm get realms/"$CUSTOMER_REALM" &>/dev/null; then
        log_info "Customer realm '$CUSTOMER_REALM' already exists"
        return 0
    fi

    log_info "Creating customer realm '$CUSTOMER_REALM'..."

    _kcadm create realms -s realm="$CUSTOMER_REALM" \
        -s enabled=true \
        -s displayName="Tamshai Customer Support" \
        -s registrationAllowed=false \
        -s registrationEmailAsUsername=true \
        -s verifyEmail=true \
        -s loginWithEmailAllowed=true \
        -s resetPasswordAllowed=true \
        -s bruteForceProtected=true \
        -s accessTokenLifespan=14400 \
        -s ssoSessionIdleTimeout=28800 \
        -s ssoSessionMaxLifespan=36000

    log_info "Customer realm created successfully"
}

# Set password policy for customer realm
# This is done separately because setting it during realm import causes errors
set_customer_password_policy() {
    log_info "Setting customer realm password policy..."

    # Password policy: 8+ chars, 1 uppercase, 1 lowercase, 1 digit, not username
    _kcadm update realms/"$CUSTOMER_REALM" \
        -s 'passwordPolicy=length(8) and upperCase(1) and lowerCase(1) and digits(1) and notUsername' 2>/dev/null || {
            log_warn "Failed to set password policy (may require existing users to reset)"
        }

    log_info "Password policy configured"
}

# =============================================================================
# Role Creation
# =============================================================================

create_customer_roles() {
    log_info "Creating customer roles..."

    # Lead Customer role
    if ! _kcadm get roles -r "$CUSTOMER_REALM" | grep -q 'lead-customer'; then
        _kcadm create roles -r "$CUSTOMER_REALM" \
            -s name=lead-customer \
            -s description="Lead Customer Contact - can view all org tickets and manage contacts"
        log_info "Created role: lead-customer"
    else
        log_info "Role lead-customer already exists"
    fi

    # Basic Customer role
    if ! _kcadm get roles -r "$CUSTOMER_REALM" | grep -q 'basic-customer'; then
        _kcadm create roles -r "$CUSTOMER_REALM" \
            -s name=basic-customer \
            -s description="Basic Customer - can only view/create own tickets"
        log_info "Created role: basic-customer"
    else
        log_info "Role basic-customer already exists"
    fi
}

# =============================================================================
# Client Scope Creation
# =============================================================================

create_organization_scope() {
    log_info "Creating organization client scope..."

    # Check if scope exists
    local scope_id
    scope_id=$(_kcadm get client-scopes -r "$CUSTOMER_REALM" --fields id,name | \
        grep -B1 '"organization"' | grep '"id"' | sed 's/.*"id"[^"]*"\([^"]*\)".*/\1/' || echo "")

    if [ -n "$scope_id" ]; then
        log_info "Organization scope already exists (id: $scope_id)"
        return 0
    fi

    # Create the scope
    _kcadm create client-scopes -r "$CUSTOMER_REALM" \
        -s name=organization \
        -s description="Organization membership scope for customer contacts" \
        -s protocol=openid-connect \
        -s 'attributes.include.in.token.scope=true' \
        -s 'attributes.display.on.consent.screen=true'

    # Get the new scope ID
    scope_id=$(_kcadm get client-scopes -r "$CUSTOMER_REALM" --fields id,name | \
        grep -B1 '"organization"' | grep '"id"' | sed 's/.*"id"[^"]*"\([^"]*\)".*/\1/')

    log_info "Created organization scope (id: $scope_id)"

    # Add organization_id mapper
    _kcadm create client-scopes/"$scope_id"/protocol-mappers/models -r "$CUSTOMER_REALM" \
        -s name=organization_id \
        -s protocol=openid-connect \
        -s protocolMapper=oidc-usermodel-attribute-mapper \
        -s consentRequired=false \
        -s 'config.userinfo.token.claim=true' \
        -s 'config.user.attribute=organization_id' \
        -s 'config.id.token.claim=true' \
        -s 'config.access.token.claim=true' \
        -s 'config.claim.name=organization_id' \
        -s 'config.jsonType.label=String'

    log_info "Added organization_id mapper"

    # Add organization_name mapper
    _kcadm create client-scopes/"$scope_id"/protocol-mappers/models -r "$CUSTOMER_REALM" \
        -s name=organization_name \
        -s protocol=openid-connect \
        -s protocolMapper=oidc-usermodel-attribute-mapper \
        -s consentRequired=false \
        -s 'config.userinfo.token.claim=true' \
        -s 'config.user.attribute=organization_name' \
        -s 'config.id.token.claim=true' \
        -s 'config.access.token.claim=true' \
        -s 'config.claim.name=organization_name' \
        -s 'config.jsonType.label=String'

    log_info "Added organization_name mapper"
}

# =============================================================================
# Client Creation
# =============================================================================

create_customer_portal_client() {
    log_info "Creating customer-portal client..."

    # Build redirect URIs and web origins per environment
    # Dev includes Caddy :8443 variants, direct Docker ports, and localhost
    local redirect_uris web_origins
    case "$ENV" in
        dev)
            redirect_uris='["http://localhost:4007/*","http://127.0.0.1:4007/*","https://customers.tamshai.local/*"]'
            web_origins='["http://localhost:4007","http://127.0.0.1:4007","https://customers.tamshai.local"]'
            ;;
        stage)
            redirect_uris='["https://customers.tamshai.com/*"]'
            web_origins='["https://customers.tamshai.com"]'
            ;;
        prod)
            redirect_uris='["https://customers.tamshai.com/*"]'
            web_origins='["https://customers.tamshai.com"]'
            ;;
    esac

    # Check if client exists
    local client_id
    client_id=$(_kcadm get clients -r "$CUSTOMER_REALM" --fields id,clientId | \
        grep -B1 '"customer-portal"' | grep '"id"' | sed 's/.*"id"[^"]*"\([^"]*\)".*/\1/' || echo "")

    if [ -n "$client_id" ]; then
        log_info "Customer portal client already exists (id: $client_id)"

        # Update redirect URIs
        _kcadm update clients/"$client_id" -r "$CUSTOMER_REALM" \
            -s "redirectUris=$redirect_uris" \
            -s "webOrigins=$web_origins"

        log_info "Updated customer portal redirect URIs"
        return 0
    fi

    # Create the client
    _kcadm create clients -r "$CUSTOMER_REALM" \
        -s clientId=customer-portal \
        -s name="Customer Support Portal" \
        -s description="Customer-facing support portal web application" \
        -s enabled=true \
        -s publicClient=true \
        -s standardFlowEnabled=true \
        -s implicitFlowEnabled=false \
        -s directAccessGrantsEnabled=true \
        -s protocol=openid-connect \
        -s rootUrl="$CUSTOMER_PORTAL_URL" \
        -s baseUrl="/" \
        -s "redirectUris=$redirect_uris" \
        -s "webOrigins=$web_origins" \
        -s 'attributes.pkce.code.challenge.method=S256'

    log_info "Created customer-portal client"

    # Get the new client ID
    client_id=$(_kcadm get clients -r "$CUSTOMER_REALM" --fields id,clientId | \
        grep -B1 '"customer-portal"' | grep '"id"' | sed 's/.*"id"[^"]*"\([^"]*\)".*/\1/')

    # Add organization scope as default
    local scope_id
    scope_id=$(_kcadm get client-scopes -r "$CUSTOMER_REALM" --fields id,name | \
        grep -B1 '"organization"' | grep '"id"' | sed 's/.*"id"[^"]*"\([^"]*\)".*/\1/' || echo "")

    if [ -n "$scope_id" ]; then
        _kcadm update clients/"$client_id"/default-client-scopes/"$scope_id" -r "$CUSTOMER_REALM" || true
        log_info "Added organization scope to customer-portal client"
    fi

    # Add audience mapper for mcp-gateway
    _kcadm create clients/"$client_id"/protocol-mappers/models -r "$CUSTOMER_REALM" \
        -s name=mcp-gateway-audience \
        -s protocol=openid-connect \
        -s protocolMapper=oidc-audience-mapper \
        -s consentRequired=false \
        -s 'config.included.client.audience=mcp-gateway' \
        -s 'config.id.token.claim=false' \
        -s 'config.access.token.claim=true'

    log_info "Added mcp-gateway audience mapper"
}

# =============================================================================
# Group Creation
# =============================================================================

create_customer_groups() {
    log_info "Creating customer groups..."

    # Lead Contacts group
    if ! _kcadm get groups -r "$CUSTOMER_REALM" | grep -q 'Lead-Contacts'; then
        _kcadm create groups -r "$CUSTOMER_REALM" -s name=Lead-Contacts

        # Get group ID and assign role
        local group_id
        group_id=$(_kcadm get groups -r "$CUSTOMER_REALM" --fields id,name | \
            grep -B1 '"Lead-Contacts"' | grep '"id"' | sed 's/.*"id"[^"]*"\([^"]*\)".*/\1/')

        _kcadm add-roles -r "$CUSTOMER_REALM" --gid "$group_id" --rolename lead-customer
        log_info "Created group: Lead-Contacts with lead-customer role"
    else
        log_info "Group Lead-Contacts already exists"
    fi

    # Basic Contacts group
    if ! _kcadm get groups -r "$CUSTOMER_REALM" | grep -q 'Basic-Contacts'; then
        _kcadm create groups -r "$CUSTOMER_REALM" -s name=Basic-Contacts

        # Get group ID and assign role
        local group_id
        group_id=$(_kcadm get groups -r "$CUSTOMER_REALM" --fields id,name | \
            grep -B1 '"Basic-Contacts"' | grep '"id"' | sed 's/.*"id"[^"]*"\([^"]*\)".*/\1/')

        _kcadm add-roles -r "$CUSTOMER_REALM" --gid "$group_id" --rolename basic-customer
        log_info "Created group: Basic-Contacts with basic-customer role"
    else
        log_info "Group Basic-Contacts already exists"
    fi
}

# =============================================================================
# Sample User Provisioning (Dev Only)
# =============================================================================

provision_sample_customers() {
    # Only provision sample users in dev environment
    if [ "$ENV" != "dev" ]; then
        log_info "Skipping sample customer provisioning (not dev environment)"
        return 0
    fi

    log_info "Provisioning sample customers (dev only)..."

    # Customer password from environment variable (GitHub Secret: CUSTOMER_USER_PASSWORD)
    local CUSTOMER_PWD="${CUSTOMER_USER_PASSWORD:-***REDACTED_PASSWORD***}"

    # Acme Corporation - Lead
    create_customer_user "jane.smith@acme.com" "Jane" "Smith" "Lead-Contacts" \
        "org-acme-001" "Acme Corporation" "IT Director" "$CUSTOMER_PWD"

    # Acme Corporation - Basic
    create_customer_user "bob.developer@acme.com" "Bob" "Developer" "Basic-Contacts" \
        "org-acme-001" "Acme Corporation" "Software Developer" "$CUSTOMER_PWD"

    # Globex Industries - Lead
    create_customer_user "mike.manager@globex.com" "Mike" "Manager" "Lead-Contacts" \
        "org-globex-002" "Globex Industries" "Operations Manager" "$CUSTOMER_PWD"

    # Globex Industries - Basic
    create_customer_user "sara.support@globex.com" "Sara" "Support" "Basic-Contacts" \
        "org-globex-002" "Globex Industries" "Support Specialist" "$CUSTOMER_PWD"

    # Initech Solutions - Lead
    create_customer_user "peter.principal@initech.com" "Peter" "Principal" "Lead-Contacts" \
        "org-initech-003" "Initech Solutions" "IT Manager" "$CUSTOMER_PWD"

    # Initech Solutions - Basic
    create_customer_user "tim.tech@initech.com" "Tim" "Tech" "Basic-Contacts" \
        "org-initech-003" "Initech Solutions" "Developer" "$CUSTOMER_PWD"

    log_info "Sample customers provisioned"
}

# Create or update a customer user (idempotent)
create_customer_user() {
    local email="$1"
    local first_name="$2"
    local last_name="$3"
    local group="$4"
    local org_id="$5"
    local org_name="$6"
    local title="$7"
    local password="$8"

    # Check if user exists
    local user_id
    user_id=$(_kcadm get users -r "$CUSTOMER_REALM" -q "email=$email" --fields id | \
        grep '"id"' | sed 's/.*"id" : "\([^"]*\)".*/\1/' || echo "")

    if [ -z "$user_id" ]; then
        # Create user
        _kcadm create users -r "$CUSTOMER_REALM" \
            -s username="$email" \
            -s email="$email" \
            -s firstName="$first_name" \
            -s lastName="$last_name" \
            -s enabled=true \
            -s emailVerified=true \
            -s "attributes.organization_id=[\"$org_id\"]" \
            -s "attributes.organization_name=[\"$org_name\"]" \
            -s "attributes.title=[\"$title\"]"

        # Get the new user ID
        user_id=$(_kcadm get users -r "$CUSTOMER_REALM" -q "email=$email" --fields id | \
            grep '"id"' | sed 's/.*"id" : "\([^"]*\)".*/\1/')

        log_info "Created user: $email"
    else
        log_info "User $email already exists — ensuring password and group"
    fi

    # Always set password (idempotent — ensures correct password after realm import)
    _kcadm set-password -r "$CUSTOMER_REALM" --username "$email" --new-password "$password"

    # Always ensure group membership
    local group_id
    group_id=$(_kcadm get groups -r "$CUSTOMER_REALM" --fields id,name | \
        grep -B1 "\"$group\"" | grep '"id"' | sed 's/.*"id"[^"]*"\([^"]*\)".*/\1/' || echo "")

    if [ -n "$group_id" ]; then
        _kcadm update users/"$user_id"/groups/"$group_id" -r "$CUSTOMER_REALM" -s realm="$CUSTOMER_REALM" -n || true
        log_info "Ensured user $email in group $group"
    else
        log_warn "Could not find group $group for user $email"
    fi
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
    log_info "=========================================="
    log_info "Customer Realm Sync - Starting"
    log_info "=========================================="

    # Configure environment and authenticate
    configure_customer_environment
    kcadm_customer_login

    # Create realm if needed
    create_customer_realm

    # Set password policy (done after realm exists to avoid import errors)
    set_customer_password_policy

    # Create roles
    create_customer_roles

    # Create organization scope
    create_organization_scope

    # Create customer-portal client
    create_customer_portal_client

    # Create groups
    create_customer_groups

    # Provision sample customers (dev only)
    provision_sample_customers

    log_info "=========================================="
    log_info "Customer Realm Sync - Complete"
    log_info "=========================================="
}

main "$@"

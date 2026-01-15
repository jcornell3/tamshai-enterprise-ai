#!/bin/bash
# =============================================================================
# Read GitHub Secrets via Workflow
# =============================================================================
#
# Retrieves GitHub secrets by triggering the export-test-secrets workflow,
# then downloads and displays the values.
#
# Usage:
#   ./read-github-secrets.sh [options]
#
# Options:
#   --e2e             Get E2E test secrets (TEST_PASSWORD, TEST_TOTP_SECRET)
#   --keycloak        Get Keycloak admin password
#   --user-passwords  Get user passwords (DEV/STAGE/PROD_USER_PASSWORD)
#   --all             Get all available secrets
#   --env             Output as environment variables (for eval)
#   --json            Output as JSON
#
# Examples:
#   ./read-github-secrets.sh --e2e                    # Get E2E test credentials
#   ./read-github-secrets.sh --e2e --env              # Output for eval
#   eval $(./read-github-secrets.sh --e2e --env)      # Set env vars directly
#   ./read-github-secrets.sh --all --json             # All secrets as JSON
#
# Prerequisites:
#   - GitHub CLI (gh) authenticated
#   - Repository access
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Default options
SECRET_TYPE="e2e"
OUTPUT_FORMAT="text"

# Parse arguments
while [ $# -gt 0 ]; do
    case "$1" in
        --e2e) SECRET_TYPE="e2e"; shift ;;
        --keycloak) SECRET_TYPE="keycloak"; shift ;;
        --user-passwords) SECRET_TYPE="user-passwords"; shift ;;
        --all) SECRET_TYPE="all"; shift ;;
        --env) OUTPUT_FORMAT="env"; shift ;;
        --json) OUTPUT_FORMAT="json"; shift ;;
        --help|-h)
            head -30 "$0" | tail -25
            exit 0
            ;;
        *) shift ;;
    esac
done

# Colors (only for text output to stderr)
log_info() { [ "$OUTPUT_FORMAT" = "text" ] && echo -e "\033[0;32m[INFO]\033[0m $1" >&2 || true; }
log_warn() { [ "$OUTPUT_FORMAT" = "text" ] && echo -e "\033[1;33m[WARN]\033[0m $1" >&2 || true; }
log_error() { echo -e "\033[0;31m[ERROR]\033[0m $1" >&2; }

# Check prerequisites
check_prerequisites() {
    if ! command -v gh &>/dev/null; then
        log_error "GitHub CLI (gh) not installed. Install: https://cli.github.com/"
        exit 1
    fi

    if ! gh auth status &>/dev/null 2>&1; then
        log_error "GitHub CLI not authenticated. Run: gh auth login"
        exit 1
    fi
}

# Trigger workflow and wait for completion
trigger_and_wait() {
    local workflow="export-test-secrets.yml"

    log_info "Triggering workflow with secret_type=$SECRET_TYPE..."
    gh workflow run "$workflow" -f "secret_type=$SECRET_TYPE"

    log_info "Waiting for workflow to start..."
    sleep 5

    # Get the latest run ID
    local run_id=""
    for i in {1..10}; do
        run_id=$(gh run list --workflow="$workflow" --limit=1 --json databaseId,status,createdAt \
            -q '.[0].databaseId' 2>/dev/null) || true
        if [ -n "$run_id" ]; then
            break
        fi
        sleep 2
    done

    if [ -z "$run_id" ]; then
        log_error "Could not find workflow run"
        exit 1
    fi

    log_info "Waiting for workflow run $run_id to complete..."

    # Wait for completion (max 2 minutes)
    for i in {1..40}; do
        local status=$(gh run view "$run_id" --json status -q '.status' 2>/dev/null) || true
        local conclusion=$(gh run view "$run_id" --json conclusion -q '.conclusion' 2>/dev/null) || true

        if [ "$status" = "completed" ]; then
            if [ "$conclusion" = "success" ]; then
                log_info "Workflow completed successfully"
                echo "$run_id"
                return 0
            else
                log_error "Workflow failed with conclusion: $conclusion"
                exit 1
            fi
        fi
        sleep 3
    done

    log_error "Workflow did not complete in time"
    exit 1
}

# Download and output secrets
download_and_output() {
    local run_id="$1"
    local temp_dir=$(mktemp -d)

    log_info "Downloading secrets artifact..."
    gh run download "$run_id" -n "secrets-export" -D "$temp_dir" 2>/dev/null || {
        log_error "Failed to download artifact. Check workflow run: gh run view $run_id"
        rm -rf "$temp_dir"
        exit 1
    }

    # Output based on format
    case "$OUTPUT_FORMAT" in
        env)
            for file in "$temp_dir"/*; do
                if [ -f "$file" ]; then
                    local name=$(basename "$file")
                    local value=$(cat "$file" | tr -d '\n')
                    echo "export $name=\"$value\""
                fi
            done
            ;;
        json)
            echo "{"
            local first=true
            for file in "$temp_dir"/*; do
                if [ -f "$file" ]; then
                    local name=$(basename "$file")
                    local value=$(cat "$file" | tr -d '\n')
                    if [ "$first" = true ]; then
                        first=false
                    else
                        echo ","
                    fi
                    printf '  "%s": "%s"' "$name" "$value"
                fi
            done
            echo ""
            echo "}"
            ;;
        text)
            echo ""
            echo "=========================================="
            echo "Retrieved Secrets ($SECRET_TYPE)"
            echo "=========================================="
            for file in "$temp_dir"/*; do
                if [ -f "$file" ]; then
                    local name=$(basename "$file")
                    local value=$(cat "$file" | tr -d '\n')
                    echo "$name=$value"
                fi
            done
            echo "=========================================="
            echo ""
            echo "To use these in your shell:"
            echo "  eval \$(./scripts/secrets/read-github-secrets.sh --$SECRET_TYPE --env)"
            ;;
    esac

    # Cleanup
    rm -rf "$temp_dir"

    # Delete the workflow run for security
    log_info "Deleting workflow run for security..."
    gh run delete "$run_id" --yes 2>/dev/null || log_warn "Could not delete run (may require manual cleanup)"
}

main() {
    check_prerequisites

    log_info "Secret type: $SECRET_TYPE"

    local run_id=$(trigger_and_wait)
    download_and_output "$run_id"
}

main "$@"

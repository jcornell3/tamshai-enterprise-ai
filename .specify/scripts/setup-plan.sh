#!/bin/bash
# Generate implementation plan from a specification

set -e

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

PROJECT_ROOT=$(get_project_root)

# Usage information
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Generate an implementation plan from a feature specification.

OPTIONS:
    -s, --spec SPEC_DIR       Spec directory (e.g., 001-foundation)
    -h, --help               Show this help message

EXAMPLES:
    $0 --spec 001-foundation
    $0 --spec 007-customer-risk-score

EOF
}

# Parse arguments
SPEC_DIR=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -s|--spec)
            SPEC_DIR="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Validate spec directory
if [ -z "$SPEC_DIR" ]; then
    log_error "Spec directory is required"
    usage
    exit 1
fi

FULL_SPEC_PATH="$PROJECT_ROOT/.specify/specs/$SPEC_DIR"

if ! dir_exists "$FULL_SPEC_PATH"; then
    log_error "Spec directory not found: $FULL_SPEC_PATH"
    exit 1
fi

# Check if spec.md exists
if ! file_exists "$FULL_SPEC_PATH/spec.md"; then
    log_error "spec.md not found in $FULL_SPEC_PATH"
    exit 1
fi

log_info "Validating specification: $SPEC_DIR"

# Check if plan.md exists
if file_exists "$FULL_SPEC_PATH/plan.md"; then
    log_warning "plan.md already exists. This script will help you review it."
    log_info "Content of current plan.md:"
    cat "$FULL_SPEC_PATH/plan.md"
else
    log_error "plan.md not found. Please create it from the template first."
    exit 1
fi

log_success "Specification validated: $SPEC_DIR"
log_info "Review the plan.md file and update as needed."
log_info "To generate tasks, run: ./scripts/setup-tasks.sh --spec $SPEC_DIR"

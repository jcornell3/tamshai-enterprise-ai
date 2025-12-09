#!/bin/bash
# Create a new feature specification using GitHub Spec Kit

set -e

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

PROJECT_ROOT=$(get_project_root)

# Usage information
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Create a new feature specification in the GitHub Spec Kit structure.

OPTIONS:
    -n, --name FEATURE_NAME    Name of the feature (required)
    -s, --spec-number NUMBER   Spec number (format: XXX, e.g., 007)
                              If not provided, will auto-increment
    -h, --help                Show this help message

EXAMPLES:
    # Auto-increment spec number
    $0 --name "customer-risk-score"

    # Specify custom spec number
    $0 --name "customer-risk-score" --spec-number 007

EOF
}

# Parse arguments
FEATURE_NAME=""
SPEC_NUMBER=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--name)
            FEATURE_NAME="$2"
            shift 2
            ;;
        -s|--spec-number)
            SPEC_NUMBER="$2"
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

# Validate feature name
if [ -z "$FEATURE_NAME" ]; then
    log_error "Feature name is required"
    usage
    exit 1
fi

# Get or validate spec number
if [ -z "$SPEC_NUMBER" ]; then
    SPEC_NUMBER=$(get_next_spec_number)
    log_info "Auto-generated spec number: $SPEC_NUMBER"
else
    validate_spec_number "$SPEC_NUMBER" || exit 1
fi

# Create spec directory
SPEC_DIR="$PROJECT_ROOT/.specify/specs/${SPEC_NUMBER}-${FEATURE_NAME}"

if dir_exists "$SPEC_DIR"; then
    log_error "Spec directory already exists: $SPEC_DIR"
    exit 1
fi

ensure_dir "$SPEC_DIR"

# Copy templates
log_info "Creating specification files from templates..."

cp "$PROJECT_ROOT/.github/templates/spec-template.md" "$SPEC_DIR/spec.md"
cp "$PROJECT_ROOT/.github/templates/plan-template.md" "$SPEC_DIR/plan.md"
cp "$PROJECT_ROOT/.github/templates/tasks-template.md" "$SPEC_DIR/tasks.md"

# Replace placeholders in files
sed -i "s/\[Feature Name\]/${FEATURE_NAME}/g" "$SPEC_DIR/spec.md"
sed -i "s/\[Feature Name\]/${FEATURE_NAME}/g" "$SPEC_DIR/plan.md"
sed -i "s/\[Feature Name\]/${FEATURE_NAME}/g" "$SPEC_DIR/tasks.md"

log_success "Created new feature specification: $SPEC_DIR"
log_info "Next steps:"
log_info "  1. Edit $SPEC_DIR/spec.md to define the feature"
log_info "  2. Run ./scripts/setup-plan.sh to generate implementation plan"
log_info "  3. Use the plan to guide development"

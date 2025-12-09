#!/bin/bash
# Update CLAUDE.md with references to latest specifications

set -e

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

PROJECT_ROOT=$(get_project_root)
CLAUDE_MD="$PROJECT_ROOT/CLAUDE.md"

# Usage information
usage() {
    cat << EOF
Usage: $0

Update CLAUDE.md with a summary of all specifications.
This helps Claude Code understand the current state of all features.

EOF
}

log_info "Updating CLAUDE.md with specification references..."

# Check if CLAUDE.md exists
if ! file_exists "$CLAUDE_MD"; then
    log_error "CLAUDE.md not found at $CLAUDE_MD"
    exit 1
fi

# Generate spec summary
SPECS_DIR="$PROJECT_ROOT/.specify/specs"
SPEC_SUMMARY=""

if dir_exists "$SPECS_DIR"; then
    log_info "Scanning specifications..."

    for spec_dir in "$SPECS_DIR"/*; do
        if [ -d "$spec_dir" ]; then
            SPEC_NAME=$(basename "$spec_dir")
            SPEC_FILE="$spec_dir/spec.md"

            if file_exists "$SPEC_FILE"; then
                # Extract title from spec.md
                TITLE=$(grep -m 1 "^# Specification:" "$SPEC_FILE" | sed 's/# Specification: //')

                # Check status based on content or phase
                STATUS="Planned"
                if grep -q "COMPLETED" "$SPEC_FILE" 2>/dev/null; then
                    STATUS="Completed"
                elif grep -q "IN PROGRESS" "$SPEC_FILE" 2>/dev/null; then
                    STATUS="In Progress"
                fi

                SPEC_SUMMARY+="- **$SPEC_NAME**: $TITLE [$STATUS]\n"
                SPEC_SUMMARY+="  - Spec: [.specify/specs/$SPEC_NAME/spec.md](.specify/specs/$SPEC_NAME/spec.md)\n"
                SPEC_SUMMARY+="  - Plan: [.specify/specs/$SPEC_NAME/plan.md](.specify/specs/$SPEC_NAME/plan.md)\n"
                SPEC_SUMMARY+="  - Tasks: [.specify/specs/$SPEC_NAME/tasks.md](.specify/specs/$SPEC_NAME/tasks.md)\n\n"
            fi
        fi
    done
fi

if [ -z "$SPEC_SUMMARY" ]; then
    log_warning "No specifications found in $SPECS_DIR"
    exit 0
fi

# Create the specification section content
SPEC_SECTION="## GitHub Spec Kit Specifications

The following specifications define the features and implementation plans for this project:

$SPEC_SUMMARY

For more information, see:
- [Constitution](docs/architecture/constitution.md) - Core principles and standards
- [Spec Template](.github/templates/spec-template.md) - Template for new features
- [Plan Template](.github/templates/plan-template.md) - Template for implementation plans
"

# Check if the section already exists
if grep -q "## GitHub Spec Kit Specifications" "$CLAUDE_MD"; then
    log_info "Updating existing GitHub Spec Kit section..."

    # Create a temporary file with the updated content
    awk -v spec_section="$SPEC_SECTION" '
        /## GitHub Spec Kit Specifications/ {
            print spec_section
            in_spec_section=1
            next
        }
        /^## [^#]/ && in_spec_section {
            in_spec_section=0
        }
        !in_spec_section {
            print
        }
    ' "$CLAUDE_MD" > "$CLAUDE_MD.tmp"

    mv "$CLAUDE_MD.tmp" "$CLAUDE_MD"
else
    log_info "Adding new GitHub Spec Kit section..."

    # Append to the end of the file
    echo -e "\n---\n\n$SPEC_SECTION" >> "$CLAUDE_MD"
fi

log_success "CLAUDE.md updated with specification references"
log_info "Review the changes and commit if appropriate"

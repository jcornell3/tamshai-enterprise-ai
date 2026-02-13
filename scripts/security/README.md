# Security Scripts

This directory contains security automation scripts for vulnerability monitoring, dependency checking, and compliance validation.

## Scripts

### check-grype-ignores.sh

**Purpose:** Re-evaluate Grype vulnerability scan ignores to ensure they remain justified.

**Usage:**

```bash
./scripts/security/check-grype-ignores.sh
```

**Exit Codes:**
- `0` - All ignores are still justified
- `1` - One or more ignores should be removed (patches available)
- `2` - Script error (missing dependencies)

**What It Checks:**

1. **Hono CVE Fixes** (CVE-2026-22817, CVE-2026-22818)
   - Verifies installed Hono version includes patches (>= 4.11.4)
   - Recommends removing ignores if patched

2. **Alpine Security Updates** (CVE-2026-22184, CVE-2025-60876)
   - Checks Alpine security advisories for patch availability
   - Verifies Dockerfiles include `apk upgrade`

3. **npm Runtime Usage**
   - Scans Dockerfiles for npm usage at runtime
   - Confirms production containers use `node dist/index.js` directly

**Dependencies:**
- `jq` - JSON parsing
- `curl` - HTTP requests
- `npm` - Node.js package manager

**Automation:**

This script runs automatically via GitHub Actions:
- **Workflow:** `.github/workflows/security-vulnerability-monitoring.yml`
- **Schedule:** Every Monday at 9:00 AM UTC
- **Triggers:** Weekly schedule, manual dispatch, PR changes to security files

**Output Example:**

```text
ℹ Starting Grype ignore re-evaluation...

ℹ Checking Hono CVE fixes...
ℹ Installed Hono version: 4.11.9
✓ Hono 4.11.9 includes CVE-2026-22817/22818 fixes
⚠ Consider removing Hono CVE ignores from .grype.yaml

ℹ Checking Alpine Linux security advisories...
ℹ Checking CVE-2026-22184...
ℹ CVE-2026-22184 - No patches available yet
ℹ Checking CVE-2025-60876...
ℹ CVE-2025-60876 - No patches available yet

ℹ Checking if npm is used at runtime in production containers...
✓ No npm runtime usage detected - ignores are justified

==================================
Grype Ignore Re-evaluation Report
==================================
Date: 2026-02-12 14:30:00 UTC

⚠ Some Grype ignores should be re-evaluated

Action Items:
  • Review warnings above
  • Update .grype.yaml to remove outdated ignores
  • Run 'grype dir:.' to verify fixes
  • Update dependency versions if needed
==================================
```

## Related Documentation

- [Vulnerability Monitoring Guide](../../docs/security/VULNERABILITY_MONITORING.md)
- [Grype Configuration](../../.grype.yaml)
- [Security Model](../../docs/security/SECURITY_MODEL.md)

## CI/CD Integration

All scripts in this directory are integrated into our CI/CD pipeline:

- **security-vulnerability-monitoring.yml** - Weekly automated checks
- **ci.yml** - npm audit on every PR
- **codeql.yml** - Static analysis on push to main

See [Testing & CI/CD Config](../../.specify/specs/011-qa-testing/TESTING_CI_CD_CONFIG.md) for complete CI/CD documentation.

## Adding New Scripts

When adding new security scripts:

1. **Name:** Use kebab-case (e.g., `check-secrets-leakage.sh`)
2. **Shebang:** `#!/usr/bin/env bash`
3. **Options:** Start with `set -euo pipefail`
4. **Exit Codes:** Document exit codes in header comment
5. **Help:** Support `--help` flag with usage information
6. **Automation:** Add to CI/CD workflow if applicable
7. **Documentation:** Update this README

**Template:**

```bash
#!/usr/bin/env bash
#
# Script Name
# Purpose: Brief description
# Usage: ./scripts/security/script-name.sh [options]
#
# Exit codes:
#   0 - Success
#   1 - Failure
#   2 - Script error
#

set -euo pipefail

# Script implementation...
```

## Testing

Test scripts locally before committing:

```bash
# Run script
./scripts/security/check-grype-ignores.sh

# Check exit code
echo $?

# Test in Docker (no local dependencies)
docker run --rm -v $(pwd):/repo -w /repo ubuntu:22.04 bash -c "
  apt-get update && apt-get install -y jq curl nodejs npm
  ./scripts/security/check-grype-ignores.sh
"
```

## Support

For questions or issues:

- **Security concerns:** Contact Security Team (<claude-qa@tamshai.com>)
- **Script bugs:** Create GitHub issue with label `security`, `bug`
- **Workflow failures:** Check GitHub Actions logs

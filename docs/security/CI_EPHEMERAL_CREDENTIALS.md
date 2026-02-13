# CI Ephemeral Credentials — Security Decision Record

**Date**: 2026-02-09
**Status**: Accepted
**Context**: Security Audit Remediation (R11, D3)

## Decision: `tamshai_password` in CI is acceptable

The `.github/workflows/ci.yml` (lines 397-434) uses a hardcoded password `tamshai_password` for PostgreSQL and MongoDB service containers. This was flagged during the Feb 2026 security audit and reviewed as **acceptable risk**.

### Why this is safe

| Property | Value |
|----------|-------|
| **Container lifetime** | Ephemeral — destroyed after each CI run |
| **Network exposure** | None — GitHub Actions runners are isolated |
| **Data sensitivity** | None — containers start empty, load test fixtures |
| **Persistence** | None — no volumes, no data survives the run |
| **Internet accessibility** | None — service ports are bound to the runner only |

### CI container configuration

```yaml
# .github/workflows/ci.yml (lines 397-434)
env:
  DB_PASSWORD: tamshai_password
  MONGODB_PASSWORD: tamshai_password

services:
  postgres:
    env:
      POSTGRES_USER: tamshai
      POSTGRES_PASSWORD: tamshai_password  # Ephemeral container only
  mongodb:
    env:
      MONGO_INITDB_ROOT_PASSWORD: tamshai_password  # Ephemeral container only
```

### What would NOT be acceptable

- Using this password in `.env` files checked into the repo
- Using this password for any persistent or internet-accessible database
- Using this password in stage or production environments
- Storing real credentials (API keys, user passwords) in workflow files

### Comparison with environment secrets

| Credential Type | Storage | Usage |
|----------------|---------|-------|
| CI database passwords | Hardcoded in workflow | Ephemeral test containers |
| `DEV_USER_PASSWORD` | GitHub Secrets | Dev Keycloak users |
| `CLAUDE_API_KEY` | GitHub Secrets | API access (billable) |
| `MCP_GATEWAY_CLIENT_SECRET` | GitHub Secrets | Service authentication |

---

## Gitleaks Pre-Commit Hook Setup (D3)

### Requirements for new developers

1. **Install pre-commit** (if not already installed):

   ```bash
   pip install pre-commit
   # or: brew install pre-commit (macOS)
   # or: choco install pre-commit (Windows)
   ```

2. **Install the hook**:

   ```bash
   cd /path/to/Tamshai-AI-Playground
   pre-commit install
   ```

3. **Verify the hook is active**:

   ```bash
   ls -la .git/hooks/pre-commit
   # Should exist and be executable
   ```

4. **Test that gitleaks catches secrets**:

   ```bash
   echo "password=secret123" | gitleaks protect --staged
   # Should report a finding
   ```

### Configuration

The gitleaks configuration is in `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.x.x
    hooks:
      - id: gitleaks
```

### Known allowlisted patterns

The `.gitleaksignore` file (if present) contains patterns that are explicitly allowed:
- CI ephemeral passwords (see decision above)
- Test fixture data with dummy values
- Documentation examples

### Troubleshooting

If gitleaks blocks a commit unexpectedly:
1. Review the finding — is it a real secret or a false positive?
2. If false positive: add a `# gitleaks:allow` comment on the line, or add to `.gitleaksignore`
3. If real secret: remove it and use environment variables or GitHub Secrets instead
4. Never use `--no-verify` to bypass the hook without understanding why it triggered

---

*Last Updated: 2026-02-09*
*Security Audit: Feb 2026 Three-Pass Review*

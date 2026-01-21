# ADR-002: Phoenix Rebuild Evolution

<!--
JSON-LD metadata for machine readability
-->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "name": "ADR-002: Phoenix Rebuild Evolution",
  "headline": "Evolution of GCP Infrastructure Disaster Recovery from Manual to Fully Automated",
  "description": "Documents the journey from 15+ manual actions to 0 manual actions across 11 Phoenix rebuild iterations",
  "datePublished": "2026-01-21",
  "dateModified": "2026-01-21",
  "keywords": ["phoenix", "disaster-recovery", "gcp", "terraform", "automation", "ci-cd", "infrastructure"],
  "learningResourceType": "process-evolution",
  "articleSection": "Architecture Decision Record",
  "isPartOf": {
    "@type": "CreativeWork",
    "name": "Tamshai Project Journey"
  },
  "about": [
    { "@type": "SoftwareApplication", "name": "Terraform" },
    { "@type": "SoftwareApplication", "name": "Google Cloud Platform" },
    { "@type": "SoftwareApplication", "name": "GitHub Actions" }
  ],
  "author": {
    "@type": "Organization",
    "name": "Tamshai Corp"
  }
}
</script>

## Status

**Accepted** (January 2026)

## Context

The Tamshai Enterprise AI production environment runs on Google Cloud Platform (GCP) with multiple Cloud Run services, Cloud SQL, and supporting infrastructure. A "Phoenix Rebuild" is a complete destruction and recreation of the production environment - used for:

1. Validating disaster recovery procedures
2. Testing infrastructure-as-code completeness
3. Ensuring reproducible deployments
4. Clearing technical debt in cloud resources

The initial Phoenix rebuild process required extensive manual intervention, taking ~4 hours with 15+ manual actions. Over 11 iterations, this was reduced to ~75 minutes with 0 manual actions.

## Decision

Invest in continuous automation of the Phoenix rebuild process, documenting each manual action encountered and automating it before the next rebuild.

## Evolution Journey

### Phase 1: Initial Pain (Phoenix v1-v2)

**Manual Actions**: 15+
**Duration**: ~4 hours
**Key Issues**:
- Terraform state conflicts
- Service account permission gaps
- Keycloak realm configuration not automated
- Database migrations required manual execution
- SSL certificate provisioning delays

### Phase 2: Script Automation (Phoenix v3-v5)

**Manual Actions**: 8-10
**Duration**: ~2 hours
**Improvements**:
- Created `phoenix-rebuild.sh` script
- Automated Keycloak realm sync
- Added database initialization scripts
- Implemented service health checks

**Remaining Issues**:
- Issue #49: Keycloak realm sync timeout on cold start
- Manual Cloud SQL proxy setup
- E2E test environment configuration

### Phase 3: CI/CD Integration (Phoenix v6-v8)

**Manual Actions**: 3-5
**Duration**: ~90 minutes
**Improvements**:
- GitHub Actions workflows for deployment
- Automated identity-sync for user provisioning
- Keycloak warmup calls before sync
- Automated E2E test execution

**Remaining Issues**:
- Issue #32: `_REGION` substitution failures
- Occasional Terraform state lock issues
- SSL certificate timing issues

### Phase 4: Full Automation (Phoenix v9-v11)

**Manual Actions**: 0
**Duration**: ~75 minutes
**Final Fixes**:

| Issue | Problem | Solution | Version |
|-------|---------|----------|---------|
| #32 | `_REGION` not substituted in provision-users | Inline CLOUD_SQL_INSTANCE construction | v10 |
| #36 | Terraform state lock deadlock | GCS lock file check before plan | v10 |
| #37 | mcp-gateway SSL startup failure | Staged deployment with 60s SSL wait | v11 |
| #49 | Keycloak cold start timeout | Warmup curl loop before sync | v4 |

## Consequences

### Positive

- **Disaster Recovery Confidence**: Can rebuild production in ~75 minutes
- **Infrastructure Reproducibility**: 100% automated, no tribal knowledge required
- **Documentation**: Each issue documented in PHOENIX_MANUAL_ACTIONSv*.md files
- **Testing**: E2E tests validate rebuild success automatically
- **Cost Optimization**: Can tear down and rebuild for cost savings

### Negative

- **Initial Investment**: Significant time spent on automation (11 iterations)
- **Complexity**: phoenix-rebuild.sh script is substantial
- **GCP Dependency**: Automation tightly coupled to GCP services

### Lessons Learned

1. **Document Every Manual Action**: Each manual step in v1 became an automation target
2. **Staged Deployments**: SSL/TLS requires services to be running first
3. **Warmup Critical**: Cold-start services need explicit warmup before dependent operations
4. **State Management**: Terraform state locks need explicit handling for CI/CD
5. **Substitution Timing**: Variable substitution in GitHub Actions has specific ordering requirements

## Timeline

```
Phoenix v1        v3-v5            v6-v8           v9-v11
    │                │                │                │
15+ manual      8-10 manual      3-5 manual       0 manual
actions         actions          actions          actions
    │                │                │                │
    └── Pain!        └── Scripts      └── CI/CD        └── Full Auto
        ~4 hours         ~2 hours         ~90 min          ~75 min
```

## Key Metrics

| Metric | v1 | v11 | Improvement |
|--------|-----|-----|-------------|
| Manual Actions | 15+ | 0 | 100% reduction |
| Duration | ~4 hours | ~75 min | 69% reduction |
| E2E Test Pass | Manual verify | 6/6 automated | Full automation |
| Documentation | Ad-hoc | 14 files | Complete coverage |

## References

### Operational Documentation
- `docs/operations/PHOENIX_RUNBOOK.md` - Current operational runbook (v3.2.0)
- `docs/operations/PHOENIX_RECOVERY.md` - Disaster recovery scenarios
- `docs/operations/PHOENIX_MANUAL_ACTIONSv1.md` through `v11.md` - Evolution of manual steps

### Scripts
- `scripts/gcp/phoenix-rebuild.sh` - Main automation script (10 phases)
- `scripts/gcp/read-github-secrets.sh` - Secrets retrieval for E2E tests

### Workflows
- `.github/workflows/deploy-to-gcp.yml` - Production deployment
- `.github/workflows/provision-prod-users.yml` - User provisioning
- `.github/workflows/e2e-tests-prod.yml` - E2E validation

## Related Decisions

- ADR-003: Nginx to Caddy Migration (simplified reverse proxy in rebuild)

---

*This ADR is part of the Tamshai Project Journey - documenting the evolution from painful manual processes to fully automated infrastructure.*

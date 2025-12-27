# Incident Response Runbook

## Tamshai Enterprise AI - Security Incident Response

**Version:** 1.0
**Last Updated:** December 2025
**Owner:** Security Team

---

## 1. Contact Information

### Primary Contacts

| Role | Name | Contact |
|------|------|---------|
| Security Lead | John Cornell | @jcornell3 (GitHub) |
| On-Call Engineer | [Rotation] | Check PagerDuty |
| Infrastructure Lead | [TBD] | [TBD] |

### External Contacts

| Service | Purpose | Contact |
|---------|---------|---------|
| Anthropic | Claude API issues | support@anthropic.com |
| GitHub | Repository security | security@github.com |
| Cloud Provider | Infrastructure issues | [Provider support] |

---

## 2. Incident Classification

### Severity Levels

| Level | Name | Description | Response Time | Examples |
|-------|------|-------------|---------------|----------|
| P0 | Critical | Active breach, data exfiltration | 15 minutes | API key exposed, unauthorized access |
| P1 | High | Potential breach, security degradation | 1 hour | Failed auth spike, suspicious logs |
| P2 | Medium | Security vulnerability discovered | 4 hours | Dependency CVE, config issue |
| P3 | Low | Security improvement needed | 24 hours | Audit finding, policy update |

### Classification Criteria

**P0 - Critical:**
- Confirmed unauthorized data access
- Active exploitation of vulnerability
- Credentials/secrets exposed publicly
- Production system compromise

**P1 - High:**
- Unusual authentication patterns (>100 failed attempts/hour)
- Potential data exposure (unconfirmed)
- Security control failure (rate limiting bypassed)
- Suspicious API activity patterns

**P2 - Medium:**
- New CVE affecting dependencies
- Configuration drift from security baseline
- Audit log gaps or anomalies
- Failed security scan in CI/CD

**P3 - Low:**
- Planned security enhancement
- Documentation update needed
- Minor policy deviation
- Security training gap

---

## 3. Response Procedures

### 3.1 Initial Response (All Incidents)

```
1. [ ] Acknowledge incident in tracking system
2. [ ] Verify classification (P0-P3)
3. [ ] Notify appropriate contacts
4. [ ] Begin evidence preservation
5. [ ] Start incident timeline documentation
```

### 3.2 P0/P1 - Critical/High Response

**Immediate Actions (0-15 minutes):**

```bash
# 1. Preserve evidence
docker compose logs > /tmp/incident-$(date +%Y%m%d-%H%M%S).log 2>&1

# 2. Check active sessions
docker compose exec redis redis-cli KEYS "session:*"

# 3. Rotate compromised credentials immediately
# For API keys - go to respective service console
# For Keycloak - admin console at :8180

# 4. Enable enhanced logging if not already
export LOG_LEVEL=debug
docker compose restart mcp-gateway
```

**Containment (15-60 minutes):**

```bash
# Option A: Isolate affected service
docker compose stop mcp-gateway

# Option B: Block suspicious IPs (if using Kong)
curl -X POST http://localhost:8001/plugins \
  -d "name=ip-restriction" \
  -d "config.deny=<SUSPICIOUS_IP>"

# Option C: Revoke all active tokens
docker compose exec redis redis-cli FLUSHDB
```

**Investigation Checklist:**

```
[ ] Review audit logs for affected time period
[ ] Check Keycloak login history
[ ] Analyze MCP Gateway access logs
[ ] Review Claude API usage patterns
[ ] Check for unauthorized data access
[ ] Identify affected users/resources
```

### 3.3 P2 - Medium Response

**Assessment (0-4 hours):**

```bash
# 1. Identify affected components
npm audit --json > audit-report.json

# 2. Check if vulnerability is exploitable
# Review CVE details and affected code paths

# 3. Evaluate exposure window
git log --since="2024-01-01" --oneline -- package*.json
```

**Remediation:**

```bash
# 1. Update vulnerable dependency
npm update <package>

# 2. Run security tests
npm test
npm audit

# 3. Deploy fix
git add package*.json
git commit -m "security: Update <package> to fix CVE-XXXX-XXXXX"
git push
```

### 3.4 P3 - Low Response

- Create GitHub issue for tracking
- Assign to appropriate sprint
- Document in security backlog
- Schedule remediation within 30 days

---

## 4. Evidence Preservation

### Log Collection

```bash
# Collect all service logs
mkdir -p /tmp/incident-evidence
docker compose logs --since 24h > /tmp/incident-evidence/all-logs.txt

# Export Keycloak events
docker compose exec postgres pg_dump -U keycloak keycloak \
  -t event_entity > /tmp/incident-evidence/keycloak-events.sql

# Export Redis keys (token cache)
docker compose exec redis redis-cli --scan > /tmp/incident-evidence/redis-keys.txt
```

### Audit Trail Export

```bash
# MCP Gateway audit logs (if configured)
docker compose exec mcp-gateway cat /var/log/mcp-gateway/audit.log \
  > /tmp/incident-evidence/gateway-audit.log
```

### Secure Storage

- Store evidence in read-only storage
- Calculate and record SHA-256 hashes
- Maintain chain of custody documentation
- Retain for minimum 1 year

---

## 5. Communication Templates

### Internal Notification (P0/P1)

```
Subject: [SECURITY INCIDENT - P{LEVEL}] {Brief Description}

Incident ID: INC-{DATE}-{NUMBER}
Severity: P{LEVEL} - {Critical/High}
Status: {Investigating/Contained/Resolved}

Summary:
{Brief description of what happened}

Impact:
- Affected systems: {list}
- Affected users: {count/list}
- Data exposure: {Yes/No/Unknown}

Current Actions:
- {Action 1}
- {Action 2}

Next Update: {Time}
```

### User Notification (if required)

```
Subject: Security Notice - Action Required

Dear {User},

We are writing to inform you of a security incident that may have
affected your account.

What happened:
{Brief, non-technical description}

What we're doing:
{Steps being taken}

What you should do:
1. {Action 1}
2. {Action 2}

If you have questions, please contact: {contact}
```

### Post-Incident Report Template

```markdown
# Post-Incident Report

## Incident Overview
- **ID:** INC-{DATE}-{NUMBER}
- **Severity:** P{LEVEL}
- **Duration:** {Start} to {End}
- **Impact:** {Summary}

## Timeline
| Time | Event |
|------|-------|
| HH:MM | Initial detection |
| HH:MM | Response initiated |
| HH:MM | Containment achieved |
| HH:MM | Resolution confirmed |

## Root Cause
{Description of underlying cause}

## Remediation Actions
1. {Immediate fix}
2. {Long-term fix}

## Lessons Learned
- What went well: {list}
- What could improve: {list}

## Action Items
| Item | Owner | Due Date | Status |
|------|-------|----------|--------|
| {Action} | {Name} | {Date} | {Status} |
```

---

## 6. Post-Incident Review

### Review Meeting Agenda

1. Incident timeline review (10 min)
2. Root cause analysis (15 min)
3. Response effectiveness (10 min)
4. Process improvements (15 min)
5. Action items assignment (10 min)

### Metrics to Track

- **MTTD** (Mean Time to Detect): Target < 1 hour
- **MTTR** (Mean Time to Respond): Target < 4 hours
- **MTTC** (Mean Time to Contain): Target < 8 hours
- **Recurrence Rate**: Target 0%

---

## 7. Regular Security Tasks

### Daily

- [ ] Review authentication failure logs
- [ ] Check rate limiting metrics
- [ ] Monitor Claude API usage

### Weekly

- [ ] Run `npm audit` on all services
- [ ] Review Keycloak admin events
- [ ] Check GitHub Dependabot alerts

### Monthly

- [ ] Rotate service account credentials
- [ ] Review access permissions
- [ ] Update security documentation
- [ ] Conduct tabletop exercise

### Quarterly

- [ ] Penetration testing
- [ ] Security architecture review
- [ ] Third-party security audit
- [ ] Update incident response procedures

---

## 8. Quick Reference

### Service Locations

| Service | Port | Purpose |
|---------|------|---------|
| Kong Gateway | 8100 | API Gateway |
| MCP Gateway | 3100 | AI Orchestration |
| Keycloak | 8180 | Identity Provider |
| Redis | 6380 | Token Cache |
| PostgreSQL | 5433 | Databases |

### Emergency Commands

```bash
# Stop all services
docker compose down

# View live logs
docker compose logs -f

# Check service health
curl http://localhost:3100/health
curl http://localhost:8180/health/ready

# Clear all sessions
docker compose exec redis redis-cli FLUSHALL

# Restart single service
docker compose restart mcp-gateway
```

### Key Files

| File | Purpose |
|------|---------|
| `.env` | Environment secrets |
| `keycloak/realm-export.json` | Auth configuration |
| `docker-compose.yml` | Service definitions |
| `.github/workflows/ci.yml` | CI/CD pipeline |

---

## 9. Specific Incident Runbooks

### 9.1 Compromised API Key (Claude/Anthropic)

**Detection:**
- Unexpected Claude API usage spike
- Billing alerts from Anthropic
- Requests from unknown IPs in Claude dashboard

**Response:**

```bash
# 1. IMMEDIATELY revoke the key
# Go to https://console.anthropic.com/settings/keys
# Click "Revoke" on the compromised key

# 2. Generate new key
# Create new key in Anthropic console

# 3. Update environment
cd infrastructure/docker
# Edit .env with new CLAUDE_API_KEY
vim .env

# 4. Restart services
docker compose restart mcp-gateway

# 5. Verify functionality
curl http://localhost:3100/health

# 6. Audit git history for exposure
git log --all -S "sk-ant-api" --oneline
```

### 9.2 Prompt Injection Attack

**Detection:**
- Alerts from prompt defense module
- Unusual query patterns in logs
- Attempts to access unauthorized data

**Response:**

```bash
# 1. Identify attacker
docker compose logs mcp-gateway | grep "PROMPT_INJECTION"

# 2. Block user temporarily
docker compose exec redis redis-cli SET "blocked:{userId}" "true" EX 86400

# 3. Review accessed data
docker compose logs mcp-gateway | grep "{userId}" | grep "mcp_tool_call"

# 4. Analyze attack pattern
# Document the injection technique for future defense

# 5. Update prompt defense if needed
# Edit services/mcp-gateway/src/security/prompt-defense.ts
```

### 9.3 Data Breach

**Immediate (0-1 hour):**
```
[ ] Escalate to P0 - Activate full incident response
[ ] Notify legal and compliance teams
[ ] Preserve all logs (minimum 90 days retention)
[ ] Identify scope: what data, how many records, which users
```

**Containment (1-4 hours):**
```bash
# Revoke all tokens
docker compose exec redis redis-cli FLUSHALL

# Rotate all secrets
# - Claude API key
# - Keycloak client secrets
# - Database passwords

# Block external access if needed
docker compose stop kong
```

**Notification Requirements:**
- **GDPR (EU):** 72 hours to notify supervisory authority
- **CCPA (California):** Notify affected residents "in the most expedient time possible"
- **General:** Document all notifications for compliance

### 9.4 Ransomware/Malware

**CRITICAL: DO NOT PAY RANSOM**

**Immediate:**
```
[ ] DISCONNECT all affected systems from network
[ ] Contact law enforcement (FBI IC3: ic3.gov)
[ ] Preserve evidence (do not reboot)
[ ] Identify patient zero
```

**Recovery:**
```bash
# 1. Verify backups are clean (test in isolated environment)
# 2. Rebuild from known-good images
docker compose down -v
docker system prune -a
# Redeploy from verified source

# 3. Restore data from clean backups
# 4. Rotate ALL credentials before reconnecting
```

### 9.5 DDoS Attack

**Detection:**
- Rate limiting triggered excessively
- Kong gateway overloaded
- Network saturation

**Response:**
```bash
# 1. Enable stricter rate limiting
curl -X PATCH http://localhost:8001/plugins/{rate-limit-id} \
  -d "config.minute=10"

# 2. Block attacking IPs
curl -X POST http://localhost:8001/plugins \
  -d "name=ip-restriction" \
  -d "config.deny={IP_LIST}"

# 3. If using cloud, enable DDoS protection
# - GCP: Cloud Armor
# - AWS: Shield/WAF
# - Cloudflare: Under Attack mode

# 4. Scale horizontally if possible
docker compose up -d --scale mcp-gateway=3
```

---

## 10. Compliance Considerations

### Data Breach Notification Requirements

| Regulation | Timeframe | Notify |
|------------|-----------|--------|
| GDPR | 72 hours | Supervisory authority + affected individuals |
| CCPA | "Expedient" | Affected California residents |
| HIPAA | 60 days | HHS + affected individuals |
| PCI-DSS | Immediate | Card brands + acquiring bank |

### Documentation Requirements

For each incident, maintain:
- Incident report (use template in Section 5)
- Timeline with UTC timestamps
- Evidence chain of custody
- Communication log
- Remediation verification

### Audit Trail Retention

| Data Type | Retention Period |
|-----------|-----------------|
| Security incidents | 7 years |
| Access logs | 1 year |
| Authentication logs | 90 days |
| API request logs | 30 days |

---

*This runbook should be reviewed and updated quarterly or after any significant incident.*

*Last Updated: December 2025*

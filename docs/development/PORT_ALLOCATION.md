# Tamshai Corp Enterprise AI - Port Allocation

## Summary

This document describes the port allocation for the Tamshai Corp Enterprise AI project (v1.2), configured to avoid conflicts with the existing MCP development environment.

---

## Existing Environment (DO NOT USE)

The following resources are already in use by `mcp-dev-environment`:

| Resource | Value | Used By |
|----------|-------|---------|
| Port 8443 | HTTPS | MCP Nginx reverse proxy |
| Network subnet | 172.28.0.0/16 | mcp-network |
| Container prefix | `mcp-dev-environment-*` | MCP containers |

---

## Tamshai Corp Port Allocation

### Infrastructure Services

| Port | Service | Protocol | Description |
|------|---------|----------|-------------|
| **6380** | Redis | TCP | Token revocation cache (NEW v1.2) |
| **8180** | Keycloak | HTTP | SSO + MFA Identity Provider |
| **8100** | Kong Proxy | HTTP | API Gateway (client requests) |
| **8101** | Kong Admin | HTTP | API Gateway Admin |
| **5433** | PostgreSQL | TCP | HR, Finance, Keycloak databases (with RLS) |
| **27018** | MongoDB | TCP | CRM Database |
| **9201** | Elasticsearch | HTTP | Support ticket search |
| **9100** | MinIO API | HTTP | S3-compatible object storage |
| **9102** | MinIO Console | HTTP | MinIO Web UI |

### Application Services

| Port | Service | Protocol | Description |
|------|---------|----------|-------------|
| **3100** | MCP Gateway | HTTP | AI orchestration + security |
| **3101** | MCP HR | HTTP | HR Data (RLS enforced) |
| **3102** | MCP Finance | HTTP | Finance Data |
| **3103** | MCP Sales | HTTP | CRM Data |
| **3104** | MCP Support | HTTP | Support Tickets |

### Sample SSO Applications

| Port | Service | Protocol | Description |
|------|---------|----------|-------------|
| **4001** | HR App | HTTP | HR self-service portal |
| **4002** | Finance App | HTTP | Financial reporting |
| **4003** | Sales App | HTTP | CRM application |
| **4004** | Support App | HTTP | Ticketing system |

### Network Configuration

| Resource | Value |
|----------|-------|
| Docker Network | `tamshai-network` |
| Subnet | `172.30.0.0/16` |
| Container Prefix | `tamshai-*` |

---

## Security Features (v1.2)

| Feature | Component | Port | Purpose |
|---------|-----------|------|---------|
| Token Revocation | Redis | 6380 | Immediate access termination |
| Row Level Security | PostgreSQL | 5433 | Database-enforced access control |
| Prompt Injection Defense | MCP Gateway | 3100 | AI security |
| Query Result Limits | MCP Gateway | 3100 | Prevent data exfiltration |
| mTLS | Internal only | N/A | Service-to-service auth |
| AI Audit Logging | MCP Gateway | 3100 | Query intent tracking |

---

## Quick Reference URLs

### Development Environment

```
# Identity Provider (SSO + MFA)
Keycloak Admin:      http://localhost:8180
                     Username: admin
                     Password: admin

# API Gateway
API Gateway:         http://localhost:8100
Kong Admin:          http://localhost:8101

# MCP Services
MCP Gateway:         http://localhost:3100
MCP HR:              http://localhost:3101
MCP Finance:         http://localhost:3102
MCP Sales:           http://localhost:3103
MCP Support:         http://localhost:3104

# Sample Applications (when deployed)
HR App:              http://localhost:4001
Finance App:         http://localhost:4002
Sales App:           http://localhost:4003
Support App:         http://localhost:4004

# Object Storage
MinIO Console:       http://localhost:9102
                     Username: minioadmin
                     Password: minioadmin

# Databases (direct access - dev only)
PostgreSQL:          localhost:5433
MongoDB:             localhost:27018
Elasticsearch:       localhost:9201
Redis:               localhost:6380
```

### Health Checks

```bash
# All services
docker compose ps

# Redis (token revocation)
docker compose exec redis redis-cli ping

# Keycloak
curl -s http://localhost:8180/health/ready

# Kong
curl -s http://localhost:8101/status

# MCP Gateway
curl -s http://localhost:3100/health

# PostgreSQL
docker compose exec postgres pg_isready -U tamshai

# MongoDB
docker compose exec mongodb mongosh --eval "db.adminCommand('ping')"

# Elasticsearch
curl -s http://localhost:9201/_cluster/health
```

---

## Conflict Avoidance Summary

| Tamshai Port | Common Default | Avoided Conflict |
|--------------|----------------|------------------|
| 6380 | 6379 | Local Redis |
| 8180 | 8080 | Tomcat, dev servers |
| 8100 | 8000 | Python SimpleHTTP |
| 3100 | 3000 | React, Node defaults |
| 5433 | 5432 | Local PostgreSQL |
| 27018 | 27017 | Local MongoDB |
| 9201 | 9200 | Local Elasticsearch |

---

## Running Both Environments

The Tamshai Enterprise AI environment can run simultaneously with the existing MCP dev environment:

| Environment | Main Port | Subnet | Container Prefix |
|-------------|-----------|--------|------------------|
| MCP Dev | 8443 | 172.28.0.0/16 | mcp-dev-environment-* |
| Tamshai | 3100-9201 | 172.30.0.0/16 | tamshai-* |

No conflicts should occur when both are running.

---

## Test Users

All users have password: `[REDACTED-DEV-PASSWORD]` and must configure TOTP on first login.

| Username | Role | Access Level |
|----------|------|--------------|
| eve.thompson | CEO | Executive (all read) |
| alice.chen | VP of HR | HR (all employees) |
| bob.martinez | Finance Director | Finance (all finance) |
| carol.johnson | VP of Sales | Sales Manager |
| ryan.garcia | Sales Manager | Sales (team only) |
| dan.williams | Support Director | Support (team only) |
| nina.patel | Engineering Manager | Manager (team only) |
| marcus.johnson | Software Engineer | Self only |
| frank.davis | IT Intern | Self only |

---

Last updated: November 29, 2025 (v1.2 - Security Review Incorporated)

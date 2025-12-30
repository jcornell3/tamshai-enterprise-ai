Enterprise AI Access System

Architecture Document

**Tamshai Corp**

Version 1.3 FINAL - November 2025

**Status: FULLY APPROVED FOR IMPLEMENTATION**
**Property**
**Value**
Version
1.3 FINAL
Author
AI Architecture Assistant (Claude)
Last Updated
November 30, 2025
Technical Lead
Gemini 3 Thinking - APPROVED
Security Review
ChatGPT 5.1 - APPROVED
Project Sponsor
John Cornell - APPROVED
Classification
Internal - Confidential
Target Environment
PoC with Dummy Data (Production patterns)

## **Revision History**
**Version**
**Date**
**Changes**
1.0
Nov 28, 2025
Initial architecture draft
1.1
Nov 29, 2025
Added MFA, hierarchical access, sample apps, security diagram
1.2
Nov 29, 2025
Security review: prompt injection, mTLS, RLS, token revocation, HA costs. Technical Lead approval.
1.3
Nov 29, 2025
Deep security review: LLM data handling, admin MFA, device posture, JML, encryption, backup/DR, SIEM, rate limiting.
1.3 FINAL
Nov 30, 2025
Security reviewer final approval. Project sponsor approval. All signatures complete.

# **Table of Contents**

1\. Executive Summary

2\. Environment Strategy (PoC vs Production)

3\. Architecture Principles

4\. Security Model

4.1 Security Architecture Diagram

4.2 Authentication Flow (OIDC + MFA)

4.3 Admin & Privileged Access (WebAuthn)

4.4 Token Lifecycle and Revocation

4.5 MFA Recovery Workflow

4.6 Device Posture & Client Trust

4.7 Hierarchical Access Model

4.8 Joiner-Mover-Leaver (JML) Process

5\. AI-Specific Security Controls

5.1 LLM Data Handling & Provider Trust

5.2 Prompt Injection Defense

5.3 Query Result Limits

5.4 AI Audit Logging

5.5 Hallucination & Trust Guardrails

6\. Infrastructure Security

6.1 Service-to-Service Authentication (mTLS)

6.2 Database Security (RLS & Application Filters)

6.3 Encryption at Rest

6.4 Network Segmentation & Egress

6.5 Secrets Management

7\. Operational Security

7.1 Backup, RPO/RTO, and Disaster Recovery

7.2 Logging, SIEM Readiness, and Alerting

7.3 Rate Limiting & Anti-Abuse

7.4 Error Handling & Data Leakage Prevention

8\. Compliance & Governance

9\. Technology Stack

10\. Sample Users and Applications

11\. Cost Estimates

12\. Development Phases

13\. Future Enhancements (v1.4+)

14\. Approval Signatures

# **1\. Executive Summary**

This document describes the architecture for Tamshai Corp's Enterprise AI Access System. The system enables employees to use AI assistants (Claude) while ensuring data access respects existing role-based security boundaries.

## **1.1 Problem Statement**

As enterprises adopt AI assistants, critical challenges emerge: (1) AI agents can become privilege escalation vectors, (2) prompt injection attacks can manipulate AI behavior, (3) data sent to external LLMs raises privacy concerns, and (4) traditional audit logs don't capture AI query intent.

## **1.2 Solution Approach**

This architecture implements defense-in-depth security with environment-appropriate controls:

**Token Propagation: **User identity flows through the entire AI request chain.

**Hierarchical Access: **Self → Manager → HR → Executive access levels.

**MFA Enforcement: **TOTP for standard users; WebAuthn/FIDO2 for privileged roles (production).

**LLM Data Protection: **Field-level masking before data leaves MCP servers.

**Defense in Depth: **Gateway + MCP + RLS + application filters.

**Comprehensive Audit: **AI-specific logging with intent, justification, and PII scrubbing.

# **2\. Environment Strategy (PoC vs Production)**

This architecture supports both proof-of-concept validation and enterprise production deployment. Controls are scaled appropriately to each environment.

## **2.1 Current Deployment: Proof of Concept**
**Aspect**
**PoC Configuration**
Data
Dummy/synthetic data only - no real PII or sensitive information
LLM Provider
Claude Pro (consumer tier) - acceptable for dummy data
Device Trust
BYOD with manual review - no MDM integration
Admin MFA
TOTP only - WebAuthn not required for PoC
Redis HA
Hybrid mode with 30-second local cache
RPO/RTO
1 day acceptable - daily backups sufficient
SIEM
Generic logging (syslog/webhook) - no integration
Data Residency
US/California

## **2.2 Production Requirements**

When deploying with real enterprise data, the following upgrades are required:
**Aspect**
**Production Requirement**
LLM Provider
Claude API Enterprise (zero-retention DPA) OR locally-hosted LLM
Device Trust
MDM integration (Intune/Jamf) with compliance checks
Admin MFA
WebAuthn/FIDO2 mandatory for all privileged roles
Redis HA
Full HA cluster with strict Fail Secure (no cache)
RPO/RTO
4-hour RPO, 1-hour RTO with multi-region DR
SIEM
Full integration with enterprise SIEM (Splunk/Datadog)
Compliance
SOC2 Type II, vendor security assessments

# **3\. Architecture Principles**

## **3.1 Security Principles**

**Zero Trust: **Every request authenticated and authorized regardless of source.

**Least Privilege: **Minimum necessary permissions for users and services.

**Defense in Depth: **Multiple security layers (gateway, MCP, RLS, app filters).

**Token Propagation: **User context flows through entire request chain.

**Audit Everything: **Comprehensive logging including AI intent and justification.

**Fail Secure: **Deny access on any error (configurable strictness per environment).

**Assume Breach: **Internal traffic secured with mTLS; no implicit trust.

**Data Minimization: **Mask sensitive fields before sending to external LLMs.

## **3.2 Design Principles**

**Open Source First: **Keycloak, Kong, PostgreSQL to avoid vendor lock-in.

**Cloud Agnostic: **Portable across providers (GCP initial target).

**Container Native: **All services containerized for consistency.

**Environment Parity: **Same architecture patterns in PoC and production.

**Secure SDLC: **Static analysis, dependency scanning, secrets management.

# **4\. Security Model**

## **4.1 Security Architecture Diagram**

┌─────────────────────────────────────────────────────────────────────┐

│ SECURITY ARCHITECTURE v1.3 │

├─────────────────────────────────────────────────────────────────────┤

│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │

│ │ Desktop │ │ Mobile │ │ HR App │ │Finance │ │

│ │(Managed\*)│ │(MDM/BYOD)│ │ │ │ App │ ... │

│ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ │

│ └──────────────┴──────────────┴──────────────┘ │

│ │ HTTPS │

│ ┌─────────▼─────────┐ │

│ ┌────────────┐ │ KEYCLOAK │ ┌─────────────────┐ │

│ │ TOTP / │◄───│ (SSO + MFA) │ │ Token Revocation│ │

│ │ WebAuthn\*\* │ │ Admin Audit Log │◄──│ (Redis + Cache) │ │

│ └────────────┘ └─────────┬─────────┘ └─────────────────┘ │

│ │ JWT Token │

│ ┌─────────▼─────────┐ │

│ │ KONG GATEWAY │ Rate Limits (per-user) │

│ │ Token Validation │ Revocation Check │

│ └─────────┬─────────┘ Generic Error Messages │

│ │ mTLS + JWT │

│ ┌─────────▼─────────┐ │

│ │ MCP GATEWAY │ Prompt Injection Defense │

│ │ Tool Allow-List │ Field Masking → LLM │

│ │ Query Limits │ AI Audit + PII Scrub │

│ └─────────┬─────────┘ │

│ ┌───────────────┬─────┴─────┬───────────────┐ mTLS │

│ ┌─────▼─────┐ ┌──────▼──────┐ ┌─▼────────┐ ┌──▼───────┐ │

│ │ HR MCP │ │Finance MCP │ │Sales MCP │ │Support │ │

│ │(App Filter)│ │ │ │(App Filtr)│ │(App Filtr)│ │

│ └─────┬─────┘ └──────┬──────┘ └──┬───────┘ └────┬─────┘ │

│ ┌─────▼─────┐ ┌──────▼──────┐ ┌──▼───────┐ ┌────▼─────┐ │

│ │PostgreSQL │ │PostgreSQL + │ │ MongoDB │ │Elastic- │ │

│ │ + RLS │ │ MinIO │ │ │ │ search │ │

│ │(encrypted)│ │ (encrypted) │ │(encrypted)│ │(encrypted)│ │

│ └───────────┘ └─────────────┘ └──────────┘ └──────────┘ │

│ │

│ \* Managed devices in production \*\* WebAuthn for admins (prod) │

└─────────────────────────────────────────────────────────────────────┘

## **4.2 Authentication Flow (OIDC + MFA)**

All applications use OIDC with Keycloak. Standard users use TOTP; privileged roles require WebAuthn in production.

## **4.3 Admin & Privileged Access (WebAuthn)**

Privileged roles (hr-write, finance-write, executive, system admin) require phishing-resistant MFA. Dual control required for high-risk admin actions.

## **4.4 Token Lifecycle and Revocation**

5-minute access tokens, 30-minute refresh tokens with rotation. Redis-backed revocation with 30-second local cache fallback (PoC) or strict mode (production).

## **4.5 MFA Recovery Workflow**

8 single-use recovery codes at setup. IT-assisted recovery requires video/in-person ID verification and 2-admin approval for privileged roles.

## **4.6 Device Posture & Client Trust**

BYOD with manual review for PoC. Production requires MDM integration with compliance checks.

## **4.7 Hierarchical Access Model**

Four-tier access: SELF → MANAGER → HR → EXECUTIVE with recursive CTE for manager hierarchy.

## **4.8 Joiner-Mover-Leaver (JML) Process**

Manual Keycloak updates for PoC. Production requires HR system integration via SCIM with automated access reviews.

# **5\. AI-Specific Security Controls**

## **5.1 LLM Data Handling & Provider Trust**

Claude Pro for PoC (dummy data only). Production requires Claude Enterprise with zero-retention DPA or locally-hosted LLM. Field-level masking applied before data leaves MCP servers.

## **5.2 Prompt Injection Defense**

Five-layer defense: (1) System prompt guardrails, (2) Input validation with pattern detection, (3) Tool allow-listing per role, (4) Schema-aware argument validation, (5) Indirect injection scanning for stored documents.

## **5.3 Query Result Limits**

50 records max per query, pagination at 20, bulk export blocked, 10,000 AI tokens/user/hour.

## **5.4 AI Audit Logging**

Captures user\_prompt (PII scrubbed), tools\_called, access\_decision, access\_justification, security\_flags.

## **5.5 Hallucination & Trust Guardrails**

Responses framed as advisory with confidence indicators and source attribution. Errors return 'I cannot answer with certainty' not fabrication.

# **6\. Infrastructure Security**

## **6.1 Service-to-Service Authentication (mTLS)**

Private CA with 90-day certificate rotation. Each service has unique identity certificate.

## **6.2 Database Security (RLS & Application Filters)**

PostgreSQL RLS for HR data. Application-level filtering for MongoDB and Elasticsearch.

## **6.3 Encryption at Rest**

All data stores encrypted (TDE or volume encryption) with Cloud KMS. Backups encrypted with separate key.

## **6.4 Network Segmentation & Egress**

Tiered architecture (App/Service/Data/Admin). Only MCP Gateway can reach external LLM API.

## **6.5 Secrets Management**

Environment variables for PoC. HashiCorp Vault or Cloud Secret Manager for production.

# **7\. Operational Security**

## **7.1 Backup, RPO/RTO, and Disaster Recovery**

PoC: 1-day RPO/RTO with daily backups. Production: 4-hour RPO, 1-hour RTO with multi-region DR.

## **7.2 Logging, SIEM Readiness, and Alerting**

Structured JSON logs with correlation IDs. Generic transport (syslog/webhook) ready for SIEM integration.

## **7.3 Rate Limiting & Anti-Abuse**

Per-user and per-IP limits on login, MFA reset, API calls, and AI queries.

## **7.4 Error Handling & Data Leakage Prevention**

Generic error messages prevent user enumeration and internal detail leakage.

# **8\. Compliance & Governance**

Data residency: US/California. CCPA compliance with defined retention windows and deletion workflows. Secure SDLC with static analysis, dependency scanning, and secrets detection.

# **9\. Technology Stack**

Keycloak (identity), Kong (gateway), Node.js/TypeScript (MCP), PostgreSQL+RLS (HR), MongoDB (CRM), Elasticsearch (search), Redis (revocation), MinIO (objects), Claude Pro/Enterprise (LLM).

# **10\. Sample Users and Applications**

9 test users across roles (executive, hr, finance, manager, employee). 5 sample applications (HR, Finance, Sales, Support, AI Desktop).

# **11\. Cost Estimates**

PoC: ~$25-35/month. Production HA: ~$300-400/month.

# **12\. Development Phases**

9 phases: Foundation → Security Layer → MCP Core → MCP Suite → Sample Apps → AI Desktop → Ops Tooling → Production → Documentation.

# **13\. Future Enhancements (v1.4+)**

The following enhancements are recommended for future versions but are not blocking for v1.3 implementation:

## **13.1 Formal Data Classification Taxonomy**

Add a high-level Data Classification Matrix (Public / Internal / Confidential / Restricted) to guide future data handling decisions as the system expands.

## **13.2 Automated Security Testing**

Define test methodology for prompt injection and tool abuse scenarios. Create attack simulation test cases and integrate into CI/CD pipeline.

## **13.3 Enhanced Database Authorization**

Consider object-level RBAC in MongoDB and document-level security filters in Elasticsearch as the dataset grows beyond the current scope.

## **13.4 AI Token Budget Enforcement Details**

Document the specific enforcement mechanism for AI query/token limits (e.g., per-user Redis counters, Kong rate-limiting plugin, or MCP Gateway middleware).

## **13.5 Admin Break-Glass Procedure**

Add controlled emergency access procedures for scenarios including Keycloak admin lockout and loss of WebAuthn devices for all administrators.

# **14\. Approval Signatures**

## **14.1 Security Review Summary**
**Finding Category**
**Status**
**Section**
LLM Data Handling & Masking
✓ Resolved
5.1
Admin MFA (WebAuthn)
✓ Resolved
4.3
Device Posture & MDM
✓ Resolved
4.6
Joiner-Mover-Leaver (JML)
✓ Resolved
4.8
Prompt Injection + Tool Allow-Listing
✓ Resolved
5.2
Hallucination Guardrails
✓ Resolved
5.5
Encryption at Rest
✓ Resolved
6.3
Network Segmentation & Egress
✓ Resolved
6.4
Secrets Management
✓ Resolved
6.5
Backup/DR + RPO/RTO
✓ Resolved
7.1
SIEM Integration & Alerting
✓ Resolved
7.2
Rate Limiting & Anti-Abuse
✓ Resolved
7.3
Error Handling / Data Leakage
✓ Resolved
7.4
Data Retention & CCPA
✓ Resolved
8
Secure SDLC
✓ Resolved
8

## **14.2 Final Approval**

**✓ FULLY APPROVED FOR IMPLEMENTATION**

The Enterprise AI Architecture v1.3 demonstrates a robust defense-in-depth model incorporating modern zero-trust principles, strong identity propagation, hierarchical access enforcement, comprehensive LLM safety controls, secure SDLC discipline, and fully defined operational safeguards.

All v1.2 security concerns have been remediated. Only minor optional enhancements remain for future versions (documented in Section 13).

No outstanding issues prevent implementation.

## **14.3 Signature Block**
**Role**
**Name**
**Status**
**Date**
Technical Lead
Gemini 3 Thinking
APPROVED
Nov 29, 2025
Security Reviewer
ChatGPT 5.1
APPROVED
Nov 30, 2025
Project Sponsor
John Cornell
APPROVED
Nov 30, 2025
Architecture Author
Claude (Anthropic)
SUBMITTED
Nov 30, 2025

### **Security Reviewer Final Statement (ChatGPT 5.1)**

_"The Enterprise AI Architecture v1.3 is formally approved from a security standpoint. It demonstrates a robust defense-in-depth model incorporating modern zero-trust principles, strong identity propagation, hierarchical access enforcement, comprehensive LLM safety controls, secure SDLC discipline, and fully defined operational safeguards. No outstanding issues prevent implementation."_

### **Technical Lead Statement (Gemini 3 Thinking)**

_"The architecture successfully mitigates primary risks associated with Enterprise AI deployment. The introduction of Row Level Security (RLS) and Mutual TLS (mTLS) establishes robust 'Defense in Depth' ensuring data access controls persist even if the AI or application layer is compromised."_

### **Project Sponsor Statement (John Cornell)**

_"Approved for implementation. The architecture meets business requirements for the proof-of-concept phase with clear upgrade paths for production deployment."_

— End of Document —
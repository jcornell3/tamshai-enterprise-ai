# **Changelog**

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog,  
and this project adheres to Semantic Versioning.

## **[Unreleased]**

### **Added**

* CI workflow with Node.js matrix builds (v20, v22)
* Flutter build verification in CI
* Terraform validation and tfsec security scanning
* qlty static analysis in CI
* Codecov integration with 70% coverage thresholds
* GitHub issue templates (bug report, feature request, security, QA debt)
* Pull request template
* Dependabot configuration for all package ecosystems
* VPS deployment infrastructure (Terraform, cloud-init, Caddy)
* Path-based routing (no subdomains required)
* CODE_OF_CONDUCT.md

### **Changed**

* Updated README.md with full system architecture and badges
* Removed continue-on-error from deployment test steps

### **Security**

* Added tfsec Terraform security scanning
* Added qlty with TruffleHog secret scanning in CI

## **\[1.4.0\] \- 2025-12-03**

### **Added**

* MCP Operational Review updates (v1.4).  
* SSE transport protocol specification.  
* LLM-friendly error schemas.  
* Truncation warning requirement.  
* Human-in-the-loop requirement for write operations.  
* Detailed GCP cost breakdown.

### **Changed**

* Updated architecture document to v1.4.

## **\[1.3.0\] \- 2025-11-29**

### **Added**

* Deep security review updates (v1.3).  
* LLM data handling specifications.  
* Admin MFA (WebAuthn) requirements.  
* Device posture and JML process details.  
* Encryption at rest and network segmentation.  
* Backup/DR and SIEM readiness sections.  
* Rate limiting and error handling guidelines.

### **Changed**

* Updated architecture document to v1.3.

## **\[1.2.0\] \- 2025-11-29**

### **Added**

* Security review findings (v1.2).  
* Prompt injection defense strategies.  
* mTLS for East-West traffic.  
* Row Level Security (RLS) implementation details.  
* Token revocation handling.  
* MFA recovery workflow.  
* High Availability (HA) cost estimates.

### **Changed**

* Updated architecture document to v1.2.

## **\[1.1.0\] \- 2025-11-29**

### **Added**

* MFA and hierarchical access model.  
* Sample application definitions.  
* Security architecture diagram.

### **Changed**

* Updated architecture document to v1.1.

## **\[1.0.0\] \-**
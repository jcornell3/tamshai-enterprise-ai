# =============================================================================
# Terraform Dev Environment - Version Requirements
# =============================================================================
#
# Manages local Docker Compose infrastructure for development
# Mimics VPS/production structure but targets local Docker Desktop
#
# Created: 2025-12-30
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
    keycloak = {
      source  = "mrparkers/keycloak"
      version = "~> 4.4.0"
    }
  }

  # Local state for dev (no remote backend needed)
  backend "local" {
    path = "terraform.tfstate"
  }
}

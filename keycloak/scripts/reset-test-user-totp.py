#!/usr/bin/env python3
"""
Reset TOTP Credential for Keycloak Test User

This script uses the Keycloak Partial Import API to delete and recreate a test user
with a known TOTP secret. This approach is recommended by GCP Production Specialists
as it works around Keycloak Admin API limitations for OTP credential creation.

Usage:
    python reset-test-user-totp.py <environment> [username] [totp_secret] [password]

Arguments:
    environment   - dev, stage, or prod
    username      - Keycloak username (default: test-user.journey)
    totp_secret   - Base32-encoded TOTP secret (default: ***REDACTED_TOTP***)
    password      - User password (default: from TEST_USER_PASSWORD env var)

Examples:
    # Using environment variable for password (recommended):
    export TEST_USER_PASSWORD="your-secure-password"
    python reset-test-user-totp.py prod

    # Passing password as argument:
    python reset-test-user-totp.py prod test-user.journey ***REDACTED_TOTP*** "your-password"

Requirements:
    - KEYCLOAK_ADMIN_PASSWORD environment variable
    - TEST_USER_PASSWORD environment variable (or pass as 4th argument)
    - requests library (pip install requests)

Author: Tamshai-Dev
Date: January 2026
"""

import getpass
import os
import sys

import requests

# Environment configuration
ENVIRONMENTS = {
    "dev": "https://www.tamshai-playground.local/auth",
    "stage": "https://www.tamshai.com/auth",
    "prod": "https://keycloak-fn44nd7wba-uc.a.run.app/auth",
}

REALM = "tamshai-corp"
DEFAULT_USERNAME = "test-user.journey"
DEFAULT_TOTP_SECRET = "***REDACTED_TOTP***"
DEFAULT_PASSWORD = os.environ.get("TEST_USER_PASSWORD", "")


# ANSI colors for output
class Colors:
    BLUE = "\033[0;34m"
    GREEN = "\033[0;32m"
    YELLOW = "\033[1;33m"
    RED = "\033[0;31m"
    NC = "\033[0m"  # No Color


def log_info(msg):
    print(f"{Colors.BLUE}[INFO]{Colors.NC} {msg}")


def log_success(msg):
    print(f"{Colors.GREEN}[SUCCESS]{Colors.NC} {msg}")


def log_warn(msg):
    print(f"{Colors.YELLOW}[WARN]{Colors.NC} {msg}")


def log_error(msg):
    print(f"{Colors.RED}[ERROR]{Colors.NC} {msg}")


def get_admin_token(keycloak_url: str, password: str) -> str:
    """Authenticate to Keycloak Admin API and return access token."""
    log_info(f"Authenticating to Keycloak at {keycloak_url}...")

    response = requests.post(
        f"{keycloak_url}/realms/master/protocol/openid-connect/token",
        data={
            "username": "admin",
            "password": password,
            "grant_type": "password",
            "client_id": "admin-cli",
        },
    )

    if not response.ok:
        log_error(f"Authentication failed: {response.status_code}")
        log_error(f"Response: {response.text}")
        sys.exit(1)

    log_success("Authentication successful")
    return response.json()["access_token"]


def find_user(keycloak_url: str, token: str, username: str) -> dict | None:
    """Find a user by username. Returns user dict or None if not found."""
    log_info(f"Looking for user '{username}'...")

    response = requests.get(
        f"{keycloak_url}/admin/realms/{REALM}/users",
        params={"username": username, "exact": "true"},
        headers={"Authorization": f"Bearer {token}"},
    )

    if response.ok and response.json():
        user = response.json()[0]
        log_success(f"Found user: {user['username']} (ID: {user['id']})")
        return user

    log_info(f"User '{username}' not found")
    return None


def delete_user(keycloak_url: str, token: str, user_id: str) -> bool:
    """Delete a user by ID."""
    log_info(f"Deleting user {user_id}...")

    response = requests.delete(
        f"{keycloak_url}/admin/realms/{REALM}/users/{user_id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    if response.status_code == 204:
        log_success("User deleted")
        return True

    log_error(f"Failed to delete user: {response.status_code}")
    return False


def create_user_with_totp(
    keycloak_url: str, token: str, username: str, totp_secret: str, user_password: str
) -> bool:
    """
    Create a user with TOTP credential using Partial Import API.

    Key insight: The Partial Import API accepts TOTP credentials when creating NEW users
    using a flat structure with type="totp" (not "otp").
    """
    log_info(f"Creating user '{username}' with TOTP credential...")

    # The working format discovered through testing:
    # - type: "totp" (not "otp")
    # - Flat structure with fields at top level
    # - secretData as raw base32 string (not nested JSON)
    import_data = {
        "users": [
            {
                "username": username,
                "email": f"{username.replace('.', '-')}@tamshai.com",
                "firstName": "Test",
                "lastName": "Journey",
                "enabled": True,
                "emailVerified": True,
                "credentials": [
                    {
                        "type": "password",
                        "value": user_password,
                        "temporary": False,
                    },
                    {
                        # IMPORTANT: Use "totp" type with flat structure
                        # This format works for Partial Import API on user creation
                        "type": "totp",
                        "secretData": totp_secret,
                        "userLabel": "E2E Test Authenticator",
                        "digits": "6",
                        "period": "30",
                        "algorithm": "HmacSHA1",
                        "counter": "0",
                    },
                ],
            }
        ]
    }

    log_info(f"Partial import payload prepared")

    response = requests.post(
        f"{keycloak_url}/admin/realms/{REALM}/partialImport",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json=import_data,
    )

    if response.status_code == 200:
        result = response.json()
        if result.get("added", 0) > 0:
            log_success(f"User created successfully")
            return True
        elif result.get("skipped", 0) > 0:
            log_warn("User was skipped (may already exist)")
            return False

    log_error(f"Failed to create user: {response.status_code}")
    log_error(f"Response: {response.text}")
    return False


def verify_credentials(keycloak_url: str, token: str, username: str) -> bool:
    """Verify the user has both password and OTP credentials."""
    log_info("Verifying credentials...")

    user = find_user(keycloak_url, token, username)
    if not user:
        return False

    response = requests.get(
        f"{keycloak_url}/admin/realms/{REALM}/users/{user['id']}/credentials",
        headers={"Authorization": f"Bearer {token}"},
    )

    if not response.ok:
        log_error(f"Failed to get credentials: {response.status_code}")
        return False

    credentials = response.json()
    has_password = any(c["type"] == "password" for c in credentials)
    has_otp = any(c["type"] == "otp" for c in credentials)

    print(f"\n  Credentials found:")
    for cred in credentials:
        label = cred.get("userLabel", "default")
        print(f"    - {cred['type']}: {label}")

    if has_password and has_otp:
        log_success("User has both password and OTP credentials")
        return True
    else:
        log_warn(f"Missing credentials - password: {has_password}, OTP: {has_otp}")
        return False


def main():
    print("\n" + "=" * 50)
    print("  Reset TOTP Credential for Keycloak Test User")
    print("=" * 50 + "\n")

    # Parse arguments
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <environment> [username] [totp_secret] [password]")
        print(f"  Environments: {', '.join(ENVIRONMENTS.keys())}")
        print(f"  Password can also be set via TEST_USER_PASSWORD environment variable")
        sys.exit(1)

    env = sys.argv[1]
    username = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_USERNAME
    totp_secret = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_TOTP_SECRET
    user_password = sys.argv[4] if len(sys.argv) > 4 else DEFAULT_PASSWORD

    # Validate password is provided
    if not user_password:
        log_error("TEST_USER_PASSWORD environment variable is required")
        log_error("Set it with: export TEST_USER_PASSWORD='your-password'")
        log_error(
            "Or pass as 4th argument: ./reset-test-user-totp.py prod user secret password"
        )
        sys.exit(1)

    if env not in ENVIRONMENTS:
        log_error(f"Invalid environment: {env}")
        log_error(f"Valid environments: {', '.join(ENVIRONMENTS.keys())}")
        sys.exit(1)

    keycloak_url = ENVIRONMENTS[env]

    log_info(f"Environment: {env}")
    log_info(f"Keycloak URL: {keycloak_url}")
    log_info(f"Username: {username}")
    log_info(f"TOTP Secret: {totp_secret[:4]}****{totp_secret[-4:]}")
    print()

    # Get admin password
    password = os.environ.get("KEYCLOAK_ADMIN_PASSWORD")
    if not password:
        password = getpass.getpass("Enter Keycloak admin password: ")

    # Authenticate
    token = get_admin_token(keycloak_url, password)

    # Delete existing user if found
    existing_user = find_user(keycloak_url, token, username)
    if existing_user:
        if not delete_user(keycloak_url, token, existing_user["id"]):
            log_error("Failed to delete existing user")
            sys.exit(1)

    # Create user with TOTP
    print()
    if not create_user_with_totp(
        keycloak_url, token, username, totp_secret, user_password
    ):
        log_error("Failed to create user with TOTP")
        sys.exit(1)

    # Verify credentials
    print()
    if not verify_credentials(keycloak_url, token, username):
        log_error("Credential verification failed")
        sys.exit(1)

    # Success message
    print("\n" + "=" * 50)
    log_success("TOTP Configuration Complete!")
    print("=" * 50)
    print(
        f"\nUser '{username}' now has TOTP configured with secret: {totp_secret[:4]}****"
    )
    print(f"\nTo generate a TOTP code:")
    print(f"  oathtool --totp --base32 {totp_secret}")
    print()


if __name__ == "__main__":
    main()

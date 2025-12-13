# Mobile Development Setup Guide

**Last Updated**: December 13, 2025
**Purpose**: Configure development environment for React Native mobile app testing
**Platforms**: Windows, macOS, Linux

---

## Overview

This guide explains how to configure your development machine to serve backend services (Keycloak, MCP Gateway, etc.) to mobile devices on your local network (LAN).

### Problem

By default, Docker services bind to `localhost` (127.0.0.1), which is only accessible from the development machine itself. Mobile devices on the same network cannot connect to `localhost` of your development machine.

### Solution

The mobile development setup:
1. **Detects your LAN IP** (e.g., 192.168.1.100)
2. **Generates `.env.mobile`** with your IP
3. **Overrides Docker Compose** to bind services to `0.0.0.0` (all interfaces)
4. **Configures firewall** (Windows only) to allow inbound connections
5. **Updates Keycloak hostname** for mobile OIDC redirects

---

## Quick Start

### Windows

```powershell
# Step 1: Detect LAN IP and generate .env.mobile
.\scripts\discover-mobile-host.ps1

# Step 2: Configure Windows Firewall (REQUIRED)
.\scripts\windows\setup-mobile-firewall.ps1

# Step 3: Start services with mobile override
cd infrastructure\docker
docker compose -f docker-compose.yml -f docker-compose.mobile.yml up -d

# Step 4: Verify from mobile device
# Open browser on phone and navigate to:
http://<YOUR_IP>:8180/health/ready
```

### Linux / macOS

```bash
# Step 1: Detect LAN IP and generate .env.mobile
./scripts/discover-mobile-host.sh

# Step 2: Check firewall (if enabled)
# Linux: sudo ufw status
# macOS: System Settings > Network > Firewall

# Step 3: Start services with mobile override
cd infrastructure/docker
docker compose -f docker-compose.yml -f docker-compose.mobile.yml up -d

# Step 4: Verify from mobile device
curl http://<YOUR_IP>:8180/health/ready
```

---

## Detailed Setup

### 1. Host Discovery

The host discovery script automatically detects your development machine's LAN IP address.

#### Automatic Detection

**Windows**:
```powershell
.\scripts\discover-mobile-host.ps1
```

**Linux/macOS**:
```bash
./scripts/discover-mobile-host.sh
```

**Output**:
```
╔════════════════════════════════════════════════════════════════╗
║  Tamshai Mobile Development - Host Discovery                  ║
╚════════════════════════════════════════════════════════════════╝

→ Detecting LAN IP address...
✓ Detected LAN IP: 192.168.1.100
→ Testing connectivity to 192.168.1.100...
✓ IP is accessible
→ Generating infrastructure/docker/.env.mobile...
✓ Generated infrastructure/docker/.env.mobile

╔════════════════════════════════════════════════════════════════╗
║  ✓ Mobile Development Environment Ready                       ║
╚════════════════════════════════════════════════════════════════╝

Host IP: 192.168.1.100
```

#### Manual Override

If auto-detection fails or detects the wrong IP:

**Windows**:
```powershell
$env:MOBILE_HOST_IP = "192.168.1.100"
.\scripts\discover-mobile-host.ps1
```

**Linux/macOS**:
```bash
export MOBILE_HOST_IP=192.168.1.100
./scripts/discover-mobile-host.sh
```

#### Finding Your IP Manually

**Windows**:
```powershell
ipconfig
# Look for "IPv4 Address" under your active network adapter
# Usually starts with 192.168.x.x or 10.x.x.x
```

**Linux**:
```bash
ip addr show
# or
hostname -I
```

**macOS**:
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

---

### 2. Firewall Configuration

#### Windows (REQUIRED)

Windows Firewall blocks inbound connections by default. You **must** run the firewall setup script:

```powershell
# Run as Administrator
.\scripts\windows\setup-mobile-firewall.ps1
```

**What it does**:
- Creates inbound firewall rules for ports: 8180, 8100, 8101, 3100-3104, 6380
- Applies rules to **Private** and **Domain** network profiles only
- Public networks (coffee shops) remain protected
- Rules are named: "Tamshai Mobile Dev - <Service>"

**Verification**:
```powershell
Get-NetFirewallRule -DisplayName "Tamshai Mobile Dev*"
```

**Cleanup** (when done with mobile development):
```powershell
.\scripts\windows\cleanup-mobile-firewall.ps1
```

#### macOS

**Check firewall status**:
```bash
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate
```

**If enabled**, add exceptions for Docker:
1. System Settings > Network > Firewall > Options
2. Add Docker.app to allowed applications

**Or disable firewall temporarily** (not recommended for public networks):
```bash
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate off
```

#### Linux

**Check UFW status** (Ubuntu/Debian):
```bash
sudo ufw status
```

**If enabled**, allow ports:
```bash
sudo ufw allow 8180/tcp comment "Keycloak"
sudo ufw allow 8100:8101/tcp comment "Kong Gateway"
sudo ufw allow 3100:3104/tcp comment "MCP Servers"
```

**Or use firewalld** (RHEL/Fedora):
```bash
sudo firewall-cmd --add-port=8180/tcp --permanent
sudo firewall-cmd --add-port=8100-8101/tcp --permanent
sudo firewall-cmd --add-port=3100-3104/tcp --permanent
sudo firewall-cmd --reload
```

---

### 3. Docker Compose Override

The `docker-compose.mobile.yml` file overrides service configurations for mobile access.

**Start services with mobile override**:
```bash
cd infrastructure/docker
docker compose -f docker-compose.yml -f docker-compose.mobile.yml up -d
```

**Key changes made by override**:

| Service | Override | Reason |
|---------|----------|--------|
| **Keycloak** | `KC_HOSTNAME=${MOBILE_HOST_IP}` | Mobile OIDC redirects need correct hostname |
| **MCP Gateway** | `CORS_ORIGINS` includes mobile app scheme | Allow mobile app to make API requests |
| **All Services** | Ports bind to `0.0.0.0` instead of `127.0.0.1` | Accept connections from LAN |
| **Kong** | `KONG_PROXY_LISTEN=0.0.0.0:8000` | API Gateway accessible from mobile |

**Stop services**:
```bash
docker compose -f docker-compose.yml -f docker-compose.mobile.yml down
```

---

### 4. Verification

#### From Development Machine

Test that services are bound to LAN IP:

```bash
# Keycloak
curl http://192.168.1.100:8180/health/ready

# MCP Gateway
curl http://192.168.1.100:3100/health

# Kong Gateway
curl http://192.168.1.100:8100/
```

Expected responses:
- Keycloak: `{"status": "UP"}`
- MCP Gateway: `{"status": "healthy", ...}`
- Kong: `{"message":"no Route matched with those values"}`

#### From Mobile Device

**Prerequisites**:
- Mobile device on **same Wi-Fi network** as development machine
- Development machine's firewall configured (Windows)

**Browser test**:
1. Open mobile browser (Safari, Chrome)
2. Navigate to: `http://192.168.1.100:8180/health/ready`
3. Should see JSON response (not "connection refused")

**Troubleshooting connection failures**:

**Cannot connect at all**:
- Verify mobile device is on same network
- Check development machine's firewall settings
- Ping development machine: `ping 192.168.1.100`

**Connection refused (immediate failure)**:
- Services not started: Run `docker compose ps`
- Wrong IP: Re-run `discover-mobile-host.sh/ps1`

**Connection timeout (slow failure)**:
- Firewall blocking: Windows users must run `setup-mobile-firewall.ps1`
- Network isolation: Some corporate networks block device-to-device communication

---

## Mobile App Configuration

### React Native Environment Variables

Create `clients/mobile/.env.development`:

```bash
# Auto-generated from .env.mobile
KEYCLOAK_URL=http://192.168.1.100:8180
MCP_GATEWAY_URL=http://192.168.1.100:3100
KONG_GATEWAY_URL=http://192.168.1.100:8100

# OAuth configuration
OAUTH_CLIENT_ID=mcp-gateway-mobile
OAUTH_REDIRECT_URI=tamshai-mobile://oauth/callback
OAUTH_SCOPE=openid profile email roles

# Environment
NODE_ENV=development
```

### React Native Code

**Authentication**:
```typescript
import { authorize } from 'react-native-app-auth';

const config = {
  issuer: process.env.KEYCLOAK_URL + '/realms/tamshai-corp',
  clientId: process.env.OAUTH_CLIENT_ID,
  redirectUrl: process.env.OAUTH_REDIRECT_URI,
  scopes: process.env.OAUTH_SCOPE.split(' '),
};

const authState = await authorize(config);
```

**MCP Gateway API**:
```typescript
const response = await fetch(`${process.env.MCP_GATEWAY_URL}/api/query`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: 'List all employees' }),
});
```

---

## Network Profile Configuration

### Windows

**Check current network profile**:
```powershell
Get-NetConnectionProfile
```

**Change from Public to Private** (required for firewall rules):
```powershell
Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private
```

**Explanation**:
- **Private**: Home/work networks - firewall rules apply
- **Public**: Coffee shops, airports - firewall blocks all inbound
- **Domain**: Corporate domain-joined - firewall rules apply

---

## Port Reference

| Port | Service | Purpose | Protocol |
|------|---------|---------|----------|
| **8180** | Keycloak | Identity Provider (OIDC) | HTTP |
| **8100** | Kong Gateway | API Gateway (Proxy) | HTTP |
| **8101** | Kong Gateway | Admin API | HTTP |
| **3100** | MCP Gateway | AI Orchestration | HTTP |
| **3101** | MCP HR | Employee data access | HTTP |
| **3102** | MCP Finance | Finance data access | HTTP |
| **3103** | MCP Sales | CRM data access | HTTP |
| **3104** | MCP Support | Support tickets/KB | HTTP |
| **6380** | Redis | Token revocation cache | TCP |

**Mobile apps should only access**:
- Keycloak (8180) - Authentication
- Kong Gateway (8100) - API proxy
- MCP Gateway (3100) - AI queries

**Direct MCP server access** (3101-3104) is for testing only.

---

## Security Considerations

### Development Only

This configuration is for **development only**. Do not use in production:
- ✅ Services bound to `0.0.0.0` (all interfaces)
- ✅ No mTLS between services
- ✅ HTTP (not HTTPS)
- ✅ Firewall rules allow LAN access

### Network Security

**Safe networks**:
- ✅ Home Wi-Fi with WPA2/WPA3
- ✅ Corporate network (trusted)
- ✅ Dedicated development network

**Unsafe networks**:
- ❌ Public Wi-Fi (coffee shops, airports)
- ❌ Hotel Wi-Fi
- ❌ Shared apartment/dorm Wi-Fi

**Best practice**: Use Private/Domain network profile on Windows to ensure firewall rules only apply to trusted networks.

### Credential Security

**Test users** (from sample data):
- `alice.chen` / `password123` (HR Admin)
- `eve.thompson` / `password123` (Executive)

**TOTP Secret**: `JBSWY3DPEHPK3PXP`

⚠️ **Never use these credentials in production**

---

## Troubleshooting

### Issue: Cannot Detect LAN IP

**Symptom**: Script says "Failed to detect valid LAN IP"

**Fixes**:
1. Ensure Wi-Fi or Ethernet is connected
2. Manually set IP:
   ```bash
   export MOBILE_HOST_IP=192.168.1.100  # Linux/macOS
   $env:MOBILE_HOST_IP = "192.168.1.100"  # Windows
   ```
3. Check network adapter status:
   ```bash
   ip link show  # Linux
   ipconfig      # Windows
   ifconfig      # macOS
   ```

### Issue: Mobile Device Cannot Connect

**Symptom**: Browser shows "Cannot connect to server" or times out

**Diagnosis**:
```bash
# From mobile device (use Termux or similar terminal app)
ping 192.168.1.100

# If ping works but HTTP doesn't:
# - Firewall is blocking (Windows: run setup-mobile-firewall.ps1)
# - Services not started (docker compose ps)
```

**Fixes**:
1. **Windows**: Run `.\scripts\windows\setup-mobile-firewall.ps1` as Administrator
2. **Network profile**: Ensure Private/Domain (not Public)
   ```powershell
   Get-NetConnectionProfile
   Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private
   ```
3. **Firewall**: Verify rules exist
   ```powershell
   Get-NetFirewallRule -DisplayName "Tamshai Mobile Dev*"
   ```
4. **Services**: Ensure bound to `0.0.0.0`
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.mobile.yml ps
   ```

### Issue: OAuth Redirect Fails

**Symptom**: After Keycloak login, redirect to `tamshai-mobile://` doesn't work

**Causes**:
1. **Wrong hostname**: Keycloak `KC_HOSTNAME` not set to LAN IP
2. **Client config**: `mcp-gateway-mobile` client has wrong redirect URI

**Fixes**:
1. Verify `.env.mobile` has correct IP:
   ```bash
   cat infrastructure/docker/.env.mobile | grep KC_HOSTNAME
   ```
2. Check Keycloak client redirect URIs:
   - Navigate to: `http://192.168.1.100:8180/admin`
   - Clients > `mcp-gateway-mobile` > Settings
   - Valid redirect URIs should include: `tamshai-mobile://oauth/callback`

### Issue: CORS Errors in Mobile App

**Symptom**: Browser console shows "CORS policy" errors

**Fix**: Verify MCP Gateway CORS origins include mobile app scheme:
```bash
# Check .env.mobile
cat infrastructure/docker/.env.mobile | grep CORS_ORIGINS

# Should include:
# CORS_ORIGINS=...,tamshai-mobile://oauth/callback,...
```

### Issue: Services Unhealthy After Restart

**Symptom**: `docker compose ps` shows unhealthy services

**Diagnosis**:
```bash
# Check logs
docker compose logs keycloak --tail=50
docker compose logs mcp-gateway --tail=50
```

**Common causes**:
- Keycloak startup delay (can take 30-60 seconds)
- Database connection issues
- Port conflicts (another process using ports)

**Fix**:
```bash
# Wait for Keycloak to fully start
curl http://192.168.1.100:8180/health/ready

# Check port conflicts
netstat -ano | findstr :8180  # Windows
lsof -i :8180                  # Linux/macOS
```

---

## Cleanup

When finished with mobile development:

### 1. Stop Services

```bash
cd infrastructure/docker
docker compose -f docker-compose.yml -f docker-compose.mobile.yml down
```

### 2. Remove Firewall Rules (Windows)

```powershell
.\scripts\windows\cleanup-mobile-firewall.ps1
```

### 3. Remove .env.mobile

```bash
rm infrastructure/docker/.env.mobile
```

### 4. Restart Services Normally

```bash
cd infrastructure/docker
docker compose up -d
```

---

## Related Documentation

- [Architecture Overview](../architecture/overview.md)
- [Desktop Client Setup](../../clients/desktop/README.md)
- [Port Allocation](./PORT_ALLOCATION.md)
- [Docker Compose Reference](../../infrastructure/docker/README.md)

---

**Questions or Issues?**

- GitHub Issues: https://github.com/jcornell3/tamshai-enterprise-ai/issues
- Check logs: `docker compose logs <service>`
- Verify firewall: `Get-NetFirewallRule -DisplayName "Tamshai Mobile Dev*"`

---

**Last Updated**: December 13, 2025
**Tested Platforms**: Windows 11, macOS Sonoma, Ubuntu 22.04
**Mobile OS Tested**: iOS 17, Android 14

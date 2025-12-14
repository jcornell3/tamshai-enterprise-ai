# Spec 007: Mobile AI Assistant (React Native)

## Document Information
- **Spec ID**: 007-mobile
- **Version**: 1.0.0
- **Status**: PLANNED
- **Author**: AI Architecture Assistant
- **Created**: December 12, 2025
- **Constitutional Compliance**: Article V (ALL - CRITICAL)

---

## 1. Business Intent

Provide mobile AI assistant applications (iOS and Android) that enable employees to access enterprise AI capabilities from their mobile devices while maintaining the same security guarantees as web and desktop clients.

### 1.1 Problem Statement

Mobile devices present unique challenges for enterprise AI access:
1. **Network Accessibility**: Development environment uses localhost/127.0.0.1 which is inaccessible from physical mobile devices
2. **Token Security**: Mobile platforms have different secure storage mechanisms than web/desktop
3. **SSE Streaming**: React Native lacks native EventSource support
4. **Firewall Restrictions**: WSL2/Windows environments require firewall configuration for mobile access

### 1.2 Solution Approach

1. **Dynamic Host Configuration**: Replace hardcoded localhost references with configurable host addresses
2. **Platform-Specific Token Storage**: Use iOS Keychain and Android Keystore via `react-native-keychain`
3. **SSE Polyfill**: Implement EventSource using `react-native-sse` or custom fetch-based streaming
4. **Network Setup Script**: Automate firewall rules and host discovery for mobile development

---

## 2. Constitutional Compliance

### Article V.1 - No Authorization Logic in Client
```typescript
// CORRECT: Backend returns masked data, client renders as-is
const EmployeeSalary = ({ employee }) => (
  <Text>{employee.salary}</Text>  // Backend returns "*** (Hidden)" for non-privileged
);

// WRONG: Client-side role checking (VIOLATES CONSTITUTION)
const EmployeeSalary = ({ employee, roles }) => {
  if (roles.includes('hr-write')) {
    return <Text>{employee.salary}</Text>;
  }
  return <Text>*** (Hidden)</Text>;
};
```

### Article V.2 - Secure Token Storage
```typescript
// iOS: Keychain Services
// Android: Keystore System
import * as Keychain from 'react-native-keychain';

async function storeTokens(accessToken: string, refreshToken: string) {
  await Keychain.setGenericPassword('tokens', JSON.stringify({
    accessToken,
    refreshToken,
  }), {
    service: 'com.tamshai.ai',
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}
```

### Article V.3 - OIDC PKCE Only
```typescript
// System browser for OAuth (not embedded WebView)
import { authorize } from 'react-native-app-auth';

const config = {
  issuer: `${API_HOST}/realms/tamshai-corp`,
  clientId: 'mcp-gateway-mobile',
  redirectUrl: 'com.tamshai.ai://oauth/callback',
  scopes: ['openid', 'profile', 'email'],
  usePKCE: true,  // REQUIRED by Constitution
};

const result = await authorize(config);
```

---

## 3. Network Architecture for Mobile Development

### 3.1 The Problem: localhost Inaccessibility

Current configuration uses `localhost` or `127.0.0.1`:
- Web apps: `VITE_KEYCLOAK_URL: http://localhost:8180`
- Keycloak issuer: `http://localhost:8180/realms/tamshai-corp`
- MCP Gateway: `http://localhost:3100`

**Issue**: Physical mobile devices cannot reach `localhost` - they need the host machine's LAN IP address.

### 3.2 Solution: Dynamic Host Configuration

#### Environment Variable Strategy

```bash
# .env.mobile (new file)
# Discovered at startup via script

# Host machine's LAN IP (e.g., 192.168.1.100)
TAMSHAI_HOST_IP=192.168.1.100

# Services accessible from mobile
KEYCLOAK_EXTERNAL_URL=http://${TAMSHAI_HOST_IP}:8180
MCP_GATEWAY_EXTERNAL_URL=http://${TAMSHAI_HOST_IP}:3100
KONG_EXTERNAL_URL=http://${TAMSHAI_HOST_IP}:8100
```

#### Docker Compose Changes

Services that need mobile access must:
1. Bind to `0.0.0.0` (all interfaces) instead of just localhost
2. Use environment variable for external URL references

```yaml
# docker-compose.mobile.yml (override file)
version: '3.8'

services:
  keycloak:
    environment:
      # Use host IP for frontend redirect URIs
      KC_HOSTNAME: ${TAMSHAI_HOST_IP:-localhost}
      KC_HOSTNAME_PORT: 8180

  mcp-gateway:
    environment:
      # External URLs for CORS and redirects
      KEYCLOAK_URL: http://${TAMSHAI_HOST_IP:-localhost}:8180
      KEYCLOAK_ISSUER: http://${TAMSHAI_HOST_IP:-localhost}:8180/realms/tamshai-corp
      CORS_ORIGINS: http://${TAMSHAI_HOST_IP:-localhost}:4000,com.tamshai.ai://*
```

### 3.3 Keycloak Client Configuration

New mobile-specific client required:

```json
{
  "clientId": "mcp-gateway-mobile",
  "protocol": "openid-connect",
  "publicClient": true,
  "standardFlowEnabled": true,
  "directAccessGrantsEnabled": false,
  "redirectUris": [
    "com.tamshai.ai://oauth/callback",
    "com.tamshai.ai://oauth/logout"
  ],
  "webOrigins": [
    "com.tamshai.ai"
  ],
  "attributes": {
    "pkce.code.challenge.method": "S256"
  }
}
```

---

## 4. Windows Firewall Configuration

### 4.1 Required Ports

| Port | Service | Direction | Protocol |
|------|---------|-----------|----------|
| 8180 | Keycloak | Inbound | TCP |
| 8100 | Kong Gateway | Inbound | TCP |
| 3100 | MCP Gateway | Inbound | TCP |
| 4000-4004 | Web Apps (optional) | Inbound | TCP |

### 4.2 PowerShell Firewall Script

```powershell
# scripts/setup-mobile-firewall.ps1
# Run as Administrator

$ports = @(8180, 8100, 3100, 4000, 4001, 4002, 4003, 4004)
$ruleName = "Tamshai-Mobile-Dev"

# Remove existing rules
Get-NetFirewallRule -DisplayName "$ruleName*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule

# Create inbound rules for each port
foreach ($port in $ports) {
    New-NetFirewallRule `
        -DisplayName "$ruleName-$port" `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort $port `
        -Action Allow `
        -Profile Private,Domain `
        -Description "Allow mobile development access to Tamshai services"

    Write-Host "Created firewall rule for port $port"
}

Write-Host "`nFirewall rules created. Mobile devices on the same network can now access services."
```

### 4.3 WSL2 Port Forwarding

WSL2 uses NAT networking, requiring port forwarding from Windows to WSL:

```powershell
# scripts/setup-wsl-portforward.ps1
# Run as Administrator

$wslIp = (wsl hostname -I).Trim().Split()[0]
$ports = @(8180, 8100, 3100, 4000, 4001, 4002, 4003, 4004)

Write-Host "WSL2 IP: $wslIp"

# Remove existing port proxies
foreach ($port in $ports) {
    netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null
}

# Add port forwards
foreach ($port in $ports) {
    netsh interface portproxy add v4tov4 `
        listenport=$port `
        listenaddress=0.0.0.0 `
        connectport=$port `
        connectaddress=$wslIp

    Write-Host "Forwarding port $port -> $wslIp:$port"
}

Write-Host "`nPort forwarding configured. Services accessible via Windows host IP."
```

---

## 5. Host Discovery Script

### 5.1 Bash Script (WSL2/Linux)

```bash
#!/bin/bash
# scripts/discover-mobile-host.sh
# Discovers host IP and generates mobile environment file

set -e

# Get the primary network interface IP
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # WSL2 or Linux
    if grep -qi microsoft /proc/version 2>/dev/null; then
        # WSL2: Get Windows host IP
        HOST_IP=$(ip route show | grep -i default | awk '{ print $3}')
        # Alternative: Get WSL2's own IP visible to Windows
        HOST_IP=$(hostname -I | awk '{print $1}')
    else
        # Native Linux
        HOST_IP=$(hostname -I | awk '{print $1}')
    fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    HOST_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
fi

if [[ -z "$HOST_IP" ]]; then
    echo "ERROR: Could not determine host IP address"
    exit 1
fi

echo "Discovered host IP: $HOST_IP"

# Generate .env.mobile file
cat > .env.mobile << EOF
# Auto-generated by discover-mobile-host.sh
# $(date)

TAMSHAI_HOST_IP=$HOST_IP

# External URLs for mobile clients
KEYCLOAK_EXTERNAL_URL=http://$HOST_IP:8180
MCP_GATEWAY_EXTERNAL_URL=http://$HOST_IP:3100
KONG_EXTERNAL_URL=http://$HOST_IP:8100

# Keycloak configuration
KC_HOSTNAME=$HOST_IP
KC_HOSTNAME_PORT=8180

# CORS origins (add mobile app scheme)
CORS_ORIGINS=http://$HOST_IP:4000,http://$HOST_IP:4001,http://$HOST_IP:4002,http://$HOST_IP:4003,http://$HOST_IP:4004,com.tamshai.ai://*
EOF

echo "Generated .env.mobile with host IP: $HOST_IP"
echo ""
echo "Next steps:"
echo "1. Run: docker compose --env-file .env.mobile up -d"
echo "2. Configure mobile app with: KEYCLOAK_URL=http://$HOST_IP:8180"
echo "3. Ensure firewall allows ports: 8180, 8100, 3100"
```

---

## 6. React Native Application Structure

### 6.1 Project Structure

```
clients/mobile/
├── package.json
├── app.json
├── babel.config.js
├── metro.config.js
├── tsconfig.json
├── index.js
├── App.tsx
├── src/
│   ├── config/
│   │   ├── env.ts              # Environment configuration
│   │   └── auth.ts             # OIDC configuration
│   ├── services/
│   │   ├── auth.service.ts     # Authentication service
│   │   ├── api.service.ts      # API client
│   │   └── sse.service.ts      # SSE streaming client
│   ├── hooks/
│   │   ├── useAuth.ts          # Authentication hook
│   │   ├── useQuery.ts         # AI query hook
│   │   └── useSSE.ts           # SSE streaming hook
│   ├── screens/
│   │   ├── LoginScreen.tsx
│   │   ├── HomeScreen.tsx
│   │   ├── QueryScreen.tsx     # AI query interface
│   │   ├── HRScreen.tsx
│   │   ├── FinanceScreen.tsx
│   │   ├── SalesScreen.tsx
│   │   └── SupportScreen.tsx
│   ├── components/
│   │   ├── QueryInput.tsx
│   │   ├── StreamingResponse.tsx
│   │   ├── ApprovalCard.tsx    # Confirmation UI
│   │   └── TruncationWarning.tsx
│   └── navigation/
│       └── AppNavigator.tsx
├── ios/
│   └── TamshaiAI/
└── android/
    └── app/
```

### 6.2 Environment Configuration

```typescript
// src/config/env.ts

import Config from 'react-native-config';

// Development: Use discovered host IP
// Production: Use production URLs
export const ENV = {
  // Base URLs (configured via react-native-config)
  KEYCLOAK_URL: Config.KEYCLOAK_URL || 'http://192.168.1.100:8180',
  MCP_GATEWAY_URL: Config.MCP_GATEWAY_URL || 'http://192.168.1.100:3100',
  KONG_URL: Config.KONG_URL || 'http://192.168.1.100:8100',

  // Keycloak realm
  KEYCLOAK_REALM: 'tamshai-corp',
  KEYCLOAK_CLIENT_ID: 'mcp-gateway-mobile',

  // App scheme for OAuth redirect
  APP_SCHEME: 'com.tamshai.ai',
};

export const getKeycloakIssuer = () =>
  `${ENV.KEYCLOAK_URL}/realms/${ENV.KEYCLOAK_REALM}`;

export const getOAuthRedirectUri = () =>
  `${ENV.APP_SCHEME}://oauth/callback`;
```

### 6.3 SSE Streaming Implementation

```typescript
// src/services/sse.service.ts

import { getAccessToken } from './auth.service';
import { ENV } from '../config/env';

export interface SSEMessage {
  type: 'text' | 'pagination' | 'error';
  text?: string;
  hasMore?: boolean;
  cursors?: Array<{ server: string; cursor: string }>;
  message?: string;
}

export async function streamQuery(
  query: string,
  onMessage: (msg: SSEMessage) => void,
  onDone: () => void,
  onError: (error: Error) => void,
): Promise<() => void> {
  const token = await getAccessToken();
  const url = `${ENV.MCP_GATEWAY_URL}/api/query?q=${encodeURIComponent(query)}&token=${token}`;

  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              onDone();
              return;
            }
            try {
              const msg = JSON.parse(data) as SSEMessage;
              onMessage(msg);
            } catch (e) {
              // Ignore parse errors for partial chunks
            }
          }
        }
      }

      onDone();
    } catch (error) {
      if (error.name !== 'AbortError') {
        onError(error as Error);
      }
    }
  })();

  // Return abort function
  return () => controller.abort();
}
```

---

## 7. Technical Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Framework | React Native 0.73+ | Cross-platform mobile |
| Language | TypeScript 5.x | Type safety |
| Navigation | React Navigation 6.x | Screen navigation |
| Auth | react-native-app-auth | OIDC PKCE flow |
| Token Storage | react-native-keychain | Secure credential storage |
| Config | react-native-config | Environment variables |
| SSE | Custom fetch-based | Streaming responses |
| State | Zustand | Lightweight state management |
| UI | React Native Paper | Material Design components |

---

## 8. Success Criteria

### 8.1 Network Accessibility
- [ ] Host discovery script correctly identifies LAN IP
- [ ] Firewall rules allow mobile device connections
- [ ] WSL2 port forwarding works (if applicable)
- [ ] Mobile device can reach Keycloak login page
- [ ] Mobile device can reach MCP Gateway API

### 8.2 Authentication
- [ ] OIDC PKCE flow works via system browser
- [ ] Tokens stored securely in platform keychain
- [ ] Token refresh works automatically
- [ ] Logout clears all stored credentials

### 8.3 AI Query Features
- [ ] SSE streaming works on both iOS and Android
- [ ] Real-time response rendering
- [ ] Pagination metadata displayed
- [ ] Confirmation cards work for write operations
- [ ] Error messages display correctly

### 8.4 Constitutional Compliance
- [ ] No authorization logic in client code
- [ ] All data masking done by backend
- [ ] Tokens never stored in AsyncStorage
- [ ] PKCE enforced for all OAuth flows

---

## 9. Dependencies

### 9.1 Specification Dependencies
- **006-ai-desktop**: Validates SSE patterns (complete first)
- **005-sample-apps**: Web app patterns to mirror
- **003-mcp-core**: Gateway API compatibility

### 9.2 Infrastructure Dependencies
- Keycloak mobile client configuration
- Firewall rules for development
- WSL2 port forwarding (Windows development)

---

## 10. Risk Assessment

### High Risk
1. **WSL2 Networking Complexity**: Port forwarding may be unreliable
   - Mitigation: Document native Docker Desktop alternative

### Medium Risk
2. **iOS App Store Requirements**: May require production certificates early
   - Mitigation: Use TestFlight for internal testing

3. **SSE on React Native**: No native EventSource support
   - Mitigation: Custom fetch-based implementation tested

### Low Risk
4. **Platform-Specific Bugs**: iOS/Android differences
   - Mitigation: Test on both platforms continuously

---

## 11. Location

**Specification Files**: `.specify/specs/007-mobile/`
- `spec.md` - This document
- `plan.md` - Implementation plan
- `tasks.md` - Detailed task breakdown

---

*Last Updated*: December 12, 2025
*Specification Version*: 1.0.0

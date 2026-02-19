# Tamshai Stage Environment Monitor

Lightweight monitoring container that runs **locally** to monitor the **remote** VPS stage environment.

## Why Local Monitoring?

The VPS uses Phoenix architecture (terraform destroy/apply for rebuilds). Running monitoring on the VPS itself would be destroyed during rebuilds. This local container:

- Survives VPS Phoenix rebuilds
- Detects when VPS goes down
- Alerts on health check failures
- Notifies on recovery

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        YOUR LOCAL MACHINE                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           tamshai-stage-monitor container               │   │
│  │                                                         │   │
│  │  • HTTP health checks every 60s                         │   │
│  │  • Alerts after 3 consecutive failures                  │   │
│  │  • Discord notifications                                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      REMOTE VPS (Stage)                         │
│                    https://www.tamshai.com                      │
│                                                                 │
│  • /api/health - MCP Gateway health                             │
│  • /auth/realms/tamshai-corp - Keycloak health                  │
│                                                                 │
│  On startup, VPS sends Discord notification:                    │
│  ✅ Services started (success)                                  │
│  🚨 Decryption failed (failure)                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Webhook
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         DISCORD                                 │
│                                                                 │
│  #tamshai-alerts channel receives:                              │
│  • VPS startup success/failure                                  │
│  • Health check failures (threshold reached)                    │
│  • Recovery notifications                                       │
└─────────────────────────────────────────────────────────────────┘
```

## Setup

### 1. Create Discord Webhook

1. Open Discord Server Settings → Integrations → Webhooks
2. Click "New Webhook"
3. Name it "Tamshai Stage Monitor"
4. Select the alerts channel
5. Copy the webhook URL

### 2. Configure Local Monitor

```bash
cd infrastructure/monitoring
cp .env.example .env
# Edit .env and set DISCORD_WEBHOOK_URL
```

### 3. Start Monitor

```bash
docker compose up -d

# View logs
docker compose logs -f
```

### 4. Configure VPS Discord Webhook

Add the webhook URL to VPS deployment:

**Option A: Environment variable in deploy-vps.yml**
```yaml
DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
```

**Option B: File on VPS**
```bash
# SSH to VPS
echo "https://discord.com/api/webhooks/..." > /opt/tamshai/.discord-webhook
chmod 600 /opt/tamshai/.discord-webhook
```

## Notifications

| Event | Source | Color |
|-------|--------|-------|
| Monitor Started | Local container | 🟡 Yellow |
| Health Check Failed | Local container | 🔴 Red |
| Service Recovered | Local container | 🟢 Green |
| VPS Startup Success | VPS start-services.sh | 🟢 Green |
| Decryption Failed | VPS decrypt-secrets.sh | 🔴 Red |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MONITOR_TARGET_URL` | `https://www.tamshai.com` | VPS URL to monitor |
| `MONITOR_INTERVAL_SECONDS` | `60` | Check interval |
| `DISCORD_WEBHOOK_URL` | (required) | Discord webhook |
| `CHECK_ENDPOINTS` | `/api/health,/auth/realms/tamshai-corp` | Endpoints to check |
| `FAILURE_THRESHOLD` | `3` | Failures before alerting |
| `RECOVERY_NOTIFY` | `true` | Send recovery notification |

## Troubleshooting

### Monitor not sending alerts
```bash
# Check if webhook is configured
docker compose exec stage-monitor env | grep DISCORD

# Test webhook manually
curl -X POST "$DISCORD_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"content":"Test message"}'
```

### VPS not sending startup notifications
```bash
# SSH to VPS and check webhook file
cat /opt/tamshai/.discord-webhook

# Test manually
source /opt/tamshai/scripts/secrets/start-services.sh
# (will send notification if webhook configured)
```

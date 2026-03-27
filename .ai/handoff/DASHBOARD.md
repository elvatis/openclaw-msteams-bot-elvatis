# DASHBOARD.md - openclaw-teams-elvatis

## Quick Status

```
Plugin:    openclaw-teams-elvatis v0.1.3
Server:    isp.elvatis.com
Port:      3978
Endpoint:  https://teams-bot.elvatis.com/api/messages
Gateway:   elvatis-agent-openclaw.service (active)
Channels:  5 (General, General, Accounting, Marketing, Personal)
```

## Key Commands

```bash
# Check bot status
ssh root@isp.elvatis.com -p 10386 "systemctl status elvatis-agent-openclaw"

# View live logs
ssh root@isp.elvatis.com -p 10386 "journalctl -u elvatis-agent-openclaw -f"

# Restart bot
ssh root@isp.elvatis.com -p 10386 "systemctl restart elvatis-agent-openclaw"

# Health check
curl https://teams-bot.elvatis.com/health

# Update channel prompts
ssh root@isp.elvatis.com -p 10386 "nano /home/elvatis-agent/.openclaw/openclaw.json"
# Then: systemctl restart elvatis-agent-openclaw
```

## Deploy New Version

```bash
# 1. Build locally
cd /home/chef-linux/.openclaw/workspace/openclaw-teams-elvatis
rm -rf dist && npx tsc

# 2. Deploy JS files to ISP server
scp -P 10386 dist/src/index.js dist/src/bot.js dist/src/session.js dist/src/types.js \
  root@isp.elvatis.com:/home/elvatis-agent/.openclaw/workspace/plugins/openclaw-teams-elvatis/

# 3. Restart gateway
ssh root@isp.elvatis.com -p 10386 "
  chown elvatis-agent:elvatis-agent /home/elvatis-agent/.openclaw/workspace/plugins/openclaw-teams-elvatis/*.js
  systemctl restart elvatis-agent-openclaw
  sleep 6 && ss -tlnp | grep 3978
"
```

## Architecture

```
Microsoft Teams
      │
      │ HTTPS POST /api/messages (Azure JWT)
      ▼
teams-bot.elvatis.com (Apache + Let's Encrypt)
      │
      │ HTTP → 127.0.0.1:3978
      ▼
openclaw-teams-elvatis plugin (Bot Framework + Express)
      │
      │ WebSocket (ws://127.0.0.1:18789) - replaces openclaw agent CLI
      │ Falls back to: openclaw agent --message "..." --session-id "..." --json
      ▼
OpenClaw Gateway (elvatis-agent, ws://127.0.0.1:18789)
      │
      │ Anthropic API (claude-sonnet-4-6, Key 2)
      ▼
AI Response → Teams channel
```

## File Locations (ISP Server)

```
Plugin root:    /home/elvatis-agent/.openclaw/workspace/plugins/openclaw-teams-elvatis/
Config:         /home/elvatis-agent/.openclaw/openclaw.json  (plugins.entries.openclaw-teams-elvatis)
Service:        /etc/systemd/system/elvatis-agent-openclaw.service
Apache vhost:   /etc/apache2/sites-enabled/teams-bot.elvatis.com.vhost
```

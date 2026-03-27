# ARCHITECTURE.md — openclaw-teams-elvatis

## Overview

openclaw-teams-elvatis is a native OpenClaw plugin that implements Microsoft Teams as a channel bridge to the OpenClaw Gateway. It uses the Microsoft Bot Framework v4 for Teams integration and forwards messages to the local OpenClaw agent via the `openclaw agent` CLI.

## Components

### 1. Plugin Entry (`src/index.ts`)
- Implements the OpenClaw Plugin Interface (`register(api)` synchronously)
- Reads plugin config from `api.pluginConfig`
- Registers a service via `api.registerService()` for async bot startup
- Builds a `GatewayAPI` object that calls `openclaw agent --json` as a subprocess

### 2. Bot Server (`src/bot.ts`)
- Express HTTP server on port 3978
- Bot Framework Adapter with App ID + Password + Tenant ID
- `POST /api/messages` — Teams webhook endpoint
- `GET /health` — health check endpoint
- Forwards messages to `SessionManager`
- Sends a typing indicator while the agent is responding

### 3. Session Manager (`src/session.ts`)
- Maps Teams channel IDs to OpenClaw session IDs
- Sanitizes channel IDs (Teams IDs contain special characters that OpenClaw rejects)
- Stores `ConversationReference` per channel for proactive messaging

### 4. Gateway Client (in `src/index.ts`)
- `sendMessage()` calls `openclaw agent --message "..." --session-id "..." --json`
- Parses the response from `result.payloads[0].text`
- Session ID = `"teams-" + sanitized(channelId).slice(0, 40)`

## OpenClaw Plugin API Learnings

Important for future plugins (undocumented, reverse-engineered 2026-03-27):

| Aspect | Behavior |
|---|---|
| `register(api)` | Must be **synchronous**. Async is ignored. |
| Plugin Config | Available at `api.pluginConfig`, not `api.config` |
| Entry Point | OpenClaw looks for `index.js` in the **plugin root**, not in `dist/` |
| `main` field | In `openclaw.plugin.json` is **ignored** |
| Async Services | Via `api.registerService({ id, start(), stop() })` |
| Export Format | `export default { id, name, version, register(api) {} }` |
| No Class Export | `export default class X {}` causes "cannot invoke without new" error |

## Message Flow

```
Teams user sends "@Akido Hello"
    │
    ▼
Azure Bot Framework validates JWT token
    │
    ▼ POST /api/messages
Bot Framework Adapter (src/bot.ts)
    │
    ▼
resolveChannelId() + resolveChannelName()
    │
    ▼
SessionManager.ensureSession(channelId, channelName, convRef)
    │  → safeId = "teams-" + sanitized(channelId).slice(0,40)
    ▼
gateway.sendMessage({ sessionId: safeId, text, sender, metadata })
    │
    ▼
execFile("openclaw", ["agent", "--message", fullText, "--session-id", safeId, "--json"])
    │
    ▼
JSON.parse(stdout).result.payloads[0].text
    │
    ▼
context.sendActivity(responseText)
    │
    ▼
Teams user sees the response
```

## Security

- **Bot Framework Auth:** All incoming requests are signed by Azure via JWT and verified by the BotFrameworkAdapter. No valid token = 401.
- **ModSecurity:** Disabled for `/api/messages` (`SecRuleEngine Off`) because OWASP CRS rules misclassify legitimate Bot Framework requests as LFI attacks.
- **Secrets:** All secrets (App ID, Password, Tenant ID) are stored only in `openclaw.json` on the server, never in the repo.
- **Session IDs:** Sanitized to prevent path traversal and invalid characters.

## Deployment Notes

- The bot runs as a **native OpenClaw plugin** (not as a separate process)
- Port 3978 is held by the `openclaw-gateway` process (not by Node directly)
- The `openclaw-teams-bot.service` (standalone) has been disabled
- On update: copy JS files from `dist/src/` directly to the plugin root

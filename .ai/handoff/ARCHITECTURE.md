# ARCHITECTURE.md — openclaw-teams-elvatis

## Overview

openclaw-teams-elvatis ist ein natives OpenClaw-Plugin das Microsoft Teams als Channel-Brücke zum OpenClaw Gateway implementiert. Es verwendet das Microsoft Bot Framework v4 für die Teams-Integration und leitet Nachrichten über die `openclaw agent` CLI an den lokalen OpenClaw-Agenten weiter.

## Components

### 1. Plugin Entry (`src/index.ts`)
- Implementiert das OpenClaw Plugin Interface (`register(api)` synchron)
- Liest Plugin-Config aus `api.pluginConfig`
- Registriert einen Service via `api.registerService()` für async Bot-Start
- Baut ein `GatewayAPI`-Objekt das `openclaw agent --json` als Subprocess aufruft

### 2. Bot Server (`src/bot.ts`)
- Express HTTP Server auf Port 3978
- Bot Framework Adapter mit App ID + Password + Tenant ID
- `POST /api/messages` — Teams Webhook Endpoint
- `GET /health` — Health Check
- Leitet Messages an `SessionManager` weiter
- Sendet Typing-Indicator während Agent antwortet

### 3. Session Manager (`src/session.ts`)
- Mapped Teams Channel IDs → OpenClaw Session IDs
- Sanitized Channel IDs (Teams IDs enthalten Sonderzeichen die OpenClaw ablehnt)
- Hält `ConversationReference` pro Channel für proaktive Nachrichten

### 4. Gateway Client (in `src/index.ts`)
- `sendMessage()` ruft `openclaw agent --message "..." --session-id "..." --json` auf
- Parsed Antwort aus `result.payloads[0].text`
- Session-ID = `"teams-" + sanitized(channelId).slice(0, 40)`

## OpenClaw Plugin API Learnings

Wichtig für zukünftige Plugins (undokumentiert, reverse-engineered 2026-03-27):

| Aspekt | Verhalten |
|---|---|
| `register(api)` | Muss **synchron** sein. Async wird ignoriert. |
| Plugin Config | In `api.pluginConfig`, nicht `api.config` |
| Entry Point | OpenClaw sucht `index.js` im **Plugin-Root**, nicht in `dist/` |
| `main`-Feld | In `openclaw.plugin.json` wird **ignoriert** |
| Async Services | Via `api.registerService({ id, start(), stop() })` |
| Export Format | `export default { id, name, version, register(api) {} }` |
| Kein Class Export | `export default class X {}` → "cannot invoke without new" Error |

## Message Flow

```
Teams User schreibt "@Akido Hallo"
    │
    ▼
Azure Bot Framework validiert JWT Token
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
Teams User sieht Antwort
```

## Security

- **Bot Framework Auth:** Alle eingehenden Requests werden von Azure via JWT signiert und vom BotFrameworkAdapter verifiziert. Kein gültiger Token = 401.
- **ModSecurity:** Für `/api/messages` deaktiviert (`SecRuleEngine Off`) da OWASP CRS Rules legitime Bot Framework Requests als LFI-Angriffe fehlklassifiziert.
- **Secrets:** Alle Secrets (App ID, Password, Tenant ID) nur in `openclaw.json` auf dem Server, nicht im Repo.
- **Session IDs:** Sanitized um Path Traversal und ungültige Chars zu verhindern.

## Deployment Notes

- Der Bot läuft als **natives OpenClaw Plugin** (nicht als separater Prozess)
- Port 3978 wird vom `openclaw-gateway` Prozess gehalten (nicht von Node direkt)
- Der `openclaw-teams-bot.service` (standalone) wurde deaktiviert
- Beim Update: JS-Dateien aus `dist/src/` direkt in Plugin-Root kopieren

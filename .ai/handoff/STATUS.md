# STATUS.md - openclaw-teams-elvatis

## Current Version: 0.1.0

| Platform | Status | URL |
|---|---|---|
| GitHub | ✅ private | github.com/elvatis/openclaw-teams-elvatis |
| npm | ❌ not published | - |
| ClawHub | ❌ not published | - |

## Deployment Status

| Component | Status | Details |
|---|---|---|
| Bot Framework server | ✅ running | Port 3978 on isp.elvatis.com |
| OpenClaw Gateway | ✅ running | elvatis-agent-openclaw.service |
| Apache Reverse Proxy | ✅ active | teams-bot.elvatis.com |
| SSL Certificate | ✅ Let's Encrypt | Auto-renew active |
| Azure Bot Registration | ✅ configured | App ID: 8cbe4777-... |
| Teams App Manifest | ✅ v1.0.1 deployed | supportsFiles: true |

## Channel Configuration

| Channel | Label | Model |
|---|---|---|
| General | teams-general | anthropic/claude-sonnet-4-6 |
| General | teams-general | anthropic/claude-sonnet-4-6 |
| Accounting | teams-accounting | anthropic/claude-sonnet-4-6 |
| Marketing | teams-marketing | anthropic/claude-sonnet-4-6 |
| Personal | teams-personal | anthropic/claude-sonnet-4-6 |

## Open TODOs (before public release)

- [ ] Credentials scan completed ✅ (2026-03-27 - clean)
- [ ] Git history clean ✅ (2026-03-27 - no secrets)
- [ ] AAHP handoff structure ✅ (2026-03-27 - this file)
- [ ] Create CHANGELOG.md
- [ ] package.json version bump to 0.1.1 (session ID fix + JSON parsing fix)
- [ ] Repo auf public schalten

## Known Fixes (since initial deploy)

| Issue | Fix | Version |
|---|---|---|
| `hasSession is not a function` | Gateway object was `{}`, now uses `openclaw agent` CLI | 0.1.1 |
| `{"ok":true}` as response | Wrong JSON path, now uses `result.payloads[0].text` | 0.1.1 |
| `Invalid session ID` | Teams channel IDs sanitized before passing to openclaw | 0.1.1 |
| `missing register/activate export` | Plugin export changed from class to object with `register()` | 0.1.1 |
| `Cannot find module './bot'` | JS files must be in plugin root, not `dist/src/` | 0.1.1 |

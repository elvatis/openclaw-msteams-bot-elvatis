# Changelog - openclaw-teams-elvatis

## [0.1.1] - 2026-03-27

### Fixed
- **Session ID sanitization:** Teams channel IDs contain special characters (`:`, `@`, etc.) that OpenClaw rejected as invalid session IDs. Channel IDs are now sanitized to alphanumeric + hyphens before being passed to `openclaw agent`.
- **Response parsing:** `openclaw agent --json` returns `{ result: { payloads: [{ text }] } }`. Previously parsed incorrectly, returning raw JSON to Teams users.
- **Plugin export format:** Changed from `export default class` to `export default { register(api) {} }`. OpenClaw plugin loader cannot instantiate ES6 classes without `new`.
- **Module resolution:** JS files must be in plugin root (not `dist/src/`). OpenClaw ignores `main` field in `openclaw.plugin.json` and always looks for `index.js` in the plugin root directory.
- **Gateway object:** Replaced empty `{}` gateway stub with real `openclaw agent` CLI bridge.

### Changed
- Plugin now uses `openclaw agent --message "..." --session-id "..." --json` to invoke the AI agent
- Session IDs are prefixed with `teams-` and limited to 40 sanitized chars
- Tenant ID (`appTenantId`) added to `BotFrameworkAdapter` config for single-tenant bots

## [0.1.0] - 2026-03-27

### Added
- Initial release
- Microsoft Teams ↔ OpenClaw Gateway bridge via Bot Framework v4
- Per-channel system prompts and model configuration
- Support for Teams channels, group chats, and 1:1 direct messages
- Typing indicators while agent is processing
- Apache reverse proxy setup with Let's Encrypt SSL
- Full deployment guide in README.md (9 steps: Azure → server → proxy → manifest → Teams)
- Teams App Manifest template (`manifest/manifest.json`)
- AAHP handoff structure (`.ai/handoff/`)

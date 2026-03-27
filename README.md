# openclaw-teams-elvatis

Microsoft Teams connector plugin for [OpenClaw Gateway](https://github.com/openclaw). Bridges Teams channels to OpenClaw sessions with per-channel system prompts and model configuration.

## Features

- **Per-channel sessions** — each Teams channel maps to its own OpenClaw session
- **Per-channel system prompts** — configure different AI personalities per channel (e.g. Accounting, Marketing, HR)
- **Per-channel model selection** — override the default model on a per-channel basis
- **Automatic session creation** — sessions are created on first message from a channel
- **Typing indicators** — shows typing activity in Teams while waiting for a response
- **1:1 and group chat support** — works in channels, group chats, and direct messages

## Prerequisites

- An [OpenClaw Gateway](https://github.com/openclaw) installation
- A Microsoft Azure account
- Node.js 18+

## Azure Bot Registration

1. Go to the [Azure Portal](https://portal.azure.com)
2. Search for **"Azure Bot"** and click **Create**
3. Fill in the bot details:
   - **Bot handle**: Choose a unique name (e.g. `elvatis-openclaw-bot`)
   - **Pricing tier**: F0 (free) for testing, S1 for production
   - **Microsoft App ID**: Select **"Create new Microsoft App ID"**
4. After creation, navigate to your bot resource
5. Go to **Configuration** and note the **Microsoft App ID**
6. Click **"Manage Password"** next to the App ID, then **"New client secret"**
   - Copy the generated secret — this is your `appPassword`
7. Under **Configuration → Messaging endpoint**, set:
   ```
   https://your-server.example.com/api/messages
   ```
   Replace with your actual server URL (must be HTTPS in production)

## Activate the Teams Channel

1. In your Azure Bot resource, go to **Channels**
2. Click **Microsoft Teams** and accept the terms
3. Click **Save**
4. The bot is now available in Teams — you can find it by searching in the Teams app

## Installation

```bash
cd /path/to/openclaw-gateway
npm install @elvatis_com/openclaw-teams-elvatis
```

Or clone this repo and build from source:

```bash
git clone https://github.com/elvatis/openclaw-teams-elvatis.git
cd openclaw-teams-elvatis
npm install
npm run build
```

## Configuration

Add the plugin to your `openclaw.json` configuration:

```json
{
  "plugins": {
    "openclaw-teams-elvatis": {
      "enabled": true,
      "port": 3978,
      "appId": "YOUR_MICROSOFT_APP_ID",
      "appPassword": "YOUR_MICROSOFT_APP_PASSWORD",
      "channels": {
        "Accounting": {
          "label": "teams-accounting",
          "systemPrompt": "Du bist der Elvatis Buchhaltungs-Assistent. Du hilfst bei Rechnungen, Ausgaben, Steuer und Buchführung.",
          "model": "anthropic/claude-sonnet-4-6"
        },
        "Marketing": {
          "label": "teams-marketing",
          "systemPrompt": "Du bist der Elvatis Marketing-Stratege. Du entwickelst Kampagnen, Content-Pläne und Wachstumsstrategien.",
          "model": "anthropic/claude-sonnet-4-6"
        },
        "Personal": {
          "label": "teams-personal",
          "systemPrompt": "Du bist der Elvatis HR-Assistent. Du hilfst bei Personalthemen, Onboarding und Team-Organisation.",
          "model": "anthropic/claude-sonnet-4-6"
        },
        "General": {
          "label": "teams-general",
          "systemPrompt": "Du bist Akido, der KI-Assistent von Elvatis. Du beantwortest allgemeine Fragen und hilfst bei der Arbeit.",
          "model": "anthropic/claude-sonnet-4-6"
        }
      }
    }
  }
}
```

### Configuration Reference

| Property       | Type     | Default | Description                                        |
|----------------|----------|---------|----------------------------------------------------|
| `enabled`      | boolean  | `true`  | Enable or disable the plugin                       |
| `port`         | number   | `3978`  | Port for the Bot Framework webhook endpoint        |
| `appId`        | string   | —       | Microsoft App ID from Azure Bot registration       |
| `appPassword`  | string   | —       | Microsoft App Password (client secret)             |
| `channels`     | object   | `{}`    | Per-channel configuration (keyed by channel name)  |

### Per-Channel Configuration

Each entry in `channels` is keyed by the Teams channel name (e.g. "General", "Accounting") and supports:

| Property       | Type   | Description                                    |
|----------------|--------|------------------------------------------------|
| `label`        | string | OpenClaw session label for this channel        |
| `systemPrompt` | string | System prompt for the AI in this channel       |
| `model`        | string | Model override (e.g. `anthropic/claude-sonnet-4-6`) |

Channels not listed in the configuration will still work — they'll get a default session without a custom system prompt.

## How It Works

1. The plugin starts an Express HTTP server on the configured port
2. Microsoft Teams sends messages to `POST /api/messages` via the Bot Framework
3. The plugin extracts the channel name/ID and sender information
4. A session is created (or reused) for the channel in OpenClaw Gateway
5. The message is forwarded to the gateway with sender metadata
6. The gateway response is sent back to the Teams channel

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # production build
```

## License

Apache-2.0

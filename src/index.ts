import { BotServer } from "./bot";
import { SessionManager } from "./session";
import { PluginConfig, GatewayAPI, InboundMessage, GatewayResponse } from "./types";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * OpenClaw Plugin API interface (as provided by the gateway).
 */
interface OpenClawPluginApi {
  id: string;
  logger: {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
    debug(msg: string, ...args: unknown[]): void;
  };
  pluginConfig: unknown;
  registerService?: (service: { id: string; start(): Promise<void>; stop(): Promise<void> }) => void;
}

/**
 * Build a GatewayAPI implementation that uses `openclaw system event`
 * to send messages to the local OpenClaw agent and get responses.
 */
function buildGateway(logger: OpenClawPluginApi["logger"]): GatewayAPI {
  const OPENCLAW_BIN = process.env.OPENCLAW_BIN || "/usr/local/bin/openclaw";
  const GATEWAY_URL = `ws://127.0.0.1:18789`;

  async function sendToAgent(text: string, sessionId?: string, timeoutMs = 90000): Promise<string> {
    try {
      // openclaw agent --message "..." --json returns the agent's reply
      const args = [
        "agent",
        "--message", text,
        "--json",
        "--timeout", String(Math.floor(timeoutMs / 1000)),
      ];

      // Use explicit session ID if provided (per-channel sessions)
      if (sessionId) {
        args.push("--session-id", sessionId);
      }

      logger.debug(`[teams] Running: openclaw agent --message "${text.slice(0, 50)}..."`);

      const { stdout, stderr } = await execFileAsync(OPENCLAW_BIN, args, {
        timeout: timeoutMs + 5000,
        env: { ...process.env, HOME: "/home/elvatis-agent" },
      });

      if (stderr) logger.debug(`[teams] openclaw stderr: ${stderr.slice(0, 200)}`);

      try {
        const result = JSON.parse(stdout.trim());
        // openclaw agent --json returns { result: { payloads: [{ text }] } }
        const text = result?.result?.payloads?.[0]?.text;
        if (text) return text;
        // fallback paths
        if (result?.text) return result.text;
      } catch {
        // Not JSON -- return raw stdout
      }

      const raw = stdout.trim();
      return raw || "No response received.";
    } catch (err: any) {
      logger.error(`[teams] openclaw agent failed: ${err.message}`);
      return "An error occurred. Please try again.";
    }
  }

  return {
    async hasSession(_sessionId: string): Promise<boolean> {
      return true; // sessions managed by gateway automatically
    },
    async createSession(_params: any): Promise<void> {
      // sessions created automatically by the gateway
    },
    async sendMessage(message: InboundMessage): Promise<GatewayResponse> {
      const context = message.sender
        ? `[Teams/${message.metadata?.channelName ?? "General"} from ${message.sender}]: ${message.text}`
        : message.text;

      // Sanitize session ID -- OpenClaw only accepts alphanumeric + hyphens/underscores
      // Hash the raw Teams channel ID to a safe short string
      const rawId = message.sessionId ?? "default";
      const safeId = "teams-" + rawId
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 40);

      const text = await sendToAgent(context, safeId);
      return { text, sessionId: message.sessionId };
    },
  };
}

/**
 * OpenClaw plugin that bridges Microsoft Teams channels to OpenClaw Gateway.
 */
export default {
  id: "openclaw-teams-elvatis",
  name: "OpenClaw Teams Connector (Elvatis)",
  version: "0.1.0",

  register(api: OpenClawPluginApi): void {
    const config = api.pluginConfig as PluginConfig;
    const logger = api.logger;

    if (config?.enabled === false) {
      logger.info("[teams] Plugin disabled - skipping startup");
      return;
    }

    if (!config?.appId || !config?.appPassword) {
      logger.error("[teams] Missing appId or appPassword in plugin config");
      return;
    }

    logger.info("[teams] Registering Teams connector service…");

    const gateway = buildGateway(logger);
    let botServer: BotServer | null = null;
    let sessionManager: SessionManager | null = null;

    if (typeof api.registerService === "function") {
      api.registerService({
        id: "openclaw-teams-bot",
        async start() {
          sessionManager = new SessionManager(gateway, logger as any, config.channels ?? {});
          botServer = new BotServer(config, sessionManager, gateway, logger as any);
          await botServer.start();
          const channelCount = Object.keys(config.channels ?? {}).length;
          logger.info(`[teams] Teams bot ready - ${channelCount} channel(s) configured`);
        },
        async stop() {
          if (botServer) { await botServer.stop(); botServer = null; }
          if (sessionManager) { sessionManager.clear(); sessionManager = null; }
        },
      });
    } else {
      // Fallback: fire-and-forget
      Promise.resolve().then(async () => {
        try {
          sessionManager = new SessionManager(gateway, logger as any, config.channels ?? {});
          botServer = new BotServer(config, sessionManager, gateway, logger as any);
          await botServer.start();
          logger.info(`[teams] Teams bot ready (fallback mode)`);
        } catch (err: any) {
          logger.error(`[teams] Failed to start: ${err.message}`);
        }
      });
    }
  },
};

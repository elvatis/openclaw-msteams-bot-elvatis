import { BotServer } from "./bot";
import { SessionManager } from "./session";
import { PluginConfig, PluginContext } from "./types";

/**
 * OpenClaw plugin that bridges Microsoft Teams channels to OpenClaw Gateway.
 *
 * Each Teams channel is mapped to its own OpenClaw session. Per-channel
 * system prompts and model overrides are supported via plugin configuration.
 */
export default class TeamsConnectorPlugin {
  name = "openclaw-teams-elvatis";

  private botServer: BotServer | null = null;
  private sessionManager: SessionManager | null = null;

  async initialize(ctx: PluginContext): Promise<void> {
    const config = ctx.config as PluginConfig;

    if (config.enabled === false) {
      ctx.logger.info("Teams connector plugin is disabled — skipping startup");
      return;
    }

    if (!config.appId || !config.appPassword) {
      throw new Error(
        "Teams connector requires appId and appPassword in plugin config",
      );
    }

    ctx.logger.info("Initializing Teams connector plugin…");

    // Set up session management
    this.sessionManager = new SessionManager(
      ctx.gateway,
      ctx.logger,
      config.channels ?? {},
    );

    // Start the Bot Framework HTTP server
    this.botServer = new BotServer(
      config,
      this.sessionManager,
      ctx.gateway,
      ctx.logger,
    );

    await this.botServer.start();

    const channelCount = Object.keys(config.channels ?? {}).length;
    ctx.logger.info(
      `Teams connector ready — ${channelCount} channel(s) configured`,
    );
  }

  async shutdown(): Promise<void> {
    if (this.botServer) {
      await this.botServer.stop();
      this.botServer = null;
    }
    if (this.sessionManager) {
      this.sessionManager.clear();
      this.sessionManager = null;
    }
  }
}

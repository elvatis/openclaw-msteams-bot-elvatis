import {
  ActivityHandler,
  BotFrameworkAdapter,
  ConversationReference,
  TurnContext,
  TeamsInfo,
  ActivityTypes,
} from "botbuilder";
import express from "express";
import bodyParser from "body-parser";
import http from "http";
import { SessionManager } from "./session";
import { GatewayAPI, Logger, PluginConfig } from "./types";

/**
 * Express HTTP server that exposes the Bot Framework messaging endpoint.
 */
export class BotServer {
  private app: express.Application;
  private server: http.Server | null = null;
  private adapter: BotFrameworkAdapter;
  private bot: OpenClawTeamsBot;

  constructor(
    private config: PluginConfig,
    private sessionManager: SessionManager,
    private gateway: GatewayAPI,
    private logger: Logger,
  ) {
    this.adapter = new BotFrameworkAdapter({
      appId: config.appId,
      appPassword: config.appPassword,
      channelAuthTenant: config.appTenantId,
    });

    // Global error handler - log and notify the user when something breaks.
    this.adapter.onTurnError = async (context: TurnContext, error: Error) => {
      this.logger.error(`Bot turn error: ${error.message}`, error);
      try {
        await context.sendActivity(
          "An error occurred. Please try again.",
        );
      } catch (sendErr) {
        this.logger.error(
          `Failed to send error message to Teams: ${(sendErr as Error).message}`,
        );
      }
    };

    this.bot = new OpenClawTeamsBot(
      this.sessionManager,
      this.gateway,
      this.adapter,
      this.logger,
    );

    this.app = express();
    this.app.use(bodyParser.json());

    // Bot Framework webhook endpoint
    this.app.post("/api/messages", (req, res) => {
      this.adapter.processActivity(req, res, async (context) => {
        await this.bot.run(context);
      });
    });

    // Health-check endpoint
    this.app.get("/health", (_req, res) => {
      res.json({ status: "ok", plugin: "openclaw-teams-elvatis" });
    });
  }

  /**
   * Start listening for incoming Bot Framework requests.
   */
  async start(): Promise<void> {
    const port = this.config.port ?? 3978;
    return new Promise((resolve, reject) => {
      this.server = this.app
        .listen(port, () => {
          this.logger.info(
            `Teams bot server listening on port ${port}`,
          );
          resolve();
        })
        .on("error", (err) => {
          this.logger.error(`Failed to start bot server: ${err.message}`);
          reject(err);
        });
    });
  }

  /**
   * Gracefully shut down the HTTP server.
   */
  async stop(): Promise<void> {
    if (!this.server) return;
    return new Promise((resolve, reject) => {
      this.server!.close((err) => {
        if (err) {
          this.logger.error(`Error stopping bot server: ${err.message}`);
          reject(err);
        } else {
          this.logger.info("Teams bot server stopped");
          resolve();
        }
      });
    });
  }
}

/**
 * Core Teams bot that bridges messages between Teams and OpenClaw Gateway.
 */
class OpenClawTeamsBot extends ActivityHandler {
  constructor(
    private sessionManager: SessionManager,
    private gateway: GatewayAPI,
    private adapter: BotFrameworkAdapter,
    private logger: Logger,
  ) {
    super();

    // Handle incoming messages
    this.onMessage(async (context: TurnContext, next) => {
      await this.handleIncomingMessage(context);
      await next();
    });

    // Handle new members joining the conversation (welcome message)
    this.onMembersAdded(async (context: TurnContext, next) => {
      const membersAdded = context.activity.membersAdded ?? [];
      for (const member of membersAdded) {
        if (member.id !== context.activity.recipient.id) {
          await context.sendActivity(
            "Hello! I am the Elvatis AI assistant. Send me a message to get started.",
          );
        }
      }
      await next();
    });
  }

  /**
   * Process an incoming Teams message:
   * 1. Resolve the channel and session
   * 2. Forward the message text to OpenClaw
   * 3. Send the gateway response back to Teams
   */
  private async handleIncomingMessage(context: TurnContext): Promise<void> {
    const text = context.activity.text?.trim() ?? "";
    const attachments = context.activity.attachments ?? [];

    // Collect image attachments
    const imageDescriptions: string[] = [];
    for (const att of attachments) {
      const isImage = att.contentType?.startsWith("image/");
      const isFile = att.contentType === "application/vnd.microsoft.teams.file.download.info";

      if (isImage && att.contentUrl) {
        try {
          // Fetch image and convert to base64 for the agent
          const fetch = require("node-fetch");
          const resp = await fetch(att.contentUrl);
          const buffer = await resp.buffer();
          const base64 = buffer.toString("base64");
          const mimeType = att.contentType ?? "image/png";
          imageDescriptions.push(`[Image attached: data:${mimeType};base64,${base64.slice(0, 100)}... (${Math.round(buffer.length / 1024)}KB)]`);
          this.logger.debug(`Received image attachment: ${att.name ?? "unnamed"} (${att.contentType}, ${buffer.length} bytes)`);
        } catch (err: any) {
          this.logger.warn(`Failed to fetch image attachment: ${err.message}`);
          imageDescriptions.push(`[Image attached: ${att.name ?? att.contentUrl}]`);
        }
      } else if (isFile) {
        const fileInfo = att.content as Record<string, string> | undefined;
        const fileName = att.name ?? fileInfo?.["uniqueId"] ?? "file";
        imageDescriptions.push(`[File attached: ${fileName}]`);
      }
    }

    // Combine text + attachment info
    const fullText = [text, ...imageDescriptions].filter(Boolean).join("\n");
    if (!fullText) return;

    const channelId = this.resolveChannelId(context);
    const channelName = await this.resolveChannelName(context, channelId);
    const senderName = this.resolveSenderName(context);

    this.logger.debug(
      `Received message from "${senderName}" in channel "${channelName}": ${fullText.substring(0, 100)}`,
    );

    // Build a conversation reference so we can reply proactively later
    const conversationReference = TurnContext.getConversationReference(
      context.activity,
    ) as Partial<ConversationReference>;

    try {
      // Ensure we have a session for this channel
      const session = await this.sessionManager.ensureSession(
        channelId,
        channelName,
        conversationReference,
      );

      // Show typing indicator while waiting for the gateway response
      await context.sendActivity({ type: ActivityTypes.Typing });

      // Forward to OpenClaw Gateway
      const response = await this.gateway.sendMessage({
        sessionId: session.sessionId,
        text: fullText,
        sender: senderName,
        metadata: {
          source: "teams",
          channelId,
          channelName,
          senderName,
        },
      });

      // Send the response back to Teams
      if (response.text) {
        await context.sendActivity(response.text);
      }
    } catch (err) {
      const error = err as Error;
      this.logger.error(
        `Error processing message in channel "${channelName}": ${error.message}`,
        error,
      );
      await context.sendActivity(
        "Sorry, I could not process your message. Please try again.",
      );
    }
  }

  /**
   * Extract the channel ID from the turn context.
   * Falls back to conversation ID for 1:1 chats.
   */
  private resolveChannelId(context: TurnContext): string {
    const channelData = context.activity.channelData as
      | Record<string, unknown>
      | undefined;

    // Teams channel conversations include teamsChannelId in channelData
    if (channelData?.channel && typeof channelData.channel === "object") {
      const channel = channelData.channel as Record<string, string>;
      if (channel.id) return channel.id;
    }

    // Fallback: use the conversation ID (covers 1:1 and group chats)
    return context.activity.conversation?.id ?? "unknown";
  }

  /**
   * Resolve a human-readable channel name.
   * Attempts to fetch via TeamsInfo; falls back to channelData or a default.
   */
  private async resolveChannelName(
    context: TurnContext,
    channelId: string,
  ): Promise<string> {
    // Try to get channel name from channelData first (faster, no API call)
    const channelData = context.activity.channelData as
      | Record<string, unknown>
      | undefined;

    if (channelData?.channel && typeof channelData.channel === "object") {
      const channel = channelData.channel as Record<string, string>;
      if (channel.name) return channel.name;
    }

    // Attempt to resolve via Teams API
    try {
      const channels = await TeamsInfo.getTeamChannels(context);
      const match = channels.find((ch) => ch.id === channelId);
      if (match?.name) return match.name;
    } catch {
      // TeamsInfo calls can fail in 1:1 chats - that's expected
    }

    // For 1:1 chats, use "Direct" as the channel name
    if (context.activity.conversation?.conversationType === "personal") {
      return "Direct";
    }

    return "General";
  }

  /**
   * Get the display name of the message sender.
   */
  private resolveSenderName(context: TurnContext): string {
    return context.activity.from?.name ?? "Unknown";
  }
}

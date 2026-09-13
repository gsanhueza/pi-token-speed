import type {
  AgentEndEvent,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { TOKEN_GENERATION_TOOLS } from "../config/constants";
import { settings } from "../config/settings";
import { Renderer } from "../ui/renderer";
import { TokenSpeedEngine } from "./engine";

interface ToolCall {
  type: string;
  name?: string;
}

interface MessageUpdatePayload {
  assistantMessageEvent: {
    type: string;
    delta?: string;
    partial?: {
      content?: ToolCall[];
      usage?: { output?: number };
    };
    contentIndex?: number;
  };
}

/**
 * Manages all Pi event subscriptions for the token-speed extension.
 */
export class EventManager {
  constructor(
    private readonly engine: TokenSpeedEngine,
    private readonly renderer: Renderer,
  ) {}

  /**
   * Initializes the engine and renderer for a new session.
   *
   * @param ctx The Pi extension context.
   */
  async handleSessionStart(ctx: ExtensionContext): Promise<void> {
    await settings.initialize();
    const errors = settings.getErrors();

    if (errors.length > 0) {
      const message = ["[pi-token-speed]", ...errors].join("\n");
      ctx.ui.notify(message, "warning");
    }

    // Warn about legacy flat settings keys — they still work, but the file
    // is only migrated to the nested format when the user stores a value
    // via /tps.
    const legacyKeys = settings.getLegacyKeys();
    if (legacyKeys.length > 0) {
      const message = [
        "[pi-token-speed]",
        `Using legacy settings keys (${legacyKeys.join(", ")}).`,
        "They still work, but consider migrating them. Check the README for more details.",
        "",
        "Hint: Run /tps and store any threshold/color value (even if it's the same one) to auto-migrate to the new format.",
      ].join("\n");
      ctx.ui.notify(message, "warning");
    }

    this.engine.initialize();
    this.engine.applyProvider(ctx.model?.provider);
    this.renderer.initialize(ctx);
    this.renderer.resetThrottle();
  }

  /**
   * Stops the engine when the session shuts down.
   */
  handleSessionShutdown(): void {
    this.engine.stop();
  }

  /**
   * Starts TTFT measurement for user messages and begins streaming for assistant messages.
   *
   * @param event The message_start event payload.
   */
  handleMessageStart(event: { message?: { role?: string } }): void {
    if (event.message?.role === "user") {
      this.engine.startTTFT();
    }
  }

  /**
   * Routes delta events to the engine and updates the renderer.
   *
   * @param event The message_update event payload.
   * @param ctx The Pi extension context.
   */
  handleMessageUpdate(
    event: MessageUpdatePayload,
    ctx: ExtensionContext,
  ): void {
    const ev = event.assistantMessageEvent;

    if (
      ev.type === "text_start" ||
      ev.type === "thinking_start" ||
      ev.type === "toolcall_start"
    ) {
      // Pick up provider overrides (e.g. after a model switch) before the
      // new stream starts; applyProvider is a no-op when unchanged or when
      // a stream is already active.
      this.engine.applyProvider(ctx.model?.provider);
      this.engine.stopTTFT();
      this.engine.start();
      return;
    }

    if (ev.type === "text_delta" || ev.type === "thinking_delta") {
      this.engine.recordDelta(ev.delta ?? "", ev.partial?.usage?.output);
      this.renderer.update(ctx);
      return;
    }

    if (ev.type === "toolcall_delta") {
      const toolCall = ev.partial?.content?.[ev.contentIndex ?? 0];
      if (toolCall?.type !== "toolCall") return;

      // Only edit/write tools are counted (token generation, relevant)
      if (this.isTokenGenerationTool(toolCall)) {
        this.engine.recordDelta(ev.delta ?? "", ev.partial?.usage?.output);
        this.renderer.update(ctx);
      }
    }

    if (ev.type === "toolcall_end") {
      const toolCall = ev.partial?.content?.[ev.contentIndex ?? 0];
      if (toolCall?.type !== "toolCall") return;

      // Pause the timer for prompt processing tools, so they don't skew the average
      if (this.isPromptProcessingTool(toolCall)) {
        this.engine.pause();
      }
    }
  }

  /**
   * Reconciles the total token count, stops streaming, and updates the renderer.
   *
   * @param event The message_end event payload.
   * @param ctx The Pi extension context.
   */
  handleAgentEnd(event: AgentEndEvent, ctx: ExtensionContext): void {
    this.engine.stop();

    // Only assistant and toolResult messages carry usage data
    const outputTokens = event.messages.reduce((acc, curr) => {
      if (curr.role === "assistant") {
        return acc + curr.usage.output;
      }
      if (curr.role === "toolResult") {
        return acc + (curr.usage?.output ?? 0);
      }
      return acc;
    }, 0);

    this.engine.reconcileTotal(outputTokens);
    this.renderer.update(ctx);
  }

  /**
   * Determines if it's a tool that generates tokens
   *
   * @param tool The tool used by Pi
   * @returns True if it's related to token generation
   */
  private isTokenGenerationTool(tool?: ToolCall): boolean {
    return TOKEN_GENERATION_TOOLS.has(tool?.name ?? "");
  }

  /**
   * Determines if it's a tool that processes tokens
   *
   * @param tool The tool used by Pi
   * @returns True if it's related to prompt processing
   */
  private isPromptProcessingTool(tool?: ToolCall): boolean {
    return !this.isTokenGenerationTool(tool);
  }
}

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { TokenSpeedEngine } from "./engine";
import { Renderer } from "./renderer";
import { settings } from "./settings";

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

    this.engine.initialize();
    this.renderer.initialize(ctx);
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
    if (event.message?.role === "assistant") {
      this.engine.start();
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
      this.engine.stopTTFT();
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
      if (toolCall.name === "edit" || toolCall.name === "write") {
        this.engine.recordDelta(ev.delta ?? "", ev.partial?.usage?.output);
        this.renderer.update(ctx);
      }
    }

    if (ev.type === "toolcall_end") {
      const toolCall = ev.partial?.content?.[ev.contentIndex ?? 0];
      if (toolCall?.type !== "toolCall") return;

      // Pause the timer for prompt processing tools, so they don't skew the average
      if (toolCall.name !== "edit" && toolCall.name !== "write") {
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
  handleMessageEnd(
    event: { message?: { role?: string; usage?: { output?: number } } },
    ctx: ExtensionContext,
  ): void {
    if (event.message?.role !== "assistant" || !this.engine.isStreaming) return;

    this.engine.reconcileTotal(event.message?.usage?.output ?? 0);
    this.engine.stop();

    this.renderer.update(ctx);
  }

  /**
   * Stops streaming if still active when a turn ends.
   */
  handleTurnEnd(): void {
    if (this.engine.isStreaming) {
      this.engine.stop();
    }
  }
}

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";

import { tpsCommand } from "./commands";
import { getConfig } from "./config";
import { TokenSpeedEngine } from "./engine";
import { renderStatus } from "./ui";

/**
 * Setup and validation utilities for the token-speed extension.
 * Handles one-time initialization during session start.
 *
 * @param uiHandler The Pi UI handler for displaying notifications and status updates.
 */
export function initialize(uiHandler: ExtensionUIContext): void {
  const { errors } = getConfig();
  if (errors.length === 0) return;

  const message = ["[pi-token-speed]", ...errors].join("\n");
  uiHandler.notify(message, "warning");
}

export default (pi: ExtensionAPI) => {
  const engine = new TokenSpeedEngine();

  pi.registerCommand("tps", {
    description: "Cycle through display modes: tps → ttft → stats → full",
    handler: (_: string, ctx: ExtensionCommandContext) =>
      tpsCommand(ctx, engine),
  });

  pi.on("session_start", async (_, ctx: ExtensionContext) => {
    initialize(ctx.ui);
    renderStatus(ctx, engine, true);
  });

  pi.on("message_start", async (event, _ctx: ExtensionContext) => {
    if (event.message?.role === "user") {
      engine.startTTFT();
    }

    if (event.message?.role === "assistant") {
      engine.start();
    }
  });

  pi.on("message_update", async (event, ctx: ExtensionContext) => {
    const ev = event.assistantMessageEvent;

    if (["text_start", "thinking_start", "toolcall_start"].includes(ev.type)) {
      engine.stopTTFT();
    }

    if (ev.type === "text_delta" || ev.type === "thinking_delta") {
      engine.recordDelta(ev.delta, ev.partial?.usage?.output);
      renderStatus(ctx, engine);
    }
  });

  pi.on("message_end", async (event, ctx: ExtensionContext) => {
    if (event.message?.role !== "assistant" || !engine.isStreaming) return;

    // Snap the total to the authoritative usage so the final average is exact.
    engine.reconcileTotal(event.message?.usage?.output ?? 0);
    engine.stop();

    renderStatus(ctx, engine);
  });

  pi.on("turn_end", async () => {
    if (engine.isStreaming) {
      engine.stop();
    }
  });

  pi.on("session_shutdown", async () => {
    engine.stop();
  });
};

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { CommandManager } from "./commands";
import { TokenSpeedEngine } from "./engine";
import { Renderer } from "./renderer";

export default async (pi: ExtensionAPI) => {
  const engine = new TokenSpeedEngine();
  const renderer = new Renderer(engine);
  const commands = new CommandManager(renderer);

  pi.registerCommand("tps", {
    description:
      "Open settings menu to configure display mode, token counting strategy, and provider token usage",
    handler: (_, ctx: ExtensionCommandContext) => commands.runTps(ctx),
  });

  pi.on("session_start", async (_, ctx: ExtensionContext) => {
    await engine.initialize();
    await renderer.initialize(ctx);
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
      await renderer.update(ctx);
    }
  });

  pi.on("message_end", async (event, ctx: ExtensionContext) => {
    if (event.message?.role !== "assistant" || !engine.isStreaming) return;

    // Snap the total to the authoritative usage so the final average is exact.
    engine.reconcileTotal(event.message?.usage?.output ?? 0);
    engine.stop();

    await renderer.update(ctx);
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

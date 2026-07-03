import type {
  AgentEndEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { CommandManager } from "./src/commands";
import { TokenSpeedEngine } from "./src/engine";
import { EventManager } from "./src/events";
import { Renderer } from "./src/renderer";

export default async (pi: ExtensionAPI) => {
  const engine = new TokenSpeedEngine();
  const renderer = new Renderer(engine);
  const commands = new CommandManager(renderer, engine);
  const eventManager = new EventManager(engine, renderer);

  // Command registration
  pi.registerCommand("tps", {
    description:
      "Open settings menu to configure display mode, token counting strategy, and provider token usage",
    handler: (_, ctx: ExtensionCommandContext) => commands.runTps(ctx),
  });

  // Session lifecycle
  pi.on("session_start", async (_, ctx: ExtensionContext) => {
    await eventManager.handleSessionStart(ctx);
  });

  pi.on("session_shutdown", () => {
    eventManager.handleSessionShutdown();
  });

  // Streaming lifecycle
  pi.on("message_start", (event) => {
    eventManager.handleMessageStart(event);
  });

  pi.on("message_update", (event, ctx: ExtensionContext) => {
    eventManager.handleMessageUpdate(event, ctx);
  });

  pi.on("agent_end", (event: AgentEndEvent, ctx: ExtensionContext) => {
    eventManager.handleAgentEnd(event, ctx);
  });
};

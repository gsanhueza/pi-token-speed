import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { setConfig } from "./config";
import { DISPLAY_MODES } from "./constants";
import { TokenSpeedEngine } from "./engine";
import { readUserSettings } from "./settings";
import { renderStatus } from "./ui";

/**
 * Handles the `/tps` command in the interface
 * @param ctx The context used by Pi
 * @param engine The engine that handles the counting
 */
export const tpsCommand = async (
  ctx: ExtensionCommandContext,
  engine: TokenSpeedEngine,
) => {
  const { display: oldDisplay = "tps" } = readUserSettings();
  const currentIndex = DISPLAY_MODES.indexOf(oldDisplay);

  const nextIndex = (currentIndex + 1) % DISPLAY_MODES.length;
  const display = DISPLAY_MODES[nextIndex];

  setConfig({ display });
  renderStatus(ctx, engine);

  ctx.ui.notify(`[pi-token-speed] Display mode → ${display}`, "info");
};

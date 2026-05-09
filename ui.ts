import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { getConfig, type TokenSpeedConfig } from "./config";
import { STATUS_KEY } from "./constants";

/**
 * Applies a custom hex color using 24-bit truecolor ANSI escape codes.
 *
 * @param text The text to colorize
 * @param hex The hex color string, e.g. "#abcdef"
 * @returns The colored text, or the original text if hex is invalid
 */
const colorHex = (text: string, hex: string): string => {
  if (!hex || hex.length !== 7) return text;

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
};

/**
 * Maps TPS value to a hex color string, or "" for no color
 *
 * @param config The resolved configuration
 * @param tps The TPS value to colorize
 * @returns The hex color string
 */
const getColor = (config: TokenSpeedConfig, tps: number | null): string => {
  if (tps == null) return "";

  if (tps >= config.tpsBlazing) return config.colorBlazing;
  if (tps >= config.tpsFast) return config.colorFast;
  if (tps >= config.tpsMedium) return config.colorMedium;
  if (tps >= config.tpsSlow) return config.colorSlow;

  return "";
};

/**
 * Renders the current TPS value with appropriate color.
 *
 * @param ctx The extension context
 * @param tps The TPS value to render
 * @param tokenCount The number of tokens processed
 * @param elapsedSeconds Elapsed seconds since stream start
 */
export const renderStatus = (
  ctx: ExtensionContext,
  tps: number | null = null,
  tokenCount: number = 0,
  elapsedSeconds: number = 0,
): void => {
  const config = getConfig((msg) => ctx.ui.notify(msg, "warning"));
  const theme = ctx.ui.theme;
  const value = tps?.toFixed(1);

  const label = theme.fg("dim", "⚡ TPS:");
  const measurement = value ? `${value} tok/s` : "--";

  const color = getColor(config, tps);
  const displayValue = colorHex(measurement, color);

  // Choose how much to show
  let text = `${label} ${displayValue}`;
  if (config.display === "full") {
    let tokensText = `${tokenCount} tok`;
    if (elapsedSeconds > 0) {
      tokensText = `${tokensText} in ${elapsedSeconds.toFixed(1)}s`;
    }

    text = `${text} (${tokensText})`;
  }

  ctx.ui.setStatus(STATUS_KEY, text);
};

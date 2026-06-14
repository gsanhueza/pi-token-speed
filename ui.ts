import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { getConfig } from "./config";
import { STATUS_KEY } from "./constants";
import { TokenSpeedEngine } from "./engine";
import { type TokenSpeedConfig } from "./interfaces";
import { isValidHex } from "./validation";

/**
 * Applies a custom hex color using 24-bit truecolor ANSI escape codes.
 *
 * @param text The text to colorize
 * @param hex The hex color string, e.g. "#abcdef"
 * @returns The colored text, or the original text if hex is invalid
 */
const colorHex = (text: string, hex: string): string => {
  if (!isValidHex(hex)) return text;

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
 * Formats the stats portion: "<x> tok in <y>s".
 */
const formatStats = (tokenCount: number, elapsedSeconds: number): string => {
  if (elapsedSeconds <= 0) return `${tokenCount} tok`;
  return `${tokenCount} tok in ${elapsedSeconds.toFixed(1)}s`;
};

/**
 * Formats the TTFT portion: "TTFT: <time> ms".
 */
const formatTTFT = (ttft: number): string => {
  return `TTFT: ${ttft} ms`;
};

/**
 * Builds a suffix for the status bar after the TPS measurement
 *
 * @param display Display mode to check agains
 * @param engine Engine to extract the data from
 * @returns The suffix to append
 */
const buildSuffix = (display: string, engine: TokenSpeedEngine) => {
  const { ttft, tokenCount, elapsedSeconds } = engine;

  switch (display) {
    case "ttft":
      return ` (${formatTTFT(ttft)})`;

    case "stats":
      return ` (${formatStats(tokenCount, elapsedSeconds)})`;

    case "full": {
      const parts: string[] = [
        formatStats(tokenCount, elapsedSeconds),
        formatTTFT(ttft),
      ];
      return ` (${parts.join(" · ")})`;
    }
    default:
      // Zero-width space
      return "\u200b";
  }
};

/**
 * Renders the current status bar entry based on the configured display mode.
 *
 * @param ctx The extension context
 * @param engine The TokenSpeedEngine instance
 * @param firstRun Whether this is the first render of the session
 */
export const renderStatus = (
  ctx: ExtensionContext,
  engine: TokenSpeedEngine,
  firstRun: boolean = false,
): void => {
  const { config } = getConfig();
  const theme = ctx.ui.theme;

  // Handle first-run state (always show TPS placeholder)
  if (firstRun) {
    const text = `${theme.fg("dim", "⚡ TPS:")} --`;
    return ctx.ui.setStatus(STATUS_KEY, text);
  }

  // Render TPS first
  const { tps } = engine;
  const value = tps?.toFixed(1);
  const measurement = value ? `${value} tok/s` : "--";

  const color = getColor(config, tps);
  const displayValue = colorHex(measurement, color);

  // Build the suffix based on display mode
  const suffix = buildSuffix(config.display, engine);
  const text = `${theme.fg("dim", "⚡ TPS:")} ${displayValue}${suffix}`;

  ctx.ui.setStatus(STATUS_KEY, text);
};

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  COLOR_BLAZING,
  COLOR_FAST,
  COLOR_MEDIUM,
  COLOR_SLOW,
  STATUS_KEY,
  TPS_THRESHOLD_BLAZING,
  TPS_THRESHOLD_FAST,
  TPS_THRESHOLD_MEDIUM,
  TPS_THRESHOLD_SLOW,
} from "./constants";

export interface TokenSpeedConfig {
  tpsSlow: number;
  tpsMedium: number;
  tpsFast: number;
  tpsBlazing: number;
  colorSlow: string;
  colorMedium: string;
  colorFast: string;
  colorBlazing: string;
  display: "tps" | "full";
}

/**
 * Validates that TPS thresholds are in ascending order.
 *
 * @param onWarning Optional callback for config warnings (e.g. invalid thresholds)
 * @returns true if tpsSlow < tpsMedium < tpsFast < tpsBlazing
 */
function isValidThresholdOrder(
  config: Partial<TokenSpeedConfig>,
  onWarning?: (message: string) => void,
): boolean {
  const {
    tpsSlow = TPS_THRESHOLD_SLOW,
    tpsMedium = TPS_THRESHOLD_MEDIUM,
    tpsFast = TPS_THRESHOLD_FAST,
    tpsBlazing = TPS_THRESHOLD_BLAZING,
  } = config;

  const valid =
    tpsSlow < tpsMedium && tpsMedium < tpsFast && tpsFast < tpsBlazing;

  if (!valid) {
    const message = [
      "[pi-token-speed] TPS thresholds must be in ascending order.",
      `Found: ${tpsSlow} < ${tpsMedium} < ${tpsFast} < ${tpsBlazing}. `,
      "Falling back to defaults.",
    ].join("\n");
    onWarning?.(message);
  }

  return valid;
}

// Global settings from the user folder
let userSettings: TokenSpeedConfig | null = null;

/**
 * Reads ~/.pi/agent/settings.json and extracts the "STATUS_KEY" key if present.
 *
 * @param onWarning Optional callback for config warnings (e.g. invalid thresholds)
 * @returns The user settings, or an empty object if not found
 */
function readUserSettings(
  onWarning?: (message: string) => void,
): TokenSpeedConfig {
  const emptyResponse = {} as TokenSpeedConfig;

  try {
    const settingsPath = join(homedir(), ".pi", "agent", "settings.json");
    const raw = readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(raw) as Record<string, unknown>;
    const tokenSpeed = settings[STATUS_KEY] as TokenSpeedConfig | undefined;

    if (!tokenSpeed) return emptyResponse;
    if (!isValidThresholdOrder(tokenSpeed, onWarning)) return emptyResponse;

    return tokenSpeed;
  } catch {
    // File doesn't exist, invalid JSON, or permission error
    return emptyResponse;
  }
}

/**
 * Resolves the final config, merging user settings from ~/.pi/agent/settings.json
 * with the built-in constants as fallbacks.
 *
 * @param onWarning Optional callback for config warnings (e.g. invalid thresholds)
 */
export function getConfig(
  onWarning?: (message: string) => void,
): TokenSpeedConfig {
  userSettings ??= readUserSettings(onWarning);

  const response: TokenSpeedConfig = {
    tpsSlow: TPS_THRESHOLD_SLOW,
    tpsMedium: TPS_THRESHOLD_MEDIUM,
    tpsFast: TPS_THRESHOLD_FAST,
    tpsBlazing: TPS_THRESHOLD_BLAZING,
    colorSlow: COLOR_SLOW,
    colorMedium: COLOR_MEDIUM,
    colorFast: COLOR_FAST,
    colorBlazing: COLOR_BLAZING,
    display: "tps",
    ...(userSettings as Partial<TokenSpeedConfig>),
  };

  // Validate display — userSettings could have an invalid value
  if (!["tps", "full"].includes(response.display)) {
    response.display = "tps";
  }

  return response;
}

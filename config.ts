import {
  COLOR_BLAZING,
  COLOR_FAST,
  COLOR_MEDIUM,
  COLOR_SLOW,
  COUNT_STRATEGY,
  DISPLAY_MODE,
  SLIDING_WINDOW,
  TPS_THRESHOLD_BLAZING,
  TPS_THRESHOLD_FAST,
  TPS_THRESHOLD_MEDIUM,
  TPS_THRESHOLD_SLOW,
  USE_PROVIDER_TOKENS,
} from "./constants";
import { TokenSpeedConfig } from "./interfaces";
import { readUserSettings, writeUserSettings } from "./settings";
import {
  isValidColorDefinition,
  isValidCountStrategy,
  isValidDisplayMode,
  isValidSlidingWindow,
  isValidThresholdOrder,
} from "./validation";

/**
 * Cached settings
 */
let userSettings: TokenSpeedConfig | null = null;
let config: TokenSpeedConfig | null = null;
let errors: string[] = [];

/**
 * Retrieves the default configuration object.
 */
const getDefaultConfig = (): TokenSpeedConfig => {
  return {
    display: DISPLAY_MODE,
    tpsSlow: TPS_THRESHOLD_SLOW,
    tpsMedium: TPS_THRESHOLD_MEDIUM,
    tpsFast: TPS_THRESHOLD_FAST,
    tpsBlazing: TPS_THRESHOLD_BLAZING,
    colorSlow: COLOR_SLOW,
    colorMedium: COLOR_MEDIUM,
    colorFast: COLOR_FAST,
    colorBlazing: COLOR_BLAZING,
    slidingWindow: SLIDING_WINDOW,
    useProviderTokens: USE_PROVIDER_TOKENS,
    countStrategy: COUNT_STRATEGY,
  };
};

/**
 * Resolves the final config, merging user settings from ~/.pi/agent/settings.json
 * with the built-in constants as fallbacks.
 */
export const getConfig = (): {
  config: TokenSpeedConfig;
  errors: Array<string>;
} => {
  if (config) return { config, errors };

  const defaultSettings = getDefaultConfig();
  userSettings ??= readUserSettings();

  const merged = { ...defaultSettings, ...userSettings };

  // Validate display mode
  if (!isValidDisplayMode(merged)) {
    errors.push(
      `- Invalid display "${merged.display}" — defaulting to "${DISPLAY_MODE}".`,
    );
    merged.display = DISPLAY_MODE;
  }

  // Validate count strategy
  if (!isValidCountStrategy(merged)) {
    errors.push(
      `- Invalid countStrategy "${merged.countStrategy}" — defaulting to "${COUNT_STRATEGY}".`,
    );
    merged.countStrategy = COUNT_STRATEGY;
  }

  // Validate useProviderTokens
  if (typeof merged.useProviderTokens !== "boolean") {
    errors.push(
      `- Invalid useProviderTokens (expected boolean) — defaulting to ${USE_PROVIDER_TOKENS}.`,
    );
    merged.useProviderTokens = USE_PROVIDER_TOKENS;
  }

  // Validate sliding window time
  if (!isValidSlidingWindow(merged)) {
    errors.push(
      `- Invalid slidingWindow "${merged.slidingWindow}" — defaulting to ${SLIDING_WINDOW}.`,
    );
    merged.slidingWindow = SLIDING_WINDOW;
  }

  // Validate thresholds
  if (!isValidThresholdOrder(merged)) {
    errors.push("- TPS thresholds must be in ascending order.");
    errors.push(
      `  Found: ${merged.tpsSlow} < ${merged.tpsMedium} < ${merged.tpsFast} < ${merged.tpsBlazing}. `,
    );
  }

  // Validate colors
  if (!isValidColorDefinition(merged)) {
    errors.push(
      "- Colors must be valid 24-bit truecolor ANSI hex strings (e.g., '#00ff88').",
      `  Found: ${merged.colorSlow} | ${merged.colorMedium} | ${merged.colorFast} | ${merged.colorBlazing}.`,
    );
  }

  config = { ...merged };

  return { config, errors };
};

/**
 * Writes a partial TokenSpeedConfig, invalidating the cache.
 */
export const setConfig = (partial: Partial<TokenSpeedConfig>): void => {
  writeUserSettings(partial);
  resetConfigCache();
};

/**
 * Resets the cached config, forcing a fresh read from disk on the next call.
 */
export const resetConfigCache = (): void => {
  config = null;
  userSettings = null;
};

import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";

import {
  COLOR_BLAZING,
  COLOR_FAST,
  COLOR_MEDIUM,
  COLOR_SLOW,
  COUNT_STRATEGY,
  DISPLAY_MODE,
  SLIDING_WINDOW,
  STATUS_KEY,
  TPS_THRESHOLD_BLAZING,
  TPS_THRESHOLD_FAST,
  TPS_THRESHOLD_MEDIUM,
  TPS_THRESHOLD_SLOW,
  USE_PROVIDER_TOKENS,
} from "./constants";
import { TokenSpeedConfig } from "./interfaces";
import { IO } from "./io";
import { Validator } from "./validation";

/**
 * Manages TokenSpeed configuration: defaults, user settings, validation,
 * caching, and persistence to ~/.pi/agent/settings.json.
 *
 * Use the exported `settings` singleton — do not instantiate directly.
 */
export class Settings {
  private cachedConfig: TokenSpeedConfig | null = null;
  private cachedErrors: string[] = [];

  /**
   * @internal Use the exported `settings` singleton instead.
   */
  constructor(
    private readonly io: IO = new IO(join(getAgentDir(), "settings.json")),
  ) {}

  /**
   * Retrieves the default configuration object.
   */
  getDefaultConfig(): TokenSpeedConfig {
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
  }

  /**
   * Resolves the final config, merging user settings with built-in defaults,
   * validating, and caching the result.
   */
  async getConfig(): Promise<{ config: TokenSpeedConfig; errors: string[] }> {
    if (this.cachedConfig)
      return { config: this.cachedConfig, errors: this.cachedErrors };

    const defaults = this.getDefaultConfig();
    const userSettings = await this.readUserSettings();
    const merged = { ...defaults, ...userSettings };

    this.validateAndMerge(merged);
    this.cachedConfig = { ...merged };
    return { config: this.cachedConfig, errors: this.cachedErrors };
  }

  /**
   * Validates the merged config, correcting invalid values and recording errors.
   */
  private validateAndMerge(merged: TokenSpeedConfig): void {
    const v = new Validator(merged);

    // Validate display mode
    if (!v.isValidDisplayMode()) {
      this.cachedErrors.push(
        `- Invalid display "${merged.display}" — defaulting to "${DISPLAY_MODE}".`,
      );
      merged.display = DISPLAY_MODE;
    }

    // Validate count strategy
    if (!v.isValidCountStrategy()) {
      this.cachedErrors.push(
        `- Invalid countStrategy "${merged.countStrategy}" — defaulting to "${COUNT_STRATEGY}".`,
      );
      merged.countStrategy = COUNT_STRATEGY;
    }

    // Validate useProviderTokens
    if (typeof merged.useProviderTokens !== "boolean") {
      this.cachedErrors.push(
        `- Invalid useProviderTokens (expected boolean) — defaulting to ${USE_PROVIDER_TOKENS}.`,
      );
      merged.useProviderTokens = USE_PROVIDER_TOKENS;
    }

    // Validate sliding window time
    if (!v.isValidSlidingWindow()) {
      this.cachedErrors.push(
        `- Invalid slidingWindow "${merged.slidingWindow}" — defaulting to ${SLIDING_WINDOW}.`,
      );
      merged.slidingWindow = SLIDING_WINDOW;
    }

    // Validate thresholds
    if (!v.isValidThresholdOrder()) {
      this.cachedErrors.push("- TPS thresholds must be in ascending order.");
      this.cachedErrors.push(
        `  Found: ${merged.tpsSlow} < ${merged.tpsMedium} < ${merged.tpsFast} < ${merged.tpsBlazing}.`,
      );
    }

    // Validate colors
    if (!v.isValidColorDefinition()) {
      this.cachedErrors.push(
        "- Colors must be valid 24-bit truecolor ANSI hex strings (e.g., '#00ff88').",
        `  Found: ${merged.colorSlow} | ${merged.colorMedium} | ${merged.colorFast} | ${merged.colorBlazing}.`,
      );
    }
  }

  /**
   * Writes a partial TokenSpeedConfig, invalidating the cache.
   */
  async setConfig(partial: Partial<TokenSpeedConfig>): Promise<void> {
    await this.writeUserSettings(partial);
    this.resetConfigCache();
  }

  /**
   * Resets the cached config, forcing a fresh read from disk on the next call.
   */
  resetConfigCache(): void {
    this.cachedConfig = null;
    this.cachedErrors = [];
  }

  /**
   * Reads ~/.pi/agent/settings.json and extracts the "tokenSpeed" settings block.
   *
   * @returns The TokenSpeed settings object.
   */
  async readUserSettings(): Promise<TokenSpeedConfig> {
    const settings = await this.io.read();
    return (settings[STATUS_KEY] || {}) as TokenSpeedConfig;
  }

  /**
   * Writes a partial TokenSpeedConfig to ~/.pi/agent/settings.json,
   * merging it with existing values.
   *
   * @param partial The partial TokenSpeedConfig to write.
   */
  async writeUserSettings(partial: Partial<TokenSpeedConfig>): Promise<void> {
    const settings = await this.io.read();
    const current = (settings[STATUS_KEY] as Record<string, unknown>) || {};
    settings[STATUS_KEY] = { ...current, ...partial };

    await this.io.write(settings);
  }
}

/**
 * Shared singleton instance used across the extension.
 */
export const settings = new Settings();

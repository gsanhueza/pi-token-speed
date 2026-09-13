import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  Colors,
  PartialConfig,
  ProviderOverride,
  ProviderOverrides,
  Thresholds,
  TierName,
  TokenSpeedConfig,
} from "./config-types";
import { STATUS_KEY } from "./constants";
import {
  COLOR_BLAZING,
  COLOR_FAST,
  COLOR_MEDIUM,
  COLOR_SLOW,
  COUNT_STRATEGY,
  DEFAULT_ICON,
  DISPLAY_MODE,
  END_TPS_BEHAVIOR,
  SLIDING_WINDOW,
  TPS_THRESHOLD_BLAZING,
  TPS_THRESHOLD_FAST,
  TPS_THRESHOLD_MEDIUM,
  TPS_THRESHOLD_SLOW,
  UPDATE_INTERVAL,
  USE_PROVIDER_TOKENS,
} from "./defaults";
import { Validator } from "./validation";

/**
 * Legacy flat threshold keys → tier name (e.g. `tpsSlow` → `slow`).
 */
const LEGACY_THRESHOLD_KEYS: Record<string, TierName> = {
  tpsSlow: "slow",
  tpsMedium: "medium",
  tpsFast: "fast",
  tpsBlazing: "blazing",
};

/**
 * Legacy flat color keys → tier name (e.g. `colorFast` → `fast`).
 */
const LEGACY_COLOR_KEYS: Record<string, TierName> = {
  colorSlow: "slow",
  colorMedium: "medium",
  colorFast: "fast",
  colorBlazing: "blazing",
};

/**
 * Type guard for plain objects (excludes arrays and null).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ALL_LEGACY_KEYS = [
  ...Object.keys(LEGACY_THRESHOLD_KEYS),
  ...Object.keys(LEGACY_COLOR_KEYS),
];

/**
 * Manages TokenSpeed configuration: defaults, user settings, caching,
 * and persistence to ~/.pi/agent/settings.json.
 *
 * Delegates validation to the `Validator` utility class.
 *
 * Use the exported `settings` singleton — do not instantiate directly.
 * * Settings shape:
 * - Thresholds and colors are stored as nested objects
 *   (`thresholds.slow`, `colors.fast`, …), all keys optional.
 * - `providerOverrides` maps a pi ProviderId (e.g. "anthropic") to a
 *   partial config applied when the active model's provider matches.
 *   Blocks are stored verbatim (sanitized); resolution is lazy via
 *   `getEffectiveConfig(providerId)`.
 * - Legacy flat keys (`tpsSlow`, `colorFast`, …) are still readable for
 *   backward compatibility, but the file is never rewritten at read time.
 *   They are stripped from the file on the next write, which only happens
 *   when the user stores a value via the `/tps` menu (auto-migration).
 *
 * Token counting behavior:
 * - Text/thinking deltas: Counted as 1 token (direct) or estimated from content (estimate)
 * - Toolcall deltas (edit/write): Counted as 1 token (direct) or estimated from content (estimate)
 * - Other toolcalls: Not counted (prompt processing, not relevant)
 */
export class Settings {
  private cachedConfig: TokenSpeedConfig | null = null;
  private cachedErrors: string[] = [];
  private legacyKeys: string[] = [];

  /**
   * @internal Use the exported `settings` singleton instead.
   */
  constructor(
    private readonly settingsPath = join(getAgentDir(), "settings.json"),
  ) {}

  /**
   * Retrieves the default configuration object.
   *
   * @returns The default configuration.
   */
  getDefaultConfig(): TokenSpeedConfig {
    return {
      thresholds: {
        slow: TPS_THRESHOLD_SLOW,
        medium: TPS_THRESHOLD_MEDIUM,
        fast: TPS_THRESHOLD_FAST,
        blazing: TPS_THRESHOLD_BLAZING,
      },
      colors: {
        slow: COLOR_SLOW,
        medium: COLOR_MEDIUM,
        fast: COLOR_FAST,
        blazing: COLOR_BLAZING,
      },
      slidingWindow: SLIDING_WINDOW,
      display: DISPLAY_MODE,
      useProviderTokens: USE_PROVIDER_TOKENS,
      countStrategy: COUNT_STRATEGY,
      endTpsBehavior: END_TPS_BEHAVIOR,
      icon: DEFAULT_ICON,
      updateInterval: UPDATE_INTERVAL,
      providerOverrides: {},
    };
  }

  /**
   * Initializes the config values
   */
  async initialize(): Promise<TokenSpeedConfig> {
    const defaults = this.getDefaultConfig();
    const raw = await this.readUserSettings();

    // Detect and convert legacy keys in memory only — the file is
    // untouched until the next write (which only happens via /tps).
    this.legacyKeys = ALL_LEGACY_KEYS.filter((key) => raw[key] !== undefined);
    const converted = this.convertLegacyKeys(raw);

    // Keep the non-legacy, non-nested-group keys as-is; the nested groups
    // are re-added sanitized (legacy values converted, new keys winning).
    const rest: Record<string, unknown> = { ...raw };
    for (const key of ["thresholds", "colors", ...ALL_LEGACY_KEYS]) {
      delete rest[key];
    }

    const merged = Settings.mergeConfig(
      { ...defaults, ...rest } as PartialConfig,
      converted,
    );

    // Sanitize per-provider overrides: drop malformed entries and invalid
    // keys (collecting prefixed warnings), keeping valid blocks verbatim so
    // resolution via getEffectiveConfig() stays lazy.
    const { overrides: providerOverrides, errors: overrideErrors } =
      this.sanitizeProviderOverrides(raw, merged);
    merged.providerOverrides = providerOverrides;

    const { config, errors } = Validator.validate(merged);
    this.cachedConfig = config;
    this.cachedErrors = [...errors, ...overrideErrors];

    return this.cachedConfig;
  }

  /**
   * Returns the effective configuration for a provider: the base config
   * merged with the provider's override block when one exists.
   *
   * Merge semantics (via `mergeConfig`): top-level keys present in the
   * override replace the base value; `thresholds`/`colors` merge per-tier;
   * omitted keys fall back to base.
   *
   * @param providerId The pi ProviderId (e.g. "anthropic"), or undefined
   *   when no model is active — returns the base config.
   */
  getEffectiveConfig(providerId?: string): TokenSpeedConfig {
    const base = this.getConfig();
    if (!providerId) return base;
    const override = base.providerOverrides[providerId];
    if (!override) return base;
    return Settings.mergeConfig(base, override as PartialConfig);
  }

  /**
   * Replaces the whole `providerOverrides` map and updates the cache.
   * Used by the `/tps overrides` editor, whose add/delete semantics are
   * map-level rather than per-key.
   */
  async setProviderOverrides(next: ProviderOverrides): Promise<void> {
    await this.setConfig({ providerOverrides: next });
  }

  /**
   * Returns the cached configuration, or defaults if not yet initialized.
   */
  getConfig(): TokenSpeedConfig {
    return this.cachedConfig || this.getDefaultConfig();
  }

  /**
   * Returns validation errors from the last config resolution.
   * Only relevant at initialization time (e.g., to show warnings).
   */
  getErrors(): string[] {
    return this.cachedErrors;
  }

  /**
   * Returns the legacy keys found in the settings file during the last
   * initialization. Empty once the file has been rewritten without them.
   */
  getLegacyKeys(): string[] {
    return this.legacyKeys;
  }

  /**
   * Writes a partial TokenSpeedConfig and updates the cache.
   * Legacy keys are stripped from the stored block, migrating the file
   * to the nested format.
   */
  async setConfig(partial: PartialConfig): Promise<void> {
    await this.writeUserSettings(partial);
    const current = this.cachedConfig || this.getDefaultConfig();
    this.cachedConfig = Settings.mergeConfig(current, partial);
    this.legacyKeys = [];
  }

  /**
   * Shallow-merges two partial configs, merging the nested `thresholds`
   * and `colors` groups per-tier so partials never wipe sibling tiers.
   */
  private static mergeConfig(
    base: PartialConfig,
    partial: PartialConfig,
  ): TokenSpeedConfig {
    // The cast is safe: base is always the full defaults or the cached
    // config, so the merged result is complete at runtime.
    return {
      ...base,
      ...partial,
      thresholds: { ...base.thresholds, ...partial.thresholds },
      colors: { ...base.colors, ...partial.colors },
    } as TokenSpeedConfig;
  }

  /**
   * Converts legacy flat keys (`tpsSlow`, `colorFast`, …) into nested
   * `thresholds`/`colors` partials. New-format keys take precedence over
   * coexisting legacy keys for the same tier.
   */
  private convertLegacyKeys(block: Record<string, unknown>): {
    thresholds?: Partial<Thresholds>;
    colors?: Partial<Colors>;
  } {
    const thresholds: Partial<Thresholds> = {};
    const colors: Partial<Colors> = {};

    for (const [key, tier] of Object.entries(LEGACY_THRESHOLD_KEYS)) {
      const value = block[key];
      if (typeof value === "number") thresholds[tier] = value;
    }
    for (const [key, tier] of Object.entries(LEGACY_COLOR_KEYS)) {
      const value = block[key];
      if (typeof value === "string") colors[tier] = value;
    }

    const nestedThresholds = this.readNestedGroup<Thresholds>(
      block,
      "thresholds",
    );
    const nestedColors = this.readNestedGroup<Colors>(block, "colors");

    return {
      // Nested (new-format) keys win over converted legacy values
      thresholds: { ...thresholds, ...nestedThresholds },
      colors: { ...colors, ...nestedColors },
    };
  }

  /**
   * Safely reads a nested object group (e.g. `thresholds`, `colors`,
   * `tokenSpeed`) from a raw block.
   */
  private readNestedGroup<T extends object>(
    block: Record<string, unknown>,
    group: string,
  ): Partial<T> {
    const value = block[group];
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {};
    }
    return value as Partial<T>;
  }

  /**
   * Sanitizes the raw `providerOverrides` value: keeps valid provider →
   * partial-config entries (with invalid keys dropped and warned about),
   * drops malformed entries entirely.
   *
   * @param raw The raw tokenSpeed settings block.
   * @param base The merged base config (defaults + user base settings),
   *   used as the fallback when validating per-tier groups.
   */
  private sanitizeProviderOverrides(
    raw: Record<string, unknown>,
    base: TokenSpeedConfig,
  ): { overrides: ProviderOverrides; errors: string[] } {
    const overrides: ProviderOverrides = {};
    const errors: string[] = [];

    const rawValue = raw.providerOverrides;
    if (rawValue === undefined) return { overrides, errors };

    if (!isPlainObject(rawValue)) {
      errors.push("- providerOverrides must be an object — ignoring.");
      return { overrides, errors };
    }

    for (const [providerId, block] of Object.entries(rawValue)) {
      if (!isPlainObject(block)) {
        errors.push(
          `- providerOverrides["${providerId}"] must be an object — entry ignored.`,
        );
        continue;
      }
      const { config, errors: blockErrors } = Validator.validateOverride(
        providerId,
        block as ProviderOverride,
        base,
      );
      errors.push(...blockErrors);
      overrides[providerId] = config;
    }

    return { overrides, errors };
  }

  /**
   * Reads and parses the settings file, returning an empty object on failure.
   */
  private async readSettings(): Promise<Record<string, unknown>> {
    try {
      const raw = await readFile(this.settingsPath, "utf-8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  /**
   * Writes a JSON object to the settings file with 2-space indentation.
   */
  private async writeSettings(data: Record<string, unknown>): Promise<void> {
    await writeFile(this.settingsPath, JSON.stringify(data, null, 2), "utf-8");
  }

  /**
   * Reads ~/.pi/agent/settings.json and extracts the raw "tokenSpeed" block.
   *
   * @returns The raw TokenSpeed settings object.
   */
  private async readUserSettings(): Promise<Record<string, unknown>> {
    const settings = await this.readSettings();
    return this.readNestedGroup<Record<string, unknown>>(settings, STATUS_KEY);
  }

  /**
   * Writes a partial TokenSpeedConfig to ~/.pi/agent/settings.json,
   * merging it with existing values and stripping every legacy key
   * (auto-migration to the nested format).
   *
   * Only explicitly-set values are persisted: the partial should contain
   * just the keys/tiers the user changed (nested groups are merged per-tier),
   * plus converted legacy keys during migration. Defaults are never written
   * unless the user explicitly sets them.
   *
   * @param partial The partial TokenSpeedConfig to write.
   */
  private async writeUserSettings(partial: PartialConfig): Promise<void> {
    const settings = await this.readSettings();
    const raw =
      this.readNestedGroup<Record<string, unknown>>(settings, STATUS_KEY) || {};

    // Convert any legacy keys on disk into the nested format (new keys
    // winning), so stripping them below never loses stored values.
    const converted = this.convertLegacyKeys(raw);
    const rest: Record<string, unknown> = { ...raw };
    for (const key of ["thresholds", "colors", ...ALL_LEGACY_KEYS]) {
      delete rest[key];
    }

    // Only explicitly-set values are persisted: the nested groups come from
    // converted legacy keys (explicit in a previous format) merged per-tier
    // with whatever the partial contains (the tiers the user just changed
    // via /tps). Values equal to their defaults are still written if the
    // user sets them explicitly.
    const block = Settings.mergeConfig(rest, {
      ...partial,
      thresholds: { ...converted.thresholds, ...partial.thresholds },
      colors: { ...converted.colors, ...partial.colors },
    }) as unknown as Record<string, unknown>;

    // Omit empty groups
    if (Object.keys(block.thresholds ?? {}).length === 0) {
      delete block.thresholds;
    }
    if (Object.keys(block.colors ?? {}).length === 0) {
      delete block.colors;
    }
    if (Object.keys(block.providerOverrides ?? {}).length === 0) {
      delete block.providerOverrides;
    }

    if (Object.keys(block).length > 0) {
      settings[STATUS_KEY] = block;
    } else {
      delete settings[STATUS_KEY];
    }
    await this.writeSettings(settings);
    this.legacyKeys = [];
  }
}

/**
 * Shared singleton instance used across the extension.
 */
export const settings = new Settings();

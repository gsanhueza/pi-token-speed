/**
 * Display mode — what information to show in the status bar.
 */
export type DisplayMode = "tps" | "ttft" | "stats" | "full";

/**
 * Count strategy — how to count tokens during streaming.
 */
export type CountStrategy = "estimate" | "direct";

/**
 * Behavior for TPS after streaming ends.
 */
export type EndTpsBehavior = "average" | "last";

/**
 * TPS tier names, shared by the threshold and color groups.
 */
export type TierName = "slow" | "medium" | "fast" | "blazing";

/**
 * TPS threshold (tok/s) at or above which a tier applies.
 */
export interface Thresholds {
  slow: number;
  medium: number;
  fast: number;
  blazing: number;
}

/**
 * Hex color (`#RRGGBB`) used for each TPS tier.
 */
export interface Colors {
  slow: string;
  medium: string;
  fast: string;
  blazing: string;
}

/**
 * Core configuration fields (everything except `providerOverrides`).
 * Kept separate so provider override blocks can be a simple partial of
 * this shape without recursive type references.
 */
export interface TokenSpeedConfigFields {
  display: DisplayMode;
  slidingWindow: number;
  useProviderTokens: boolean;
  countStrategy: CountStrategy;
  endTpsBehavior: EndTpsBehavior;
  icon: string;
  updateInterval: number; // ms, 0 = update on every delta
  thresholds: Thresholds;
  colors: Colors;
}

/**
 * Partial config that may override any top-level base key.
 * Omitted keys fall back to the base config at resolution time;
 * `thresholds`/`colors` merge per-tier.
 */
export type ProviderOverride = Partial<
  Omit<TokenSpeedConfigFields, "thresholds" | "colors">
> & {
  thresholds?: Partial<Thresholds>;
  colors?: Partial<Colors>;
};

/**
 * Maps a pi ProviderId (e.g. "anthropic", "openai") to a partial config
 * applied whenever the active model's provider matches.
 */
export interface ProviderOverrides {
  [providerId: string]: ProviderOverride;
}

/**
 * Configuration for the token-speed extension.
 * All fields can be overridden via ~/.pi/agent/settings.json under the "tokenSpeed" key.
 * All keys are optional — defaults are applied at merge time.
 */
export interface TokenSpeedConfig extends TokenSpeedConfigFields {
  /** Per-provider config overrides, keyed by pi ProviderId. */
  providerOverrides: ProviderOverrides;
}

/**
 * Partial config where the nested groups may also be partially specified.
 * Used for merging user settings over defaults without wiping sibling tiers.
 */
export type PartialConfig = Partial<
  Omit<TokenSpeedConfigFields, "thresholds" | "colors">
> & {
  thresholds?: Partial<Thresholds>;
  colors?: Partial<Colors>;
  providerOverrides?: ProviderOverrides;
};

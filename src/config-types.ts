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
 * Configuration for the token-speed extension.
 * All fields can be overridden via ~/.pi/agent/settings.json under the "tokenSpeed" key.
 * All keys are optional — defaults are applied at merge time.
 */
export interface TokenSpeedConfig {
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

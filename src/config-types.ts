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
 * Configuration for the token-speed extension.
 * All fields can be overridden via ~/.pi/agent/settings.json under the "tokenSpeed" key.
 */
export interface TokenSpeedConfig {
  display: DisplayMode;
  tpsSlow: number;
  tpsMedium: number;
  tpsFast: number;
  tpsBlazing: number;
  colorSlow: string;
  colorMedium: string;
  colorFast: string;
  colorBlazing: string;
  slidingWindow: number;
  useProviderTokens: boolean;
  countStrategy: CountStrategy;
  endTpsBehavior: EndTpsBehavior;
  icon: string;
  updateInterval: number; // ms, 0 = update on every delta
}

/**
 * User-facing option definitions for the SettingsList menu.
 */

/**
 * Human-readable labels for display mode values.
 */
export const DISPLAY_LABELS: Record<string, string> = {
  tps: "TPS speed",
  ttft: "TTFT only",
  stats: "Token stats",
  full: "Full details",
};

/**
 * Human-readable labels for count strategy values.
 */
export const COUNT_STRATEGY_LABELS: Record<string, string> = {
  estimate: "Estimate (fast)",
  direct: "Direct (accurate)",
};

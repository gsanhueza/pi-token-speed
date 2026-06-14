import type { CountStrategy, DisplayMode } from "./types";

/**
 * Human-readable labels for display mode values.
 */
export const DISPLAY_LABELS: Record<DisplayMode, string> = {
  tps: "TPS speed",
  ttft: "TTFT only",
  stats: "Token stats",
  full: "Full details",
};

/**
 * Human-readable labels for count strategy values.
 */
export const COUNT_STRATEGY_LABELS: Record<CountStrategy, string> = {
  estimate: "Estimate (fast)",
  direct: "Direct (accurate)",
};

/**
 * Human-readable labels for boolean toggle values.
 */
export const TOGGLE_LABELS: Record<"on" | "off", string> = {
  on: "On",
  off: "Off",
};

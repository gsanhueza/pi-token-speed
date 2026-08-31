import type {
  CountStrategy,
  DisplayMode,
  EndTpsBehavior,
} from "./config-types";

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
 * Human-readable labels for end TPS behavior values.
 */
export const END_TPS_BEHAVIOR_LABELS: Record<EndTpsBehavior, string> = {
  average: "Average (overall)",
  last: "Last (sliding window)",
};

/**
 * Human-readable labels for boolean toggle values.
 */
export const TOGGLE_LABELS: Record<"on" | "off", string> = {
  on: "On",
  off: "Off",
};

/**
 * Human-readable labels for showIcon toggle values.
 */
export const SHOW_ICON_LABELS: Record<"on" | "off", string> = {
  on: "Show icon (⚡)",
  off: "Hide icon",
};

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
 * Available status bar icons for selection.
 */
export const ICONS: string[] = ["⚡", "🔥", "💨", "🚀"];

/**
 * Human-readable label for the icon setting.
 */
export const ICON_LABEL = "Status icon";

/**
 * Labels for update interval preset values (in ms).
 */
export const UPDATE_INTERVAL_LABELS: Record<string, string> = {
  "0": "Every delta (default)",
  "50": "50 ms",
  "100": "100 ms",
  "200": "200 ms",
  "500": "500 ms",
};

/**
 * Human-readable label for updateInterval setting.
 */
export const UPDATE_INTERVAL_LABEL = "Status update interval";

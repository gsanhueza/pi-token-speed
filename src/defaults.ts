import type {
  CountStrategy,
  DisplayMode,
  EndTpsBehavior,
} from "./config-types";

/**
 * TPS threshold above which speed is considered slow
 * Anything below this will not be colored
 */
export const TPS_THRESHOLD_SLOW = 0;

/**
 * TPS threshold above which speed is considered medium
 */
export const TPS_THRESHOLD_MEDIUM = 15;

/**
 * TPS threshold above which speed is considered fast
 */
export const TPS_THRESHOLD_FAST = 30;

/**
 * TPS threshold above which speed is considered blazing
 */
export const TPS_THRESHOLD_BLAZING = 45;

/**
 * Color used when TPS is at or above the slow threshold but below medium
 */
export const COLOR_SLOW = "#ff4444";

/**
 * Color used when TPS is at or above the medium threshold but below fast
 */
export const COLOR_MEDIUM = "#ffaa00";

/**
 * Color used when TPS is at or above the fast threshold but below blazing
 */
export const COLOR_FAST = "#00ff88";

/**
 * Color used when TPS is at or above the blazing threshold
 */
export const COLOR_BLAZING = "#44ddff";

/**
 * Sliding window duration (ms) for time-based TPS calculation
 */
export const SLIDING_WINDOW = 1000;

/**
 * Display mode for the extension
 */
export const DISPLAY_MODE: DisplayMode = "tps";

/**
 * Selection for extension vs provider's counter
 */
export const USE_PROVIDER_TOKENS = false;

/**
 * Counting strategy for the extension
 */
export const COUNT_STRATEGY: CountStrategy = "direct";

/**
 * Behavior for TPS display after streaming ends.
 */
export const END_TPS_BEHAVIOR: EndTpsBehavior = "average";

/**
 * Whether to show the ⚡ icon in the status bar.
 */
export const SHOW_ICON = true;

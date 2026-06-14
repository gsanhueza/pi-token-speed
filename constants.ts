/**
 * Identifier for the status bar entry
 */
export const STATUS_KEY = "tokenSpeed";

/**
 * Maximum number of dead timestamp entries before compacting the array.
 */
export const COMPACTION_THRESHOLD = 5000;

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
 * Default sliding window duration (ms) for time-based TPS calculation
 */
export const SLIDING_WINDOW = 1000;

/**
 * All available display modes for the extension
 */
export const DISPLAY_MODES = ["tps", "ttft", "stats", "full"] as const;

/**
 * Default display mode for the extension
 */
export const DISPLAY_MODE = "tps";

/**
 * Default selection for extension vs provider's counter
 */
export const USE_PROVIDER_TOKENS = false;

/**
 * Default counting strategy for the extension
 */
export const COUNT_STRATEGY = "direct";

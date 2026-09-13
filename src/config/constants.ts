/**
 * Identifier for the status bar entry
 */
export const STATUS_KEY = "tokenSpeed";

/**
 * Known Pi tools that generate tokens
 */
export const TOKEN_GENERATION_TOOLS = new Set(["edit", "write"]);

/**
 * Maximum number of dead timestamp entries before compacting the array.
 */
export const COMPACTION_THRESHOLD = 5000;

/**
 * Minimum sliding window duration (ms) — 100ms is the smallest meaningful window
 */
export const MIN_SLIDING_WINDOW = 100;

/**
 * Maximum sliding window duration (ms) — 30s is the largest practical window
 */
export const MAX_SLIDING_WINDOW = 30000;

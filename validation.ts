import {
  COLOR_BLAZING,
  COLOR_FAST,
  COLOR_MEDIUM,
  COLOR_SLOW,
  DISPLAY_MODES,
  SLIDING_WINDOW,
  TPS_THRESHOLD_BLAZING,
  TPS_THRESHOLD_FAST,
  TPS_THRESHOLD_MEDIUM,
  TPS_THRESHOLD_SLOW,
} from "./constants";
import { type TokenSpeedConfig } from "./interfaces";

/**
 * Validates that display mode is a recognized value.
 *
 * @param config The configuration object containing the display mode.
 * @returns True if display is a valid mode; false otherwise
 */
export const isValidDisplayMode = (config: TokenSpeedConfig): boolean => {
  const { display } = config;
  return DISPLAY_MODES.includes(display);
};

/**
 * Validates that sliding window is a reasonable number
 *
 * @param config The configuration object containing the window value.
 * @returns True if it's a number representing a window between 0.1 and 30.0 seconds
 */
export const isValidSlidingWindow = (config: TokenSpeedConfig): boolean => {
  const { slidingWindow = SLIDING_WINDOW } = config;

  return (
    typeof slidingWindow === "number" &&
    slidingWindow >= 100 &&
    slidingWindow <= 30000
  );
};

/**
 * Validates that TPS thresholds are in strict ascending order:
 * tpsSlow < tpsMedium < tpsFast < tpsBlazing.
 *
 * @param config The configuration object containing the four threshold values.
 * @returns True if all thresholds are in ascending order; false otherwise.
 */
export const isValidThresholdOrder = (config: TokenSpeedConfig): boolean => {
  const {
    tpsSlow = TPS_THRESHOLD_SLOW,
    tpsMedium = TPS_THRESHOLD_MEDIUM,
    tpsFast = TPS_THRESHOLD_FAST,
    tpsBlazing = TPS_THRESHOLD_BLAZING,
  } = config;

  return tpsSlow < tpsMedium && tpsMedium < tpsFast && tpsFast < tpsBlazing;
};

/**
 * Validates that color definitions are valid 24-bit truecolor ANSI hex strings.
 *
 * @param config The configuration object containing the color definitions.
 * @returns True if all colors are valid hex strings; false otherwise.
 */
export const isValidColorDefinition = (config: TokenSpeedConfig): boolean => {
  const {
    colorSlow = COLOR_SLOW,
    colorMedium = COLOR_MEDIUM,
    colorFast = COLOR_FAST,
    colorBlazing = COLOR_BLAZING,
  } = config;

  return (
    isValidHex(colorSlow) &&
    isValidHex(colorMedium) &&
    isValidHex(colorFast) &&
    isValidHex(colorBlazing)
  );
};

/**
 * Validates that the string is a valid 24-bit truecolor ANSI hex string.
 *
 * @param s The string to validate
 * @returns True if the string is a valid hex color; false otherwise
 */
export const isValidHex = (s: string): boolean => /^#[0-9a-fA-F]{6}$/.test(s);

/**
 * Validates that countStrategy is a recognized value.
 *
 * @param config The configuration object containing the count strategy.
 * @returns True if countStrategy is "estimate" or "direct"; false otherwise.
 */
export const isValidCountStrategy = (config: TokenSpeedConfig): boolean => {
  const { countStrategy } = config;
  return ["estimate", "direct"].includes(countStrategy);
};

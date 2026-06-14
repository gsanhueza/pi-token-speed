import {
  COLOR_BLAZING,
  COLOR_FAST,
  COLOR_MEDIUM,
  COLOR_SLOW,
  MAX_SLIDING_WINDOW,
  MIN_SLIDING_WINDOW,
  SLIDING_WINDOW,
  TPS_THRESHOLD_BLAZING,
  TPS_THRESHOLD_FAST,
  TPS_THRESHOLD_MEDIUM,
  TPS_THRESHOLD_SLOW,
} from "./constants";
import { type TokenSpeedConfig } from "./interfaces";
import { COUNT_STRATEGY_LABELS, DISPLAY_LABELS } from "./options";

/**
 * Validator for TokenSpeed configuration values.
 */
export class Validator {
  constructor(private readonly config: TokenSpeedConfig) {}

  /**
   * Validates that display mode is a recognized value.
   *
   * @returns True if display is a valid mode; false otherwise
   */
  isValidDisplayMode(): boolean {
    const { display } = this.config;
    return Object.keys(DISPLAY_LABELS).includes(display);
  }

  /**
   * Validates that sliding window is a reasonable number (between 100ms and 30s).
   *
   * @returns True if it's a number within the valid range
   */
  isValidSlidingWindow(): boolean {
    const { slidingWindow = SLIDING_WINDOW } = this.config;

    return (
      typeof slidingWindow === "number" &&
      slidingWindow >= MIN_SLIDING_WINDOW &&
      slidingWindow <= MAX_SLIDING_WINDOW
    );
  }

  /**
   * Validates that TPS thresholds are in strict ascending order:
   * tpsSlow < tpsMedium < tpsFast < tpsBlazing.
   *
   * @returns True if all thresholds are in ascending order; false otherwise.
   */
  isValidThresholdOrder(): boolean {
    const {
      tpsSlow = TPS_THRESHOLD_SLOW,
      tpsMedium = TPS_THRESHOLD_MEDIUM,
      tpsFast = TPS_THRESHOLD_FAST,
      tpsBlazing = TPS_THRESHOLD_BLAZING,
    } = this.config;

    return tpsSlow < tpsMedium && tpsMedium < tpsFast && tpsFast < tpsBlazing;
  }

  /**
   * Validates that color definitions are valid 24-bit truecolor ANSI hex strings.
   *
   * @returns True if all colors are valid hex strings; false otherwise.
   */
  isValidColorDefinition(): boolean {
    const {
      colorSlow = COLOR_SLOW,
      colorMedium = COLOR_MEDIUM,
      colorFast = COLOR_FAST,
      colorBlazing = COLOR_BLAZING,
    } = this.config;

    return (
      Validator.isValidHex(colorSlow) &&
      Validator.isValidHex(colorMedium) &&
      Validator.isValidHex(colorFast) &&
      Validator.isValidHex(colorBlazing)
    );
  }

  /**
   * Validates that countStrategy is a recognized value.
   *
   * @returns True if countStrategy is "estimate" or "direct"; false otherwise.
   */
  isValidCountStrategy(): boolean {
    const { countStrategy } = this.config;
    return Object.keys(COUNT_STRATEGY_LABELS).includes(countStrategy);
  }

  /**
   * Validates that the string is a valid 24-bit truecolor ANSI hex string.
   *
   * @param s The string to validate
   * @returns True if the string is a valid hex color; false otherwise
   */
  static isValidHex(s: string): boolean {
    return /^#[0-9a-fA-F]{6}$/.test(s);
  }
}

import type { TokenSpeedConfig } from "../../config/types";
import { ValidationCheckResult, ValidationResult } from "../base";
import { ScalarSettingsItem } from "./scalar";

/**
 * String setting for the status bar prefix label (default "TPS").
 * Set to "(empty)" to hide the label entirely.
 */
export class PrefixSettingsItem extends ScalarSettingsItem<string> {
  constructor() {
    super({
      id: "prefix",
      label: "Status prefix",
      description: "Prefix label shown before the measurement",
      default: "TPS",
    });
  }

  /** Display value — "(empty)" maps to the empty string for the user. */
  values = ["(empty)", "TPS", "Speed"];

  /**
   * Formats the current config value for display.
   *
   * @param config The current TokenSpeedConfig.
   * @returns The formatted display string, or undefined if unset.
   */
  format(config: TokenSpeedConfig): string | undefined {
    const value = config[this.options.id];
    if (typeof value === "string" && value !== "") return value;
    return this.options.default;
  }

  /**
   * Sets the prefix config value, normalizing "(empty)" → "".
   *
   * @param _config The current TokenSpeedConfig (unused).
   * @param value The display-value string from the user.
   * @returns A ValidationResult with the config patch.
   */
  setConfig(_config: TokenSpeedConfig, value: string): ValidationResult {
    return {
      valid: true,
      config: {
        [this.options.id]: value === "(empty)" ? "" : value,
      } as Partial<TokenSpeedConfig>,
    };
  }

  /**
   * Validates a raw value and returns a corrected version if invalid.
   *
   * @param value The value to validate.
   * @returns A ValidationCheckResult with validity, corrections, and errors.
   */
  validate(value: unknown): ValidationCheckResult {
    if (typeof value !== "string") {
      return {
        valid: false,
        corrected: this.options.default,
        errors: [
          `Invalid prefix (expected string) — defaulting to "${this.options.default}".`,
        ],
      };
    }
    const normalized = value === "(empty)" ? "" : value;
    if (normalized === "" || normalized === this.options.default) {
      return { valid: true, corrected: normalized };
    }
    // Accept any non-empty string as a valid custom prefix
    return { valid: true, corrected: normalized };
  }
}

import type {
  Colors,
  CountStrategy,
  DisplayMode,
  EndTpsBehavior,
  ProviderOverride,
  Thresholds,
  TierName,
  TokenSpeedConfig,
} from "./config-types";
import { MAX_SLIDING_WINDOW, MIN_SLIDING_WINDOW } from "./constants";
import {
  COLOR_BLAZING,
  COLOR_FAST,
  COLOR_MEDIUM,
  COLOR_SLOW,
  COUNT_STRATEGY,
  DEFAULT_ICON,
  DISPLAY_MODE,
  END_TPS_BEHAVIOR,
  SLIDING_WINDOW,
  TPS_THRESHOLD_BLAZING,
  TPS_THRESHOLD_FAST,
  TPS_THRESHOLD_MEDIUM,
  TPS_THRESHOLD_SLOW,
  UPDATE_INTERVAL,
  USE_PROVIDER_TOKENS,
} from "./defaults";
import {
  COUNT_STRATEGY_LABELS,
  DISPLAY_LABELS,
  END_TPS_BEHAVIOR_LABELS,
} from "./options";

/**
 * Static utility class for TokenSpeed configuration validation.
 */
export class Validator {
  /**
   * Validates the config, correcting invalid values and collecting errors.
   *
   * @param config The configuration to validate
   * @returns The corrected configuration and a list of error messages
   */
  static validate(config: TokenSpeedConfig): {
    config: TokenSpeedConfig;
    errors: string[];
  } {
    const response = { ...config };
    const errors: string[] = [];

    // Correct values with defaults where applicable
    response.display = this.checkDisplayMode(config.display, errors);
    response.countStrategy = this.checkCountStrategy(
      config.countStrategy,
      errors,
    );
    response.useProviderTokens = this.checkUseProviderTokens(
      config.useProviderTokens,
      errors,
    );
    response.slidingWindow = this.checkSlidingWindow(
      config.slidingWindow,
      errors,
    );
    response.endTpsBehavior = this.checkEndTpsBehavior(
      config.endTpsBehavior,
      errors,
    );
    response.icon = this.checkIcon(config.icon, errors);
    response.updateInterval = this.checkUpdateInterval(
      config.updateInterval,
      errors,
    );

    // Error-only checks (no correction)
    const thresholdResult = this.isValidThresholdOrder(config);
    if (!thresholdResult.valid) {
      errors.push(...thresholdResult.errors!);
    }

    const colorResult = this.isValidColorDefinition(config);
    if (!colorResult.valid) {
      errors.push(
        "- Colors must be valid 24-bit truecolor ANSI hex strings (e.g., '#00ff88').",
      );
      errors.push(
        `  Found: ${config.colors.slow} | ${config.colors.medium} | ${config.colors.fast} | ${config.colors.blazing}.`,
      );
      errors.push(...colorResult.errors!);
    }

    return { config: response, errors };
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

  /**
   * Validates a single provider override block against the base config.
   * Only explicitly-set keys are checked; invalid keys are dropped (with a
   * prefixed error) so the effective value falls back to base instead of a
   * global default.
   *
   * Threshold/color groups are validated against the effective (base-merged)
   * values so an override can't create an invalid ordering via fallback.
   *
   * @param providerId The provider the block applies to (for error messages)
   * @param override The raw override block
   * @param base The merged base config used as fallback
   * @returns The cleaned block (invalid keys removed) and error messages
   */
  static validateOverride(
    providerId: string,
    override: ProviderOverride,
    base: TokenSpeedConfig,
  ): { config: ProviderOverride; errors: string[] } {
    const cleaned: ProviderOverride = { ...override };
    const errors: string[] = [];
    const prefix = `providerOverrides["${providerId}"]`;
    const drop = (key: string, detail: string) => {
      errors.push(`- ${prefix}: ${detail} — falling back to base.`);
      delete cleaned[key as keyof ProviderOverride];
    };

    if (
      cleaned.display !== undefined &&
      !Object.keys(DISPLAY_LABELS).includes(cleaned.display)
    ) {
      drop("display", `Invalid display "${cleaned.display}"`);
    }

    if (
      cleaned.countStrategy !== undefined &&
      !Object.keys(COUNT_STRATEGY_LABELS).includes(cleaned.countStrategy)
    ) {
      drop("countStrategy", `Invalid countStrategy "${cleaned.countStrategy}"`);
    }

    if (
      cleaned.endTpsBehavior !== undefined &&
      !Object.keys(END_TPS_BEHAVIOR_LABELS).includes(
        cleaned.endTpsBehavior as string,
      )
    ) {
      drop(
        "endTpsBehavior",
        `Invalid endTpsBehavior "${cleaned.endTpsBehavior}"`,
      );
    }

    if (
      cleaned.useProviderTokens !== undefined &&
      typeof cleaned.useProviderTokens !== "boolean"
    ) {
      drop("useProviderTokens", "Invalid useProviderTokens (expected boolean)");
    }

    if (
      cleaned.slidingWindow !== undefined &&
      !(
        typeof cleaned.slidingWindow === "number" &&
        cleaned.slidingWindow >= MIN_SLIDING_WINDOW &&
        cleaned.slidingWindow <= MAX_SLIDING_WINDOW
      )
    ) {
      drop("slidingWindow", `Invalid slidingWindow "${cleaned.slidingWindow}"`);
    }

    if (
      cleaned.updateInterval !== undefined &&
      !(
        typeof cleaned.updateInterval === "number" &&
        cleaned.updateInterval >= 0
      )
    ) {
      drop(
        "updateInterval",
        `Invalid updateInterval "${cleaned.updateInterval}"`,
      );
    }

    if (cleaned.icon !== undefined && typeof cleaned.icon !== "string") {
      drop("icon", "Invalid icon (expected string)");
    }

    // Thresholds: keep only numeric tiers, then validate ordering against
    // the effective values (base fallback for omitted tiers)
    if (cleaned.thresholds !== undefined) {
      const raw = cleaned.thresholds;
      if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
        const partial: Partial<Thresholds> = {};
        for (const [tier, value] of Object.entries(raw)) {
          if (typeof value === "number") {
            partial[tier as TierName] = value;
          } else {
            errors.push(
              `- ${prefix}: Invalid thresholds.${tier} "${value}" (expected number) — tier falls back to base.`,
            );
          }
        }
        const merged = { ...base.thresholds, ...partial };
        if (!Validator.isAscendingThresholds(merged)) {
          drop(
            "thresholds",
            `Thresholds must be in ascending order (effective: ${merged.slow} < ${merged.medium} < ${merged.fast} < ${merged.blazing})`,
          );
        } else if (Object.keys(partial).length > 0) {
          cleaned.thresholds = partial;
        } else {
          delete cleaned.thresholds;
        }
      } else {
        drop("thresholds", "Invalid thresholds (expected object)");
      }
    }

    // Colors: keep only valid hex tiers, then drop the whole group if any
    // effective color is invalid
    if (cleaned.colors !== undefined) {
      const raw = cleaned.colors;
      if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
        const partial: Partial<Colors> = {};
        for (const [tier, value] of Object.entries(raw)) {
          if (typeof value === "string" && Validator.isValidHex(value)) {
            partial[tier as TierName] = value.toLowerCase();
          } else {
            errors.push(
              `- ${prefix}: Invalid colors.${tier} "${value}" (expected hex like '#00ff88') — tier falls back to base.`,
            );
          }
        }
        const merged = { ...base.colors, ...partial };
        const allValid = Object.values(merged).every((c) =>
          Validator.isValidHex(c),
        );
        if (!allValid) {
          drop("colors", "Effective colors must be valid hex strings");
        } else if (Object.keys(partial).length > 0) {
          cleaned.colors = partial;
        } else {
          delete cleaned.colors;
        }
      } else {
        drop("colors", "Invalid colors (expected object)");
      }
    }

    return { config: cleaned, errors };
  }

  /**
   * Checks that a complete set of tier thresholds is in strict ascending
   * order: slow < medium < fast < blazing.
   *
   * @param thresholds The full thresholds object to check
   * @returns True if the thresholds are in ascending order
   */
  static isAscendingThresholds(thresholds: Thresholds): boolean {
    return (
      thresholds.slow < thresholds.medium &&
      thresholds.medium < thresholds.fast &&
      thresholds.fast < thresholds.blazing
    );
  }

  /**
   * Validates that TPS thresholds are in strict ascending order:
   * slow < medium < fast < blazing.
   *
   * @param config The configuration to validate
   * @returns An object with validity status and optional error messages
   */
  static isValidThresholdOrder(config: TokenSpeedConfig): {
    valid: boolean;
    errors?: string[];
  } {
    const {
      slow = TPS_THRESHOLD_SLOW,
      medium = TPS_THRESHOLD_MEDIUM,
      fast = TPS_THRESHOLD_FAST,
      blazing = TPS_THRESHOLD_BLAZING,
    } = config.thresholds;
    const valid = Validator.isAscendingThresholds({
      slow,
      medium,
      fast,
      blazing,
    });
    return {
      valid,
      errors: valid
        ? undefined
        : [
            "- TPS thresholds must be in ascending order.",
            `  Found: ${slow} < ${medium} < ${fast} < ${blazing}.`,
          ],
    };
  }

  /**
   * Validates that color definitions are valid 24-bit truecolor ANSI hex strings.
   *
   * @param config The configuration to validate
   * @returns An object with validity status and optional error messages
   */
  private static isValidColorDefinition(config: TokenSpeedConfig): {
    valid: boolean;
    errors?: string[];
  } {
    const {
      slow = COLOR_SLOW,
      medium = COLOR_MEDIUM,
      fast = COLOR_FAST,
      blazing = COLOR_BLAZING,
    } = config.colors;
    const errors: string[] = [];
    if (!Validator.isValidHex(slow))
      errors.push(`  - Invalid colors.slow: ${slow}`);
    if (!Validator.isValidHex(medium))
      errors.push(`  - Invalid colors.medium: ${medium}`);
    if (!Validator.isValidHex(fast))
      errors.push(`  - Invalid colors.fast: ${fast}`);
    if (!Validator.isValidHex(blazing))
      errors.push(`  - Invalid colors.blazing: ${blazing}`);
    return { valid: errors.length === 0, errors };
  }

  /**
   * Checks that display mode is a recognized value, defaulting if invalid.
   *
   * @param value The display mode value to check.
   * @param errors The shared errors array to push to if invalid.
   * @returns The validated (or defaulted) display mode.
   */
  private static checkDisplayMode(
    value: string,
    errors: string[],
  ): DisplayMode {
    if (Object.keys(DISPLAY_LABELS).includes(value))
      return value as DisplayMode;

    errors.push(
      `- Invalid display "${value}" — defaulting to "${DISPLAY_MODE}".`,
    );

    return DISPLAY_MODE;
  }

  /**
   * Checks that countStrategy is a recognized value, defaulting if invalid.
   *
   * @param value The count strategy value to check.
   * @param errors The shared errors array to push to if invalid.
   * @returns The validated (or defaulted) count strategy.
   */
  private static checkCountStrategy(
    value: string,
    errors: string[],
  ): CountStrategy {
    if (Object.keys(COUNT_STRATEGY_LABELS).includes(value))
      return value as CountStrategy;

    errors.push(
      `- Invalid countStrategy "${value}" — defaulting to "${COUNT_STRATEGY}".`,
    );

    return COUNT_STRATEGY;
  }

  /**
   * Checks that useProviderTokens is a boolean, defaulting if invalid.
   *
   * @param value The useProviderTokens value to check.
   * @param errors The shared errors array to push to if invalid.
   * @returns The validated (or defaulted) boolean value.
   */
  private static checkUseProviderTokens(
    value: unknown,
    errors: string[],
  ): boolean {
    if (typeof value === "boolean") return value;

    errors.push(
      `- Invalid useProviderTokens (expected boolean) — defaulting to ${USE_PROVIDER_TOKENS}.`,
    );

    return USE_PROVIDER_TOKENS;
  }

  /**
   * Checks that sliding window is a reasonable number (between 100ms and 30s),
   * defaulting if invalid.
   *
   * @param value The sliding window value to check.
   * @param errors The shared errors array to push to if invalid.
   * @returns The validated (or defaulted) sliding window value.
   */
  private static checkSlidingWindow(value: unknown, errors: string[]): number {
    if (
      typeof value === "number" &&
      value >= MIN_SLIDING_WINDOW &&
      value <= MAX_SLIDING_WINDOW
    )
      return value;

    errors.push(
      `- Invalid slidingWindow "${value}" — defaulting to ${SLIDING_WINDOW}.`,
    );

    return SLIDING_WINDOW;
  }

  /**
   * Checks that endTpsBehavior is a recognized value, defaulting if invalid.
   *
   * @param value The endTpsBehavior value to check.
   * @param errors The shared errors array to push to if invalid.
   * @returns The validated (or defaulted) end TPS behavior.
   */
  private static checkEndTpsBehavior(
    value: unknown,
    errors: string[],
  ): EndTpsBehavior {
    if (Object.keys(END_TPS_BEHAVIOR_LABELS).includes(value as string))
      return value as EndTpsBehavior;

    errors.push(
      `- Invalid endTpsBehavior "${value}" — defaulting to "${END_TPS_BEHAVIOR}".`,
    );

    return END_TPS_BEHAVIOR;
  }

  /**
   * Checks that icon is a string, defaulting if invalid.
   *
   * @param value The icon value to check.
   * @param errors The shared errors array to push to if invalid.
   * @returns The validated (or defaulted) string value.
   */
  private static checkIcon(value: unknown, errors: string[]): string {
    if (typeof value === "string") return value;

    errors.push(
      `- Invalid icon (expected string) — defaulting to "${DEFAULT_ICON}".`,
    );

    return DEFAULT_ICON;
  }

  /**
   * Checks that updateInterval is a non-negative number (ms for status updates).
   * Non-numbers default to 0 (update on every delta).
   *
   * @param value The updateInterval value to check.
   * @param errors The shared errors array to push to if invalid.
   * @returns The validated (or defaulted) updateInterval value.
   */
  private static checkUpdateInterval(value: unknown, errors: string[]): number {
    if (typeof value === "number" && value >= 0) return value;

    errors.push(
      `- Invalid updateInterval "${value}" — defaulting to ${UPDATE_INTERVAL}.`,
    );

    return UPDATE_INTERVAL;
  }
}

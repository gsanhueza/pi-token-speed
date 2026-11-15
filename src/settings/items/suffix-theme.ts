import { ScalarSettingsItem } from "./scalar";
import type { TokenSpeedConfig } from "../../config/types";
import { ValidationCheckResult, ValidationResult } from "../base";

export const SUFFIX_THEME_DEFAULT = "";

const SUFFIX_THEME_LABELS: Record<string, string> = {
  "": "(empty)",
  dim: "dim",
  muted: "muted",
};

/**
 * Settings item for the `suffixTheme` selector.
 *
 * Shows a fixed set of theme keys in the TUI menu, but accepts any string
 * so users can pick arbitrary theme colors from their config.
 */
export class SuffixThemeSettingsItem extends ScalarSettingsItem<string> {
  readonly values: string[] = Object.values(SUFFIX_THEME_LABELS);

  constructor() {
    super({
      id: "suffixTheme",
      label: "Suffix theming",
      description: "Style for uncolored suffix parts ((empty), dim, muted)",
      default: SUFFIX_THEME_DEFAULT,
    });
  }

  /**
   * Returns the display label for a config value.
   */
  format(config: TokenSpeedConfig): string | undefined {
    const value = config[this.options.id] as string;
    return SUFFIX_THEME_LABELS[value] ?? value;
  }

  /**
   * Accepts any string — the theme handles unknown keys gracefully.
   */
  setConfig(_config: TokenSpeedConfig, value: string): ValidationResult {
    return {
      valid: true,
      config: { suffixTheme: value === "(empty)" ? "" : value },
    };
  }

  /**
   * Accepts any string — the theme handles unknown keys gracefully.
   */
  validate(value: unknown): ValidationCheckResult {
    if (typeof value !== "string") {
      return {
        valid: false,
        corrected: this.options.default,
        errors: [
          `Invalid suffixTheme (expected string) — defaulting to "${this.options.default}".`,
        ],
      };
    }
    return { valid: true, corrected: value };
  }
}

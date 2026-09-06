import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { SettingItem } from "@earendil-works/pi-tui";
import { Input } from "@earendil-works/pi-tui";
import type { TokenSpeedConfig } from "./config-types";
import { settings } from "./settings";
import { Validator } from "./validation";

/**
 * Color tier metadata.
 */
interface ColorTier {
  key: keyof Pick<
    TokenSpeedConfig,
    "colorSlow" | "colorMedium" | "colorFast" | "colorBlazing"
  >;
  label: string;
}

const COLOR_TIERS: ColorTier[] = [
  { key: "colorSlow", label: "Slow" },
  { key: "colorMedium", label: "Medium" },
  { key: "colorFast", label: "Fast" },
  { key: "colorBlazing", label: "Blazing" },
];

/**
 * Renders a single character colored with the given hex color.
 * Uses 24-bit truecolor ANSI escape codes.
 */
export function coloredBlock(hex: string): string {
  if (!Validator.isValidHex(hex)) return "■";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m■\x1b[0m`;
}

/**
 * Builds the SettingsList items for the color customization submenu.
 *
 * Each row opens an Input component for hex editing on Enter.
 *
 * @param ctx The command context (for notifications).
 * @returns Array of SettingItem for the color submenu.
 */
export const buildColorSettingsItems = (
  ctx: ExtensionCommandContext,
): SettingItem[] => {
  const config = settings.getConfig();

  return COLOR_TIERS.map((tier) => ({
    id: tier.key,
    label: `${coloredBlock(config[tier.key])} ${tier.label}`,
    description: `Hex color for the ${tier.label.toLowerCase()} TPS tier`,
    currentValue: config[tier.key],
    submenu: (_currentValue: string, done: (value?: string) => void) => {
      const input = new Input();
      // Read the config value fresh each time the submenu opens
      // so that previously saved colors are reflected immediately
      input.setValue(settings.getConfig()[tier.key]);

      input.onSubmit = (value: string) => {
        if (Validator.isValidHex(value)) {
          done(value);
        } else {
          ctx.ui.notify(
            `Invalid hex color "${value}" — must be #RRGGBB`,
            "warning",
          );
          // Don't call done — keep the input open for correction
        }
      };

      return input;
    },
  }));
};

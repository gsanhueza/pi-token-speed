import type { Theme } from "@earendil-works/pi-coding-agent";
import type { SettingItem, TUI } from "@earendil-works/pi-tui";
import { HexColorInput } from "./color-input";
import type { Colors, TierName } from "./config-types";
import { InputDialog } from "./dialog";
import { settings } from "./settings";
import { Validator } from "./validation";

/**
 * Color tier metadata.
 */
interface ColorTier {
  key: TierName;
  label: string;
}

const COLOR_TIERS: ColorTier[] = [
  { key: "slow", label: "Slow" },
  { key: "medium", label: "Medium" },
  { key: "fast", label: "Fast" },
  { key: "blazing", label: "Blazing" },
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
 * Each row opens a framed `InputDialog` for hex editing on Enter.
 *
 * @param theme The active theme (for dialog styling)
 * @param tui The TUI instance (for re-renders while the dialog is open)
 * @returns Array of SettingItem for the color submenu.
 */
export const buildColorSettingsItems = (
  theme: Theme,
  tui: TUI,
): SettingItem[] => {
  const config = settings.getConfig();

  return COLOR_TIERS.map((tier) => ({
    id: `colors.${tier.key as keyof Colors}`,
    label: `${coloredBlock(config.colors[tier.key])} ${tier.label}`,
    description: `Hex color for the ${tier.label.toLowerCase()} tier`,
    currentValue: config.colors[tier.key],
    // Read the config value fresh each time the submenu opens
    // so that previously saved colors are reflected immediately
    submenu: InputDialog.inputSubmenu(theme, tui, {
      title: `${tier.label} color`,
      message: `Hex color for the ${tier.label.toLowerCase()} tier`,
      placeholder: "#RRGGBB",
      initialValue: settings.getConfig().colors[tier.key],
      // Live hex preview while typing (see PLAN_COLORS.md).
      createInput: () => new HexColorInput(),
      // Normalize on commit: hex is stored lower-cased regardless of
      // how the user typed it (isValidHex accepts both cases).
      validate: (raw) => (Validator.isValidHex(raw) ? raw.toLowerCase() : null),
    }),
  }));
};

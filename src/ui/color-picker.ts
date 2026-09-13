import type { Theme } from "@earendil-works/pi-coding-agent";
import type { SettingItem, TUI } from "@earendil-works/pi-tui";
import { TIERS } from "../config/options";
import { settings } from "../config/settings";
import { Validator } from "../config/validation";
import { truecolor } from "./ansi";
import { HexColorInput } from "./color-input";
import { InputDialog } from "./dialog";

/**
 * Renders a single character colored with the given hex color.
 * Uses 24-bit truecolor ANSI escape codes.
 */
export function coloredBlock(hex: string): string {
  return truecolor("■", hex);
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

  return TIERS.map((tier) => ({
    id: `colors.${tier.key}`,
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

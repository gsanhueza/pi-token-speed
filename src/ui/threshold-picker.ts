import type { Theme } from "@earendil-works/pi-coding-agent";
import type { SettingItem, TUI } from "@earendil-works/pi-tui";
import { TIERS } from "../config/options";
import { settings } from "../config/settings";
import { InputDialog } from "./dialog";

/**
 * Builds the SettingsList items for the TPS threshold customization submenu.
 *
 * Each row opens a framed `InputDialog` for editing the threshold value.
 *
 * @param theme The active theme (for dialog styling)
 * @param tui The TUI instance (for re-renders while the dialog is open)
 * @returns Array of SettingItem for the threshold submenu.
 */
export const buildThresholdSettingsItems = (
  theme: Theme,
  tui: TUI,
): SettingItem[] => {
  const config = settings.getConfig();

  return TIERS.map((tier) => ({
    id: `thresholds.${tier.key}`,
    label: `${tier.label}`,
    description: `TPS threshold for the ${tier.label.toLowerCase()} tier`,
    currentValue: config.thresholds[tier.key].toString(),
    // Read the config value fresh each time the submenu opens
    // so that previously saved thresholds are reflected immediately
    submenu: InputDialog.inputSubmenu(theme, tui, {
      title: `${tier.label} threshold`,
      message: `TPS threshold for the ${tier.label.toLowerCase()} tier`,
      placeholder: "non-negative integer",
      initialValue: settings.getConfig().thresholds[tier.key].toString(),
      validate: (raw) => {
        const num = Number(raw);
        return Number.isFinite(num) && num >= 0 && Number.isInteger(num)
          ? num.toString()
          : null;
      },
    }),
  }));
};

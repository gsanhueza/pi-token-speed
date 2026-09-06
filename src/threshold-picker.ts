import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { SettingItem } from "@earendil-works/pi-tui";
import { Input } from "@earendil-works/pi-tui";
import type { TokenSpeedConfig } from "./config-types";
import { settings } from "./settings";

/**
 * Threshold tier metadata.
 */
interface ThresholdTier {
  key: keyof Pick<
    TokenSpeedConfig,
    "tpsSlow" | "tpsMedium" | "tpsFast" | "tpsBlazing"
  >;
  label: string;
}

const THRESHOLD_TIERS: ThresholdTier[] = [
  { key: "tpsSlow", label: "Slow" },
  { key: "tpsMedium", label: "Medium" },
  { key: "tpsFast", label: "Fast" },
  { key: "tpsBlazing", label: "Blazing" },
];

/**
 * Builds the SettingsList items for the TPS threshold customization submenu.
 *
 * Each row opens an Input component for editing the threshold value.
 *
 * @param ctx The command context (for notifications).
 * @returns Array of SettingItem for the threshold submenu.
 */
export const buildThresholdSettingsItems = (
  ctx: ExtensionCommandContext,
): SettingItem[] => {
  const config = settings.getConfig();

  return THRESHOLD_TIERS.map((tier) => ({
    id: tier.key,
    label: `${tier.label}`,
    description: `TPS threshold for the ${tier.label.toLowerCase()} tier`,
    currentValue: config[tier.key].toString(),
    submenu: (_currentValue: string, done: (value?: string) => void) => {
      const input = new Input();
      // Read the config value fresh each time the submenu opens
      // so that previously saved colors are reflected immediately
      input.setValue(settings.getConfig()[tier.key].toString());

      input.onSubmit = (value: string) => {
        const num = Number(value);
        if (Number.isFinite(num) && num >= 0 && Number.isInteger(num)) {
          done(num.toString());
        } else {
          ctx.ui.notify(
            `Invalid threshold "${value}" — must be a non-negative integer`,
            "warning",
          );
          // Don't call done — keep the input open for correction
        }
      };

      return input;
    },
  }));
};

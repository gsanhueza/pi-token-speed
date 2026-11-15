import type { SettingsItem } from "./base";
import { COLOR_ITEMS } from "./items/colors";
import { ColorsGroupSettingsItem } from "./items/colors/group";
import { CountStrategySettingsItem } from "./items/count-strategy";
import { DisplaySettingsItem } from "./items/display";
import { DISPLAY_COLOR_ITEMS } from "./items/display-colors";
import { DisplayColorsGroupSettingsItem } from "./items/display-colors/group";
import { EndTpsBehaviorSettingsItem } from "./items/end-tps-behavior";
import { FormatDurationSettingsItem } from "./items/format-duration";
import { IconSettingsItem } from "./items/icon";
import { PrefixSettingsItem } from "./items/prefix";
import { SlidingWindowSettingsItem } from "./items/sliding-window";
import { THRESHOLD_ITEMS } from "./items/thresholds";
import { ThresholdsGroupSettingsItem } from "./items/thresholds/group";
import { UpdateIntervalSettingsItem } from "./items/update-interval";
import { UseProviderTokensSettingsItem } from "./items/use-provider-tokens";

// ── Settings item definitions ──────────────────────────────────────────
// Instantiated at module load time; consumed by Settings, OverrideValidator,
// and menu construction.
export const SETTINGS_ITEMS: Record<string, SettingsItem> = {
  display: new DisplaySettingsItem(),
  icon: new IconSettingsItem(),
  prefix: new PrefixSettingsItem(),
  updateInterval: new UpdateIntervalSettingsItem(),
  useProviderTokens: new UseProviderTokensSettingsItem(),
  countStrategy: new CountStrategySettingsItem(),
  slidingWindow: new SlidingWindowSettingsItem(),
  endTpsBehavior: new EndTpsBehaviorSettingsItem(),
  formatDuration: new FormatDurationSettingsItem(),
  thresholds: new ThresholdsGroupSettingsItem(),
  colors: new ColorsGroupSettingsItem(),
  displayColors: new DisplayColorsGroupSettingsItem(),
};

export const TIER_SETTINGS_ITEMS: Record<string, SettingsItem> = {
  ...Object.fromEntries(
    Object.entries(THRESHOLD_ITEMS).map(([k, v]) => [`thresholds.${k}`, v]),
  ),
  ...Object.fromEntries(
    Object.entries(COLOR_ITEMS).map(([k, v]) => [`colors.${k}`, v]),
  ),
};

export const DISPLAY_COLOR_SETTINGS_ITEMS: Record<string, SettingsItem> = {
  ...Object.fromEntries(
    Object.entries(DISPLAY_COLOR_ITEMS).map(([k, v]) => [
      `displayColors.${k}`,
      v,
    ]),
  ),
};

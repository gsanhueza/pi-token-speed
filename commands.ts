import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { SettingsList, type SettingItem } from "@earendil-works/pi-tui";
import { getDefaultConfig, setConfig } from "./config";
import { TokenSpeedEngine } from "./engine";
import { COUNT_STRATEGY_LABELS, DISPLAY_LABELS } from "./options";
import { readUserSettings } from "./settings";
import { renderStatus } from "./ui";

/**
 * Creates the SettingsList for the token speed settings menu.
 */
const createSettingsList = (
  items: SettingItem[],
  onChange: (id: string, newValue: string) => void,
  onClose: () => void,
): SettingsList =>
  new SettingsList(
    items,
    items.length,
    getSettingsListTheme(),
    onChange,
    onClose,
  );

/**
 * Builds the SettingsList items for the token speed settings menu.
 */
const buildSettingsItems = (
  display: string,
  useProviderTokens: boolean,
  countStrategy: string,
): SettingItem[] => [
  {
    id: "display",
    label: "Display mode",
    description: "Level of detail to show in the status bar",
    currentValue: display,
    values: Object.keys(DISPLAY_LABELS),
  },
  {
    id: "useProviderTokens",
    label: "Use provider tokens",
    description:
      "Use the provider's token count instead of this extension's counter",
    currentValue: useProviderTokens ? "on" : "off",
    values: ["on", "off"],
  },
  {
    id: "countStrategy",
    label: "Count strategy",
    description:
      "Direct counting (server streams tokens) vs estimate counting (server streams chunks)",
    currentValue: countStrategy,
    values: Object.keys(COUNT_STRATEGY_LABELS),
  },
];

/**
 * Handles the `/tps` command — opens a SettingsList to configure
 * display mode, token counting strategy, and provider token usage.
 *
 * @param ctx The context used by Pi
 * @param engine The engine that handles the counting
 */
export const tpsCommand = async (
  ctx: ExtensionCommandContext,
  engine: TokenSpeedEngine,
): Promise<void> => {
  const defaults = getDefaultConfig();
  const {
    display = defaults.display,
    useProviderTokens = defaults.useProviderTokens,
    countStrategy = defaults.countStrategy,
  } = readUserSettings();

  const items = buildSettingsItems(display, useProviderTokens, countStrategy);

  await ctx.ui.custom<void>((_tui, _theme, _kb, done) =>
    createSettingsList(
      items,
      (id, newValue) => {
        if (id === "display") {
          setConfig({ display: newValue as typeof display });
        } else if (id === "useProviderTokens") {
          setConfig({ useProviderTokens: newValue === "on" });
        } else if (id === "countStrategy") {
          setConfig({ countStrategy: newValue as typeof countStrategy });
        }
        renderStatus(ctx, engine);
      },
      done,
    ),
  );

  // Re-render with the latest config (cache was already reset by setConfig
  // calls inside the callback, or is still valid if nothing changed)
  renderStatus(ctx, engine);
};

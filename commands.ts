import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { SettingsList, type SettingItem } from "@earendil-works/pi-tui";
import {
  COUNT_STRATEGY_LABELS,
  DISPLAY_LABELS,
  TOGGLE_LABELS,
} from "./options";
import type { Renderer } from "./renderer";
import { settings } from "./settings";
import type { CountStrategy, DisplayMode } from "./types";

/**
 * Handles commands for the token-speed extension.
 */
export class CommandManager {
  constructor(private readonly renderer: Renderer) {}

  /**
   * Handles the `/tps` command — opens a SettingsList to configure
   * display mode, token counting strategy, and provider token usage.
   *
   * @param ctx The context used by Pi
   */
  async runTps(ctx: ExtensionCommandContext): Promise<void> {
    const defaults = settings.getDefaultConfig();
    const {
      display = defaults.display,
      useProviderTokens = defaults.useProviderTokens,
      countStrategy = defaults.countStrategy,
    } = await settings.readUserSettings();

    const items = this.buildSettingsItems(
      display,
      useProviderTokens,
      countStrategy,
    );

    await ctx.ui.custom<void>((_tui, _theme, _kb, done) =>
      this.createSettingsList(
        items,
        async (id, newValue) => {
          if (id === "display") {
            await settings.setConfig({ display: newValue as DisplayMode });
          } else if (id === "useProviderTokens") {
            await settings.setConfig({ useProviderTokens: newValue === "on" });
          } else if (id === "countStrategy") {
            await settings.setConfig({
              countStrategy: newValue as CountStrategy,
            });
          }
          await this.renderer.update(ctx);
        },
        done,
      ),
    );

    // Re-render with the latest config (cache was already reset by setConfig
    // calls inside the callback, or is still valid if nothing changed)
    await this.renderer.update(ctx);
  }

  /**
   * Creates the SettingsList for the token speed settings menu.
   *
   * @param items The settings items to display
   * @param onChange Callback when a setting value changes
   * @param onClose Callback when the dialog closes
   * @returns The configured SettingsList instance
   */
  private createSettingsList(
    items: SettingItem[],
    onChange: (id: string, newValue: string) => void,
    onClose: () => void,
  ): SettingsList {
    return new SettingsList(
      items,
      items.length,
      getSettingsListTheme(),
      onChange,
      onClose,
    );
  }

  /**
   * Builds the SettingsList items for the token speed settings menu.
   *
   * @param display Current display mode value
   * @param useProviderTokens Whether provider tokens are enabled
   * @param countStrategy Current count strategy value
   * @returns The array of SettingItem objects
   */
  private buildSettingsItems(
    display: DisplayMode,
    useProviderTokens: boolean,
    countStrategy: CountStrategy,
  ): SettingItem[] {
    return [
      {
        id: "display",
        label: "Display mode",
        description: "Level of detail to show in the status bar",
        currentValue: display,
        values: Object.keys(DISPLAY_LABELS) as DisplayMode[],
      },
      {
        id: "useProviderTokens",
        label: "Use provider tokens",
        description:
          "Use the provider's token count instead of this extension's counter",
        currentValue: useProviderTokens ? "on" : "off",
        values: Object.keys(TOGGLE_LABELS),
      },
      {
        id: "countStrategy",
        label: "Count strategy",
        description:
          "Direct counting (server streams tokens) vs estimate counting (server streams chunks)",
        currentValue: countStrategy,
        values: Object.keys(COUNT_STRATEGY_LABELS) as CountStrategy[],
      },
    ];
  }
}

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { SettingsList, type SettingItem } from "@earendil-works/pi-tui";
import type {
  CountStrategy,
  DisplayMode,
  EndTpsBehavior,
  TokenSpeedConfig,
} from "./config-types";
import { TokenSpeedEngine } from "./engine";
import {
  COUNT_STRATEGY_LABELS,
  DISPLAY_LABELS,
  END_TPS_BEHAVIOR_LABELS,
  SHOW_ICON_LABELS,
  TOGGLE_LABELS,
  UPDATE_INTERVAL_LABEL,
  UPDATE_INTERVAL_LABELS,
} from "./options";
import type { Renderer } from "./renderer";
import { settings } from "./settings";

/**
 * Configuration options
 */
enum Options {
  DISPLAY = "display",
  USE_PROVIDER_TOKENS = "useProviderTokens",
  COUNT_STRATEGY = "countStrategy",
  END_TPS_BEHAVIOR = "endTpsBehavior",
  SHOW_ICON = "showIcon",
  UPDATE_INTERVAL = "updateInterval",
}

/**
 * Handles commands for the token-speed extension.
 */
export class CommandManager {
  constructor(
    private readonly renderer: Renderer,
    private readonly engine: TokenSpeedEngine,
  ) {}

  /**
   * Handles the `/tps` command — opens a SettingsList to configure
   * display mode, token counting strategy, and provider token usage.
   *
   * @param ctx The context used by Pi
   */
  async runTps(ctx: ExtensionCommandContext): Promise<void> {
    const config = settings.getConfig();
    const items = this.buildSettingsItems(config);

    await ctx.ui.custom<void>((_tui, _theme, _kb, done) =>
      this.createSettingsList(
        items,
        async (id, newValue) => this.handleSettingChange(id, newValue, ctx),
        done,
      ),
    );
  }

  /**
   * Handles a settings value change — writes the new value and re-renders.
   *
   * @param id The setting identifier
   * @param newValue The new value to apply
   * @param ctx The context used by Pi
   */
  private async handleSettingChange(
    id: string,
    newValue: string,
    ctx: ExtensionCommandContext,
  ): Promise<void> {
    if (id === Options.DISPLAY) {
      await settings.setConfig({ display: newValue as DisplayMode });
    } else if (id === Options.USE_PROVIDER_TOKENS) {
      await settings.setConfig({ useProviderTokens: newValue === "on" });
    } else if (id === Options.COUNT_STRATEGY) {
      await settings.setConfig({
        countStrategy: newValue as CountStrategy,
      });
    } else if (id === Options.END_TPS_BEHAVIOR) {
      await settings.setConfig({
        endTpsBehavior: newValue as EndTpsBehavior,
      });
    } else if (id === Options.SHOW_ICON) {
      await settings.setConfig({ showIcon: newValue === "on" });
    } else if (id === Options.UPDATE_INTERVAL) {
      await settings.setConfig({ updateInterval: Number(newValue) });
    }

    // Re-render with the latest config
    this.engine.initialize();
    this.renderer.update(ctx);
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
   * @param config The resolved configuration
   * @returns The array of SettingItem objects
   */
  private buildSettingsItems(config: TokenSpeedConfig): SettingItem[] {
    return [
      {
        id: Options.DISPLAY,
        label: "Display mode",
        description: "Level of detail to show in the status bar",
        currentValue: config.display,
        values: Object.keys(DISPLAY_LABELS) as DisplayMode[],
      },
      {
        id: Options.USE_PROVIDER_TOKENS,
        label: "Use provider tokens",
        description:
          "Use the provider's token count instead of this extension's counter",
        currentValue: config.useProviderTokens ? "on" : "off",
        values: Object.keys(TOGGLE_LABELS),
      },
      {
        id: Options.COUNT_STRATEGY,
        label: "Count strategy",
        description:
          "Direct counting (server streams tokens) vs estimate counting (server streams chunks)",
        currentValue: config.countStrategy,
        values: Object.keys(COUNT_STRATEGY_LABELS) as CountStrategy[],
      },
      {
        id: Options.END_TPS_BEHAVIOR,
        label: "End-of-stream TPS",
        description:
          "What to show after streaming: overall average or last sliding window value",
        currentValue: config.endTpsBehavior,
        values: Object.keys(END_TPS_BEHAVIOR_LABELS) as EndTpsBehavior[],
      },
      {
        id: Options.SHOW_ICON,
        label: "Show icon",
        description: "Toggle the lightning bolt icon (⚡) in the status bar",
        currentValue: config.showIcon ? "on" : "off",
        values: Object.keys(SHOW_ICON_LABELS),
      },
      {
        id: Options.UPDATE_INTERVAL,
        label: UPDATE_INTERVAL_LABEL,
        description:
          "How often to update the status bar. 0 = every delta (current behavior).",
        currentValue: config.updateInterval?.toString() ?? "0",
        values: Object.keys(UPDATE_INTERVAL_LABELS),
      },
    ];
  }
}

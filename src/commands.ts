import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { SettingsList, type SettingItem } from "@earendil-works/pi-tui";
import type { TokenSpeedConfig } from "./config-types";
import { TokenSpeedEngine } from "./engine";
import {
  COUNT_STRATEGY_LABELS,
  DISPLAY_LABELS,
  END_TPS_BEHAVIOR_LABELS,
  ICON_LABEL,
  ICONS,
  SLIDING_WINDOW_LABEL,
  SLIDING_WINDOW_LABELS,
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
  ICON = "icon",
  UPDATE_INTERVAL = "updateInterval",
  SLIDING_WINDOW = "slidingWindow",
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
   * display mode, token counting, timing, icon, and sliding window.
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
      await settings.setConfig({
        display: CommandManager.invertLabels(DISPLAY_LABELS)[newValue],
      });
    } else if (id === Options.USE_PROVIDER_TOKENS) {
      await settings.setConfig({ useProviderTokens: newValue === "On" });
    } else if (id === Options.COUNT_STRATEGY) {
      await settings.setConfig({
        countStrategy: CommandManager.invertLabels(COUNT_STRATEGY_LABELS)[
          newValue
        ],
      });
    } else if (id === Options.END_TPS_BEHAVIOR) {
      await settings.setConfig({
        endTpsBehavior: CommandManager.invertLabels(END_TPS_BEHAVIOR_LABELS)[
          newValue
        ],
      });
    } else if (id === Options.ICON) {
      await settings.setConfig({
        icon: newValue === "(empty)" ? "" : newValue,
      });
    } else if (id === Options.UPDATE_INTERVAL) {
      await settings.setConfig({
        updateInterval: Number(
          CommandManager.invertLabels(UPDATE_INTERVAL_LABELS)[newValue],
        ),
      });
    } else if (id === Options.SLIDING_WINDOW) {
      await settings.setConfig({
        slidingWindow: Number(
          CommandManager.invertLabels(SLIDING_WINDOW_LABELS)[newValue],
        ),
      });
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
        currentValue: DISPLAY_LABELS[config.display],
        values: Object.values(DISPLAY_LABELS),
      },
      {
        id: Options.USE_PROVIDER_TOKENS,
        label: "Use provider tokens",
        description:
          "Use the provider's token count instead of this extension's counter",
        currentValue: config.useProviderTokens
          ? TOGGLE_LABELS.on
          : TOGGLE_LABELS.off,
        values: Object.values(TOGGLE_LABELS),
      },
      {
        id: Options.COUNT_STRATEGY,
        label: "Count strategy",
        description:
          "Direct counting (server streams tokens) vs estimate counting (server streams chunks)",
        currentValue: COUNT_STRATEGY_LABELS[config.countStrategy],
        values: Object.values(COUNT_STRATEGY_LABELS),
      },
      {
        id: Options.END_TPS_BEHAVIOR,
        label: "End-of-stream TPS",
        description:
          "What to show after streaming: overall average or last sliding window value",
        currentValue: END_TPS_BEHAVIOR_LABELS[config.endTpsBehavior],
        values: Object.values(END_TPS_BEHAVIOR_LABELS),
      },
      {
        id: Options.ICON,
        label: ICON_LABEL,
        description: "Icon shown before TPS in the status bar",
        currentValue: config.icon || "(empty)",
        values: [...ICONS, "(empty)"],
      },
      {
        id: Options.SLIDING_WINDOW,
        label: SLIDING_WINDOW_LABEL,
        description:
          "Time window for TPS calculation. Larger = smoother, smaller = more reactive.",
        currentValue:
          SLIDING_WINDOW_LABELS[config.slidingWindow.toString()] ??
          config.slidingWindow.toString(),
        values: Object.values(SLIDING_WINDOW_LABELS),
      },
      {
        id: Options.UPDATE_INTERVAL,
        label: UPDATE_INTERVAL_LABEL,
        description:
          "How often to update the status bar. 0 = every delta (current behavior).",
        currentValue:
          UPDATE_INTERVAL_LABELS[config.updateInterval.toString()] ??
          config.updateInterval.toString(),
        values: Object.values(UPDATE_INTERVAL_LABELS),
      },
    ];
  }

  private static invertLabels<K extends string>(
    obj: Record<K, string>,
  ): Record<string, K> {
    const result = {} as Record<string, K>;
    for (const key in obj) {
      result[obj[key]] = key;
    }
    return result;
  }
}

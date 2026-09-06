import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { SettingsList, type SettingItem } from "@earendil-works/pi-tui";
import { buildColorSettingsItems, coloredBlock } from "./color-picker";
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
  COLORS = "colors",
}

/**
 * Handles commands for the token-speed extension.
 */
export class CommandManager {
  private settingsList: SettingsList | null = null;
  private colorSubmenuList: SettingsList | null = null;
  private colorSubmenuItems: SettingItem[] | null = null;

  constructor(
    private readonly renderer: Renderer,
    private readonly engine: TokenSpeedEngine,
  ) {}

  /**
   * Handles the `/tps` command — opens a SettingsList to configure
   * display mode, token counting, timing, icon, sliding window, and colors.
   *
   * @param ctx The context used by Pi
   */
  async runTps(ctx: ExtensionCommandContext): Promise<void> {
    const config = settings.getConfig();
    const items = this.buildSettingsItems(config, ctx);

    await ctx.ui.custom<void>((_tui, _theme, _kb, done) => {
      this.settingsList = this.createSettingsList(
        items,
        async (id, newValue) => this.handleSettingChange(id, newValue, ctx),
        done,
      );
      return this.settingsList;
    });
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
    } else if (
      id === "colorSlow" ||
      id === "colorMedium" ||
      id === "colorFast" ||
      id === "colorBlazing"
    ) {
      // Color keys are saved by the color picker's input.onSubmit,
      // but we still need to merge into the cache here so the main
      // menu's SettingsList items reflect the new values after the
      // submenu closes.
      await settings.setConfig({ [id]: newValue });
      this.refreshColorItems();
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
   * Refreshes the SettingsList items after a color change.
   * Updates both the main menu's Colors entry and the
   * submenu's color rows so colored blocks reflect
   * the new values immediately.
   */
  private refreshColorItems(): void {
    const config = settings.getConfig();
    const slow = `${coloredBlock(config.colorSlow)}`;
    const medium = `${coloredBlock(config.colorMedium)}`;
    const fast = `${coloredBlock(config.colorFast)}`;
    const blazing = `${coloredBlock(config.colorBlazing)}`;
    const allColors = `${slow} ${medium} ${fast} ${blazing}`;

    // Update main menu's Colors entry
    if (this.settingsList) {
      this.settingsList.updateValue("colors", allColors);
    }

    // Update submenu's color rows:
    // - label gets the colored block + tier name
    // - currentValue stays as the hex string
    if (this.colorSubmenuItems) {
      const colorMap: Record<string, { block: string; tier: string }> = {
        colorSlow: { block: slow, tier: "Slow" },
        colorMedium: { block: medium, tier: "Medium" },
        colorFast: { block: fast, tier: "Fast" },
        colorBlazing: { block: blazing, tier: "Blazing" },
      };

      for (const [id, { block, tier }] of Object.entries(colorMap)) {
        const item = this.colorSubmenuItems.find((i) => i.id === id);
        if (item) {
          item.label = `${block} ${tier}`;
        }
      }
    }
  }

  /**
   * Builds the SettingsList items for the token speed settings menu.
   *
   * @param config The resolved configuration
   * @param ctx The command context (for the colors submenu)
   * @returns The array of SettingItem objects
   */
  private buildSettingsItems(
    config: TokenSpeedConfig,
    ctx: ExtensionCommandContext,
  ): SettingItem[] {
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
      {
        id: Options.COLORS,
        label: "Colors",
        description: "Customize tier colors (slow, medium, fast, blazing)",
        currentValue: `${coloredBlock(config.colorSlow)} ${coloredBlock(config.colorMedium)} ${coloredBlock(config.colorFast)} ${coloredBlock(config.colorBlazing)}`,
        submenu: (_currentValue: string, done: (value?: string) => void) => {
          const items = buildColorSettingsItems(ctx);
          this.colorSubmenuItems = items;
          this.colorSubmenuList = new SettingsList(
            items,
            Math.min(items.length + 2, 15),
            getSettingsListTheme(),
            (id, newValue) => {
              this.handleSettingChange(id, newValue, ctx);
            },
            () => done(undefined),
          );
          return this.colorSubmenuList;
        },
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

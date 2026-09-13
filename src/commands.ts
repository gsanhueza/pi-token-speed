import type {
  ExtensionCommandContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import {
  SettingsList,
  type SettingItem,
  type TUI,
} from "@earendil-works/pi-tui";
import { buildColorSettingsItems, coloredBlock } from "./color-picker";
import type { TierName, TokenSpeedConfig } from "./config-types";
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
import { buildThresholdSettingsItems } from "./threshold-picker";
import { Validator } from "./validation";

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
  THRESHOLDS = "thresholds",
}

/**
 * Handles commands for the token-speed extension.
 */
export class CommandManager {
  private settingsList: SettingsList | null = null;
  private colorSubmenuList: SettingsList | null = null;
  private colorSubmenuItems: SettingItem[] | null = null;
  private thresholdSubmenuList: SettingsList | null = null;
  private thresholdSubmenuItems: SettingItem[] | null = null;

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

    await ctx.ui.custom<void>((tui, theme, _kb, done) => {
      // Items are built inside the callback so the `theme`/`tui` needed by
      // the framed InputDialog submenus are available; `SettingsList` invokes
      // the submenu factories lazily while this custom UI is active.
      const items = this.buildSettingsItems(config, ctx, theme, tui);
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
    } else if (id.startsWith("colors.")) {
      // Ids are namespaced as "colors.<tier>"; only the changed tier is
      // written so the file accumulates just the user's explicit choices.
      const tier = id.slice("colors.".length) as TierName;
      await settings.setConfig({ colors: { [tier]: newValue } });
      this.refreshColorItems();
    } else if (id.startsWith("thresholds.")) {
      // Ids are namespaced as "thresholds.<tier>"
      const tier = id.slice("thresholds.".length) as TierName;
      // Validate against the fully merged group…
      const merged = {
        ...settings.getConfig().thresholds,
        [tier]: Number(newValue),
      };
      const result = Validator.isValidThresholdOrder({
        ...settings.getConfig(),
        thresholds: merged,
      });
      if (!result.valid) {
        ctx.ui.notify(result.errors!.join("\n"), "warning");
        return;
      }
      // …but persist only the changed tier
      await settings.setConfig({ thresholds: { [tier]: Number(newValue) } });
      this.refreshThresholdItems();
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
   * Refreshes the SettingsList items after a threshold change.
   * Updates both the main menu's Thresholds entry and the
   * submenu's threshold rows so currentValue reflects
   * the new values immediately.
   */
  private refreshThresholdItems(): void {
    const config = settings.getConfig();
    const { thresholds } = config;
    const allThresholds = `${thresholds.slow} | ${thresholds.medium} | ${thresholds.fast} | ${thresholds.blazing}`;

    // Update main menu's Thresholds entry
    if (this.settingsList) {
      this.settingsList.updateValue("thresholds", allThresholds);
    }

    // Update submenu's threshold rows
    if (this.thresholdSubmenuItems) {
      const thresholdMap: Record<string, string> = {
        "thresholds.slow": thresholds.slow.toString(),
        "thresholds.medium": thresholds.medium.toString(),
        "thresholds.fast": thresholds.fast.toString(),
        "thresholds.blazing": thresholds.blazing.toString(),
      };

      for (const [id, value] of Object.entries(thresholdMap)) {
        const item = this.thresholdSubmenuItems.find((i) => i.id === id);
        if (item) {
          item.currentValue = value;
        }
      }
    }
  }

  /**
   * Refreshes the SettingsList items after a color change.
   * Updates both the main menu's Colors entry and the
   * submenu's color rows so colored blocks reflect
   * the new values immediately.
   */
  private refreshColorItems(): void {
    const config = settings.getConfig();
    const { colors } = config;
    const slow = `${coloredBlock(colors.slow)}`;
    const medium = `${coloredBlock(colors.medium)}`;
    const fast = `${coloredBlock(colors.fast)}`;
    const blazing = `${coloredBlock(colors.blazing)}`;
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
        "colors.slow": { block: slow, tier: "Slow" },
        "colors.medium": { block: medium, tier: "Medium" },
        "colors.fast": { block: fast, tier: "Fast" },
        "colors.blazing": { block: blazing, tier: "Blazing" },
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
   * @param ctx The command context
   * @param theme The active theme (for dialog styling)
   * @param tui The TUI instance (for dialog re-renders)
   * @returns The array of SettingItem objects
   */
  private buildSettingsItems(
    config: TokenSpeedConfig,
    ctx: ExtensionCommandContext,
    theme: Theme,
    tui: TUI,
  ): SettingItem[] {
    const {
      display,
      useProviderTokens,
      countStrategy,
      endTpsBehavior,
      icon,
      slidingWindow,
      updateInterval,
      colors,
      thresholds,
    } = config;

    const colorsDisplay = `${coloredBlock(colors.slow)} ${coloredBlock(colors.medium)} ${coloredBlock(colors.fast)} ${coloredBlock(colors.blazing)}`;
    const thresholdsDisplay = `${thresholds.slow} | ${thresholds.medium} | ${thresholds.fast} | ${thresholds.blazing}`;

    return [
      // Display-related settings
      {
        id: Options.DISPLAY,
        label: "Display mode",
        description: "Level of detail to show in the status bar",
        currentValue: DISPLAY_LABELS[display],
        values: Object.values(DISPLAY_LABELS),
      },
      {
        id: Options.ICON,
        label: ICON_LABEL,
        description: "Icon shown before TPS in the status bar",
        currentValue: icon || "(empty)",
        values: [...ICONS, "(empty)"],
      },
      {
        id: Options.UPDATE_INTERVAL,
        label: UPDATE_INTERVAL_LABEL,
        description:
          "How often to update the status bar. 0 = every delta (current behavior).",
        currentValue:
          UPDATE_INTERVAL_LABELS[updateInterval.toString()] ??
          updateInterval.toString(),
        values: Object.values(UPDATE_INTERVAL_LABELS),
      },
      // Token counting settings
      {
        id: Options.USE_PROVIDER_TOKENS,
        label: "Use provider tokens",
        description:
          "Use the provider's token count instead of this extension's counter",
        currentValue: useProviderTokens ? TOGGLE_LABELS.on : TOGGLE_LABELS.off,
        values: Object.values(TOGGLE_LABELS),
      },
      {
        id: Options.COUNT_STRATEGY,
        label: "Count strategy",
        description:
          "Direct counting (server streams tokens) vs estimate counting (server streams chunks)",
        currentValue: COUNT_STRATEGY_LABELS[countStrategy],
        values: Object.values(COUNT_STRATEGY_LABELS),
      },
      // TPS calculation settings
      {
        id: Options.SLIDING_WINDOW,
        label: SLIDING_WINDOW_LABEL,
        description:
          "Time window for TPS calculation. Larger = smoother, smaller = more reactive.",
        currentValue:
          SLIDING_WINDOW_LABELS[slidingWindow.toString()] ??
          slidingWindow.toString(),
        values: Object.values(SLIDING_WINDOW_LABELS),
      },
      {
        id: Options.END_TPS_BEHAVIOR,
        label: "End-of-stream TPS",
        description:
          "What to show after streaming: overall average or last sliding window value",
        currentValue: END_TPS_BEHAVIOR_LABELS[endTpsBehavior],
        values: Object.values(END_TPS_BEHAVIOR_LABELS),
      },
      // Tier customization
      {
        id: Options.THRESHOLDS,
        label: "Thresholds",
        description: "Customize TPS thresholds (slow, medium, fast, blazing)",
        currentValue: thresholdsDisplay,
        submenu: (_currentValue: string, done: (value?: string) => void) => {
          const items = buildThresholdSettingsItems(theme, tui);
          this.thresholdSubmenuItems = items;
          this.thresholdSubmenuList = new SettingsList(
            items,
            Math.min(items.length + 2, 15),
            getSettingsListTheme(),
            (id, newValue) => {
              this.handleSettingChange(id, newValue, ctx);
            },
            () => done(undefined),
          );
          return this.thresholdSubmenuList;
        },
      },
      {
        id: Options.COLORS,
        label: "Colors",
        description: "Customize tier colors (slow, medium, fast, blazing)",
        currentValue: colorsDisplay,
        submenu: (_currentValue: string, done: (value?: string) => void) => {
          const items = buildColorSettingsItems(theme, tui);
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

  /**
   * Inverts a label map, swapping keys and values.
   *
   * E.g., `{ tps: "TPS speed" }` → `{ "TPS speed": "tps" }`.
   * Used to convert the user-facing label back to the config value
   * when a setting is changed via the SettingsList.
   */
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

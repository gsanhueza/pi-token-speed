import type {
  ExtensionCommandContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import {
  AutocompleteItem,
  SettingsList,
  type SettingItem,
  type TUI,
} from "@earendil-works/pi-tui";
import type { TierName, TokenSpeedConfig } from "./config/config-types";
import {
  COUNT_STRATEGY_LABELS,
  DISPLAY_LABELS,
  END_TPS_BEHAVIOR_LABELS,
  ICON_LABEL,
  ICONS,
  invertLabels,
  SLIDING_WINDOW_LABEL,
  SLIDING_WINDOW_LABELS,
  TIERS,
  TOGGLE_LABELS,
  UPDATE_INTERVAL_LABEL,
  UPDATE_INTERVAL_LABELS,
} from "./config/options";
import { settings } from "./config/settings";
import { Validator } from "./config/validation";
import { TokenSpeedEngine } from "./core/engine";
import { buildColorSettingsItems, coloredBlock } from "./ui/color-picker";
import { OverridesEditor } from "./ui/override-editor";
import type { Renderer } from "./ui/renderer";
import { ResettableSettingsList } from "./ui/resettable-settings-list";
import { buildThresholdSettingsItems } from "./ui/threshold-picker";

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
  private colorSubmenuItems: SettingItem[] | null = null;
  private thresholdSubmenuItems: SettingItem[] | null = null;

  constructor(
    private readonly renderer: Renderer,
    private readonly engine: TokenSpeedEngine,
  ) {}

  /**
   * Argument completions for the `/tps` command.
   *
   * @param prefix Prefix written by the user
   * @returns Completions with that prefix
   */
  getArgumentCompletions(prefix: string): AutocompleteItem[] | null {
    const completions: AutocompleteItem[] = [
      {
        value: "overrides",
        label: "overrides",
        description: "Manage per-provider overrides",
      },
    ];
    const filtered = completions.filter((a) => a.value.startsWith(prefix));
    return filtered.length > 0 ? filtered : null;
  }

  /**
   * Handles the `/tps` command.
   *
   * - No arguments: opens a SettingsList to configure display mode, token
   *   counting, timing, icon, sliding window, and colors (base config).
   * - `overrides`: opens the per-provider overrides editor.
   *
   * @param args Command arguments
   * @param ctx The context used by Pi
   */
  async runTps(args: string, ctx: ExtensionCommandContext): Promise<void> {
    if (args === "overrides") {
      await this.runOverridesEditor(ctx);
      return;
    }

    if (args === "") {
      await this.runSettingsMenu(ctx);
      return;
    }

    ctx.ui.notify(
      `Unknown argument "${args}" — usage: /tps [overrides]`,
      "warning",
    );
  }

  /**
   * Runs the base settings menu (unchanged behavior).
   *
   * @param ctx The context used by Pi
   */
  private async runSettingsMenu(ctx: ExtensionCommandContext): Promise<void> {
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
        ctx,
      );
      return this.settingsList;
    });
  }

  /**
   * Runs the interactive per-provider overrides editor for
   * `tokenSpeed.providerOverrides`: a SettingsList of providers (add with
   * `a`, delete with `d` after confirmation), drilling down into each
   * provider's override block (one row per overridable field, `(base)`
   * when unset).
   *
   * Modeled after pi-llama-cpp's `/models overrides`.
   *
   * Writes replace the whole map via `settings.setProviderOverrides()`;
   * write errors are notified and the values are kept unchanged. After
   * closing, the engine re-applies the current provider's effective config
   * so changes take effect immediately (engine-side fields at the next
   * stream start).
   *
   * @param ctx The context used by Pi
   */
  private async runOverridesEditor(
    ctx: ExtensionCommandContext,
  ): Promise<void> {
    if (ctx.mode !== "tui") {
      ctx.ui.notify(
        "/tps overrides requires an interactive session (TUI)",
        "warning",
      );
      return;
    }

    const overrides = settings.getConfig().providerOverrides;
    await ctx.ui.custom<void>(
      (tui, theme, keybindings, done) =>
        new OverridesEditor({
          tui,
          theme,
          keybindings,
          overrides: { ...overrides },
          persist: (next) => settings.setProviderOverrides(next),
          done: () => {
            done(undefined);
            // Re-apply the current provider's effective config so changes
            // take effect immediately (initialize resets the provider, so
            // applyProvider is not short-circuited by the unchanged guard)
            this.engine.initialize();
            this.engine.applyProvider(ctx.model?.provider);
            this.renderer.update(ctx);
          },
          onError: (message) => ctx.ui.notify(message, "error"),
          onWarning: (message) => ctx.ui.notify(message, "warning"),
        }),
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
        display: invertLabels(DISPLAY_LABELS)[newValue],
      });
    } else if (id === Options.USE_PROVIDER_TOKENS) {
      await settings.setConfig({ useProviderTokens: newValue === "On" });
    } else if (id === Options.COUNT_STRATEGY) {
      await settings.setConfig({
        countStrategy: invertLabels(COUNT_STRATEGY_LABELS)[newValue],
      });
    } else if (id === Options.END_TPS_BEHAVIOR) {
      await settings.setConfig({
        endTpsBehavior: invertLabels(END_TPS_BEHAVIOR_LABELS)[newValue],
      });
    } else if (id === Options.ICON) {
      await settings.setConfig({
        icon: newValue === "(empty)" ? "" : newValue,
      });
    } else if (id === Options.UPDATE_INTERVAL) {
      await settings.setConfig({
        updateInterval: Number(invertLabels(UPDATE_INTERVAL_LABELS)[newValue]),
      });
    } else if (id === Options.SLIDING_WINDOW) {
      await settings.setConfig({
        slidingWindow: Number(invertLabels(SLIDING_WINDOW_LABELS)[newValue]),
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
   * `r` shortcut: resets the selected setting to its built-in default
   * (see `defaults.ts`). Per-tier ids (`thresholds.slow`, `colors.fast`)
   * reset just that tier; the Thresholds/Colors group ids reset all
   * tiers at once. The default value is written explicitly (there is no
   * key-removal API), which is equivalent at read time.
   *
   * @param id The setting identifier
   * @param ctx The command context
   */
  private async resetSetting(
    id: string,
    ctx: ExtensionCommandContext,
  ): Promise<void> {
    const defaults = settings.getDefaultConfig();

    switch (id) {
      case Options.DISPLAY:
        await settings.setConfig({ display: defaults.display });
        break;
      case Options.ICON:
        await settings.setConfig({ icon: defaults.icon });
        break;
      case Options.UPDATE_INTERVAL:
        await settings.setConfig({ updateInterval: defaults.updateInterval });
        break;
      case Options.USE_PROVIDER_TOKENS:
        await settings.setConfig({
          useProviderTokens: defaults.useProviderTokens,
        });
        break;
      case Options.COUNT_STRATEGY:
        await settings.setConfig({ countStrategy: defaults.countStrategy });
        break;
      case Options.SLIDING_WINDOW:
        await settings.setConfig({ slidingWindow: defaults.slidingWindow });
        break;
      case Options.END_TPS_BEHAVIOR:
        await settings.setConfig({ endTpsBehavior: defaults.endTpsBehavior });
        break;
      case Options.THRESHOLDS:
        await settings.setConfig({ thresholds: { ...defaults.thresholds } });
        this.refreshThresholdItems();
        break;
      case Options.COLORS:
        await settings.setConfig({ colors: { ...defaults.colors } });
        this.refreshColorItems();
        break;
      default: {
        if (id.startsWith("thresholds.")) {
          const tier = id.slice("thresholds.".length) as TierName;
          await settings.setConfig({
            thresholds: { [tier]: defaults.thresholds[tier] },
          });
          this.refreshThresholdItems();
        } else if (id.startsWith("colors.")) {
          const tier = id.slice("colors.".length) as TierName;
          await settings.setConfig({
            colors: { [tier]: defaults.colors[tier] },
          });
          this.refreshColorItems();
        } else {
          return;
        }
      }
    }

    // Re-render with the latest config (same tail as handleSettingChange)
    this.engine.initialize();
    this.renderer.update(ctx);
  }

  /**
   * Creates the SettingsList for the token speed settings menu.
   * `r` resets the selected setting to its built-in default.
   *
   * @param items The settings items to display
   * @param onChange Callback when a setting value changes
   * @param onClose Callback when the dialog closes
   * @param ctx The command context (for `resetSetting`)
   * @returns The configured SettingsList instance
   */
  private createSettingsList(
    items: SettingItem[],
    onChange: (id: string, newValue: string) => void,
    onClose: () => void,
    ctx: ExtensionCommandContext,
  ): SettingsList {
    return new ResettableSettingsList(
      items,
      items.length,
      getSettingsListTheme(),
      onChange,
      onClose,
      (id) => {
        void this.resetSetting(id, ctx);
      },
    );
  }

  /**
   * Creates the SettingsList for a tier-customization submenu
   * (thresholds or colors). Changes are routed back through
   * `handleSettingChange` so persistence and refreshes stay centralized;
   * `r` resets the selected tier (or the whole group) to its default.
   *
   * @param items The settings items to display
   * @param ctx The command context (for `handleSettingChange`)
   * @param onClose Callback when the dialog closes
   * @returns The configured SettingsList instance
   */
  private createSubmenuList(
    items: SettingItem[],
    ctx: ExtensionCommandContext,
    done: (value?: string) => void,
  ): SettingsList {
    return new ResettableSettingsList(
      items,
      Math.min(items.length + 2, 15),
      getSettingsListTheme(),
      (id, newValue) => {
        this.handleSettingChange(id, newValue, ctx);
      },
      () => done(undefined),
      (id) => {
        void this.resetSetting(id, ctx);
      },
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
    const allThresholds = TIERS.map(({ key }) => thresholds[key]).join(" | ");

    // Update main menu's Thresholds entry
    if (this.settingsList) {
      this.settingsList.updateValue("thresholds", allThresholds);
    }

    // Update submenu's threshold rows
    if (this.thresholdSubmenuItems) {
      for (const { key } of TIERS) {
        const item = this.thresholdSubmenuItems.find(
          (i) => i.id === `thresholds.${key}`,
        );
        if (item) {
          item.currentValue = thresholds[key].toString();
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
    const allColors = TIERS.map(({ key }) => coloredBlock(colors[key])).join(
      " ",
    );

    // Update main menu's Colors entry
    if (this.settingsList) {
      this.settingsList.updateValue("colors", allColors);
    }

    // Update submenu's color rows:
    // - label gets the colored block + tier name
    // - currentValue stays as the hex string
    if (this.colorSubmenuItems) {
      for (const { key, label } of TIERS) {
        const item = this.colorSubmenuItems.find(
          (i) => i.id === `colors.${key}`,
        );
        if (item) {
          item.label = `${coloredBlock(colors[key])} ${label}`;
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

    const colorsDisplay = TIERS.map(({ key }) =>
      coloredBlock(colors[key]),
    ).join(" ");
    const thresholdsDisplay = TIERS.map(({ key }) => thresholds[key]).join(
      " | ",
    );

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
          return this.createSubmenuList(items, ctx, done);
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
          return this.createSubmenuList(items, ctx, done);
        },
      },
    ];
  }
}

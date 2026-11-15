import type {
  ExtensionCommandContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type {
  KeybindingsManager,
  SettingsList,
  TUI,
} from "@earendil-works/pi-tui";
import type { SettingsProvider } from "../config/types";
import type { TokenSpeedEngine } from "../core/engine";
import { SettingsMenu } from "../settings/menu/settings-menu";
import type { Renderer } from "../ui/renderer";
import { BaseMenuHandler } from "./base-handler";

/**
 * Handles the "" (empty) argument — opens the base settings menu.
 */
export class SettingsHandler extends BaseMenuHandler {
  constructor(
    private readonly renderer: Renderer,
    private readonly engine: TokenSpeedEngine,
    private readonly settings: SettingsProvider,
  ) {
    super();
  }

  protected override createMenu(ctx: ExtensionCommandContext): {
    menu: {
      create: (
        tui: TUI,
        theme: Theme,
        keybindings: KeybindingsManager,
        done: (value?: string) => void,
      ) => SettingsList;
    };
    onClosed: () => void;
  } {
    const menu = new SettingsMenu({
      config: this.settings.getConfig(),
      settings: this.settings,
      onSettingChange: () => {
        this.engine.initialize();
        this.renderer.resetThrottle();
        this.renderer.update(ctx);
      },
      onWarning: (message) => ctx.ui.notify(message, "warning"),
    });

    return {
      menu,
      onClosed: () => {},
    };
  }
}

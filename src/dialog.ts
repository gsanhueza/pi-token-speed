import { DynamicBorder, type Theme } from "@earendil-works/pi-coding-agent";
import type { Component, Keybinding, TUI } from "@earendil-works/pi-tui";
import {
  Container,
  getKeybindings,
  Input,
  Spacer,
  Text,
} from "@earendil-works/pi-tui";

/**
 * Base dialog class encapsulating shared UI utilities (frame, hints,
 * themes) so concrete dialogs don't duplicate code.
 */
abstract class BaseDialog {
  protected theme: Theme;
  protected tui: TUI;

  constructor(theme: Theme, tui: TUI) {
    this.theme = theme;
    this.tui = tui;
  }

  // -- shared utilities ------------------------------------------------------

  protected hint(action: Keybinding, description: string): string {
    const keys = getKeybindings().getKeys(action).join("/");
    return (
      this.theme.fg("dim", keys) + this.theme.fg("muted", ` ${description}`)
    );
  }

  protected inputFooter(): string {
    return `${this.hint("tui.select.confirm", "save")} • ${this.hint("tui.select.cancel", "cancel")}`;
  }

  protected createFrame(
    title: string,
    body: Component[],
    footer?: string,
  ): Container {
    const container = new Container();
    container.addChild(
      new DynamicBorder((text) => this.theme.fg("accent", text)),
    );
    container.addChild(
      new Text(this.theme.fg("accent", this.theme.bold(title)), 1, 0),
    );
    for (const child of body) container.addChild(child);
    if (footer) {
      container.addChild(new Spacer(1));
      container.addChild(new Text(this.theme.fg("dim", footer), 1, 0));
    }
    container.addChild(
      new DynamicBorder((text) => this.theme.fg("accent", text)),
    );
    return container;
  }
}

/**
 * Framed text-input dialog used as a `SettingItem.submenu` target.
 * Shows a title, a message, an optional `e.g., <placeholder>` hint and the
 * input itself, framed by accent `DynamicBorder`s with a keybinding footer.
 *
 * Enter commits the validated value via `onSubmit`; Esc cancels via
 * `onCancel`. Invalid values render an inline error line and keep the
 * dialog open for correction.
 */
export class InputDialog extends BaseDialog {
  private readonly options: InputDialogOptions;
  private readonly body = new Container();
  private readonly container: Container;
  private readonly input: Input;
  private errorText: Text | undefined;

  constructor(options: InputDialogOptions) {
    super(options.theme, options.tui);
    this.options = options;

    const initial = options.initialValue ?? "";
    this.input = new Input();
    this.input.setValue(initial);
    for (let i = 0; i < [...initial].length; i++) {
      this.input.handleInput("\x1b[C");
    }
    this.input.onSubmit = (value) => this.submit(value);
    this.input.onEscape = () => options.onCancel();

    this.body.addChild(new Text(this.theme.fg("text", options.message), 1, 0));
    if (options.placeholder) {
      this.body.addChild(
        new Text(this.theme.fg("dim", `e.g., ${options.placeholder}`), 1, 0),
      );
    }
    this.body.addChild(this.input);

    this.container = this.createFrame(
      options.title,
      [this.body],
      this.inputFooter(),
    );
  }

  // -- Component -------------------------------------------------------------

  invalidate(): void {
    this.container.invalidate();
  }

  handleInput(data: string): void {
    this.input.handleInput(data);
    this.tui.requestRender();
  }

  render(width: number): string[] {
    return this.container.render(width);
  }

  // -- Focusable ---------------------------------------------------------------

  get focused(): boolean {
    return this.input.focused;
  }

  set focused(value: boolean) {
    this.input.focused = value;
  }

  // -- helpers -------------------------------------------------------------------

  private submit(raw: string): void {
    const validated = this.options.validate ? this.options.validate(raw) : raw;
    if (validated === null) {
      this.setError(`Invalid value "${raw}"`);
      return;
    }
    this.options.onSubmit(validated);
  }

  private setError(message: string | undefined): void {
    if (this.errorText) {
      this.body.removeChild(this.errorText);
      this.errorText = undefined;
    }
    if (message) {
      this.errorText = new Text(this.theme.fg("error", message), 1, 0);
      this.body.addChild(this.errorText);
    }
    this.tui.requestRender();
  }

  /**
   * Builds a `SettingItem.submenu` factory that opens an `InputDialog`.
   */
  static inputSubmenu =
    (
      theme: Theme,
      tui: TUI,
      title: string,
      message: string,
      placeholder: string | undefined,
      initialValue: string,
      validate?: (raw: string) => string | null,
    ) =>
    (
      _currentValue: string,
      done: (selectedValue?: string) => void,
    ): Component => {
      const dialog = new InputDialog({
        theme,
        tui,
        title,
        message,
        placeholder,
        initialValue,
        validate,
        onSubmit: (value) => done(value),
        onCancel: () => done(undefined),
      });
      dialog.focused = true;
      return dialog;
    };
}

export interface InputDialogOptions {
  theme: Theme;
  tui: TUI;
  title: string;
  message: string;
  placeholder?: string;
  initialValue?: string;
  validate?: (raw: string) => string | null;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

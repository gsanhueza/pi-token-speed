import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DisplayMode, type TokenSpeedConfig } from "./config-types";
import { STATUS_KEY } from "./constants";
import { TokenSpeedEngine } from "./engine";
import { settings } from "./settings";
import { Validator } from "./validation";

/**
 * Renderer for the token-speed status bar.
 */
export class Renderer {
  private lastUpdateTime = 0;

  /**
   * Creates a new Renderer bound to an engine.
   */
  constructor(private readonly engine: TokenSpeedEngine) {}

  /**
   * Updates the status bar, throttled by the configured updateInterval.
   * If updateInterval is undefined, updates happen immediately (current behavior).
   *
   * @param ctx The context used by Pi.
   */
  update(ctx: ExtensionContext): void {
    const config = settings.getConfig();
    const interval = config.updateInterval;

    // If no interval set, update immediately (current behavior)
    if (!interval) {
      this.render(ctx);
      return;
    }

    const now = Date.now();

    if (now - this.lastUpdateTime >= interval) {
      this.render(ctx);
      this.lastUpdateTime = now;
    }
  }

  /**
   * Renders the status bar update without throttling.
   *
   * @param ctx The context used by Pi.
   */
  private render(ctx: ExtensionContext): void {
    const config = settings.getConfig();
    const theme = ctx.ui.theme;

    // Render TPS first
    const { tps } = this.engine;
    const value = tps?.toFixed(1);
    const measurement = value ? `${value} tok/s` : "--";

    const color = this.getColor(config, tps);
    const displayValue = this.colorHex(measurement, color);

    // Build the suffix based on display mode
    const suffix = this.buildSuffix(config.display);

    const icon = config.showIcon ? "⚡ " : "";
    const prefix = theme.fg("dim", `${icon}TPS:`);
    const text = `${prefix} ${displayValue}${suffix}`;

    ctx.ui.setStatus(STATUS_KEY, text);
  }

  /**
   * Applies a custom hex color using 24-bit truecolor ANSI escape codes.
   *
   * @param text The text to colorize
   * @param hex The hex color string, e.g. "#abcdef"
   * @returns The colored text, or the original text if hex is invalid.
   */
  private colorHex(text: string, hex: string): string {
    if (!Validator.isValidHex(hex)) return text;

    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
  }

  /**
   * Maps TPS value to a hex color string, or "" for no color.
   *
   * @param config The resolved configuration
   * @param tps The TPS value to colorize
   * @returns The hex color string, or empty string if no color should be applied.
   */
  private getColor(config: TokenSpeedConfig, tps: number | null): string {
    if (tps == null) return "";

    if (tps >= config.tpsBlazing) return config.colorBlazing;
    if (tps >= config.tpsFast) return config.colorFast;
    if (tps >= config.tpsMedium) return config.colorMedium;
    if (tps >= config.tpsSlow) return config.colorSlow;

    return "";
  }

  /**
   * Formats the stats portion: "<x> tok in <y>s".
   *
   * @param tokenCount The number of tokens
   * @param elapsedSeconds The elapsed time in seconds
   * @returns The formatted stats string.
   */
  private formatStats(tokenCount: number, elapsedSeconds: number): string {
    if (elapsedSeconds <= 0) return `${tokenCount} tok`;
    return `${tokenCount} tok in ${elapsedSeconds.toFixed(1)}s`;
  }

  /**
   * Builds a suffix for the status bar after the TPS measurement.
   *
   * @param display Display mode to check against
   * @returns The suffix to append
   */
  private buildSuffix(display: DisplayMode): string {
    const { ttft, tokenCount: tokens, elapsedSeconds: elapsed } = this.engine;

    switch (display) {
      case "tps":
        return `\u200b`;
      case "ttft":
        return ` (TTFT: ${ttft} ms)\u200b`;
      case "stats":
        return ` (${this.formatStats(tokens, elapsed)})\u200b`;
      case "full":
        return ` (${this.formatStats(tokens, elapsed)} · TTFT: ${ttft} ms)\u200b`;
    }
  }

  /**
   * Renders the first-run placeholder in the status bar.
   *
   * @param ctx The context used by Pi.
   */
  initialize(ctx: ExtensionContext): void {
    const theme = ctx.ui.theme;
    const config = settings.getConfig();
    const icon = config.showIcon ? "⚡ " : "";
    const prefix = theme.fg("dim", `${icon}TPS:`);
    const text = `${prefix} --`;
    ctx.ui.setStatus(STATUS_KEY, text);
  }

  /**
   * Resets the last update time (called on session start).
   */
  resetThrottle(): void {
    this.lastUpdateTime = 0;
  }
}

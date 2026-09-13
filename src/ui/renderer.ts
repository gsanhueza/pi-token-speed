import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DisplayMode, type TokenSpeedConfig } from "../config/config-types";
import { STATUS_KEY } from "../config/constants";
import { settings } from "../config/settings";
import { TokenSpeedEngine } from "../core/engine";
import { truecolor } from "./ansi";

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
    const config = settings.getEffectiveConfig(ctx.model?.provider);
    const theme = ctx.ui.theme;

    // Render TPS first
    const { tps } = this.engine;
    const value = tps?.toFixed(1);
    const measurement = value ? `${value} tok/s` : "--";

    const color = this.getColor(config, tps);
    const displayValue = truecolor(measurement, color);

    // Build the suffix based on display mode
    const suffix = this.buildSuffix(config.display);

    const icon = config.icon ? `${config.icon} ` : "";
    const prefix = theme.fg("dim", `${icon}TPS:`);
    const text = `${prefix} ${displayValue}${suffix}`;

    ctx.ui.setStatus(STATUS_KEY, text);
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

    if (tps >= config.thresholds.blazing) return config.colors.blazing;
    if (tps >= config.thresholds.fast) return config.colors.fast;
    if (tps >= config.thresholds.medium) return config.colors.medium;
    if (tps >= config.thresholds.slow) return config.colors.slow;

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
    const config = settings.getEffectiveConfig(ctx.model?.provider);
    const icon = config.icon ? `${config.icon} ` : "";
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

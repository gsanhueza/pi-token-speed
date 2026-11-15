import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { STATUS_KEY } from "../config/constants";
import type {
  DisplayColors,
  SettingsProvider,
  TokenSpeedConfig,
} from "../config/types";
import { TokenSpeedEngine } from "../core/engine";
import { type DisplayMode } from "../settings/items/display";
import { truecolor } from "./ansi";

/**
 * Options for rendering the stats suffix.
 */
interface StatsFormatOptions {
  /** Show elapsed time in human-readable units. */
  formatDuration?: boolean;
  /** Hex colors for the suffix parts ("" = uncolored). */
  displayColors?: DisplayColors;
}

/**
 * Renderer for the token-speed status bar.
 */
export class Renderer {
  private lastUpdateTime = 0;

  /**
   * Creates a new Renderer bound to an engine and settings provider.
   */
  constructor(
    private readonly engine: TokenSpeedEngine,
    private readonly settings: SettingsProvider,
  ) {}

  /**
   * Updates the status bar, throttled by the configured updateInterval.
   * If updateInterval is undefined, updates happen immediately (current behavior).
   *
   * @param ctx The context used by Pi.
   */
  update(ctx: ExtensionContext): void {
    const config = this.settings.getConfig();
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
    const config = this.settings.resolveConfig(ctx.model?.provider);
    const theme = ctx.ui.theme;

    // Render TPS first
    const { tps } = this.engine;
    const measurement = `${tps.toFixed(1)} tok/s`;

    const color = this.getColor(config, tps);
    const displayValue = truecolor(measurement, color);

    // Build the suffix based on display mode
    const suffix = this.buildSuffix(config.display, {
      formatDuration: config.formatDuration,
      displayColors: config.displayColors,
    });

    const icon = config.icon ? `${config.icon}` : "";
    const label = config.prefix ? `${config.prefix}:` : "";
    const prefix = theme.fg(
      "dim",
      `${icon}${icon && label ? " " : ""}${label}`,
    );
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
  private getColor(config: TokenSpeedConfig, tps: number): string {
    if (tps >= config.thresholds.blazing) return config.colors.blazing;
    if (tps >= config.thresholds.fast) return config.colors.fast;
    if (tps >= config.thresholds.medium) return config.colors.medium;
    if (tps >= config.thresholds.slow) return config.colors.slow;

    return "";
  }

  /**
   * Formats elapsed seconds into human-readable units.
   *
   * Pure formatting: number in → string out. Knows nothing about the
   * `formatDuration` toggle or colors — the caller decides whether to use it
   * and may wrap its output (e.g. with `truecolor()` for display colors).
   *
   * Rules:
   * - < 1min: seconds with 0.1s precision  (0.0s, 0.5s, 45.7s)
   * - 1min–1h: minutes (int) + seconds (0.1s)  (1m 0.0s, 1m 32.3s)
   * - 1h–1d: hours (int) + minutes (int)  (1h 0m, 2h 5m)
   * - ≥ 1d: days (int) + hours (int)  (1d 0h, 3d 7h)
   * - All components shown down to the smallest unit (trailing zeroes allowed)
   */
  private formatDuration(seconds: number): string {
    // Clamp invalid input (negative, NaN, Infinity) to zero
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;

    const totalTenths = Math.round(seconds * 10); // tenths of a second

    if (totalTenths === 0) return "0.0s";

    const days = Math.floor(totalTenths / 864000);
    const remaining = totalTenths % 864000;
    const hours = Math.floor(remaining / 36000);
    const remaining2 = remaining % 36000;
    const minutes = Math.floor(remaining2 / 600);
    const secs = (remaining2 % 600) / 10;

    if (totalTenths >= 864000) {
      // >= 1 day
      return `${days}d ${hours}h`;
    }
    if (totalTenths >= 36000) {
      // >= 1 hour
      return `${hours}h ${minutes}m`;
    }
    if (totalTenths >= 600) {
      // >= 1 minute
      return `${minutes}m ${secs.toFixed(1)}s`;
    }
    // < 1 minute
    return `${secs.toFixed(1)}s`;
  }

  /**
   * Formats the stats portion: "<x> tok in <y>s" (or human-readable units).
   * Colors via `opts.displayColors` when set.
   *
   * @param tokenCount The number of tokens
   * @param elapsedSeconds The elapsed time in seconds
   * @param opts Formatting options (formatDuration, displayColors).
   * @returns The formatted stats string.
   */
  private formatStats(
    tokenCount: number,
    elapsedSeconds: number,
    opts: StatsFormatOptions,
  ): string {
    const colors = opts.displayColors ?? { count: "", elapsed: "", ttft: "" };
    const countColored = colors.count
      ? truecolor(`${tokenCount} tok`, colors.count)
      : `${tokenCount} tok`;

    if (elapsedSeconds <= 0) return countColored;

    const elapsedStr = opts.formatDuration
      ? this.formatDuration(elapsedSeconds)
      : `${elapsedSeconds.toFixed(1)}s`;

    const elapsedColored = colors.elapsed
      ? truecolor(elapsedStr, colors.elapsed)
      : elapsedStr;

    return `${countColored} in ${elapsedColored}`;
  }

  private readonly RENDER_SUFFIXES: Record<
    DisplayMode,
    (
      ttft: number,
      tokens: number,
      elapsed: number,
      opts: StatsFormatOptions,
    ) => string
  > = {
    tps: () => "\u200b",
    ttft: (ttft, _, __, opts) =>
      ` (TTFT: ${
        opts.displayColors?.ttft
          ? truecolor(`${ttft} ms`, opts.displayColors.ttft)
          : `${ttft} ms`
      })\u200b`,
    stats: (_, tokens, elapsed, opts) =>
      ` (${this.formatStats(tokens, elapsed, opts)})\u200b`,
    full: (ttft, tokens, elapsed, opts) =>
      ` (${this.formatStats(tokens, elapsed, opts)} · TTFT: ${
        opts.displayColors?.ttft
          ? truecolor(`${ttft} ms`, opts.displayColors.ttft)
          : `${ttft} ms`
      })\u200b`,
  };

  /**
   * Builds a suffix for the status bar after the TPS measurement.
   *
   * @param display Display mode to check against
   * @param opts Formatting options for the stats portion.
   * @returns The suffix to append
   */
  private buildSuffix(display: DisplayMode, opts: StatsFormatOptions): string {
    const { ttft, tokenCount: tokens, elapsedSeconds: elapsed } = this.engine;
    return this.RENDER_SUFFIXES[display](ttft, tokens, elapsed, opts);
  }

  /**
   * Renders the first-run placeholder in the status bar.
   *
   * @param ctx The context used by Pi.
   */
  initialize(ctx: ExtensionContext): void {
    const theme = ctx.ui.theme;
    const config = this.settings.resolveConfig(ctx.model?.provider);
    const icon = config.icon ? `${config.icon}` : "";
    const label = config.prefix ? `${config.prefix}:` : "";
    const prefix = theme.fg(
      "dim",
      `${icon}${icon && label ? " " : ""}${label}`,
    );
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

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { STATUS_KEY } from "./constants";
import { TokenSpeedEngine } from "./engine";
import { type TokenSpeedConfig } from "./interfaces";
import { settings } from "./settings";
import { Validator } from "./validation";

/**
 * Renderer for the token-speed status bar.
 */
export class Renderer {
  private readonly engine: TokenSpeedEngine;

  /**
   * Creates a new Renderer bound to an engine.
   */
  constructor(engine: TokenSpeedEngine) {
    this.engine = engine;
  }

  /**
   * Applies a custom hex color using 24-bit truecolor ANSI escape codes.
   *
   * @param text The text to colorize
   * @param hex The hex color string, e.g. "#abcdef"
   * @returns The colored text, or the original text if hex is invalid
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
   * @returns The hex color string
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
   * @returns The formatted stats string
   */
  private formatStats(tokenCount: number, elapsedSeconds: number): string {
    if (elapsedSeconds <= 0) return `${tokenCount} tok`;
    return `${tokenCount} tok in ${elapsedSeconds.toFixed(1)}s`;
  }

  /**
   * Formats the TTFT portion: "TTFT: <time> ms".
   *
   * @param ttft The TTFT value in milliseconds
   * @returns The formatted TTFT string
   */
  private formatTTFT(ttft: number): string {
    return `TTFT: ${ttft} ms`;
  }

  /**
   * Builds a suffix for the status bar after the TPS measurement.
   *
   * @param display Display mode to check against
   * @returns The suffix to append
   */
  private buildSuffix(display: string): string {
    const { ttft, tokenCount, elapsedSeconds } = this.engine;

    switch (display) {
      case "ttft":
        return ` (${this.formatTTFT(ttft)})`;

      case "stats":
        return ` (${this.formatStats(tokenCount, elapsedSeconds)})`;

      case "full": {
        const parts: string[] = [
          this.formatStats(tokenCount, elapsedSeconds),
          this.formatTTFT(ttft),
        ];
        return ` (${parts.join(" · ")})`;
      }
      default:
        // Zero-width space
        return "\u200b";
    }
  }

  /**
   * Renders the first-run placeholder and resets the flag.
   * Validates config and warns on errors before updating the status.
   *
   * @param ctx The context used by Pi.
   */
  async initialize(ctx: ExtensionContext): Promise<void> {
    const { errors } = await settings.getConfig();

    if (errors.length > 0) {
      const message = ["[pi-token-speed]", ...errors].join("\n");
      ctx.ui.notify(message, "warning");
    }

    const theme = ctx.ui.theme;
    const text = `${theme.fg("dim", "⚡ TPS:")} --`;
    ctx.ui.setStatus(STATUS_KEY, text);
  }

  /**
   * Updates the status bar with the given context.
   *
   * @param ctx The context used by Pi.
   */
  async update(ctx: ExtensionContext): Promise<void> {
    const { config } = await settings.getConfig();
    const theme = ctx.ui.theme;

    // Render TPS first
    const { tps } = this.engine;
    const value = tps?.toFixed(1);
    const measurement = value ? `${value} tok/s` : "--";

    const color = this.getColor(config, tps);
    const displayValue = this.colorHex(measurement, color);

    // Build the suffix based on display mode
    const suffix = this.buildSuffix(config.display);
    const text = `${theme.fg("dim", "⚡ TPS:")} ${displayValue}${suffix}`;

    ctx.ui.setStatus(STATUS_KEY, text);
  }
}

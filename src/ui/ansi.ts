import { Validator } from "../config/validation";

/**
 * Applies a hex color to text using 24-bit truecolor ANSI escape codes.
 *
 * @param text The text to colorize.
 * @param hex The hex color string, e.g. "#abcdef".
 * @returns The colored text, or the original text if hex is invalid.
 */
export function truecolor(text: string, hex: string): string {
  if (!Validator.isValidHex(hex)) return text;

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}

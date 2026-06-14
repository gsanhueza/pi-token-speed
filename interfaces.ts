import type { CountStrategy, DisplayMode } from "./types";

/**
 * Configuration for the token-speed extension.
 * All fields can be overridden via ~/.pi/agent/settings.json under the "tokenSpeed" key.
 */
export interface TokenSpeedConfig {
  display: DisplayMode;
  tpsSlow: number;
  tpsMedium: number;
  tpsFast: number;
  tpsBlazing: number;
  colorSlow: string;
  colorMedium: string;
  colorFast: string;
  colorBlazing: string;
  slidingWindow: number;
  useProviderTokens: boolean;
  countStrategy: CountStrategy;
}

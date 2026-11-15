import { vi } from "vitest";

import type {
  SettingsProvider,
  TokenSpeedConfig,
} from "../../src/config/types";

/** Default TokenSpeedConfig used by all tests. */
export const defaultConfig: TokenSpeedConfig = {
  display: "tps",
  slidingWindow: 5000,
  useProviderTokens: false,
  countStrategy: "direct",
  endTpsBehavior: "average",
  icon: "⚡",
  prefix: "TPS",
  updateInterval: 0,
  formatDuration: false,
  suffixTheme: "",
  thresholds: { slow: 10, medium: 30, fast: 60, blazing: 100 },
  colors: {
    slow: "#ffcc00",
    medium: "#88cc00",
    fast: "#44cc44",
    blazing: "#00ccff",
  },
  displayColors: { count: "", elapsed: "", ttft: "" },
  providerOverrides: {},
};

/** Factory that returns a fresh default config (typed). */
export function makeDefaults(): TokenSpeedConfig {
  return { ...defaultConfig };
}

/**
 * Creates a controllable SettingsProvider mock.
 * Use `mock.setConfig(partial)` to mutate state, or replace `mock.setConfig` directly.
 */
export function makeSettingsMock(
  initial: Partial<TokenSpeedConfig> = {},
): SettingsProvider {
  let current: TokenSpeedConfig = {
    ...defaultConfig,
    ...initial,
  } as TokenSpeedConfig;

  const defaultSetConfig: SettingsProvider["setConfig"] = async (partial) => {
    current = { ...current, ...partial } as TokenSpeedConfig;
  };

  return {
    getConfig: () => current,
    resolveConfig: (_providerId?: string) => current,
    getErrors: () => [],
    getDefaultConfig: makeDefaults,
    setConfig: vi.fn(defaultSetConfig),
    resetKeys: vi.fn(async (_keys: string[]) => {
      current = makeDefaults();
    }),
    setProviderOverrides: async (overrides: Record<string, unknown>) => {
      current = { ...current, providerOverrides: overrides as any };
    },
    initialize: async () => current,
  };
}

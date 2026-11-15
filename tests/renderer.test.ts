import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AgentEndEvent,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { EventManager } from "../src/core/events";
import { STATUS_KEY } from "../src/config/constants";
import type { TokenSpeedConfig } from "../src/config/types";
import { TokenSpeedEngine } from "../src/core/engine";
import { Renderer } from "../src/ui/renderer";

// Mutable config so tests can override settings mid-flight
const configRef: { current: TokenSpeedConfig } = {
  current: {
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
  },
};

const makeConfig = (
  partial: Partial<TokenSpeedConfig> = {},
): TokenSpeedConfig => ({
  ...configRef.current,
  ...partial,
});

// ---------- helpers ----------

const mockTheme: any = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
  italic: (text: string) => text,
  underline: (text: string) => text,
  inverse: (text: string) => text,
  strikethrough: (text: string) => text,
  getFgAnsi: (_color: string) => "",
  getBgAnsi: (_color: string) => "",
  getColorMode: () => "truecolor" as const,
  getThinkingBorderColor: () => (s: string) => s,
  getBashModeBorderColor: () => (s: string) => s,
};

// Shared settings mock that always reads configRef.current
const settings = {
  getConfig: () => configRef.current,
  resolveConfig: () => configRef.current,
  setConfig: async () => {},
  resetKeys: async () => {},
  setProviderOverrides: async () => {},
  getDefaultConfig: () => configRef.current,
  getErrors: () => [],
  initialize: async () => configRef.current,
};

const makeEngine = (
  overrides?: Partial<TokenSpeedEngine>,
): TokenSpeedEngine => {
  const engine = new TokenSpeedEngine(settings as any);
  engine.initialize();
  engine.start();
  Object.assign(engine, overrides);
  return engine;
};

const makeContext = (
  overrides?: Partial<ExtensionContext>,
): ExtensionContext => ({
  ui: {
    setStatus: vi.fn(),
    theme: {
      fg: (_color: string, text: string) => text,
      bg: (_color: string, text: string) => text,
      bold: (text: string) => text,
      italic: (text: string) => text,
      underline: (text: string) => text,
      inverse: (text: string) => text,
      strikethrough: (text: string) => text,
      getFgAnsi: (_color: string) => "",
      getBgAnsi: (_color: string) => "",
      getColorMode: () => "truecolor" as const,
      getThinkingBorderColor: () => (s: string) => s,
      getBashModeBorderColor: () => (s: string) => s,
    } as any,
    ...((overrides as any)?.ui ?? {}),
  },
  model: undefined as any,
  mode: "tui" as const,
  hasUI: true,
  cwd: "/tmp",
  sessionManager: {} as any,
  modelRegistry: {} as any,
  scopedModels: [],
  isIdle: () => true,
  isProjectTrusted: () => true,
  signal: undefined,
  abort: () => {},
  hasPendingMessages: () => false,
  shutdown: () => {},
  getContextUsage: () => undefined,
  compact: () => {},
  getSystemPrompt: () => "",
  ...overrides,
});

// ---------- tests ----------

describe("Renderer", () => {
  let engine: TokenSpeedEngine;
  let ctx: ExtensionContext;
  let renderer: Renderer;

  beforeEach(() => {
    // Reset to clean default config (no throttle)
    configRef.current = {
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
    engine = makeEngine();
    ctx = makeContext();
    renderer = new Renderer(engine, settings as any);
  });

  // ---- update / throttle ----

  describe("update", () => {
    it("calls render when no interval is set (immediate)", () => {
      const renderSpy = vi.spyOn(renderer as any, "render");
      renderer.update(ctx);
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it("calls render immediately on first call with interval", () => {
      const renderSpy = vi.spyOn(renderer as any, "render");
      (renderer as any).lastUpdateTime = 0;
      renderer.update(ctx);
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it("throttles subsequent calls within the interval", () => {
      configRef.current = makeConfig({ updateInterval: 500 });
      renderer = new Renderer(engine, settings as any);
      const renderSpy = vi.spyOn(renderer as any, "render");

      renderer.update(ctx);
      expect(renderSpy).toHaveBeenCalledTimes(1);

      // Call again before interval elapses
      renderer.update(ctx);
      expect(renderSpy).toHaveBeenCalledTimes(1);

      // Advance time past the interval
      (renderer as any).lastUpdateTime = Date.now() - 600;
      renderer.update(ctx);
      expect(renderSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ---- render (status bar text) ----

  describe("render", () => {
    it("sets the status bar with the TPS measurement", () => {
      const setStatusSpy = vi.spyOn(ctx.ui, "setStatus");
      engine["_tps"] = 42.5;

      (renderer as any).render(ctx);

      expect(setStatusSpy).toHaveBeenCalledWith(
        STATUS_KEY,
        expect.stringContaining("42.5 tok/s"),
      );
    });

    it("uses the configured icon as prefix", () => {
      const setStatusSpy = vi.spyOn(ctx.ui, "setStatus");
      configRef.current = makeConfig({ icon: "🚀" });
      renderer = new Renderer(engine, settings as any);
      engine["_tps"] = 10;

      (renderer as any).render(ctx);

      expect(setStatusSpy).toHaveBeenCalledWith(
        STATUS_KEY,
        expect.stringContaining("🚀"),
      );
    });

    it("omits the icon when disabled", () => {
      const setStatusSpy = vi.spyOn(ctx.ui, "setStatus");
      configRef.current = makeConfig({ icon: "" });
      renderer = new Renderer(engine, settings as any);
      engine["_tps"] = 10;

      (renderer as any).render(ctx);

      expect(setStatusSpy).toHaveBeenCalledWith(
        STATUS_KEY,
        expect.not.stringContaining("🚀"),
      );
    });

    it("uses a custom prefix label", () => {
      const setStatusSpy = vi.spyOn(ctx.ui, "setStatus");
      configRef.current = makeConfig({ prefix: "Speed" });
      renderer = new Renderer(engine, settings as any);
      engine["_tps"] = 10;

      (renderer as any).render(ctx);

      expect(setStatusSpy).toHaveBeenCalledWith(
        STATUS_KEY,
        expect.stringContaining("Speed:"),
      );
    });

    it("omits the label but keeps the icon when prefix is empty", () => {
      const setStatusSpy = vi.spyOn(ctx.ui, "setStatus");
      configRef.current = makeConfig({ prefix: "" });
      renderer = new Renderer(engine, settings as any);
      engine["_tps"] = 10;

      (renderer as any).render(ctx);

      expect(setStatusSpy).toHaveBeenCalledWith(
        STATUS_KEY,
        expect.stringContaining("⚡"),
      );
    });

    it("applies color based on thresholds", () => {
      const setStatusSpy = vi.spyOn(ctx.ui, "setStatus");

      // blazing tier — #00ccff = rgb(0, 204, 255)
      engine["_tps"] = 150;
      (renderer as any).render(ctx);
      expect(setStatusSpy).toHaveBeenCalledWith(
        STATUS_KEY,
        expect.stringContaining("\x1b[38;2;0;204;255m"),
      );

      // fast tier — #44cc44 = rgb(68, 204, 68)
      engine["_tps"] = 75;
      (renderer as any).render(ctx);
      expect(setStatusSpy).toHaveBeenCalledWith(
        STATUS_KEY,
        expect.stringContaining("\x1b[38;2;68;204;68m"),
      );

      // medium tier — #88cc00 = rgb(136, 204, 0)
      engine["_tps"] = 40;
      (renderer as any).render(ctx);
      expect(setStatusSpy).toHaveBeenCalledWith(
        STATUS_KEY,
        expect.stringContaining("\x1b[38;2;136;204;0m"),
      );

      // slow tier — #ffcc00 = rgb(255, 204, 0)
      engine["_tps"] = 20;
      (renderer as any).render(ctx);
      expect(setStatusSpy).toHaveBeenCalledWith(
        STATUS_KEY,
        expect.stringContaining("\x1b[38;2;255;204;0m"),
      );

      // below slow — no color (empty string)
      engine["_tps"] = 5;
      (renderer as any).render(ctx);
      expect(setStatusSpy).toHaveBeenCalledWith(
        STATUS_KEY,
        expect.not.stringContaining("\x1b[38;2;"),
      );
    });

    it.each([
      ["tps", "tps"],
      ["ttft", "ttft"],
      ["stats", "stats"],
      ["full", "full"],
    ])("renders suffix for display mode '%s'", (mode: string) => {
      const setStatusSpy = vi.spyOn(ctx.ui, "setStatus");
      configRef.current = makeConfig({ display: mode as any });
      renderer = new Renderer(engine, settings as any);
      engine["_tps"] = 30;

      (renderer as any).render(ctx);

      expect(setStatusSpy).toHaveBeenCalled();
    });
  });

  // ---- getColor ----

  describe("getColor", () => {
    it("returns blazing color for high TPS", () => {
      const config = makeConfig();
      const color = (renderer as any).getColor(config, 150);
      expect(color).toBe("#00ccff");
    });

    it("returns fast color for medium-high TPS", () => {
      const config = makeConfig();
      const color = (renderer as any).getColor(config, 75);
      expect(color).toBe("#44cc44");
    });

    it("returns medium color for medium TPS", () => {
      const config = makeConfig();
      const color = (renderer as any).getColor(config, 40);
      expect(color).toBe("#88cc00");
    });

    it("returns slow color for low TPS", () => {
      const config = makeConfig();
      const color = (renderer as any).getColor(config, 20);
      expect(color).toBe("#ffcc00");
    });

    it("returns empty string for very low TPS", () => {
      const config = makeConfig();
      const color = (renderer as any).getColor(config, 5);
      expect(color).toBe("");
    });

    it("handles exact boundary values", () => {
      const config = makeConfig({
        thresholds: { slow: 10, medium: 30, fast: 60, blazing: 100 },
      });
      expect((renderer as any).getColor(config, 10)).toBe("#ffcc00");
      expect((renderer as any).getColor(config, 30)).toBe("#88cc00");
      expect((renderer as any).getColor(config, 60)).toBe("#44cc44");
      expect((renderer as any).getColor(config, 100)).toBe("#00ccff");
    });
  });

  // ---- formatDuration ----

  describe("formatDuration", () => {
    it("shows plain seconds with one decimal below a minute", () => {
      expect((renderer as any).formatDuration(45.67)).toBe("45.7s");
      expect((renderer as any).formatDuration(0)).toBe("0.0s");
      expect((renderer as any).formatDuration(59.9)).toBe("59.9s");
    });

    it("shows minutes plus seconds below an hour", () => {
      expect((renderer as any).formatDuration(92.3)).toBe("1m 32.3s");
      expect((renderer as any).formatDuration(3599)).toBe("59m 59.0s");
    });

    it("shows hours plus minutes below a day", () => {
      expect((renderer as any).formatDuration(3600)).toBe("1h 0m");
      expect((renderer as any).formatDuration(7325)).toBe("2h 2m");
    });

    it("shows days plus hours at a day or more", () => {
      expect((renderer as any).formatDuration(86400)).toBe("1d 0h");
      expect((renderer as any).formatDuration(3 * 86400 + 7 * 3600)).toBe(
        "3d 7h",
      );
    });

    it("never renders 60.0s by rounding into the next unit", () => {
      // 59.96 rounds to 60.0 → becomes 1m 0.0s
      expect((renderer as any).formatDuration(59.96)).toBe("1m 0.0s");
      // 3599.97 rounds to 3600.0 → becomes 1h 0m
      expect((renderer as any).formatDuration(3599.97)).toBe("1h 0m");
    });

    it("clamps invalid input to zero", () => {
      expect((renderer as any).formatDuration(-5)).toBe("0.0s");
      expect((renderer as any).formatDuration(Number.NaN)).toBe("0.0s");
      expect((renderer as any).formatDuration(Number.POSITIVE_INFINITY)).toBe(
        "0.0s",
      );
    });
  });

  // ---- formatStats ----

  describe("formatStats", () => {
    const opts = { theme: mockTheme };

    it("shows tokens only when elapsed is zero", () => {
      const result = (renderer as any).formatStats(100, 0, opts);
      expect(result).toBe("100 tok");
    });

    it("shows tokens and elapsed time", () => {
      const result = (renderer as any).formatStats(100, 5.3, opts);
      expect(result).toBe("100 tok in 5.3s");
    });

    it("rounds elapsed to one decimal place", () => {
      const result = (renderer as any).formatStats(100, 3.14159, opts);
      expect(result).toBe("100 tok in 3.1s");
    });

    it("uses human-readable units when formatDuration is set", () => {
      expect(
        (renderer as any).formatStats(150, 92.34, {
          ...opts,
          formatDuration: true,
        }),
      ).toBe("150 tok in 1m 32.3s");
    });
  });

  // ---- buildSuffix ----

  describe("buildSuffix", () => {
    const opts = { theme: mockTheme };

    it('returns a zero-width space for "tps" mode', () => {
      const suffix = (renderer as any).buildSuffix("tps", opts);
      expect(suffix).toBe("\u200b");
    });

    it('includes TTFT for "ttft" mode', () => {
      engine["_ttftEnd"] = 500;
      engine["_ttftStart"] = 0;
      const suffix = (renderer as any).buildSuffix("ttft", opts);
      expect(suffix).toContain("(TTFT: 500 ms)");
    });

    it('includes stats for "stats" mode', () => {
      engine["_tokenCount"] = 200;
      engine["_startTime"] = Date.now() - 5000;
      engine["_endTime"] = Date.now();
      const suffix = (renderer as any).buildSuffix("stats", opts);
      expect(suffix).toContain("200 tok in");
      expect(suffix).toContain(".0s");
    });

    it('includes both stats and TTFT for "full" mode', () => {
      engine["_tokenCount"] = 200;
      engine["_startTime"] = Date.now() - 5000;
      engine["_endTime"] = Date.now();
      engine["_ttftEnd"] = 300;
      engine["_ttftStart"] = 0;
      const suffix = (renderer as any).buildSuffix("full", opts);
      expect(suffix).toContain("200 tok in");
      expect(suffix).toContain(".0s");
      expect(suffix).toContain("TTFT: 300 ms");
    });
  });

  // ---- initialize ----

  describe("initialize", () => {
    beforeEach(() => {
      configRef.current = {
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
      renderer = new Renderer(engine, settings as any);
    });

    it("sets the status bar to a placeholder with TPS: --", () => {
      const setStatusSpy = vi.spyOn(ctx.ui, "setStatus");

      renderer.initialize(ctx);

      expect(setStatusSpy).toHaveBeenCalledWith(STATUS_KEY, "⚡ TPS: --");
    });

    it("omits icon when icon is empty", () => {
      const setStatusSpy = vi.spyOn(ctx.ui, "setStatus");
      configRef.current = makeConfig({ icon: "" });
      renderer = new Renderer(engine, settings as any);

      renderer.initialize(ctx);

      expect(setStatusSpy).toHaveBeenCalledWith(STATUS_KEY, "TPS: --");
    });

    it("omits the label but keeps the icon when prefix is empty", () => {
      const setStatusSpy = vi.spyOn(ctx.ui, "setStatus");
      configRef.current = makeConfig({ prefix: "" });
      renderer = new Renderer(engine, settings as any);

      renderer.initialize(ctx);

      expect(setStatusSpy).toHaveBeenCalledWith(STATUS_KEY, "⚡ --");
    });

    it("uses a custom prefix label", () => {
      const setStatusSpy = vi.spyOn(ctx.ui, "setStatus");
      configRef.current = makeConfig({ prefix: "Speed" });
      renderer = new Renderer(engine, settings as any);

      renderer.initialize(ctx);

      expect(setStatusSpy).toHaveBeenCalledWith(STATUS_KEY, "⚡ Speed: --");
    });

    it("uses a custom prefix with an icon", () => {
      const setStatusSpy = vi.spyOn(ctx.ui, "setStatus");
      configRef.current = makeConfig({ prefix: "Speed", icon: "🔥" });
      renderer = new Renderer(engine, settings as any);

      renderer.initialize(ctx);

      expect(setStatusSpy).toHaveBeenCalledWith(STATUS_KEY, "🔥 Speed: --");
    });
  });

  // ---- resetThrottle ----

  describe("resetThrottle", () => {
    it("resets lastUpdateTime to 0", () => {
      (renderer as any).lastUpdateTime = 1000;
      renderer.resetThrottle();
      expect((renderer as any).lastUpdateTime).toBe(0);
    });

    it("unblocks update() even when the interval has not elapsed", () => {
      configRef.current = makeConfig({ updateInterval: 50000 });
      renderer = new Renderer(engine, settings as any);
      const renderSpy = vi.spyOn(renderer as any, "render");

      // Simulate a recent mid-stream render
      (renderer as any).lastUpdateTime = Date.now();

      // resetThrottle + update should fire render
      renderer.resetThrottle();
      renderer.update(ctx);
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ---- formatStats (displayColors) ----

  describe("formatStats (displayColors)", () => {
    const baseOpts = { theme: mockTheme };

    it("returns plain text when no colors are set", () => {
      const colors = { count: "", elapsed: "", ttft: "" };
      expect(
        (renderer as any).formatStats(150, 6.0, {
          ...baseOpts,
          displayColors: colors,
        }),
      ).toBe("150 tok in 6.0s");
    });

    it("colors the count when count color is set", () => {
      const colors = { count: "#00ff88", elapsed: "", ttft: "" };
      const result = (renderer as any).formatStats(150, 6.0, {
        ...baseOpts,
        displayColors: colors,
      });
      expect(result).toContain("\x1b[38;2;0;255;136m150 tok\x1b[0m");
    });

    it("colors the elapsed when elapsed color is set", () => {
      const colors = { count: "", elapsed: "#ffaa00", ttft: "" };
      const result = (renderer as any).formatStats(150, 6.0, {
        ...baseOpts,
        displayColors: colors,
      });
      expect(result).toContain("\x1b[38;2;255;170;0m6.0s\x1b[0m");
    });

    it("colors all parts when all colors are set", () => {
      const colors = { count: "#00ff88", elapsed: "#ffaa00", ttft: "" };
      const result = (renderer as any).formatStats(150, 6.0, {
        ...baseOpts,
        displayColors: colors,
      });
      expect(result).toContain("\x1b[38;2;0;255;136m150 tok\x1b[0m");
      expect(result).toContain("\x1b[38;2;255;170;0m6.0s\x1b[0m");
    });

    it("returns count-only when elapsed is zero", () => {
      const colors = { count: "", elapsed: "", ttft: "" };
      expect(
        (renderer as any).formatStats(150, 0, {
          ...baseOpts,
          displayColors: colors,
        }),
      ).toBe("150 tok");
    });

    it("colors the formatted duration when formatDuration is on", () => {
      const colors = { count: "", elapsed: "#ffaa00", ttft: "" };
      const result = (renderer as any).formatStats(150, 92.34, {
        ...baseOpts,
        formatDuration: true,
        displayColors: colors,
      });
      expect(result).toContain("\x1b[38;2;255;170;0m1m 32.3s\x1b[0m");
    });

    it("lowercases accepted hex values", () => {
      const result = (renderer as any).formatStats(100, 1.0, {
        ...baseOpts,
        displayColors: { count: "#AABBCC", elapsed: "", ttft: "" },
      });
      expect(result).toContain("\x1b[38;2;170;187;204m");
    });
  });

  // ---- formatStats (suffixTheme) ----

  describe("formatStats (suffixTheme)", () => {
    const colorOpts = { theme: mockTheme, suffixTheme: "dim" };

    it("applies dim to uncolored parts when suffixTheme is true", () => {
      const result = (renderer as any).formatStats(150, 6.0, { ...colorOpts });
      // mockTheme.fg returns text unchanged, but the call path is exercised
      expect(result).toBe("150 tok in 6.0s");
    });

    it("mixes colored and dimmed parts", () => {
      const result = (renderer as any).formatStats(150, 6.0, {
        ...colorOpts,
        displayColors: { count: "#00ff88", elapsed: "", ttft: "" },
      });
      expect(result).toContain("\x1b[38;2;0;255;136m150 tok\x1b[0m");
      expect(result).toContain("in 6.0s");
    });
  });

  // ---- buildSuffix (displayColors) ----

  describe("buildSuffix (displayColors)", () => {
    it("applies colors in stats mode", () => {
      configRef.current = makeConfig({
        display: "stats",
        displayColors: { count: "#00ff88", elapsed: "#ffaa00", ttft: "" },
      });
      renderer = new Renderer(engine, settings as any);
      engine["_tokenCount"] = 200;
      engine["_startTime"] = Date.now() - 5000;
      engine["_endTime"] = Date.now();

      const setStatusSpy = vi.spyOn(ctx.ui, "setStatus");
      (renderer as any).render(ctx);

      expect(setStatusSpy).toHaveBeenCalled();
      const calledWith = setStatusSpy.mock.calls[0][1] as string;
      expect(calledWith).toContain("\x1b[38;2;0;255;136m");
      expect(calledWith).toContain("\x1b[38;2;255;170;0m");
    });

    it("applies TTFT color in ttft mode", () => {
      configRef.current = makeConfig({
        display: "ttft",
        displayColors: { count: "", elapsed: "", ttft: "#44ddff" },
      });
      renderer = new Renderer(engine, settings as any);
      engine["_ttftEnd"] = 450;
      engine["_ttftStart"] = 0;

      const setStatusSpy = vi.spyOn(ctx.ui, "setStatus");
      (renderer as any).render(ctx);

      expect(setStatusSpy).toHaveBeenCalled();
      const calledWith = setStatusSpy.mock.calls[0][1] as string;
      expect(calledWith).toContain("\x1b[38;2;68;221;255m");
    });

    it("applies all colors in full mode", () => {
      configRef.current = makeConfig({
        display: "full",
        displayColors: {
          count: "#00ff88",
          elapsed: "#ffaa00",
          ttft: "#44ddff",
        },
      });
      renderer = new Renderer(engine, settings as any);
      engine["_tokenCount"] = 200;
      engine["_startTime"] = Date.now() - 5000;
      engine["_endTime"] = Date.now();
      engine["_ttftEnd"] = 300;
      engine["_ttftStart"] = 0;

      const setStatusSpy = vi.spyOn(ctx.ui, "setStatus");
      (renderer as any).render(ctx);

      expect(setStatusSpy).toHaveBeenCalled();
      const calledWith = setStatusSpy.mock.calls[0][1] as string;
      expect(calledWith).toContain("\x1b[38;2;0;255;136m");
      expect(calledWith).toContain("\x1b[38;2;255;170;0m");
      expect(calledWith).toContain("\x1b[38;2;68;221;255m");
    });
  });

  // ---- handleAgentEnd integration ----

  describe("handleAgentEnd integration", () => {
    it("calls resetThrottle before update so the final render is not suppressed", () => {
      configRef.current = makeConfig({ updateInterval: 50000 });
      const resetSpy = vi.spyOn(renderer, "resetThrottle");
      const updateSpy = vi.spyOn(renderer as any, "update");

      const eventManager = new EventManager(engine, renderer, settings as any);
      const ctx = makeContext();
      const event: AgentEndEvent = {
        messages: [{ role: "assistant", usage: { output: 42 } }],
      } as AgentEndEvent;

      eventManager.handleAgentEnd(event, ctx);

      expect(resetSpy).toHaveBeenCalledOnce();
      expect(updateSpy).toHaveBeenCalledOnce();
      // resetThrottle must come before update
      const resetIdx = resetSpy.mock.invocationCallOrder[0];
      const updateIdx = updateSpy.mock.invocationCallOrder[0];
      expect(resetIdx).toBeLessThan(updateIdx);
    });
  });
});

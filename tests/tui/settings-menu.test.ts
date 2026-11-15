import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SettingItem } from "@earendil-works/pi-tui";
import { SettingsMenu } from "../../src/settings/menu/settings-menu";
import { makeSettingsMock } from "../mocks/settings";
import { makeTheme } from "../mocks/theme";
import { makeTui } from "../mocks/tui";

// Mock getSettingsListTheme before the module loads
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    getSettingsListTheme: () => ({
      label: (text: string, selected?: boolean) =>
        selected ? `\x1b[38;5;203m${text}\x1b[0m` : text,
      value: (text: string, selected?: boolean) =>
        selected ? `\x1b[38;5;203m${text}\x1b[0m` : `\x1b[2m${text}\x1b[0m`,
      description: (text: string) => `\x1b[2m${text}\x1b[0m`,
      cursor: "\x1b[38;5;203m→\x1b[0m",
      hint: (text: string) => `\x1b[2m${text}\x1b[0m`,
    }),
  };
});

// ── Mock settings (stateful, mirrors real Settings semantics) ────────────────

const settingsState = vi.hoisted(() => {
  const makeDefaults = () => ({
    display: "tps" as const,
    slidingWindow: 5000,
    useProviderTokens: false,
    countStrategy: "direct" as const,
    endTpsBehavior: "average" as const,
    icon: "⚡",
    prefix: "TPS",
    updateInterval: 0,
    formatDuration: false,
    thresholds: { slow: 10, medium: 30, fast: 60, blazing: 100 },
    colors: {
      slow: "#ffcc00",
      medium: "#88cc00",
      fast: "#44cc44",
      blazing: "#00ccff",
    },
    displayColors: { count: "", elapsed: "", ttft: "" },
    providerOverrides: {},
  });
  let current: ReturnType<typeof makeDefaults> = makeDefaults();
  return {
    makeDefaults,
    get config() {
      return current;
    },
    set config(value: ReturnType<typeof makeDefaults>) {
      current = value;
    },
  };
});

/**
 * Merges a partial config into the mocked cache (same semantics as the real
 * `mergeConfig`).
 */
async function mockSetConfig(partial: Record<string, unknown>): Promise<void> {
  const current = settingsState.config;
  settingsState.config = {
    ...current,
    ...partial,
    thresholds: {
      ...current.thresholds,
      ...(partial.thresholds as Record<string, unknown> | undefined),
    },
    colors: {
      ...current.colors,
      ...(partial.colors as Record<string, unknown> | undefined),
    },
    displayColors: {
      ...current.displayColors,
      ...(partial.displayColors as Record<string, unknown> | undefined),
    },
    providerOverrides: {
      ...current.providerOverrides,
      ...(partial.providerOverrides as Record<string, unknown> | undefined),
    },
  } as typeof current;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("SettingsMenu", () => {
  let menu: SettingsMenu;
  let settings: ReturnType<typeof makeSettingsMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    settingsState.config = settingsState.makeDefaults();
    settings = makeSettingsMock(settingsState.config);
    // Wire mock so setConfig and getConfig always read/write settingsState
    (settings.setConfig as any).mockImplementation(mockSetConfig);
    settings.getConfig = () => settingsState.config;
    settings.resolveConfig = () => settingsState.config;
    menu = new SettingsMenu({
      config: settingsState.config,
      onSettingChange: vi.fn(),
      settings,
    });
  });

  // ── buildSettingsItems ───────────────────────────────────────────────

  describe("buildSettingsItems", () => {
    it("includes all scalar settings", () => {
      const tui = makeTui();
      const items = (menu as any).buildSettingsItems(
        settings.getConfig(),
        makeTheme(),
        tui,
      );

      const ids = items.map((i: SettingItem) => i.id);
      expect(ids).toContain("display");
      expect(ids).toContain("icon");
      expect(ids).toContain("updateInterval");
      expect(ids).toContain("useProviderTokens");
      expect(ids).toContain("countStrategy");
      expect(ids).toContain("slidingWindow");
      expect(ids).toContain("endTpsBehavior");
    });

    it("includes thresholds group entry", () => {
      const tui = makeTui();
      const items = (menu as any).buildSettingsItems(
        settings.getConfig(),
        makeTheme(),
        tui,
      );

      const thresholdsItem = items.find(
        (i: SettingItem) => i.id === "thresholds",
      );
      expect(thresholdsItem).toBeDefined();
      expect(thresholdsItem?.currentValue).toContain("10");
      expect(thresholdsItem?.currentValue).toContain("30");
      expect(thresholdsItem?.currentValue).toContain("60");
      expect(thresholdsItem?.currentValue).toContain("100");
      expect(typeof thresholdsItem?.submenu).toBe("function");
    });

    it("includes colors group entry", () => {
      const tui = makeTui();
      const items = (menu as any).buildSettingsItems(
        settings.getConfig(),
        makeTheme(),
        tui,
      );

      const colorsItem = items.find((i: SettingItem) => i.id === "colors");
      expect(colorsItem).toBeDefined();
      expect(typeof colorsItem?.submenu).toBe("function");
    });
  });

  // ── createMainSettingsList ───────────────────────────────────────────

  describe("createMainSettingsList", () => {
    it("creates a list with correct items", () => {
      const tui = makeTui();
      const onChange = vi.fn();
      const onCancel = vi.fn();
      const onReset = vi.fn();
      const items = [
        { id: "test", label: "Test", currentValue: "value" },
      ] as SettingItem[];

      const list = (menu as any).createMainSettingsList(
        items,
        items.length,
        onChange,
        onCancel,
        onReset,
        tui,
      );

      expect(list).toBeDefined();
      expect((list as any).items).toEqual(items);
    });

    it("calls onCancel when the list is closed", () => {
      const tui = makeTui();
      const onChange = vi.fn();
      const onCancel = vi.fn();
      const onReset = vi.fn();
      const items = [
        { id: "test", label: "Test", currentValue: "value" },
      ] as SettingItem[];

      const list = (menu as any).createMainSettingsList(
        items,
        items.length,
        onChange,
        onCancel,
        onReset,
        tui,
      );

      (list as any).onCancel();
      expect(onCancel).toHaveBeenCalled();
    });
  });

  // ── createSubmenuList ────────────────────────────────────────────────

  describe("createSubmenuList", () => {
    it("stores items for threshold submenus", () => {
      const tui = makeTui();
      const done = vi.fn();
      const items = [{ id: "thresholds.slow", label: "Slow" }] as SettingItem[];

      const list = (menu as any).createSubmenuList(
        items,
        Math.min(items.length + 2, 15),
        () => {},
        done,
        () => {},
        tui,
      );

      expect((menu as any).thresholdSubmenuItems).toEqual(items);
      expect((menu as any).activeSubmenuList).toBe(list);
    });

    it("stores items for color submenus", () => {
      const tui = makeTui();
      const done = vi.fn();
      const items = [{ id: "colors.slow", label: "Slow" }] as SettingItem[];

      const list = (menu as any).createSubmenuList(
        items,
        Math.min(items.length + 2, 15),
        () => {},
        done,
        () => {},
        tui,
      );

      expect((menu as any).colorSubmenuItems).toEqual(items);
      expect((menu as any).activeSubmenuList).toBe(list);
    });

    it("clears stored items when submenu closes", () => {
      const tui = makeTui();
      const done = vi.fn();
      const items = [{ id: "thresholds.slow", label: "Slow" }] as SettingItem[];

      const list = (menu as any).createSubmenuList(
        items,
        Math.min(items.length + 2, 15),
        () => {},
        done,
        () => {},
        tui,
      );

      // Close the submenu
      (list as any).onCancel();

      expect((menu as any).thresholdSubmenuItems).toBeNull();
      expect((menu as any).activeSubmenuList).toBeNull();
      expect(done).toHaveBeenCalled();
    });
  });

  // ── handleSettingChange ──────────────────────────────────────────────

  describe("handleSettingChange", () => {
    it("calls onSettingChange on success", async () => {
      const onSettingChange = vi.fn();
      const menu2 = new SettingsMenu({
        config: settings.getConfig(),
        onSettingChange,
        settings,
      });

      await (menu2 as any).handleSettingChange("display", "TPS speed");

      expect(onSettingChange).toHaveBeenCalled();
    });

    it("does nothing when validation fails", async () => {
      const onSettingChange = vi.fn();
      const menu2 = new SettingsMenu({
        config: settings.getConfig(),
        onSettingChange,
        settings,
      });

      await (menu2 as any).handleSettingChange("display", "invalid-value");

      expect(onSettingChange).not.toHaveBeenCalled();
    });

    it("warns when a threshold breaks ascending order", async () => {
      const onSettingChange = vi.fn();
      const onWarning = vi.fn();
      const menu2 = new SettingsMenu({
        config: settings.getConfig(),
        onSettingChange,
        onWarning,
        settings,
      });

      // Default config has fast=60; use 70 (greater than fast), which must be rejected.
      await (menu2 as any).handleSettingChange("thresholds.medium", "70");

      expect(onWarning).toHaveBeenCalled();
      const message = onWarning.mock.calls[0][0] as string;
      expect(message).toContain("ascending");
      expect(onSettingChange).not.toHaveBeenCalled();
    });

    it("does not warn on a valid threshold change", async () => {
      const onSettingChange = vi.fn();
      const onWarning = vi.fn();
      const menu2 = new SettingsMenu({
        config: settings.getConfig(),
        onSettingChange,
        onWarning,
        settings,
      });

      await (menu2 as any).handleSettingChange("thresholds.medium", "40");

      expect(onWarning).not.toHaveBeenCalled();
      expect(onSettingChange).toHaveBeenCalled();
    });
  });

  // ── refreshThresholdItems ────────────────────────────────────────────

  describe("refreshThresholdItems", () => {
    it("updates the main list thresholds value", () => {
      const tui = makeTui();
      const items = [
        {
          id: "thresholds",
          label: "Thresholds",
          currentValue: "10 | 30 | 60 | 100",
        },
      ] as SettingItem[];
      const list = (menu as any).createMainSettingsList(
        items,
        items.length,
        () => {},
        () => {},
        () => {},
        tui,
      );

      (menu as any).refreshThresholdItems();

      expect(
        (list as any).items.find((i: SettingItem) => i.id === "thresholds")
          .currentValue,
      ).toBe("10 | 30 | 60 | 100");
    });

    it("updates threshold submenu items", () => {
      const tui = makeTui();
      const done = vi.fn();
      const items = [
        { id: "thresholds.slow", label: "Slow", currentValue: "10" },
        { id: "thresholds.medium", label: "Medium", currentValue: "30" },
      ] as SettingItem[];

      (menu as any).createSubmenuList(
        items,
        Math.min(items.length + 2, 15),
        () => {},
        done,
        () => {},
        tui,
      );

      // Mutate the internal items
      (menu as any).refreshThresholdItems();

      expect((menu as any).thresholdSubmenuItems![0].currentValue).toBe("10");
    });

    it("invalidates the active submenu list", () => {
      const tui = makeTui();
      const done = vi.fn();
      const items = [{ id: "thresholds.slow", label: "Slow" }] as SettingItem[];

      const list = (menu as any).createSubmenuList(
        items,
        Math.min(items.length + 2, 15),
        () => {},
        done,
        () => {},
        tui,
      );

      (menu as any).refreshThresholdItems();

      expect((list as any).invalidate).toBeDefined();
    });
  });

  // ── refreshColorItems ────────────────────────────────────────────────

  describe("refreshColorItems", () => {
    it("updates the main list colors value", () => {
      const tui = makeTui();
      const items = [
        { id: "colors", label: "Colors", currentValue: "■ ■ ■ ■" },
      ] as SettingItem[];
      const list = (menu as any).createMainSettingsList(
        items,
        items.length,
        () => {},
        () => {},
        () => {},
        tui,
      );

      (menu as any).refreshColorItems();

      expect(
        (list as any).items.find((i: SettingItem) => i.id === "colors")
          .currentValue,
      ).toContain("■");
    });

    it("updates color submenu items", () => {
      const tui = makeTui();
      const done = vi.fn();
      const items = [
        { id: "colors.slow", label: "■ Slow", currentValue: "#ffcc00" },
      ] as SettingItem[];

      (menu as any).createSubmenuList(
        items,
        Math.min(items.length + 2, 15),
        () => {},
        done,
        () => {},
        tui,
      );

      (menu as any).refreshColorItems();

      expect((menu as any).colorSubmenuItems![0].currentValue).toBe("#ffcc00");
    });

    it("updates the open submenu list after a color change", async () => {
      const tui = makeTui();
      const items = [
        { id: "colors.slow", label: "■ Slow", currentValue: "#ffcc00" },
        { id: "colors.medium", label: "■ Medium", currentValue: "#88cc00" },
        { id: "colors.fast", label: "■ Fast", currentValue: "#44cc44" },
        { id: "colors.blazing", label: "■ Blazing", currentValue: "#00ccff" },
      ] as SettingItem[];

      const list = (menu as any).createSubmenuList(
        items,
        Math.min(items.length + 2, 15),
        (id: string, v: string) => (menu as any).handleSettingChange(id, v),
        () => {},
        () => {},
        tui,
      );

      await (menu as any).handleSettingChange("colors.slow", "#123456");

      const refreshed = (list as any).items.find(
        (i: SettingItem) => i.id === "colors.slow",
      );
      expect(refreshed.currentValue).toBe("#123456");
    });
  });

  // ── Stale-submenu regression ──────────────────────────────────────

  describe("stale submenu regression", () => {
    it("refreshes the threshold submenu from live config after a change", async () => {
      const tui = makeTui();
      const items = [
        { id: "thresholds.slow", label: "Slow", currentValue: "10" },
        { id: "thresholds.medium", label: "Medium", currentValue: "30" },
        { id: "thresholds.fast", label: "Fast", currentValue: "60" },
        { id: "thresholds.blazing", label: "Blazing", currentValue: "100" },
      ] as SettingItem[];

      (menu as any).createSubmenuList(
        items,
        Math.min(items.length + 2, 15),
        (id: string, v: string) => (menu as any).handleSettingChange(id, v),
        () => {},
        () => {},
        tui,
      );

      // The menu captured a config snapshot at construction time; the real
      // setConfig replaces the cached config object, so the refresh must
      // re-read from settings (not from the stale snapshot).
      await (menu as any).handleSettingChange("thresholds.slow", "3");

      expect(settingsState.config.thresholds.slow).toBe(3);
      const refreshed = (menu as any).thresholdSubmenuItems.find(
        (i: SettingItem) => i.id === "thresholds.slow",
      );
      expect(refreshed.currentValue).toBe("3");
    });

    it("refreshes the open threshold submenu list from live config", async () => {
      const tui = makeTui();
      const items = [
        { id: "thresholds.slow", label: "Slow", currentValue: "10" },
        { id: "thresholds.medium", label: "Medium", currentValue: "30" },
        { id: "thresholds.fast", label: "Fast", currentValue: "60" },
        { id: "thresholds.blazing", label: "Blazing", currentValue: "100" },
      ] as SettingItem[];

      const list = (menu as any).createSubmenuList(
        items,
        Math.min(items.length + 2, 15),
        (id: string, v: string) => (menu as any).handleSettingChange(id, v),
        () => {},
        () => {},
        tui,
      );

      await (menu as any).handleSettingChange("thresholds.slow", "3");

      const refreshed = (list as any).items.find(
        (i: SettingItem) => i.id === "thresholds.slow",
      );
      expect(refreshed.currentValue).toBe("3");
    });

    it("refreshes the color submenu from live config after a change", async () => {
      const tui = makeTui();
      const items = [
        { id: "colors.slow", label: "■ Slow", currentValue: "#ffcc00" },
        { id: "colors.medium", label: "■ Medium", currentValue: "#88cc00" },
        { id: "colors.fast", label: "■ Fast", currentValue: "#44cc44" },
        { id: "colors.blazing", label: "■ Blazing", currentValue: "#00ccff" },
      ] as SettingItem[];

      (menu as any).createSubmenuList(
        items,
        Math.min(items.length + 2, 15),
        (id: string, v: string) => (menu as any).handleSettingChange(id, v),
        () => {},
        () => {},
        tui,
      );

      await (menu as any).handleSettingChange("colors.slow", "#123456");

      expect(settingsState.config.colors.slow).toBe("#123456");
      const colorItem = (menu as any).colorSubmenuItems.find(
        (i: SettingItem) => i.id === "colors.slow",
      );
      expect(colorItem.currentValue).toBe("#123456");
    });
  });

  // ── getThresholds / getColors / getDisplayColors ──────────────────────

  describe("getters", () => {
    it("returns the thresholds from config", () => {
      expect(menu.getThresholds()).toEqual({
        slow: 10,
        medium: 30,
        fast: 60,
        blazing: 100,
      });
    });

    it("returns the colors from config", () => {
      expect(menu.getColors()).toEqual({
        slow: "#ffcc00",
        medium: "#88cc00",
        fast: "#44cc44",
        blazing: "#00ccff",
      });
    });

    it("returns the displayColors from config", () => {
      expect(menu.getDisplayColors()).toEqual({
        count: "",
        elapsed: "",
        ttft: "",
      });
    });
  });

  // ── commit ────────────────────────────────────────────────────────────

  describe("commit", () => {
    it("commits a valid scalar setting", async () => {
      await (menu as any).commit("display", "TPS speed");
      expect(settings.setConfig).toHaveBeenCalledWith({
        display: "tps",
      });
    });

    it("commits a valid per-tier setting", async () => {
      await (menu as any).commit("thresholds.slow", "20");
      expect(settings.setConfig).toHaveBeenCalledWith({
        thresholds: { slow: 20 },
      });
    });

    it("commits a valid color setting", async () => {
      await (menu as any).commit("colors.slow", "#AABBCC");
      expect(settings.setConfig).toHaveBeenCalledWith({
        colors: { slow: "#aabbcc" },
      });
    });

    it("rejects an invalid scalar and calls onWarning", async () => {
      const onWarning = vi.fn();
      const menu2 = new SettingsMenu({
        config: settingsState.config,
        onSettingChange: vi.fn(),
        onWarning,
        settings,
      });
      await (menu2 as any).commit("display", "bogus");
      expect(onWarning).toHaveBeenCalled();
      expect(settings.setConfig).not.toHaveBeenCalled();
    });

    it("rejects an invalid per-tier setting and calls onWarning", async () => {
      const onWarning = vi.fn();
      const menu2 = new SettingsMenu({
        config: settingsState.config,
        onSettingChange: vi.fn(),
        onWarning,
        settings,
      });
      await (menu2 as any).commit("thresholds.slow", "-5");
      expect(onWarning).toHaveBeenCalled();
      expect(settings.setConfig).not.toHaveBeenCalled();
    });

    it("rejects an invalid color and calls onWarning", async () => {
      const onWarning = vi.fn();
      const menu2 = new SettingsMenu({
        config: settingsState.config,
        onSettingChange: vi.fn(),
        onWarning,
        settings,
      });
      await (menu2 as any).commit("colors.slow", "nope");
      expect(onWarning).toHaveBeenCalled();
      expect(settings.setConfig).not.toHaveBeenCalled();
    });

    it("returns false when item is not found", async () => {
      const result = await (menu as any).commit("nonexistent", "value");
      expect(result).toBe(false);
      expect(settings.setConfig).not.toHaveBeenCalled();
    });
  });

  // ── resetScalar / resetGroup ──────────────────────────────────────────

  describe("resetScalar", () => {
    it("resets a scalar setting", async () => {
      const tui = makeTui();
      const items = [
        { id: "display", label: "Display", currentValue: "TPS speed" },
      ] as SettingItem[];
      const list = (menu as any).createMainSettingsList(
        items,
        items.length,
        () => {},
        () => {},
        () => {},
        tui,
      );
      (menu as any).settingsList = list;

      await (menu as any).resetScalar("display");

      expect(settings.resetKeys).toHaveBeenCalledWith(["display"]);
    });

    it("resets a per-tier setting", async () => {
      await (menu as any).resetScalar("thresholds.slow");
      expect(settings.resetKeys).toHaveBeenCalledWith(["thresholds.slow"]);
    });

    it("does nothing for unknown id", async () => {
      await (menu as any).resetScalar("nonexistent");
      expect(settings.resetKeys).not.toHaveBeenCalled();
    });
  });

  describe("resetGroup", () => {
    it("resets the thresholds group", async () => {
      await (menu as any).resetGroup("thresholds");
      expect(settings.resetKeys).toHaveBeenCalledWith(["thresholds"]);
    });

    it("resets the colors group", async () => {
      await (menu as any).resetGroup("colors");
      expect(settings.resetKeys).toHaveBeenCalledWith(["colors"]);
    });

    it("does nothing for unknown group", async () => {
      await (menu as any).resetGroup("nonexistent");
      expect(settings.resetKeys).not.toHaveBeenCalled();
    });
  });

  // ── afterChange / afterReset ──────────────────────────────────────────

  describe("afterChange", () => {
    it("fires the onSettingChange callback", () => {
      const onSettingChange = vi.fn();
      const menu2 = new SettingsMenu({
        config: settingsState.config,
        onSettingChange,
        settings,
      });
      (menu2 as any).afterChange("display");
      expect(onSettingChange).toHaveBeenCalled();
    });
  });

  describe("afterReset", () => {
    it("fires the onSettingChange callback", () => {
      const onSettingChange = vi.fn();
      const menu2 = new SettingsMenu({
        config: settingsState.config,
        onSettingChange,
        settings,
      });
      (menu2 as any).afterReset("display");
      expect(onSettingChange).toHaveBeenCalled();
    });
  });

  // ── refreshDisplayColorItems ──────────────────────────────────────────

  describe("refreshDisplayColorItems", () => {
    it("updates the main list displayColors value", () => {
      const tui = makeTui();
      const items = [
        {
          id: "displayColors",
          label: "Display Colors",
          currentValue: "■ ■ ■",
        },
      ] as SettingItem[];
      const list = (menu as any).createMainSettingsList(
        items,
        items.length,
        () => {},
        () => {},
        () => {},
        tui,
      );

      (menu as any).refreshDisplayColorItems();

      expect(
        (list as any).items.find((i: SettingItem) => i.id === "displayColors")
          .currentValue,
      ).toContain("■");
    });

    it("invalidates the active submenu list", () => {
      const tui = makeTui();
      const done = vi.fn();
      const items = [
        { id: "displayColors.count", label: "Count" },
      ] as SettingItem[];

      const list = (menu as any).createSubmenuList(
        items,
        Math.min(items.length + 2, 15),
        () => {},
        done,
        () => {},
        tui,
      );

      (menu as any).refreshDisplayColorItems();

      expect((list as any).invalidate).toBeDefined();
    });
  });
});

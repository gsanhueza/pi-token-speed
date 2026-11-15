import { describe, expect, it } from "vitest";

import type { TokenSpeedConfig } from "../src/config/types";
import { PrefixSettingsItem } from "../src/settings/items/prefix";

describe("PrefixSettingsItem", () => {
  const item = new PrefixSettingsItem();

  // ── format ───────────────────────────────────────────────────────────────

  describe("format", () => {
    it("returns the prefix when set to a non-empty string", () => {
      const config: TokenSpeedConfig = { prefix: "Speed" } as TokenSpeedConfig;
      expect(item.format(config)).toBe("Speed");
    });

    it("returns the default prefix when the value is empty string", () => {
      const config: TokenSpeedConfig = { prefix: "" } as TokenSpeedConfig;
      expect(item.format(config)).toBe("TPS");
    });

    it("returns the default prefix when the value is undefined", () => {
      const config = { prefix: undefined } as unknown as TokenSpeedConfig;
      expect(item.format(config)).toBe("TPS");
    });
  });

  // ── setConfig ────────────────────────────────────────────────────────────

  describe("setConfig", () => {
    it("returns the prefix value as-is", () => {
      const result = item.setConfig({} as TokenSpeedConfig, "Speed");
      expect(result).toEqual({ valid: true, config: { prefix: "Speed" } });
    });

    it("normalizes '(empty)' to ''", () => {
      const result = item.setConfig({} as TokenSpeedConfig, "(empty)");
      expect(result).toEqual({ valid: true, config: { prefix: "" } });
    });
  });

  // ── validate ─────────────────────────────────────────────────────────────

  describe("validate", () => {
    it("accepts a valid non-empty string", () => {
      const result = item.validate("Speed");
      expect(result).toEqual({ valid: true, corrected: "Speed" });
    });

    it("accepts '(empty)' and normalizes to ''", () => {
      const result = item.validate("(empty)");
      expect(result).toEqual({ valid: true, corrected: "" });
    });

    it("accepts '' and passes through", () => {
      const result = item.validate("");
      expect(result).toEqual({ valid: true, corrected: "" });
    });

    it("accepts the default value", () => {
      const result = item.validate("TPS");
      expect(result).toEqual({ valid: true, corrected: "TPS" });
    });

    it("defaults to the default prefix for non-string values", () => {
      const result = item.validate(42);
      expect(result).toEqual({
        valid: false,
        corrected: "TPS",
        errors: [`Invalid prefix (expected string) — defaulting to "TPS".`],
      });
    });

    it("defaults to the default prefix for null", () => {
      const result = item.validate(null);
      expect(result.valid).toBe(false);
      expect(result.corrected).toBe("TPS");
    });
  });
});

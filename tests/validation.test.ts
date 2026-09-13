import { describe, expect, it } from "vitest";

import { MAX_SLIDING_WINDOW, MIN_SLIDING_WINDOW } from "../src/config/constants";
import { Validator } from "../src/config/validation";
import { settings } from "../src/config/settings";

const defaults = settings.getDefaultConfig();

describe("Validator.isValidHex", () => {
  it.each([
    "#00ff88",
    "#FFFFFF",
    "#000000",
    "#a1B2c3",
  ])("accepts valid hex %s", (hex) => {
    expect(Validator.isValidHex(hex)).toBe(true);
  });

  it.each([
    "00ff88", // missing #
    "#00ff8", // too short
    "#00ff888", // too long
    "#00ff8g", // invalid char
    "#fff", // 3-digit shorthand not supported
    "",
  ])("rejects invalid hex %s", (hex) => {
    expect(Validator.isValidHex(hex)).toBe(false);
  });
});

describe("Validator.validate", () => {
  it("accepts the default config without errors", () => {
    const { config, errors } = Validator.validate(defaults);
    expect(errors).toEqual([]);
    expect(config).toEqual(defaults);
  });

  it("does not mutate the input config", () => {
    const input = { ...defaults, display: "bogus" as never };
    Validator.validate(input);
    expect(input.display).toBe("bogus");
  });

  it("corrects an invalid display mode to the default", () => {
    const { config, errors } = Validator.validate({
      ...defaults,
      display: "bogus" as never,
    });
    expect(config.display).toBe(defaults.display);
    expect(errors.some((e) => e.includes('Invalid display "bogus"'))).toBe(
      true,
    );
  });

  it("corrects an invalid countStrategy to the default", () => {
    const { config, errors } = Validator.validate({
      ...defaults,
      countStrategy: "wizard" as never,
    });
    expect(config.countStrategy).toBe(defaults.countStrategy);
    expect(errors.some((e) => e.includes('Invalid countStrategy "wizard"'))).toBe(
      true,
    );
  });

  it("corrects an invalid endTpsBehavior to the default", () => {
    const { config, errors } = Validator.validate({
      ...defaults,
      endTpsBehavior: "sometimes" as never,
    });
    expect(config.endTpsBehavior).toBe(defaults.endTpsBehavior);
    expect(
      errors.some((e) => e.includes('Invalid endTpsBehavior "sometimes"')),
    ).toBe(true);
  });

  it.each([
    undefined,
    "true",
    1,
    null,
  ])("corrects non-boolean useProviderTokens (%s)", (value) => {
    const { config, errors } = Validator.validate({
      ...defaults,
      useProviderTokens: value as never,
    });
    expect(config.useProviderTokens).toBe(defaults.useProviderTokens);
    expect(errors.some((e) => e.includes("useProviderTokens"))).toBe(true);
  });

  it.each([
    50, // below minimum
    MAX_SLIDING_WINDOW + 1, // above maximum
    "1000",
    null,
  ])("corrects out-of-range slidingWindow (%s)", (value) => {
    const { config, errors } = Validator.validate({
      ...defaults,
      slidingWindow: value as never,
    });
    expect(config.slidingWindow).toBe(defaults.slidingWindow);
    expect(errors.some((e) => e.includes("slidingWindow"))).toBe(true);
  });

  it("accepts slidingWindow at the min/max boundaries", () => {
    const { errors: lo } = Validator.validate({
      ...defaults,
      slidingWindow: MIN_SLIDING_WINDOW,
    });
    const { errors: hi } = Validator.validate({
      ...defaults,
      slidingWindow: MAX_SLIDING_WINDOW,
    });
    expect(lo).toEqual([]);
    expect(hi).toEqual([]);
  });

  it("flags non-ascending thresholds without correcting them", () => {
    const { config, errors } = Validator.validate({
      ...defaults,
      thresholds: { ...defaults.thresholds, fast: 1 },
    });
    expect(config.thresholds).toEqual({
      ...defaults.thresholds,
      fast: 1,
    }); // error-only check: not corrected
    expect(
      errors.some((e) => e.includes("TPS thresholds must be in ascending order")),
    ).toBe(true);
  });

  it("flags invalid colors", () => {
    const { errors } = Validator.validate({
      ...defaults,
      colors: { ...defaults.colors, fast: "not-a-color" },
    });
    expect(
      errors.some((e) => e.includes("Invalid colors.fast")),
    ).toBe(true);
  });

  it("accepts a valid non-default config", () => {
    const { errors } = Validator.validate({
      ...defaults,
      display: "stats",
      countStrategy: "estimate",
      slidingWindow: 5000,
      endTpsBehavior: "last",
      updateInterval: 250,
      thresholds: { slow: 1, medium: 2, fast: 3, blazing: 4 },
    });
    expect(errors).toEqual([]);
  });
});

describe("Validator.validateOverride", () => {
  it("passes a valid block through unchanged", () => {
    const override = {
      display: "stats" as const,
      slidingWindow: 2000,
    };
    const { config, errors } = Validator.validateOverride(
      "anthropic",
      override,
      defaults,
    );
    expect(errors).toEqual([]);
    expect(config).toEqual(override);
  });

  it("drops invalid enum values and reports them", () => {
    const { config, errors } = Validator.validateOverride(
      "anthropic",
      { display: "bogus" as never },
      defaults,
    );
    expect(config.display).toBeUndefined();
    expect(errors[0]).toContain('providerOverrides["anthropic"]');
    expect(errors[0]).toContain('Invalid display "bogus"');
  });

  it("drops non-boolean useProviderTokens", () => {
    const { config, errors } = Validator.validateOverride(
      "openai",
      { useProviderTokens: "yes" as never },
      defaults,
    );
    expect(config.useProviderTokens).toBeUndefined();
    expect(errors[0]).toContain("useProviderTokens");
  });

  it("drops out-of-range slidingWindow", () => {
    const { config } = Validator.validateOverride(
      "openai",
      { slidingWindow: 1 },
      defaults,
    );
    expect(config.slidingWindow).toBeUndefined();
  });

  it("drops non-string icons", () => {
    const { config, errors } = Validator.validateOverride(
      "openai",
      { icon: 42 as never },
      defaults,
    );
    expect(config.icon).toBeUndefined();
    expect(errors[0]).toContain("icon");
  });

  it("keeps only numeric threshold tiers and validates the merged order", () => {
    // Merged with base, the partial below produces valid ascending order
    const good = Validator.validateOverride(
      "anthropic",
      { thresholds: { slow: 5, medium: 10 } },
      defaults,
    );
    expect(good.errors).toEqual([]);
    expect(good.config.thresholds).toEqual({ slow: 5, medium: 10 });

    // A partial that breaks the merged order is dropped entirely
    const bad = Validator.validateOverride(
      "anthropic",
      { thresholds: { medium: 999 } },
      { ...defaults, thresholds: { ...defaults.thresholds, fast: 50 } },
    );
    expect(bad.config.thresholds).toBeUndefined();
    expect(bad.errors[0]).toContain("Thresholds must be in ascending order");
  });

  it("drops non-numeric threshold tiers with a warning", () => {
    const { config, errors } = Validator.validateOverride(
      "anthropic",
      { thresholds: { slow: "high" as never } },
      defaults,
    );
    expect(config.thresholds).toBeUndefined();
    expect(errors[0]).toContain("Invalid thresholds.slow");
  });

  it("keeps only valid hex color tiers and validates the merged set", () => {
    const good = Validator.validateOverride(
      "anthropic",
      { colors: { fast: "#ABCDEF" } },
      defaults,
    );
    expect(good.errors).toEqual([]);
    // Valid hex is lowercased
    expect(good.config.colors).toEqual({ fast: "#abcdef" });

    // A partial that leaves the merged set invalid is dropped: an invalid
    // base color (e.g. from a legacy flat key) cannot be repaired by the
    // override, so the whole group falls back to base
    const staleBase = {
      ...defaults,
      colors: { ...defaults.colors, fast: "nope" },
    };
    const bad = Validator.validateOverride(
      "anthropic",
      { colors: { slow: "#00ff88" } },
      staleBase as typeof defaults,
    );
    expect(bad.config.colors).toBeUndefined();
    expect(bad.errors[0]).toContain("Effective colors must be valid hex");
  });

  it("drops non-object thresholds and colors groups", () => {
    const { config, errors } = Validator.validateOverride(
      "anthropic",
      {
        thresholds: "nope" as never,
        colors: ["#00ff88"] as never,
      },
      defaults,
    );
    expect(config.thresholds).toBeUndefined();
    expect(config.colors).toBeUndefined();
    expect(errors.some((e) => e.includes("Invalid thresholds"))).toBe(true);
    expect(errors.some((e) => e.includes("Invalid colors"))).toBe(true);
  });

  it("omits keys not present in the override", () => {
    const { config } = Validator.validateOverride("anthropic", {}, defaults);
    expect(config).toEqual({});
  });
});

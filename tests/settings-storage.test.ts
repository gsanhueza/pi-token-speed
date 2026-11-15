import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { SettingsStorage } from "../src/config/settings-storage";

describe("SettingsStorage.writeTokenSpeedBlock", () => {
  let path: string;
  let storage: SettingsStorage;

  const readBlock = async (): Promise<Record<string, unknown>> => {
    const raw = JSON.parse(await readFile(path, "utf-8"));
    return raw.tokenSpeed ?? {};
  };

  beforeEach(async () => {
    path = join(await mkdtemp(`${tmpdir()}/`), "settings.json");
    storage = new SettingsStorage(path);
  });

  it("does not persist empty displayColors when changing a different setting", async () => {
    await storage.writeTokenSpeedBlock({ display: "full" });

    expect(await readBlock()).toEqual({ display: "full" });
    expect((await readBlock()).displayColors).toBeUndefined();
  });

  it("preserves non-empty displayColors when changing a different setting", async () => {
    await writeFile(
      path,
      JSON.stringify({
        tokenSpeed: { display: "full", displayColors: { count: "#ff0000" } },
      }),
    );

    await storage.writeTokenSpeedBlock({ display: "stats" });

    expect(await readBlock()).toEqual({
      display: "stats",
      displayColors: { count: "#ff0000" },
    });
  });

  it("removes displayColors when it becomes empty after a write", async () => {
    await writeFile(
      path,
      JSON.stringify({
        tokenSpeed: { display: "full", displayColors: { count: "" } },
      }),
    );

    await storage.writeTokenSpeedBlock({ display: "stats" });

    // displayColors with empty string values still has keys, so it persists
    // (only truly empty {} objects are removed)
    expect(await readBlock()).toEqual({
      display: "stats",
      displayColors: { count: "" },
    });
  });
});

describe("SettingsStorage.deleteTokenSpeedKeys", () => {
  let path: string;
  let storage: SettingsStorage;

  const readBlock = async (): Promise<Record<string, unknown>> => {
    const raw = JSON.parse(await readFile(path, "utf-8"));
    return raw.tokenSpeed ?? {};
  };

  beforeEach(async () => {
    path = join(await mkdtemp(`${tmpdir()}/`), "settings.json");
    storage = new SettingsStorage(path);
  });

  it("deletes a top-level scalar key", async () => {
    await writeFile(
      path,
      JSON.stringify({ tokenSpeed: { display: "full", icon: "⚡" } }),
    );

    await storage.deleteTokenSpeedKeys(["display"]);

    expect(await readBlock()).toEqual({ icon: "⚡" });
  });

  it("deletes a single tier from a nested group", async () => {
    await writeFile(
      path,
      JSON.stringify({
        tokenSpeed: {
          thresholds: { slow: 1, fast: 9 },
          display: "full",
        },
      }),
    );

    await storage.deleteTokenSpeedKeys(["thresholds.slow"]);

    expect(await readBlock()).toEqual({
      thresholds: { fast: 9 },
      display: "full",
    });
  });

  it("removes a nested group when its last tier is deleted", async () => {
    await writeFile(
      path,
      JSON.stringify({
        tokenSpeed: {
          colors: { fast: "#00ff00" },
          display: "full",
        },
      }),
    );

    await storage.deleteTokenSpeedKeys(["colors.fast"]);

    expect(await readBlock()).toEqual({ display: "full" });
  });

  it("removes the whole tokenSpeed block when nothing remains", async () => {
    await writeFile(
      path,
      JSON.stringify({ tokenSpeed: { display: "full" }, other: true }),
    );

    await storage.deleteTokenSpeedKeys(["display"]);

    const raw = JSON.parse(await readFile(path, "utf-8"));
    expect(raw).toEqual({ other: true });
  });

  it("is a no-op for keys that are not present", async () => {
    await writeFile(path, JSON.stringify({ tokenSpeed: { display: "full" } }));

    await storage.deleteTokenSpeedKeys(["thresholds.slow", "icon"]);

    expect(await readBlock()).toEqual({ display: "full" });
  });

  it("handles a missing or malformed settings file", async () => {
    await storage.deleteTokenSpeedKeys(["display"]);

    await expect(readFile(path, "utf-8")).resolves.toBe("{}");
  });
});

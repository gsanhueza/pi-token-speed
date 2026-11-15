import { readFile, writeFile } from "node:fs/promises";
import type { PartialConfig } from "./types";

/**
 * Reads and writes the ~/.pi/agent/settings.json file.
 *
 * Handles the settings file format: a top-level JSON object containing a
 * `"tokenSpeed"` key (the TokenSpeed settings block). All file I/O is
 * isolated here so the `Settings` class can be tested without touching disk.
 */
export class SettingsStorage {
  /**
   * @param settingsPath Path to the settings JSON file.
   */
  constructor(private readonly settingsPath: string) {}

  /**
   * Reads and parses the settings file, returning an empty object on failure.
   *
   * @returns The parsed JSON object, or an empty object if the file is
   *   missing or invalid.
   */
  async read(): Promise<Record<string, unknown>> {
    try {
      const raw = await readFile(this.settingsPath, "utf-8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  /**
   * Writes a JSON object to the settings file with 2-space indentation.
   *
   * @param data The object to serialize and write.
   */
  async write(data: Record<string, unknown>): Promise<void> {
    await writeFile(this.settingsPath, JSON.stringify(data, null, 2), "utf-8");
  }

  /**
   * Reads the settings file and extracts the raw `"tokenSpeed"` block.
   *
   * @returns The raw TokenSpeed settings object, or an empty object if
   *   missing, null, or not an object.
   */
  async readTokenSpeedBlock(): Promise<Record<string, unknown>> {
    const settings = await this.read();
    return this.readNestedGroup<Record<string, unknown>>(
      settings,
      "tokenSpeed",
    );
  }

  /**
   * Writes a partial TokenSpeedConfig into the settings file, merging it
   * with existing values under the `"tokenSpeed"` key.
   *
   * Only explicitly-set values are persisted: the partial should contain
   * just the keys/tiers the user changed (nested groups are merged per-tier).
   * Defaults are never written unless the user explicitly sets them.
   *
   * @param partial The partial TokenSpeedConfig to write.
   */
  async writeTokenSpeedBlock(partial: PartialConfig): Promise<void> {
    const settings = await this.read();
    const raw =
      this.readNestedGroup<Record<string, unknown>>(settings, "tokenSpeed") ||
      {};

    const block = mergeConfig(raw as PartialConfig, {
      ...partial,
      thresholds: {
        ...(raw.thresholds as Record<string, unknown>),
        ...partial.thresholds,
      },
      colors: { ...(raw.colors as Record<string, unknown>), ...partial.colors },
    }) as unknown as Record<string, unknown>;

    // Omit empty groups
    if (Object.keys(block.thresholds ?? {}).length === 0) {
      delete block.thresholds;
    }
    if (Object.keys(block.colors ?? {}).length === 0) {
      delete block.colors;
    }
    if (Object.keys(block.displayColors ?? {}).length === 0) {
      delete block.displayColors;
    }
    if (Object.keys(block.providerOverrides ?? {}).length === 0) {
      delete block.providerOverrides;
    }

    if (Object.keys(block).length > 0) {
      settings["tokenSpeed"] = block;
    } else {
      delete settings["tokenSpeed"];
    }

    await this.write(settings);
  }

  /**
   * Deletes keys from the raw "tokenSpeed" block in the settings file.
   *
   * Supports dotted keys to remove a single tier from a nested group
   * (e.g. "thresholds.slow"); when the nested group becomes empty it is
   * removed entirely. Plain keys (e.g. "display", "thresholds") are
   * removed as-is, and the "tokenSpeed" block itself is dropped when
   * nothing remains.
   *
   * @param keys The keys to delete from the tokenSpeed block.
   */
  async deleteTokenSpeedKeys(keys: string[]): Promise<void> {
    const settings = await this.read();
    const block =
      this.readNestedGroup<Record<string, unknown>>(settings, "tokenSpeed") ||
      {};

    for (const key of keys) {
      const dot = key.indexOf(".");
      if (dot === -1) {
        delete block[key];
        continue;
      }
      const group = key.slice(0, dot);
      const tier = key.slice(dot + 1);
      // readNestedGroup returns the live nested object, so mutating it
      // updates the block in place; a fresh {} means the group was absent.
      const nested = this.readNestedGroup<Record<string, unknown>>(
        block,
        group,
      );
      if (tier in nested) {
        delete nested[tier];
        if (Object.keys(nested).length === 0) {
          delete block[group];
        }
      }
    }

    if (Object.keys(block).length > 0) {
      settings["tokenSpeed"] = block;
    } else {
      delete settings["tokenSpeed"];
    }

    await this.write(settings);
  }

  /**
   * Safely reads a nested object group from a raw block.
   *
   * @param block The raw settings block to read from.
   * @param group The key of the nested group to extract.
   * @returns A partial object of the group, or an empty object if the
   *   value is missing, null, or an array.
   */
  private readNestedGroup<T extends object>(
    block: Record<string, unknown>,
    group: string,
  ): Partial<T> {
    const value = block[group];
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {};
    }
    return value as Partial<T>;
  }
}

/**
 * Shallow-merges two partial configs, merging the nested `thresholds`
 * and `colors` groups per-tier so partials never wipe sibling tiers.
 *
 * @internal Used internally by `SettingsStorage` and `Settings`.
 */
export function mergeConfig(
  base: PartialConfig,
  partial: PartialConfig,
): PartialConfig {
  return {
    ...base,
    ...partial,
    thresholds: { ...base.thresholds, ...partial.thresholds },
    colors: { ...base.colors, ...partial.colors },
    displayColors: { ...base.displayColors, ...partial.displayColors },
  };
}

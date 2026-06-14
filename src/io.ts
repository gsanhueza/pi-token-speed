import { readFile, writeFile } from "node:fs/promises";

/**
 * Low-level file I/O for JSON settings files.
 *
 * Handles reading and writing JSON files with error tolerance —
 * parse failures return an empty object rather than throwing.
 */
export class IO {
  constructor(private readonly path: string) {}

  /**
   * Reads and parses a JSON file.
   *
   * @returns The parsed JSON object, or an empty object on failure.
   */
  async read(): Promise<Record<string, unknown>> {
    try {
      const raw = await readFile(this.path, "utf-8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  /**
   * Writes a JSON object to the file with 2-space indentation.
   *
   * @param data The object to serialize and write.
   */
  async write(data: Record<string, unknown>): Promise<void> {
    await writeFile(this.path, JSON.stringify(data, null, 2), "utf-8");
  }
}

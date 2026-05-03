import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { cloneSaveSnapshot, parseSaveSnapshot, type SaveSnapshot } from "./schema.js";
import type { SaveCacheStore } from "./cache.js";

export class FileSaveCache implements SaveCacheStore {
  constructor(private readonly directory: string) {}

  async get(saveId: string): Promise<SaveSnapshot | null> {
    try {
      const contents = await readFile(this.resolvePath(saveId), "utf8");
      return parseSaveSnapshot(JSON.parse(contents));
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async set(snapshot: SaveSnapshot): Promise<void> {
    const canonicalSnapshot = parseSaveSnapshot(snapshot);
    await mkdir(this.directory, { recursive: true });
    await writeFile(
      this.resolvePath(canonicalSnapshot.saveId),
      `${JSON.stringify(cloneSaveSnapshot(canonicalSnapshot), null, 2)}\n`,
      "utf8",
    );
  }

  async clear(saveId: string): Promise<void> {
    await rm(this.resolvePath(saveId), { force: true });
  }

  private resolvePath(saveId: string): string {
    return path.join(this.directory, `${encodeURIComponent(saveId)}.json`);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

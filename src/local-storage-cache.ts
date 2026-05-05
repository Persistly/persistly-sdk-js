import { cloneSaveSnapshot, parseSaveSnapshot, type SaveSnapshot } from "./schema.js";
import type { SaveCacheStore } from "./cache.js";

export interface LocalStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LocalStorageSaveCacheOptions {
  storage?: LocalStorageLike;
  keyPrefix?: string;
}

export class LocalStorageSaveCache implements SaveCacheStore {
  private readonly storage: LocalStorageLike;
  private readonly keyPrefix: string;

  constructor(options: LocalStorageSaveCacheOptions = {}) {
    const storage = options.storage ?? (globalThis as { localStorage?: LocalStorageLike }).localStorage;

    if (!storage) {
      throw new Error("LocalStorageSaveCache requires browser localStorage or an explicit storage implementation.");
    }

    this.storage = storage;
    this.keyPrefix = options.keyPrefix ?? "persistly:save:";
  }

  get(saveId: string): SaveSnapshot | null {
    const contents = this.storage.getItem(this.resolveKey(saveId));

    if (contents === null) {
      return null;
    }

    return parseSaveSnapshot(JSON.parse(contents));
  }

  set(snapshot: SaveSnapshot): void {
    const canonicalSnapshot = parseSaveSnapshot(snapshot);
    this.storage.setItem(this.resolveKey(canonicalSnapshot.saveId), JSON.stringify(cloneSaveSnapshot(canonicalSnapshot)));
  }

  clear(saveId: string): void {
    this.storage.removeItem(this.resolveKey(saveId));
  }

  private resolveKey(saveId: string): string {
    return `${this.keyPrefix}${encodeURIComponent(saveId)}`;
  }
}

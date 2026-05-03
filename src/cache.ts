import { cloneSaveSnapshot, parseSaveSnapshot, type JsonObject, type JsonValue, type SaveSnapshot } from "./schema.js";

export type { JsonObject, JsonValue, SaveSnapshot } from "./schema.js";

export interface SaveCacheStore {
  get(saveId: string): Promise<SaveSnapshot | null> | SaveSnapshot | null;
  set(snapshot: SaveSnapshot): Promise<void> | void;
  clear(saveId: string): Promise<void> | void;
}

export class MemorySaveCache implements SaveCacheStore {
  private readonly snapshots = new Map<string, SaveSnapshot>();

  get(saveId: string): SaveSnapshot | null {
    const snapshot = this.snapshots.get(saveId);
    return snapshot ? cloneSaveSnapshot(snapshot) : null;
  }

  set(snapshot: SaveSnapshot): void {
    const canonicalSnapshot = parseSaveSnapshot(snapshot);
    this.snapshots.set(canonicalSnapshot.saveId, cloneSaveSnapshot(canonicalSnapshot));
  }

  clear(saveId: string): void {
    this.snapshots.delete(saveId);
  }
}

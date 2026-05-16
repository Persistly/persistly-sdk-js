import { PersistlySyncStatus, type PersistlyClient, type SyncPolicy, type SyncSaveResult } from "./client.js";
import type { LocalStorageLike } from "./local-storage-cache.js";
import type { JsonObject } from "./schema.js";

export interface AutosaveDraft {
  state: JsonObject;
  metadata?: JsonObject;
}

export interface AutosaveDraftStore {
  get(profileSaveId: string, characterSaveId: string): Promise<AutosaveDraft | null> | AutosaveDraft | null;
  set(profileSaveId: string, characterSaveId: string, draft: AutosaveDraft): Promise<void> | void;
  clear(profileSaveId: string, characterSaveId: string): Promise<void> | void;
}

export interface PersistlyAutosaveManagerOptions {
  client: PersistlyClient;
  profileSaveId: string;
  characterSaveId: string;
  profileSessionToken: string;
  syncPolicy: SyncPolicy;
  draftStore?: AutosaveDraftStore;
  now?: () => number;
}

export class MemoryAutosaveDraftStore implements AutosaveDraftStore {
  private readonly drafts = new Map<string, AutosaveDraft>();

  get(profileSaveId: string, characterSaveId: string): AutosaveDraft | null {
    const draft = this.drafts.get(draftKey(profileSaveId, characterSaveId));
    return draft ? structuredClone(draft) : null;
  }

  set(profileSaveId: string, characterSaveId: string, draft: AutosaveDraft): void {
    this.drafts.set(draftKey(profileSaveId, characterSaveId), structuredClone(draft));
  }

  clear(profileSaveId: string, characterSaveId: string): void {
    this.drafts.delete(draftKey(profileSaveId, characterSaveId));
  }
}

export interface LocalStorageAutosaveDraftStoreOptions {
  storage?: LocalStorageLike;
  keyPrefix?: string;
}

export class LocalStorageAutosaveDraftStore implements AutosaveDraftStore {
  private readonly storage: LocalStorageLike;
  private readonly keyPrefix: string;

  constructor(options: LocalStorageAutosaveDraftStoreOptions = {}) {
    const storage = options.storage ?? (globalThis as { localStorage?: LocalStorageLike }).localStorage;

    if (!storage) {
      throw new Error("LocalStorageAutosaveDraftStore requires browser localStorage or an explicit storage implementation.");
    }

    this.storage = storage;
    this.keyPrefix = options.keyPrefix ?? "persistly:draft:";
  }

  get(profileSaveId: string, characterSaveId: string): AutosaveDraft | null {
    const value = this.storage.getItem(this.resolveKey(profileSaveId, characterSaveId));
    if (value === null) {
      return null;
    }
    return normalizeDraft(JSON.parse(value) as AutosaveDraft);
  }

  set(profileSaveId: string, characterSaveId: string, draft: AutosaveDraft): void {
    this.storage.setItem(this.resolveKey(profileSaveId, characterSaveId), JSON.stringify(normalizeDraft(draft)));
  }

  clear(profileSaveId: string, characterSaveId: string): void {
    this.storage.removeItem(this.resolveKey(profileSaveId, characterSaveId));
  }

  private resolveKey(profileSaveId: string, characterSaveId: string): string {
    return `${this.keyPrefix}${encodeURIComponent(profileSaveId)}:${encodeURIComponent(characterSaveId)}`;
  }
}

export class PersistlyAutosaveManager {
  private readonly client: PersistlyClient;
  private readonly profileSaveId: string;
  private readonly characterSaveId: string;
  private readonly profileSessionToken: string;
  private readonly syncPolicy: SyncPolicy;
  private readonly draftStore: AutosaveDraftStore;
  private readonly now: () => number;
  private lastRemoteSyncAt: number;
  private lastForceSyncAt = Number.NEGATIVE_INFINITY;

  constructor(options: PersistlyAutosaveManagerOptions) {
    this.client = options.client;
    this.profileSaveId = options.profileSaveId;
    this.characterSaveId = options.characterSaveId;
    this.profileSessionToken = options.profileSessionToken;
    this.syncPolicy = options.syncPolicy;
    this.draftStore = options.draftStore ?? new MemoryAutosaveDraftStore();
    this.now = options.now ?? Date.now;
    this.lastRemoteSyncAt = this.now();
  }

  async recordLocalChange(draft: AutosaveDraft): Promise<void> {
    await this.draftStore.set(this.profileSaveId, this.characterSaveId, normalizeDraft(draft));
  }

  async tick(): Promise<SyncSaveResult | null> {
    const elapsedMs = this.now() - this.lastRemoteSyncAt;
    if (elapsedMs < this.syncPolicy.minRemoteSyncIntervalSeconds * 1000) {
      return null;
    }
    return await this.syncPendingDraft();
  }

  async forceSync(): Promise<SyncSaveResult | null> {
    const elapsedMs = this.now() - this.lastForceSyncAt;
    if (elapsedMs < this.syncPolicy.forceSyncCooldownSeconds * 1000) {
      return null;
    }
    this.lastForceSyncAt = this.now();
    return await this.syncPendingDraft();
  }

  private async syncPendingDraft(): Promise<SyncSaveResult | null> {
    const draft = await this.draftStore.get(this.profileSaveId, this.characterSaveId);
    if (!draft) {
      return null;
    }

    const result = await this.client.syncProfileCharacter({
      profileSaveId: this.profileSaveId,
      characterSaveId: this.characterSaveId,
      profileSessionToken: this.profileSessionToken,
      ...(draft.metadata === undefined ? {} : { metadata: draft.metadata }),
      state: draft.state,
    });
    if (result.status === PersistlySyncStatus.Accepted) {
      await this.draftStore.clear(this.profileSaveId, this.characterSaveId);
    }
    this.lastRemoteSyncAt = this.now();
    return result;
  }
}

function normalizeDraft(draft: AutosaveDraft): AutosaveDraft {
  return {
    ...(draft.metadata === undefined ? {} : { metadata: draft.metadata }),
    state: draft.state,
  };
}

function draftKey(profileSaveId: string, characterSaveId: string): string {
  return `${profileSaveId}:${characterSaveId}`;
}

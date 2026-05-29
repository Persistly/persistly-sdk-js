import { PersistlySyncStatus, type PersistlyClient, type SyncPolicy, type SyncSaveResult } from "./client.js";
import type { LocalStorageLike } from "./local-storage-cache.js";
import type { JsonObject } from "./schema.js";

export interface AutosaveDraft {
  state: JsonObject;
  metadata?: JsonObject;
}

export interface AutosaveDraftStore {
  get(accountId: string, slotId: string): Promise<AutosaveDraft | null> | AutosaveDraft | null;
  set(accountId: string, slotId: string, draft: AutosaveDraft): Promise<void> | void;
  clear(accountId: string, slotId: string): Promise<void> | void;
}

export interface PersistlyAutosaveManagerOptions {
  client: PersistlyClient;
  accountId: string;
  slotId: string;
  accountSessionToken: string;
  syncPolicy: SyncPolicy;
  draftStore?: AutosaveDraftStore;
  now?: () => number;
}

export class MemoryAutosaveDraftStore implements AutosaveDraftStore {
  private readonly drafts = new Map<string, AutosaveDraft>();

  get(accountId: string, slotId: string): AutosaveDraft | null {
    const draft = this.drafts.get(draftKey(accountId, slotId));
    return draft ? structuredClone(draft) : null;
  }

  set(accountId: string, slotId: string, draft: AutosaveDraft): void {
    this.drafts.set(draftKey(accountId, slotId), structuredClone(draft));
  }

  clear(accountId: string, slotId: string): void {
    this.drafts.delete(draftKey(accountId, slotId));
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

  get(accountId: string, slotId: string): AutosaveDraft | null {
    const value = this.storage.getItem(this.resolveKey(accountId, slotId));
    if (value === null) {
      return null;
    }
    return normalizeDraft(JSON.parse(value) as AutosaveDraft);
  }

  set(accountId: string, slotId: string, draft: AutosaveDraft): void {
    this.storage.setItem(this.resolveKey(accountId, slotId), JSON.stringify(normalizeDraft(draft)));
  }

  clear(accountId: string, slotId: string): void {
    this.storage.removeItem(this.resolveKey(accountId, slotId));
  }

  private resolveKey(accountId: string, slotId: string): string {
    return `${this.keyPrefix}${encodeURIComponent(accountId)}:${encodeURIComponent(slotId)}`;
  }
}

export class PersistlyAutosaveManager {
  private readonly client: PersistlyClient;
  private readonly accountId: string;
  private readonly slotId: string;
  private readonly accountSessionToken: string;
  private readonly syncPolicy: SyncPolicy;
  private readonly draftStore: AutosaveDraftStore;
  private readonly now: () => number;
  private lastRemoteSyncAt: number;
  private lastForceSyncAt = Number.NEGATIVE_INFINITY;

  constructor(options: PersistlyAutosaveManagerOptions) {
    this.client = options.client;
    this.accountId = options.accountId;
    this.slotId = options.slotId;
    this.accountSessionToken = options.accountSessionToken;
    this.syncPolicy = options.syncPolicy;
    this.draftStore = options.draftStore ?? new MemoryAutosaveDraftStore();
    this.now = options.now ?? Date.now;
    this.lastRemoteSyncAt = this.now();
  }

  async recordLocalChange(draft: AutosaveDraft): Promise<void> {
    await this.draftStore.set(this.accountId, this.slotId, normalizeDraft(draft));
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
    const draft = await this.draftStore.get(this.accountId, this.slotId);
    if (!draft) {
      return null;
    }

    const result = await this.client.syncAccountSlot({
      accountId: this.accountId,
      slotId: this.slotId,
      accountSessionToken: this.accountSessionToken,
      ...(draft.metadata === undefined ? {} : { metadata: draft.metadata }),
      data: draft.state,
    });
    if (result.status === PersistlySyncStatus.Accepted) {
      await this.draftStore.clear(this.accountId, this.slotId);
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

function draftKey(accountId: string, slotId: string): string {
  return `${accountId}:${slotId}`;
}

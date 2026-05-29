import {
  PersistlyClient,
  PersistlySyncStatus,
  type ExternalAccountRef,
  type Save,
  type SyncPolicy,
} from "./client.js";
import {
  PersistlyApiError,
  PersistlyConfigurationError,
  PersistlyRateLimitedError,
  PersistlySlotAlreadyExistsError,
  PersistlyStorageError,
  PersistlyTransportError,
} from "./errors.js";
import type { LocalStorageLike } from "./local-storage-cache.js";
import { parseObject, type JsonObject } from "./schema.js";

export const PersistlyGameSaveStatus = {
  LocalSaved: "local_saved",
  LocalFound: "local_found",
  NotFound: "not_found",
  NoChanges: "no_changes",
  Cooldown: "cooldown",
  Synced: "synced",
  Conflict: "conflict",
  Offline: "offline",
  RateLimited: "rate_limited",
} as const;

export type PersistlyGameSaveStatusValue =
  (typeof PersistlyGameSaveStatus)[keyof typeof PersistlyGameSaveStatus];

export const PersistlyGameSaveTarget = {
  Account: "account",
  Slot: "slot",
} as const;

export type PersistlyGameSaveTargetValue =
  (typeof PersistlyGameSaveTarget)[keyof typeof PersistlyGameSaveTarget];

export const PersistlySlotStatus = PersistlyGameSaveStatus;
export type PersistlySlotStatusValue = PersistlyGameSaveStatusValue;

export type PersistlyGameSavesStorage = "memory" | "localStorage";

export const PersistlyDefaultSlotKey = "autosave" as const;

export interface PersistlyGameSavesConfig {
  runtimeKey: string;
  playerRef?: string;
  externalAccountRef?: ExternalAccountRef;
  localAccountKey?: string;
  localProfileKey?: string;
  accountId?: string;
  accountSessionToken?: string;
  storage?: PersistlyGameSavesStorage;
  storageHelper?: LocalStorageLike;
  fetch?: typeof globalThis.fetch;
  onSyncResult?: (result: PersistlyGameSaveSyncResult) => void;
}

export interface PersistlyGameSavesSaveSlotOptions {
  slotInfo?: JsonObject;
  /** @internal */
  metadata?: JsonObject;
}

export interface PersistlyGameSavesSyncOptions {
  bypassCooldown?: boolean;
  includeSkipped?: boolean;
}

export interface PersistlyAccountSession {
  accountId?: string;
  accountSessionToken?: string;
}

export interface PersistlyAttachAccountOptions {
  accountId: string;
  accountSessionToken: string;
}

export interface PersistlyEnsureAccountResult {
  status: typeof PersistlyGameSaveStatus.Synced | typeof PersistlyGameSaveStatus.LocalFound;
  target: typeof PersistlyGameSaveTarget.Account;
  accountId: string;
  account?: Save;
  /** @internal */
  profile?: Save;
}

export interface PersistlySlotInspection {
  status: typeof PersistlyGameSaveStatus.LocalFound | typeof PersistlyGameSaveStatus.NotFound;
  target: typeof PersistlyGameSaveTarget.Slot;
  slotId?: string;
  /** @internal */
  slotKey?: string;
  data?: JsonObject;
  /** @internal */
  state?: JsonObject;
  slotInfo?: JsonObject;
  /** @internal */
  metadata?: JsonObject;
  version?: number;
  /** @internal */
  characterSaveId?: string;
  dirty: boolean;
  archived: boolean;
  lastCloudData?: JsonObject;
  /** @internal */
  lastCloudState?: JsonObject;
  lastCloudSlotInfo?: JsonObject;
  /** @internal */
  lastCloudMetadata?: JsonObject;
  lastLocalSavedAt?: string;
  lastRemoteSyncedAt?: string;
}

export interface PersistlyAccountInspection {
  status: typeof PersistlyGameSaveStatus.LocalFound | typeof PersistlyGameSaveStatus.NotFound;
  target: typeof PersistlyGameSaveTarget.Account;
  accountId?: string;
  accountData?: JsonObject;
  slots?: JsonObject[];
  /** @internal */
  metadata?: JsonObject;
  /** @internal */
  characterSlots?: JsonObject[];
  version?: number;
  dirty: boolean;
  lastCloudAccountData?: JsonObject;
  cloudVersion?: number;
  lastRemoteSyncedAt?: string;
}

export type PersistlyGameSaveSyncResult =
  | {
      status: typeof PersistlyGameSaveStatus.LocalSaved;
      target: PersistlyGameSaveTargetValue;
      slotId?: string;
      /** @internal */
      slotKey?: string;
    }
  | {
      status: typeof PersistlyGameSaveStatus.NoChanges | typeof PersistlyGameSaveStatus.Cooldown;
      target: PersistlyGameSaveTargetValue;
      slotId?: string;
      /** @internal */
      slotKey?: string;
    }
  | {
      status: typeof PersistlyGameSaveStatus.Synced;
      target: PersistlyGameSaveTargetValue;
      slotId?: string;
      /** @internal */
      slotKey?: string;
      save?: Save | undefined;
      account?: Save | undefined;
      /** @internal */
      profile?: Save | undefined;
      historyRetained?: boolean;
      warnings?: string[];
    }
  | {
      status: typeof PersistlyGameSaveStatus.Conflict;
      target: PersistlyGameSaveTargetValue;
      slotId?: string;
      /** @internal */
      slotKey?: string;
      localData?: JsonObject;
      cloudData?: JsonObject;
      /** @internal */
      localState?: JsonObject;
      /** @internal */
      cloudState?: JsonObject;
      localVersion?: number;
      cloudVersion: number;
      cloudSave: Save;
    }
  | {
      status: typeof PersistlyGameSaveStatus.Offline;
      target: PersistlyGameSaveTargetValue;
      slotId?: string;
      /** @internal */
      slotKey?: string;
    }
  | {
      status: typeof PersistlyGameSaveStatus.RateLimited;
      target: PersistlyGameSaveTargetValue;
      slotId?: string;
      /** @internal */
      slotKey?: string;
      retryAfterSeconds?: number;
    };

export type PersistlySlotResult = PersistlyGameSaveSyncResult;

const ACCOUNT_RECORD_SCHEMA = "persistly.gameSaves.account.v1" as const;
const SLOT_INDEX_SCHEMA = "persistly.gameSaves.slotIndex.v1" as const;
const SLOT_RECORD_SCHEMA = "persistly.gameSaves.slot.v1" as const;

interface AccountRecord {
  schema: typeof ACCOUNT_RECORD_SCHEMA;
  schemaVersion: 1;
  accountId?: string;
  accountSessionToken?: string;
  version?: number;
  metadata: JsonObject;
  accountData: JsonObject;
  characterSlots: JsonObject[];
  slots?: JsonObject[];
  cloudAccountData?: JsonObject;
  cloudMetadata?: JsonObject;
  cloudVersion?: number;
  dirty: boolean;
  lastRemoteSyncedAt?: string;
  syncPolicy?: SyncPolicy;
}

interface SlotRecord {
  schema: typeof SLOT_RECORD_SCHEMA;
  schemaVersion: 1;
  slotKey: string;
  characterSaveId?: string | undefined;
  version?: number | undefined;
  metadata: JsonObject;
  slotInfo?: JsonObject;
  state: JsonObject;
  cloudState?: JsonObject | undefined;
  cloudMetadata?: JsonObject | undefined;
  cloudSlotInfo?: JsonObject | undefined;
  cloudVersion?: number | undefined;
  dirty: boolean;
  archived: boolean;
  lastLocalSavedAt?: string;
  lastRemoteSyncedAt?: string;
}

interface GameSavesStore {
  getProfile(): Promise<AccountRecord | undefined>;
  setProfile(profile: AccountRecord): Promise<void>;
  deleteAccount(): Promise<void>;
  getSlot(slotId: string): Promise<SlotRecord | undefined>;
  setSlot(slot: SlotRecord): Promise<void>;
  deleteSlot(slotId: string): Promise<void>;
  listSlotKeys(): Promise<string[]>;
}

interface PersistlyGameSavesFacade {
  createAccount(): Promise<PersistlyEnsureAccountResult>;
  attachAccount(options: PersistlyAttachAccountOptions): Promise<PersistlyEnsureAccountResult>;
  ensureAccount(): Promise<PersistlyEnsureAccountResult>;
  getAccountSession(options?: { includeToken?: boolean }): Promise<PersistlyAccountSession>;
  getAccountInfo(): Promise<PersistlyAccountInspection>;
  getAccountData(): Promise<JsonObject>;
  saveAccountData(accountData: JsonObject): Promise<PersistlyGameSaveSyncResult>;
  patchAccountData(accountDataPatch: JsonObject): Promise<PersistlyGameSaveSyncResult>;
  forceSyncAccount(options?: PersistlyGameSavesSyncOptions): Promise<PersistlyGameSaveSyncResult>;
  syncDueAccount(options?: PersistlyGameSavesSyncOptions): Promise<PersistlyGameSaveSyncResult>;
  loadData(): Promise<PersistlySlotInspection>;
  saveData(state: JsonObject, options?: PersistlyGameSavesSaveSlotOptions): Promise<PersistlyGameSaveSyncResult>;
  inspectData(): Promise<PersistlySlotInspection>;
  loadSlot(slotId: string): Promise<PersistlySlotInspection>;
  saveSlot(slotId: string, state: JsonObject, options?: PersistlyGameSavesSaveSlotOptions): Promise<PersistlyGameSaveSyncResult>;
  listSlots(options?: { includeArchived?: boolean }): Promise<PersistlySlotInspection[]>;
  inspectSlot(slotId: string): Promise<PersistlySlotInspection>;
  refreshSlot(slotId: string): Promise<PersistlyGameSaveSyncResult>;
  forceSyncData(options?: PersistlyGameSavesSyncOptions): Promise<PersistlyGameSaveSyncResult>;
  forceSync(slotId: string, options?: PersistlyGameSavesSyncOptions): Promise<PersistlyGameSaveSyncResult>;
  syncDueSlots(options?: PersistlyGameSavesSyncOptions): Promise<PersistlyGameSaveSyncResult[]>;
  syncDue(options?: PersistlyGameSavesSyncOptions): Promise<PersistlyGameSaveSyncResult[]>;
  archiveSlot(slotId: string): Promise<PersistlyGameSaveSyncResult>;
  deleteAccount(): Promise<PersistlyGameSaveSyncResult>;
  deleteSlot(slotId: string): Promise<PersistlyGameSaveSyncResult>;
  clearLocalAccount(): Promise<PersistlyGameSaveSyncResult>;
  clearLocalSlot(slotId: string): Promise<PersistlyGameSaveSyncResult>;
  acceptCloudData(): Promise<PersistlyGameSaveSyncResult>;
  overwriteCloudData(options?: PersistlyGameSavesSyncOptions): Promise<PersistlyGameSaveSyncResult>;
  keepLocalDataForLater(): Promise<PersistlyGameSaveSyncResult>;
  acceptCloudVersion(slotId: string): Promise<PersistlyGameSaveSyncResult>;
  overwriteCloudVersion(slotId: string, options?: PersistlyGameSavesSyncOptions): Promise<PersistlyGameSaveSyncResult>;
  keepLocalForLater(slotId: string): Promise<PersistlyGameSaveSyncResult>;
}

class MemoryGameSavesStore implements GameSavesStore {
  private profile: AccountRecord | undefined;
  private readonly slots = new Map<string, SlotRecord>();

  async getProfile(): Promise<AccountRecord | undefined> {
    return cloneOptional(this.profile);
  }

  async setProfile(profile: AccountRecord): Promise<void> {
    this.profile = clone(profile);
  }

  async deleteAccount(): Promise<void> {
    this.profile = undefined;
  }

  async getSlot(slotId: string): Promise<SlotRecord | undefined> {
    return cloneOptional(this.slots.get(slotId));
  }

  async setSlot(slot: SlotRecord): Promise<void> {
    this.slots.set(slot.slotKey, clone(slot));
  }

  async deleteSlot(slotId: string): Promise<void> {
    this.slots.delete(slotId);
  }

  async listSlotKeys(): Promise<string[]> {
    return [...this.slots.keys()].sort();
  }
}

class LocalStorageGameSavesStore implements GameSavesStore {
  private readonly storage: LocalStorageLike;
  private readonly keyPrefix: string;

  constructor(config: PersistlyGameSavesConfig) {
    const storage = config.storageHelper ?? (globalThis as { localStorage?: LocalStorageLike }).localStorage;

    if (!storage) {
      throw new PersistlyConfigurationError(
        "PersistlyGameSaves localStorage storage requires browser localStorage or an explicit storageHelper.",
      );
    }

    this.storage = storage;
    this.keyPrefix = `persistly:game-saves:${encodeURIComponent(config.runtimeKey)}:${encodeURIComponent(resolveLocalNamespace(config, storage))}`;
  }

  async getProfile(): Promise<AccountRecord | undefined> {
    return parseStoredAccountRecord(this.storage.getItem(this.profileKey()));
  }

  async setProfile(profile: AccountRecord): Promise<void> {
    this.storage.setItem(this.profileKey(), JSON.stringify(profile));
  }

  async deleteAccount(): Promise<void> {
    this.storage.removeItem(this.profileKey());
  }

  async getSlot(slotId: string): Promise<SlotRecord | undefined> {
    return parseStoredSlotRecord(this.storage.getItem(this.slotKey(slotId)));
  }

  async setSlot(slot: SlotRecord): Promise<void> {
    const keys = await this.listSlotKeys();
    if (!keys.includes(slot.slotKey)) {
      this.storage.setItem(this.slotIndexKey(), JSON.stringify({
        schema: SLOT_INDEX_SCHEMA,
        slotKeys: [...keys, slot.slotKey].sort(),
      }));
    }
    this.storage.setItem(this.slotKey(slot.slotKey), JSON.stringify(slot));
  }

  async deleteSlot(slotId: string): Promise<void> {
    this.storage.removeItem(this.slotKey(slotId));
    const keys = (await this.listSlotKeys()).filter((key) => key !== slotId);
    this.storage.setItem(this.slotIndexKey(), JSON.stringify({
      schema: SLOT_INDEX_SCHEMA,
      slotKeys: keys,
    }));
  }

  async listSlotKeys(): Promise<string[]> {
    const value = this.storage.getItem(this.slotIndexKey());
    if (value === null) {
      return [];
    }
    return parseStoredSlotIndex(value);
  }

  private profileKey(): string {
    return `${this.keyPrefix}:profile`;
  }

  private slotIndexKey(): string {
    return `${this.keyPrefix}:slot-index`;
  }

  private slotKey(slotId: string): string {
    return `${this.keyPrefix}:slot:${encodeURIComponent(slotId)}`;
  }
}

class UnconfiguredPersistlyGameSaves implements PersistlyGameSavesFacade {
  async createAccount(): Promise<never> {
    throwNotConfigured();
  }

  async attachAccount(): Promise<never> {
    throwNotConfigured();
  }

  async ensureAccount(): Promise<never> {
    throwNotConfigured();
  }

  async getAccountSession(): Promise<never> {
    throwNotConfigured();
  }

  async getAccountInfo(): Promise<never> {
    throwNotConfigured();
  }

  async getAccountData(): Promise<never> {
    throwNotConfigured();
  }

  async saveAccountData(): Promise<never> {
    throwNotConfigured();
  }

  async patchAccountData(): Promise<never> {
    throwNotConfigured();
  }

  async forceSyncAccount(): Promise<never> {
    throwNotConfigured();
  }

  async syncDueAccount(): Promise<never> {
    throwNotConfigured();
  }

  async loadData(): Promise<never> {
    throwNotConfigured();
  }

  async saveData(): Promise<never> {
    throwNotConfigured();
  }

  async inspectData(): Promise<never> {
    throwNotConfigured();
  }

  async loadSlot(): Promise<never> {
    throwNotConfigured();
  }

  async saveSlot(): Promise<never> {
    throwNotConfigured();
  }

  async listSlots(): Promise<never> {
    throwNotConfigured();
  }

  async inspectSlot(): Promise<never> {
    throwNotConfigured();
  }

  async refreshSlot(): Promise<never> {
    throwNotConfigured();
  }

  async forceSyncData(): Promise<never> {
    throwNotConfigured();
  }

  async forceSync(): Promise<never> {
    throwNotConfigured();
  }

  async syncDueSlots(): Promise<never> {
    throwNotConfigured();
  }

  async syncDue(): Promise<never> {
    throwNotConfigured();
  }

  async archiveSlot(): Promise<never> {
    throwNotConfigured();
  }

  async deleteAccount(): Promise<never> {
    throwNotConfigured();
  }

  async deleteSlot(): Promise<never> {
    throwNotConfigured();
  }

  async clearLocalAccount(): Promise<never> {
    throwNotConfigured();
  }

  async clearLocalSlot(): Promise<never> {
    throwNotConfigured();
  }

  async acceptCloudData(): Promise<never> {
    throwNotConfigured();
  }

  async overwriteCloudData(): Promise<never> {
    throwNotConfigured();
  }

  async keepLocalDataForLater(): Promise<never> {
    throwNotConfigured();
  }

  async acceptCloudVersion(): Promise<never> {
    throwNotConfigured();
  }

  async overwriteCloudVersion(): Promise<never> {
    throwNotConfigured();
  }

  async keepLocalForLater(): Promise<never> {
    throwNotConfigured();
  }
}

export class PersistlyGameSavesInstance implements PersistlyGameSavesFacade {
  private readonly client: PersistlyClient;
  private readonly config: PersistlyGameSavesConfig;
  private readonly store: GameSavesStore;
  private readonly now: () => string;
  private ignoreConfiguredProfileSessionSeed = false;

  constructor(config: PersistlyGameSavesConfig) {
    if (!config.runtimeKey) {
      throw new PersistlyConfigurationError("PersistlyGameSaves requires a non-empty runtimeKey.");
    }

    this.config = config;
    this.client = new PersistlyClient({
      runtimeKey: config.runtimeKey,
      ...(config.fetch === undefined ? {} : { fetch: config.fetch }),
    });
    this.store = createStore(config);
    this.now = () => new Date().toISOString();
  }

  async createAccount(): Promise<PersistlyEnsureAccountResult> {
    await this.assertNoExistingLocalProfileState(
      "createAccount requires empty local profile state. Call clearLocalAccount() before creating a different profile.",
    );
    const profile = await this.getOrCreateLocalAccount();
    const created = await this.createRemoteAccount(profile);
    if (!created.accountId) {
      throw new PersistlyConfigurationError("createAccount could not resolve accountId.");
    }
    return {
      status: PersistlyGameSaveStatus.Synced,
      target: PersistlyGameSaveTarget.Account,
      accountId: created.accountId,
      profile: profileRecordToSave(created),
    };
  }

  async attachAccount(options: PersistlyAttachAccountOptions): Promise<PersistlyEnsureAccountResult> {
    await this.assertNoExistingLocalProfileState(
      "attachAccount requires empty local profile state. Call clearLocalAccount() before attaching a different profile.",
    );
    this.ignoreConfiguredProfileSessionSeed = true;
    const seed: AccountRecord = {
      schema: ACCOUNT_RECORD_SCHEMA,
      schemaVersion: 1,
      accountId: options.accountId,
      accountSessionToken: options.accountSessionToken,
      metadata: {},
      accountData: {},
      characterSlots: [],
      dirty: false,
    };
    await this.store.setProfile(seed);
    const attached = await this.loadRemoteAccount(seed as AccountRecord & { accountId: string; accountSessionToken: string });
    return {
      status: PersistlyGameSaveStatus.Synced,
      target: PersistlyGameSaveTarget.Account,
      accountId: attached.accountId ?? options.accountId,
      profile: profileRecordToSave(attached),
    };
  }

  async ensureAccount(): Promise<PersistlyEnsureAccountResult> {
    const existing = await this.getOrCreateLocalAccount();
    if (existing.accountId && existing.accountSessionToken && existing.version !== undefined) {
      return {
        status: PersistlyGameSaveStatus.LocalFound,
        target: PersistlyGameSaveTarget.Account,
        accountId: existing.accountId,
        profile: profileRecordToSave(existing),
      };
    }

    const synced = await this.createRemoteAccount(existing);
    if (!synced.accountId) {
      throw new PersistlyConfigurationError("ensureAccount could not resolve accountId.");
    }
    return {
      status: PersistlyGameSaveStatus.Synced,
      target: PersistlyGameSaveTarget.Account,
      accountId: synced.accountId,
      profile: profileRecordToSave(synced),
    };
  }

  async getAccountSession(options: { includeToken?: boolean } = {}): Promise<PersistlyAccountSession> {
    const profile = await this.store.getProfile();
    if (!profile?.accountId) {
      return {};
    }

    return {
      accountId: profile.accountId,
      ...(options.includeToken ? { accountSessionToken: profile.accountSessionToken } : {}),
    };
  }

  async getAccountInfo(): Promise<PersistlyAccountInspection> {
    const profile = await this.store.getProfile();
    if (!profile) {
      return {
        status: PersistlyGameSaveStatus.NotFound,
        target: PersistlyGameSaveTarget.Account,
        dirty: false,
      };
    }

    return {
      status: PersistlyGameSaveStatus.LocalFound,
      target: PersistlyGameSaveTarget.Account,
      ...(profile.accountId === undefined ? {} : { accountId: profile.accountId }),
      metadata: clone(profile.metadata),
      accountData: clone(profile.accountData),
      characterSlots: clone(profile.characterSlots),
      ...(profile.version === undefined ? {} : { version: profile.version }),
      dirty: profile.dirty,
      ...(profile.cloudAccountData === undefined ? {} : { lastCloudAccountData: clone(profile.cloudAccountData) }),
      ...(profile.cloudMetadata === undefined ? {} : { lastCloudMetadata: clone(profile.cloudMetadata) }),
      ...(profile.cloudVersion === undefined ? {} : { cloudVersion: profile.cloudVersion }),
      ...(profile.lastRemoteSyncedAt === undefined ? {} : { lastRemoteSyncedAt: profile.lastRemoteSyncedAt }),
    };
  }

  async getAccountData(): Promise<JsonObject> {
    return clone((await this.store.getProfile())?.accountData ?? {});
  }

  async saveAccountData(accountData: JsonObject): Promise<PersistlyGameSaveSyncResult> {
    const profile = await this.getOrCreateLocalAccount();
    await this.store.setProfile({
      ...profile,
      accountData: clone(parseObject(accountData, "accountData")),
      dirty: true,
    });
    return { status: PersistlyGameSaveStatus.LocalSaved, target: PersistlyGameSaveTarget.Account };
  }

  async patchAccountData(accountDataPatch: JsonObject): Promise<PersistlyGameSaveSyncResult> {
    const patch = parseObject(accountDataPatch, "accountDataPatch");
    const profile = await this.getOrCreateLocalAccount();
    const accountData = clone(profile.accountData);

    for (const [key, value] of Object.entries(patch)) {
      if (value === null) {
        delete accountData[key];
      } else {
        accountData[key] = value;
      }
    }

    await this.store.setProfile({
      ...profile,
      accountData,
      dirty: true,
    });
    return { status: PersistlyGameSaveStatus.LocalSaved, target: PersistlyGameSaveTarget.Account };
  }

  async forceSyncAccount(options: PersistlyGameSavesSyncOptions = {}): Promise<PersistlyGameSaveSyncResult> {
    let profile = await this.getOrCreateLocalAccount();
    if (!profile.dirty && profile.accountId) {
      if (hasProfileSession(profile) && profile.version === undefined) {
        profile = await this.loadRemoteAccount(profile);
      }
      return this.emit({ status: PersistlyGameSaveStatus.NoChanges, target: PersistlyGameSaveTarget.Account });
    }
    if (!options.bypassCooldown && !isForceSyncAllowed(profile.lastRemoteSyncedAt, profile.syncPolicy)) {
      return this.emit({ status: PersistlyGameSaveStatus.Cooldown, target: PersistlyGameSaveTarget.Account });
    }

    try {
      if (hasProfileSession(profile) && profile.version === undefined) {
        const loaded = await this.loadRemoteAccount(profile);
        profile = {
          ...loaded,
          accountData: profile.accountData,
          dirty: profile.dirty,
          ...(profile.cloudAccountData === undefined ? {} : { cloudAccountData: profile.cloudAccountData }),
          ...(profile.cloudMetadata === undefined ? {} : { cloudMetadata: profile.cloudMetadata }),
          ...(profile.cloudVersion === undefined ? {} : { cloudVersion: profile.cloudVersion }),
        };
        await this.store.setProfile(profile);
      }

      if (!profile.accountId || !profile.accountSessionToken) {
        const synced = await this.createRemoteAccount(profile);
        return this.emit({
          status: PersistlyGameSaveStatus.Synced,
          target: PersistlyGameSaveTarget.Account,
          profile: profileRecordToSave(synced),
        });
      }

      const result = await this.client.syncAccountData({
        accountId: profile.accountId,
        accountSessionToken: profile.accountSessionToken,
        baseVersion: profile.version ?? 1,
        accountData: profile.accountData,
      });

      if (result.status === PersistlySyncStatus.Conflict) {
        const cloudAccountData = readProfileAccountData(result.save);
        const conflictedProfile: AccountRecord = {
          ...profile,
          cloudAccountData: clone(cloudAccountData),
          cloudMetadata: clone(result.save.metadata),
          cloudVersion: result.save.version,
          dirty: true,
        };
        await this.store.setProfile(conflictedProfile);
        return this.emit({
          status: PersistlyGameSaveStatus.Conflict,
          target: PersistlyGameSaveTarget.Account,
          localState: clone(profile.accountData),
          cloudState: clone(cloudAccountData),
          ...(profile.version === undefined ? {} : { localVersion: profile.version }),
          cloudVersion: result.save.version,
          cloudSave: result.save,
        });
      }

      const syncedProfile = profileFromSave(result.save, profile.accountSessionToken, profile.syncPolicy);
      await this.store.setProfile({ ...syncedProfile, dirty: false, lastRemoteSyncedAt: this.now() });
      return this.emit({
        status: PersistlyGameSaveStatus.Synced,
        target: PersistlyGameSaveTarget.Account,
        profile: result.save,
        historyRetained: result.historyRetained,
        ...(result.warnings === undefined ? {} : { warnings: result.warnings }),
      });
    } catch (error) {
      return this.mapSyncError(error, PersistlyGameSaveTarget.Account);
    }
  }

  async syncDueAccount(options: PersistlyGameSavesSyncOptions = {}): Promise<PersistlyGameSaveSyncResult> {
    const profile = await this.store.getProfile();
    if (!profile?.dirty) {
      return { status: PersistlyGameSaveStatus.NoChanges, target: PersistlyGameSaveTarget.Account };
    }
    if (!options.bypassCooldown && !isDue(profile.lastRemoteSyncedAt, profile.syncPolicy)) {
      return { status: PersistlyGameSaveStatus.Cooldown, target: PersistlyGameSaveTarget.Account };
    }
    return await this.forceSyncAccount({ ...options, bypassCooldown: true });
  }

  async loadSlot(slotId: string): Promise<PersistlySlotInspection> {
    return await this.inspectSlot(slotId);
  }

  async loadData(): Promise<PersistlySlotInspection> {
    return await this.loadSlot(PersistlyDefaultSlotKey);
  }

  async inspectData(): Promise<PersistlySlotInspection> {
    return await this.inspectSlot(PersistlyDefaultSlotKey);
  }

  async saveData(
    state: JsonObject,
    options: PersistlyGameSavesSaveSlotOptions = {},
  ): Promise<PersistlyGameSaveSyncResult> {
    return await this.saveSlot(PersistlyDefaultSlotKey, state, options);
  }

  async saveSlot(
    slotId: string,
    state: JsonObject,
    options: PersistlyGameSavesSaveSlotOptions = {},
  ): Promise<PersistlyGameSaveSyncResult> {
    await this.getOrCreateLocalAccount();
    const canonicalSlotKey = assertSlotKey(slotId);
    const existing = await this.store.getSlot(canonicalSlotKey);
    const reusableExisting = existing?.archived ? undefined : existing;
    const record: SlotRecord = {
      schema: SLOT_RECORD_SCHEMA,
      schemaVersion: 1,
      slotKey: canonicalSlotKey,
      ...(reusableExisting?.characterSaveId === undefined ? {} : { characterSaveId: reusableExisting.characterSaveId }),
      ...(reusableExisting?.version === undefined ? {} : { version: reusableExisting.version }),
      metadata: developerSlotMetadata(options.slotInfo ?? options.metadata ?? existing?.metadata ?? {}),
      slotInfo: developerSlotMetadata(options.slotInfo ?? options.metadata ?? existing?.metadata ?? {}),
      state: clone(parseObject(state, "slot.state")),
      ...(reusableExisting?.cloudState === undefined ? {} : { cloudState: reusableExisting.cloudState }),
      ...(reusableExisting?.cloudMetadata === undefined ? {} : { cloudMetadata: reusableExisting.cloudMetadata }),
      ...(reusableExisting?.cloudVersion === undefined ? {} : { cloudVersion: reusableExisting.cloudVersion }),
      dirty: true,
      archived: false,
      lastLocalSavedAt: this.now(),
      ...(reusableExisting?.lastRemoteSyncedAt === undefined ? {} : { lastRemoteSyncedAt: reusableExisting.lastRemoteSyncedAt }),
    };

    await this.store.setSlot(record);
    return { status: PersistlyGameSaveStatus.LocalSaved, target: PersistlyGameSaveTarget.Slot, slotKey: canonicalSlotKey };
  }

  async listSlots(options: { includeArchived?: boolean } = {}): Promise<PersistlySlotInspection[]> {
    const slots = await Promise.all((await this.store.listSlotKeys()).map((slotId) => this.inspectSlot(slotId)));
    return slots.filter((slot) => options.includeArchived || !slot.archived);
  }

  async inspectSlot(slotId: string): Promise<PersistlySlotInspection> {
    const canonicalSlotKey = assertSlotKey(slotId);
    const slot = await this.store.getSlot(canonicalSlotKey);
    if (!slot) {
      return {
        status: PersistlyGameSaveStatus.NotFound,
        target: PersistlyGameSaveTarget.Slot,
        slotKey: canonicalSlotKey,
        dirty: false,
        archived: false,
      };
    }

    return {
      status: PersistlyGameSaveStatus.LocalFound,
      target: PersistlyGameSaveTarget.Slot,
      slotKey: canonicalSlotKey,
      state: clone(slot.state),
      metadata: clone(slot.metadata),
      ...(slot.version === undefined ? {} : { version: slot.version }),
      ...(slot.characterSaveId === undefined ? {} : { characterSaveId: slot.characterSaveId }),
      dirty: slot.dirty,
      archived: slot.archived,
      ...(slot.cloudState === undefined ? {} : { lastCloudState: clone(slot.cloudState) }),
      ...(slot.cloudMetadata === undefined ? {} : { lastCloudMetadata: clone(slot.cloudMetadata) }),
      ...(slot.lastLocalSavedAt === undefined ? {} : { lastLocalSavedAt: slot.lastLocalSavedAt }),
      ...(slot.lastRemoteSyncedAt === undefined ? {} : { lastRemoteSyncedAt: slot.lastRemoteSyncedAt }),
    };
  }

  async refreshSlot(slotId: string): Promise<PersistlyGameSaveSyncResult> {
    const canonicalSlotKey = assertSlotKey(slotId);
    const profile = await this.requireAccountSession("refreshSlot");
    let slot = await this.store.getSlot(canonicalSlotKey);

    if (!slot?.characterSaveId) {
      await this.materializeProfileSlotRefs(profile);
      slot = await this.store.getSlot(canonicalSlotKey);
    }

    if (!slot?.characterSaveId) {
      return this.emit({
        status: PersistlyGameSaveStatus.NoChanges,
        target: PersistlyGameSaveTarget.Slot,
        slotKey: canonicalSlotKey,
      });
    }

    try {
      const remote = await this.client.loadAccountSlot({
        accountId: profile.accountId,
        accountSessionToken: profile.accountSessionToken,
        characterSaveId: slot.characterSaveId,
      });

      if (slot.dirty) {
        await this.store.setSlot({
          ...slot,
          cloudState: clone(remote.state),
          cloudMetadata: clone(remote.metadata),
          cloudVersion: remote.version,
        });
        return this.emit({
          status: PersistlyGameSaveStatus.Conflict,
          target: PersistlyGameSaveTarget.Slot,
          slotKey: canonicalSlotKey,
          localState: clone(slot.state),
          cloudState: clone(remote.state),
          ...(slot.version === undefined ? {} : { localVersion: slot.version }),
          cloudVersion: remote.version,
          cloudSave: remote,
        });
      }

      await this.store.setSlot(slotFromSave(
        canonicalSlotKey,
        remote,
        remote.state,
        stripReservedSlotMetadata(remote.metadata),
        this.now(),
      ));
      return this.emit({
        status: PersistlyGameSaveStatus.Synced,
        target: PersistlyGameSaveTarget.Slot,
        slotKey: canonicalSlotKey,
        save: remote,
      });
    } catch (error) {
      return this.mapSyncError(error, PersistlyGameSaveTarget.Slot, canonicalSlotKey);
    }
  }

  async forceSyncData(options: PersistlyGameSavesSyncOptions = {}): Promise<PersistlyGameSaveSyncResult> {
    return await this.forceSync(PersistlyDefaultSlotKey, options);
  }

  async forceSync(slotId: string, options: PersistlyGameSavesSyncOptions = {}): Promise<PersistlyGameSaveSyncResult> {
    const canonicalSlotKey = assertSlotKey(slotId);
    const slot = await this.store.getSlot(canonicalSlotKey);
    if (!slot?.dirty) {
      return this.emit({ status: PersistlyGameSaveStatus.NoChanges, target: PersistlyGameSaveTarget.Slot, slotKey: canonicalSlotKey });
    }
    if (!options.bypassCooldown && !isForceSyncAllowed(slot.lastRemoteSyncedAt, (await this.store.getProfile())?.syncPolicy)) {
      return this.emit({ status: PersistlyGameSaveStatus.Cooldown, target: PersistlyGameSaveTarget.Slot, slotKey: canonicalSlotKey });
    }

    try {
      const result = slot.characterSaveId
        ? await this.syncExistingCharacter(slot)
        : await this.createAccountOrCharacterForSlot(slot);
      return this.emit(result);
    } catch (error) {
      return this.mapSyncError(error, PersistlyGameSaveTarget.Slot, canonicalSlotKey);
    }
  }

  async syncDueSlots(options: PersistlyGameSavesSyncOptions = {}): Promise<PersistlyGameSaveSyncResult[]> {
    const results: PersistlyGameSaveSyncResult[] = [];
    for (const slotKey of await this.store.listSlotKeys()) {
      const slot = await this.store.getSlot(slotKey);
      if (!slot?.dirty) {
        if (options.includeSkipped) {
          results.push({ status: PersistlyGameSaveStatus.NoChanges, target: PersistlyGameSaveTarget.Slot, slotKey });
        }
        continue;
      }
      if (!options.bypassCooldown && !isDue(slot.lastRemoteSyncedAt, (await this.store.getProfile())?.syncPolicy)) {
        if (options.includeSkipped) {
          results.push({ status: PersistlyGameSaveStatus.Cooldown, target: PersistlyGameSaveTarget.Slot, slotKey });
        }
        continue;
      }
      results.push(await this.forceSync(slotKey, { ...options, bypassCooldown: true }));
    }
    return results;
  }

  async syncDue(options: PersistlyGameSavesSyncOptions = {}): Promise<PersistlyGameSaveSyncResult[]> {
    const results: PersistlyGameSaveSyncResult[] = [];
    const profile = await this.store.getProfile();
    if (profile?.dirty || options.includeSkipped) {
      results.push(await this.syncDueAccount(options));
    }
    results.push(...(await this.syncDueSlots(options)));
    return results;
  }

  async archiveSlot(slotId: string): Promise<PersistlyGameSaveSyncResult> {
    const canonicalSlotKey = assertSlotKey(slotId);
    const profile = await this.requireAccountSession("archiveSlot");
    const slot = await this.store.getSlot(canonicalSlotKey);
    if (!slot?.characterSaveId) {
      throw new PersistlyConfigurationError("archiveSlot requires a synced local slot with a characterSaveId.");
    }

    try {
      const envelope = await this.client.archiveAccountSlot({
        accountId: profile.accountId,
        accountSessionToken: profile.accountSessionToken,
        characterSaveId: slot.characterSaveId,
      });
      await this.store.setProfile({
        ...profileFromSave(envelope.profile, profile.accountSessionToken, profile.syncPolicy),
        dirty: false,
        lastRemoteSyncedAt: this.now(),
      });
      await this.store.setSlot({
        ...slot,
        dirty: false,
        archived: true,
        lastRemoteSyncedAt: this.now(),
      });
      return this.emit({ status: PersistlyGameSaveStatus.Synced, target: PersistlyGameSaveTarget.Slot, slotKey: canonicalSlotKey });
    } catch (error) {
      return this.mapSyncError(error, PersistlyGameSaveTarget.Slot, canonicalSlotKey);
    }
  }

  async deleteAccount(): Promise<PersistlyGameSaveSyncResult> {
    const localProfile = await this.store.getProfile();
    const slotKeys = await this.store.listSlotKeys();
    if (!localProfile?.accountId || !localProfile.accountSessionToken) {
      for (const slotKey of slotKeys) {
        await this.store.deleteSlot(slotKey);
      }
      await this.store.deleteAccount();
      this.ignoreConfiguredProfileSessionSeed = true;
      return this.emit({ status: PersistlyGameSaveStatus.LocalSaved, target: PersistlyGameSaveTarget.Account });
    }

    const profile = await this.requireAccountSession("deleteAccount");
    const result = await this.client.deleteAccount({
      accountId: profile.accountId,
      accountSessionToken: profile.accountSessionToken,
    });
    for (const slotKey of slotKeys) {
      await this.store.deleteSlot(slotKey);
    }
    await this.store.deleteAccount();
    this.ignoreConfiguredProfileSessionSeed = true;
    return this.emit({
      status: PersistlyGameSaveStatus.Synced,
      target: PersistlyGameSaveTarget.Account,
      ...(result.cleanupQueued ? { warnings: ["delete_cleanup_queued"] } : {}),
    });
  }

  async deleteSlot(slotId: string): Promise<PersistlyGameSaveSyncResult> {
    const canonicalSlotKey = assertSlotKey(slotId);
    const slot = await this.store.getSlot(canonicalSlotKey);
    if (!slot) {
      return this.emit({ status: PersistlyGameSaveStatus.NoChanges, target: PersistlyGameSaveTarget.Slot, slotKey: canonicalSlotKey });
    }
    if (!slot.characterSaveId) {
      await this.store.deleteSlot(canonicalSlotKey);
      const profile = await this.store.getProfile();
      if (profile) {
        await this.store.setProfile(removeSlotRefFromProfile(profile, canonicalSlotKey));
      }
      return this.emit({ status: PersistlyGameSaveStatus.LocalSaved, target: PersistlyGameSaveTarget.Slot, slotKey: canonicalSlotKey });
    }

    const profile = await this.requireAccountSession("deleteSlot");
    const result = await this.client.deleteAccountSlot({
      accountId: profile.accountId,
      accountSessionToken: profile.accountSessionToken,
      characterSaveId: slot.characterSaveId,
    });
    await this.store.deleteSlot(canonicalSlotKey);
    if (result.profile) {
      await this.store.setProfile({
        ...profileFromSave(result.profile, profile.accountSessionToken, profile.syncPolicy),
        dirty: false,
        lastRemoteSyncedAt: this.now(),
      });
    } else {
      await this.store.setProfile(removeSlotRefFromProfile(profile, canonicalSlotKey, slot.characterSaveId, this.now()));
    }
    return this.emit({
      status: PersistlyGameSaveStatus.Synced,
      target: PersistlyGameSaveTarget.Slot,
      slotKey: canonicalSlotKey,
      ...(result.profile === undefined ? {} : { profile: result.profile }),
      ...(result.cleanupQueued ? { warnings: ["delete_cleanup_queued"] } : {}),
    });
  }

  async clearLocalAccount(): Promise<PersistlyGameSaveSyncResult> {
    for (const slotKey of await this.store.listSlotKeys()) {
      await this.store.deleteSlot(slotKey);
    }
    await this.store.deleteAccount();
    this.ignoreConfiguredProfileSessionSeed = true;
    return { status: PersistlyGameSaveStatus.LocalSaved, target: PersistlyGameSaveTarget.Account };
  }

  async clearLocalSlot(slotId: string): Promise<PersistlyGameSaveSyncResult> {
    const canonicalSlotKey = assertSlotKey(slotId);
    await this.store.deleteSlot(canonicalSlotKey);
    return { status: PersistlyGameSaveStatus.LocalSaved, target: PersistlyGameSaveTarget.Slot, slotKey: canonicalSlotKey };
  }

  async acceptCloudData(): Promise<PersistlyGameSaveSyncResult> {
    return await this.acceptCloudVersion(PersistlyDefaultSlotKey);
  }

  async overwriteCloudData(options: PersistlyGameSavesSyncOptions = {}): Promise<PersistlyGameSaveSyncResult> {
    return await this.overwriteCloudVersion(PersistlyDefaultSlotKey, options);
  }

  async keepLocalDataForLater(): Promise<PersistlyGameSaveSyncResult> {
    return await this.keepLocalForLater(PersistlyDefaultSlotKey);
  }

  async acceptCloudVersion(slotId: string): Promise<PersistlyGameSaveSyncResult> {
    const canonicalSlotKey = assertSlotKey(slotId);
    const slot = await this.store.getSlot(canonicalSlotKey);
    if (!slot?.cloudState || slot.cloudVersion === undefined) {
      return { status: PersistlyGameSaveStatus.NoChanges, target: PersistlyGameSaveTarget.Slot, slotKey: canonicalSlotKey };
    }

    await this.store.setSlot({
      ...slot,
      state: clone(slot.cloudState),
      metadata: stripReservedSlotMetadata(slot.cloudMetadata ?? slot.metadata),
      version: slot.cloudVersion,
      dirty: false,
      lastRemoteSyncedAt: this.now(),
    });
    return { status: PersistlyGameSaveStatus.Synced, target: PersistlyGameSaveTarget.Slot, slotKey: canonicalSlotKey };
  }

  async overwriteCloudVersion(slotId: string, options: PersistlyGameSavesSyncOptions = {}): Promise<PersistlyGameSaveSyncResult> {
    const canonicalSlotKey = assertSlotKey(slotId);
    const slot = await this.store.getSlot(canonicalSlotKey);
    if (!slot?.dirty) {
      return { status: PersistlyGameSaveStatus.NoChanges, target: PersistlyGameSaveTarget.Slot, slotKey: canonicalSlotKey };
    }
    if (slot.cloudVersion !== undefined) {
      await this.store.setSlot({ ...slot, version: slot.cloudVersion });
    }
    return await this.forceSync(canonicalSlotKey, options);
  }

  async keepLocalForLater(slotId: string): Promise<PersistlyGameSaveSyncResult> {
    const canonicalSlotKey = assertSlotKey(slotId);
    const slot = await this.store.getSlot(canonicalSlotKey);
    if (slot) {
      await this.store.setSlot({ ...slot, dirty: true });
    }
    return { status: PersistlyGameSaveStatus.LocalSaved, target: PersistlyGameSaveTarget.Slot, slotKey: canonicalSlotKey };
  }

  private async createAccountOrCharacterForSlot(slot: SlotRecord): Promise<PersistlyGameSaveSyncResult> {
    let profile = await this.getOrCreateLocalAccount();
    if (!profile.accountId || !profile.accountSessionToken) {
      const envelope = await this.client.createAccount({
        ...(this.config.playerRef === undefined ? {} : { playerRef: this.config.playerRef }),
        ...(this.config.externalAccountRef === undefined ? {} : { externalAccountRef: this.config.externalAccountRef }),
        accountData: profile.accountData,
        character: {
          metadata: remoteSlotMetadata(slot.slotKey, slot.metadata),
          state: slot.state,
        },
      });
      const profileRecord = profileFromSave(envelope.profile, envelope.accountSessionToken, envelope.syncPolicy);
      await this.store.setProfile({ ...profileRecord, dirty: false, lastRemoteSyncedAt: this.now() });
      if (!envelope.character) {
        throw new PersistlyConfigurationError("Create profile response did not include the requested initial character.");
      }
      await this.store.setSlot(slotFromSave(slot.slotKey, envelope.character, slot.state, slot.metadata, this.now()));
      return { status: PersistlyGameSaveStatus.Synced, target: PersistlyGameSaveTarget.Slot, slotKey: slot.slotKey, save: envelope.character };
    }

    if (!hasProfileSession(profile)) {
      throw new PersistlyConfigurationError("createAccountOrCharacterForSlot requires accountId and accountSessionToken.");
    }
    const accountId = profile.accountId;
    const accountSessionToken = profile.accountSessionToken;

    if (profile.version === undefined) {
      profile = await this.loadRemoteAccount(profile);
    }

    try {
      const envelope = await this.client.createAccountSlot({
        accountId,
        accountSessionToken,
        metadata: remoteSlotMetadata(slot.slotKey, slot.metadata),
        state: slot.state,
      });
      await this.store.setProfile({
        ...profileFromSave(envelope.profile, accountSessionToken, profile.syncPolicy),
        dirty: false,
        lastRemoteSyncedAt: this.now(),
      });
      await this.store.setSlot(slotFromSave(slot.slotKey, envelope.character, slot.state, slot.metadata, this.now()));
      return { status: PersistlyGameSaveStatus.Synced, target: PersistlyGameSaveTarget.Slot, slotKey: slot.slotKey, save: envelope.character };
    } catch (error) {
      if (!(error instanceof PersistlySlotAlreadyExistsError)) {
        throw error;
      }
      const reconciled = await this.reconcileExistingRemoteSlot(slot, accountId, accountSessionToken, profile.syncPolicy);
      return await this.syncExistingCharacter(reconciled);
    }
  }

  private async syncExistingCharacter(slot: SlotRecord): Promise<PersistlyGameSaveSyncResult> {
    const profile = await this.requireAccountSession("forceSync");
    if (!slot.characterSaveId) {
      throw new PersistlyConfigurationError("syncExistingCharacter requires characterSaveId.");
    }

    const baseVersion = slot.version ?? slot.cloudVersion;
    const result = await this.client.syncAccountSlot({
      accountId: profile.accountId,
      accountSessionToken: profile.accountSessionToken,
      characterSaveId: slot.characterSaveId,
      ...(baseVersion === undefined ? {} : { baseVersion }),
      metadata: remoteSlotMetadata(slot.slotKey, slot.metadata),
      state: slot.state,
    });

    if (result.status === PersistlySyncStatus.Conflict) {
      await this.store.setSlot({
        ...slot,
        cloudState: clone(result.save.state),
        cloudMetadata: clone(result.save.metadata),
        cloudVersion: result.save.version,
        dirty: true,
      });
      return {
        status: PersistlyGameSaveStatus.Conflict,
        target: PersistlyGameSaveTarget.Slot,
        slotKey: slot.slotKey,
        localState: clone(slot.state),
        cloudState: clone(result.save.state),
        ...(slot.version === undefined ? {} : { localVersion: slot.version }),
        cloudVersion: result.save.version,
        cloudSave: result.save,
      };
    }

    await this.store.setSlot(slotFromSave(slot.slotKey, result.save, slot.state, slot.metadata, this.now()));
    return {
      status: PersistlyGameSaveStatus.Synced,
      target: PersistlyGameSaveTarget.Slot,
      slotKey: slot.slotKey,
      save: result.save,
      historyRetained: result.historyRetained,
      ...(result.warnings === undefined ? {} : { warnings: result.warnings }),
    };
  }

  private async getOrCreateLocalAccount(): Promise<AccountRecord> {
    const stored = await this.store.getProfile();
    if (stored) {
      return stored;
    }

    const profile: AccountRecord = {
      schema: ACCOUNT_RECORD_SCHEMA,
      schemaVersion: 1,
      ...(this.ignoreConfiguredProfileSessionSeed || this.config.accountId === undefined
        ? {}
        : { accountId: this.config.accountId }),
      ...(this.ignoreConfiguredProfileSessionSeed || this.config.accountSessionToken === undefined
        ? {}
        : { accountSessionToken: this.config.accountSessionToken }),
      ...(this.ignoreConfiguredProfileSessionSeed || this.config.accountId === undefined || this.config.accountSessionToken === undefined
        ? { version: 1 }
        : {}),
      metadata: {},
      accountData: {},
      characterSlots: [],
      dirty: false,
    };
    await this.store.setProfile(profile);
    return profile;
  }

  private async createRemoteAccount(profile: AccountRecord): Promise<AccountRecord> {
    if (hasProfileSession(profile)) {
      return await this.loadRemoteAccount(profile);
    }

    const envelope = await this.client.createAccount({
      ...(this.config.playerRef === undefined ? {} : { playerRef: this.config.playerRef }),
      ...(this.config.externalAccountRef === undefined ? {} : { externalAccountRef: this.config.externalAccountRef }),
      accountData: profile.accountData,
    });
    const nextProfile = profileFromSave(envelope.profile, envelope.accountSessionToken, envelope.syncPolicy);
    await this.store.setProfile({ ...nextProfile, dirty: false, lastRemoteSyncedAt: this.now() });
    return nextProfile;
  }

  private async requireAccountSession(operation: string): Promise<AccountRecord & { accountId: string; accountSessionToken: string }> {
    let profile = await this.getOrCreateLocalAccount();
    if (!hasProfileSession(profile)) {
      throw new PersistlyConfigurationError(`${operation} requires accountId and accountSessionToken.`);
    }
    const accountId = profile.accountId;
    const accountSessionToken = profile.accountSessionToken;
    if (profile.version === undefined) {
      profile = await this.loadRemoteAccount(profile);
    }
    return { ...profile, accountId, accountSessionToken };
  }

  private async loadRemoteAccount(profile: AccountRecord & { accountId: string; accountSessionToken: string }): Promise<AccountRecord> {
    const envelope = await this.client.loadAccountEnvelope({
      accountId: profile.accountId,
      accountSessionToken: profile.accountSessionToken,
    });
    const syncPolicy = envelope.syncPolicy ?? (await this.client.getRuntimeConfig()).syncPolicy;
    const nextProfile = profileFromSave(envelope.profile, profile.accountSessionToken, syncPolicy);
    await this.store.setProfile({ ...nextProfile, dirty: false, lastRemoteSyncedAt: this.now() });
    await this.materializeProfileSlotRefs(nextProfile);
    return nextProfile;
  }

  private emit(result: PersistlyGameSaveSyncResult): PersistlyGameSaveSyncResult {
    this.config.onSyncResult?.(result);
    return result;
  }

  private mapSyncError(
    error: unknown,
    target: PersistlyGameSaveTargetValue,
    slotKey?: string,
  ): PersistlyGameSaveSyncResult {
    if (error instanceof PersistlyRateLimitedError) {
      const retryAfterSeconds = readRetryAfterSeconds(error.details);
      return this.emit({
        status: PersistlyGameSaveStatus.RateLimited,
        target,
        ...(slotKey === undefined ? {} : { slotKey }),
        ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      });
    }
    if (error instanceof PersistlyTransportError || (error instanceof Error && /fetch|network|offline/i.test(error.message))) {
      return this.emit({ status: PersistlyGameSaveStatus.Offline, target, ...(slotKey === undefined ? {} : { slotKey }) });
    }
    if (error instanceof PersistlyApiError && error.code === "rate_limited") {
      return this.emit({ status: PersistlyGameSaveStatus.RateLimited, target, ...(slotKey === undefined ? {} : { slotKey }) });
    }
    throw error;
  }

  private async reconcileExistingRemoteSlot(
    slot: SlotRecord,
    accountId: string,
    accountSessionToken: string,
    syncPolicy: SyncPolicy | undefined,
  ): Promise<SlotRecord> {
    const envelope = await this.client.loadAccountEnvelope({
      accountId,
      accountSessionToken,
    });
    const nextProfile = profileFromSave(envelope.profile, accountSessionToken, envelope.syncPolicy ?? syncPolicy);
    await this.store.setProfile({ ...nextProfile, dirty: false, lastRemoteSyncedAt: this.now() });

    const remoteSlot = findRemoteCharacterSlot(nextProfile.characterSlots, slot.slotKey);
    if (!remoteSlot?.characterSaveId) {
      throw new PersistlyConfigurationError(
        `Remote profile reported slot_already_exists for ${slot.slotKey} but did not expose a matching characterSaveId.`,
      );
    }

    const remoteCharacter = await this.client.loadAccountSlot({
      accountId,
      accountSessionToken,
      characterSaveId: remoteSlot.characterSaveId,
    });

    const reconciled: SlotRecord = {
      ...slot,
      characterSaveId: remoteCharacter.saveId,
      version: remoteCharacter.version,
      cloudState: clone(remoteCharacter.state),
      cloudMetadata: clone(remoteCharacter.metadata),
      cloudVersion: remoteCharacter.version,
      archived: false,
      ...(slot.lastRemoteSyncedAt === undefined ? {} : { lastRemoteSyncedAt: slot.lastRemoteSyncedAt }),
    };
    await this.store.setSlot(reconciled);
    return reconciled;
  }

  private async assertNoExistingLocalProfileState(message: string): Promise<void> {
    const profile = await this.store.getProfile();
    const slotKeys = await this.store.listSlotKeys();
    if (!isBlankLocalProfile(profile) || slotKeys.length > 0) {
      throw new PersistlyConfigurationError(message);
    }
  }

  private async materializeProfileSlotRefs(profile: AccountRecord): Promise<void> {
    for (const slotRef of profile.characterSlots) {
      const slotKey = typeof slotRef.slotKey === "string" ? slotRef.slotKey : "";
      if (!slotKey) {
        continue;
      }
      const existing = await this.store.getSlot(slotKey);
      if (existing) {
        continue;
      }
      const metadata = "metadata" in slotRef ? stripReservedSlotMetadata(parseObject(slotRef.metadata, `profile.characterSlots.${slotKey}.metadata`)) : {};
      const characterSaveId = typeof slotRef.characterSaveId === "string" ? slotRef.characterSaveId : undefined;
      const archived = slotRef.archived === true;
      const stub: SlotRecord = {
        schema: SLOT_RECORD_SCHEMA,
        schemaVersion: 1,
        slotKey,
        ...(characterSaveId === undefined ? {} : { characterSaveId }),
        metadata,
        state: {},
        dirty: false,
        archived,
      };
      await this.store.setSlot(stub);
    }
  }
}

export class PersistlyGameSaves {
  static shared: PersistlyGameSavesFacade = new UnconfiguredPersistlyGameSaves();

  static async start(config: PersistlyGameSavesConfig): Promise<PersistlyGameSavesInstance> {
    return new PersistlyGameSavesInstance(config);
  }

  static async configure(config: PersistlyGameSavesConfig): Promise<void> {
    PersistlyGameSaves.shared = await PersistlyGameSaves.start(config);
  }
}

function createStore(config: PersistlyGameSavesConfig): GameSavesStore {
  if (config.storage === "memory") {
    return new MemoryGameSavesStore();
  }

  if (
    config.storage === "localStorage" ||
    config.storageHelper ||
    (globalThis as { localStorage?: LocalStorageLike }).localStorage
  ) {
    return new LocalStorageGameSavesStore(config);
  }

  return new MemoryGameSavesStore();
}

function resolveLocalNamespace(config: PersistlyGameSavesConfig, storage: LocalStorageLike): string {
  if (config.localProfileKey) {
    return config.localProfileKey;
  }
  if (config.externalAccountRef) {
    return `${config.externalAccountRef.provider}:${config.externalAccountRef.subject}`;
  }
  if (config.playerRef) {
    return config.playerRef;
  }

  const anonymousKey = `persistly:game-saves:${encodeURIComponent(config.runtimeKey)}:anonymous-device`;
  const existing = storage.getItem(anonymousKey);
  if (existing) {
    return existing;
  }
  const generated = `anonymous:${randomId()}`;
  storage.setItem(anonymousKey, generated);
  return generated;
}

function profileFromSave(save: Save, accountSessionToken: string | undefined, syncPolicy: SyncPolicy | undefined): AccountRecord {
  const profileState = readProfileState(save);
  return {
    schema: ACCOUNT_RECORD_SCHEMA,
    schemaVersion: 1,
    accountId: save.saveId,
    ...(accountSessionToken === undefined ? {} : { accountSessionToken }),
    version: save.version,
    metadata: clone(save.metadata),
    accountData: clone(profileState.accountData),
    characterSlots: clone(profileState.characterSlots),
    dirty: false,
    ...(syncPolicy === undefined ? {} : { syncPolicy }),
  };
}

function profileRecordToSave(profile: AccountRecord): Save {
  return {
    saveId: profile.accountId ?? "local_profile",
    playerRef: null,
    metadata: clone(profile.metadata),
    state: {
      schema: "persistly.profile.v1",
      accountData: clone(profile.accountData),
      characterSlots: clone(profile.characterSlots),
    },
    version: profile.version ?? 1,
    createdAt: profile.lastRemoteSyncedAt ?? new Date(0).toISOString(),
    updatedAt: profile.lastRemoteSyncedAt ?? new Date(0).toISOString(),
  };
}

function removeSlotRefFromProfile(
  profile: AccountRecord,
  slotId: string,
  characterSaveId?: string,
  lastRemoteSyncedAt?: string,
): AccountRecord {
  return {
    ...profile,
    characterSlots: profile.characterSlots.filter((entry) => {
      if (entry.slotKey === slotId) {
        return false;
      }
      if (characterSaveId !== undefined && entry.characterSaveId === characterSaveId) {
        return false;
      }
      return true;
    }),
    ...(lastRemoteSyncedAt === undefined ? {} : { lastRemoteSyncedAt }),
  };
}

function readProfileAccountData(save: Save): JsonObject {
  return clone(readProfileState(save).accountData);
}

function isBlankLocalProfile(profile: AccountRecord | undefined): boolean {
  if (!profile) {
    return true;
  }
  return !profile.accountId
    && !profile.accountSessionToken
    && Object.keys(profile.metadata).length === 0
    && Object.keys(profile.accountData).length === 0
    && profile.characterSlots.length === 0
    && !profile.dirty
    && profile.cloudAccountData === undefined
    && profile.cloudMetadata === undefined
    && profile.cloudVersion === undefined
    && profile.lastRemoteSyncedAt === undefined;
}

function readProfileState(save: Save): { accountData: JsonObject; characterSlots: JsonObject[] } {
  const state = parseObject(save.state, "profile.state");
  if (state.schema !== "persistly.profile.v1") {
    throw new PersistlyConfigurationError("profile.state.schema must be persistly.profile.v1.");
  }
  const characterSlots = state.characterSlots;
  if (!Array.isArray(characterSlots)) {
    throw new PersistlyConfigurationError("profile.state.characterSlots must be an array.");
  }

  return {
    accountData: parseObject(state.accountData, "profile.state.accountData"),
    characterSlots: characterSlots.map((slot, index) => parseObject(slot, `profile.state.characterSlots[${index}]`)),
  };
}

function findRemoteCharacterSlot(
  characterSlots: JsonObject[],
  slotId: string,
): { slotKey: string; characterSaveId?: string } | undefined {
  for (const slot of characterSlots) {
    if (slot.slotKey !== slotId) {
      continue;
    }
    const characterSaveId = typeof slot.characterSaveId === "string" ? slot.characterSaveId : undefined;
    return { slotKey: slotId, ...(characterSaveId === undefined ? {} : { characterSaveId }) };
  }
  return undefined;
}

function slotFromSave(
  slotId: string,
  save: Save,
  localState: JsonObject,
  localMetadata: JsonObject,
  now: string,
): SlotRecord {
  return {
    schema: SLOT_RECORD_SCHEMA,
    schemaVersion: 1,
    slotKey: slotId,
    characterSaveId: save.saveId,
    version: save.version,
    metadata: stripReservedSlotMetadata(localMetadata),
    state: clone(localState),
    cloudState: clone(save.state),
    cloudMetadata: clone(save.metadata),
    cloudVersion: save.version,
    dirty: false,
    archived: false,
    lastRemoteSyncedAt: now,
  };
}

function developerSlotMetadata(metadata: JsonObject): JsonObject {
  const clean = clone(parseObject(metadata, "slot.metadata"));
  if (clean._persistly !== undefined) {
    throw new PersistlyConfigurationError("slot.metadata._persistly is reserved for Persistly and must not be supplied by game code.");
  }
  return clean;
}

function remoteSlotMetadata(slotId: string, metadata: JsonObject): JsonObject {
  const clean = stripReservedSlotMetadata(metadata);
  clean._persistly = { slotKey: slotId };
  return clean;
}

function stripReservedSlotMetadata(metadata: JsonObject): JsonObject {
  const clean = clone(parseObject(metadata, "slot.metadata"));
  delete clean._persistly;
  return clean;
}

function assertSlotKey(slotId: string): string {
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(slotId)) {
    throw new PersistlyConfigurationError("slotId must match ^[A-Za-z0-9_.-]{1,64}$.");
  }
  return slotId;
}

function isForceSyncAllowed(lastRemoteSyncedAt: string | undefined, syncPolicy: SyncPolicy | undefined): boolean {
  if (!lastRemoteSyncedAt || !syncPolicy) {
    return true;
  }
  return Date.now() - Date.parse(lastRemoteSyncedAt) >= syncPolicy.forceSyncCooldownSeconds * 1000;
}

function isDue(lastRemoteSyncedAt: string | undefined, syncPolicy: SyncPolicy | undefined): boolean {
  if (!lastRemoteSyncedAt || !syncPolicy) {
    return true;
  }
  return Date.now() - Date.parse(lastRemoteSyncedAt) >= syncPolicy.minRemoteSyncIntervalSeconds * 1000;
}

function hasProfileSession(profile: AccountRecord): profile is AccountRecord & { accountId: string; accountSessionToken: string } {
  return typeof profile.accountId === "string" && typeof profile.accountSessionToken === "string";
}

function parseStoredAccountRecord(value: string | null): AccountRecord | undefined {
  if (value === null) {
    return undefined;
  }
  const record = parseStoredObject(value, "profile record");
  if (record.schema !== ACCOUNT_RECORD_SCHEMA) {
    throw new PersistlyStorageError(`Stored profile record schema is unsupported: ${String(record.schema)}.`);
  }
  if (record.schemaVersion !== 1) {
    throw new PersistlyStorageError("Stored profile record schemaVersion is unsupported.");
  }
  return {
    schema: ACCOUNT_RECORD_SCHEMA,
    schemaVersion: 1,
    ...(typeof record.accountId === "string" ? { accountId: record.accountId } : {}),
    ...(typeof record.accountSessionToken === "string" ? { accountSessionToken: record.accountSessionToken } : {}),
    ...(typeof record.version === "number" ? { version: record.version } : {}),
    metadata: parseObject(record.metadata, "stored profile.metadata"),
    accountData: parseObject(record.accountData, "stored profile.accountData"),
    characterSlots: parseStoredObjectArray(record.characterSlots, "stored profile.characterSlots"),
    ...(record.cloudAccountData === undefined ? {} : { cloudAccountData: parseObject(record.cloudAccountData, "stored profile.cloudAccountData") }),
    ...(record.cloudMetadata === undefined ? {} : { cloudMetadata: parseObject(record.cloudMetadata, "stored profile.cloudMetadata") }),
    ...(typeof record.cloudVersion === "number" ? { cloudVersion: record.cloudVersion } : {}),
    dirty: record.dirty === true,
    ...(typeof record.lastRemoteSyncedAt === "string" ? { lastRemoteSyncedAt: record.lastRemoteSyncedAt } : {}),
    ...(record.syncPolicy === undefined ? {} : { syncPolicy: parseStoredSyncPolicy(record.syncPolicy) }),
  };
}

function parseStoredSlotRecord(value: string | null): SlotRecord | undefined {
  if (value === null) {
    return undefined;
  }
  const record = parseStoredObject(value, "slot record");
  if (record.schema !== SLOT_RECORD_SCHEMA) {
    throw new PersistlyStorageError(`Stored slot record schema is unsupported: ${String(record.schema)}.`);
  }
  if (record.schemaVersion !== 1) {
    throw new PersistlyStorageError("Stored slot record schemaVersion is unsupported.");
  }
  if (typeof record.slotKey !== "string") {
    throw new PersistlyStorageError("Stored slot record slotKey must be a string.");
  }

  return {
    schema: SLOT_RECORD_SCHEMA,
    schemaVersion: 1,
    slotKey: record.slotKey,
    ...(typeof record.characterSaveId === "string" ? { characterSaveId: record.characterSaveId } : {}),
    ...(typeof record.version === "number" ? { version: record.version } : {}),
    metadata: parseObject(record.metadata, "stored slot.metadata"),
    state: parseObject(record.state, "stored slot.state"),
    ...(record.cloudState === undefined ? {} : { cloudState: parseObject(record.cloudState, "stored slot.cloudState") }),
    ...(record.cloudMetadata === undefined ? {} : { cloudMetadata: parseObject(record.cloudMetadata, "stored slot.cloudMetadata") }),
    ...(typeof record.cloudVersion === "number" ? { cloudVersion: record.cloudVersion } : {}),
    dirty: record.dirty === true,
    archived: record.archived === true,
    ...(typeof record.lastLocalSavedAt === "string" ? { lastLocalSavedAt: record.lastLocalSavedAt } : {}),
    ...(typeof record.lastRemoteSyncedAt === "string" ? { lastRemoteSyncedAt: record.lastRemoteSyncedAt } : {}),
  };
}

function parseStoredSlotIndex(value: string): string[] {
  const record = parseStoredObject(value, "slot index");
  if (record.schema !== SLOT_INDEX_SCHEMA) {
    throw new PersistlyStorageError(`Stored slot index schema is unsupported: ${String(record.schema)}.`);
  }
  if (!Array.isArray(record.slotKeys)) {
    throw new PersistlyStorageError("Stored slot index slotKeys must be an array.");
  }
  return record.slotKeys.filter((item): item is string => typeof item === "string").sort();
}

function parseStoredObject(value: string, label: string): JsonObject {
  try {
    return parseObject(JSON.parse(value), `stored ${label}`);
  } catch (error) {
    if (error instanceof PersistlyStorageError) {
      throw error;
    }
    throw new PersistlyStorageError(error instanceof Error ? error.message : `Stored ${label} was malformed.`);
  }
}

function parseStoredObjectArray(value: unknown, label: string): JsonObject[] {
  if (!Array.isArray(value)) {
    throw new PersistlyStorageError(`${label} must be an array.`);
  }
  return value.map((item, index) => parseObject(item, `${label}[${index}]`));
}

function parseStoredSyncPolicy(value: unknown): SyncPolicy {
  const record = parseObject(value, "stored profile.syncPolicy");
  return {
    minRemoteSyncIntervalSeconds: parseStoredPositiveInteger(record.minRemoteSyncIntervalSeconds, "stored syncPolicy.minRemoteSyncIntervalSeconds"),
    forceSyncCooldownSeconds: parseStoredPositiveInteger(record.forceSyncCooldownSeconds, "stored syncPolicy.forceSyncCooldownSeconds"),
    syncOnAppBackground: record.syncOnAppBackground === true,
    syncOnAppForeground: record.syncOnAppForeground === true,
    syncOnReconnect: record.syncOnReconnect === true,
    maxQueuedLocalSnapshots: parseStoredPositiveInteger(record.maxQueuedLocalSnapshots, "stored syncPolicy.maxQueuedLocalSnapshots"),
  };
}

function parseStoredPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new PersistlyStorageError(`${label} must be a positive integer.`);
  }
  return value;
}

function readRetryAfterSeconds(details: Record<string, unknown> | undefined): number | undefined {
  const retryAfterSeconds = details?.retryAfterSeconds;
  return typeof retryAfterSeconds === "number" ? retryAfterSeconds : undefined;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function cloneOptional<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : clone(value);
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 12);
}

function throwNotConfigured(): never {
  throw new PersistlyConfigurationError("not_configured: call PersistlyGameSaves.configure() first");
}

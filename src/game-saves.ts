import {
  PersistlyClient,
  PersistlySyncStatus,
  type ExternalProfileRef,
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
  Profile: "profile",
  Slot: "slot",
} as const;

export type PersistlyGameSaveTargetValue =
  (typeof PersistlyGameSaveTarget)[keyof typeof PersistlyGameSaveTarget];

export const PersistlySlotStatus = PersistlyGameSaveStatus;
export type PersistlySlotStatusValue = PersistlyGameSaveStatusValue;

export type PersistlyGameSavesStorage = "memory" | "localStorage";

export interface PersistlyGameSavesConfig {
  runtimeKey: string;
  playerRef?: string;
  externalProfileRef?: ExternalProfileRef;
  localProfileKey?: string;
  profileSaveId?: string;
  profileSessionToken?: string;
  storage?: PersistlyGameSavesStorage;
  storageHelper?: LocalStorageLike;
  fetch?: typeof globalThis.fetch;
  onSyncResult?: (result: PersistlyGameSaveSyncResult) => void;
}

export interface PersistlyGameSavesSaveSlotOptions {
  metadata?: JsonObject;
}

export interface PersistlyGameSavesSyncOptions {
  bypassCooldown?: boolean;
  includeSkipped?: boolean;
}

export interface PersistlyProfileSession {
  profileSaveId?: string;
  profileSessionToken?: string;
}

export interface PersistlyEnsureProfileResult {
  status: typeof PersistlyGameSaveStatus.Synced | typeof PersistlyGameSaveStatus.LocalFound;
  target: typeof PersistlyGameSaveTarget.Profile;
  profileSaveId: string;
  profile: Save;
}

export interface PersistlySlotInspection {
  status: typeof PersistlyGameSaveStatus.LocalFound | typeof PersistlyGameSaveStatus.NotFound;
  target: typeof PersistlyGameSaveTarget.Slot;
  slotKey: string;
  state?: JsonObject;
  metadata?: JsonObject;
  version?: number;
  characterSaveId?: string;
  dirty: boolean;
  archived: boolean;
  lastCloudState?: JsonObject;
  lastCloudMetadata?: JsonObject;
  lastLocalSavedAt?: string;
  lastRemoteSyncedAt?: string;
}

export type PersistlyGameSaveSyncResult =
  | {
      status: typeof PersistlyGameSaveStatus.LocalSaved;
      target: PersistlyGameSaveTargetValue;
      slotKey?: string;
    }
  | {
      status: typeof PersistlyGameSaveStatus.NoChanges | typeof PersistlyGameSaveStatus.Cooldown;
      target: PersistlyGameSaveTargetValue;
      slotKey?: string;
    }
  | {
      status: typeof PersistlyGameSaveStatus.Synced;
      target: PersistlyGameSaveTargetValue;
      slotKey?: string;
      save?: Save;
      profile?: Save;
      historyRetained?: boolean;
      warnings?: string[];
    }
  | {
      status: typeof PersistlyGameSaveStatus.Conflict;
      target: PersistlyGameSaveTargetValue;
      slotKey?: string;
      localState: JsonObject;
      cloudState: JsonObject;
      localVersion?: number;
      cloudVersion: number;
      cloudSave: Save;
    }
  | {
      status: typeof PersistlyGameSaveStatus.Offline;
      target: PersistlyGameSaveTargetValue;
      slotKey?: string;
    }
  | {
      status: typeof PersistlyGameSaveStatus.RateLimited;
      target: PersistlyGameSaveTargetValue;
      slotKey?: string;
      retryAfterSeconds?: number;
    };

export type PersistlySlotResult = PersistlyGameSaveSyncResult;

const PROFILE_RECORD_SCHEMA = "persistly.gameSaves.profile.v1" as const;
const SLOT_INDEX_SCHEMA = "persistly.gameSaves.slotIndex.v1" as const;
const SLOT_RECORD_SCHEMA = "persistly.gameSaves.slot.v1" as const;

interface ProfileRecord {
  schema: typeof PROFILE_RECORD_SCHEMA;
  schemaVersion: 1;
  profileSaveId?: string;
  profileSessionToken?: string;
  version?: number;
  metadata: JsonObject;
  accountData: JsonObject;
  characterSlots: JsonObject[];
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
  characterSaveId?: string;
  version?: number;
  metadata: JsonObject;
  state: JsonObject;
  cloudState?: JsonObject;
  cloudMetadata?: JsonObject;
  cloudVersion?: number;
  dirty: boolean;
  archived: boolean;
  lastLocalSavedAt?: string;
  lastRemoteSyncedAt?: string;
}

interface GameSavesStore {
  getProfile(): Promise<ProfileRecord | undefined>;
  setProfile(profile: ProfileRecord): Promise<void>;
  getSlot(slotKey: string): Promise<SlotRecord | undefined>;
  setSlot(slot: SlotRecord): Promise<void>;
  deleteSlot(slotKey: string): Promise<void>;
  listSlotKeys(): Promise<string[]>;
}

interface PersistlyGameSavesFacade {
  ensureProfile(): Promise<PersistlyEnsureProfileResult>;
  getProfileSession(options?: { includeToken?: boolean }): Promise<PersistlyProfileSession>;
  saveAccountData(accountData: JsonObject): Promise<PersistlyGameSaveSyncResult>;
  patchAccountData(accountDataPatch: JsonObject): Promise<PersistlyGameSaveSyncResult>;
  forceSyncProfile(options?: PersistlyGameSavesSyncOptions): Promise<PersistlyGameSaveSyncResult>;
  syncDueProfile(options?: PersistlyGameSavesSyncOptions): Promise<PersistlyGameSaveSyncResult>;
  loadSlot(slotKey: string): Promise<PersistlySlotInspection>;
  saveSlot(slotKey: string, state: JsonObject, options?: PersistlyGameSavesSaveSlotOptions): Promise<PersistlyGameSaveSyncResult>;
  listSlots(options?: { includeArchived?: boolean }): Promise<PersistlySlotInspection[]>;
  inspectSlot(slotKey: string): Promise<PersistlySlotInspection>;
  forceSync(slotKey: string, options?: PersistlyGameSavesSyncOptions): Promise<PersistlyGameSaveSyncResult>;
  syncDueSlots(options?: PersistlyGameSavesSyncOptions): Promise<PersistlyGameSaveSyncResult[]>;
  syncDue(options?: PersistlyGameSavesSyncOptions): Promise<PersistlyGameSaveSyncResult[]>;
  archiveSlot(slotKey: string): Promise<PersistlyGameSaveSyncResult>;
  clearLocalSlot(slotKey: string): Promise<PersistlyGameSaveSyncResult>;
  acceptCloudVersion(slotKey: string): Promise<PersistlyGameSaveSyncResult>;
  overwriteCloudVersion(slotKey: string, options?: PersistlyGameSavesSyncOptions): Promise<PersistlyGameSaveSyncResult>;
  keepLocalForLater(slotKey: string): Promise<PersistlyGameSaveSyncResult>;
}

class MemoryGameSavesStore implements GameSavesStore {
  private profile: ProfileRecord | undefined;
  private readonly slots = new Map<string, SlotRecord>();

  async getProfile(): Promise<ProfileRecord | undefined> {
    return cloneOptional(this.profile);
  }

  async setProfile(profile: ProfileRecord): Promise<void> {
    this.profile = clone(profile);
  }

  async getSlot(slotKey: string): Promise<SlotRecord | undefined> {
    return cloneOptional(this.slots.get(slotKey));
  }

  async setSlot(slot: SlotRecord): Promise<void> {
    this.slots.set(slot.slotKey, clone(slot));
  }

  async deleteSlot(slotKey: string): Promise<void> {
    this.slots.delete(slotKey);
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

  async getProfile(): Promise<ProfileRecord | undefined> {
    return parseStoredProfileRecord(this.storage.getItem(this.profileKey()));
  }

  async setProfile(profile: ProfileRecord): Promise<void> {
    this.storage.setItem(this.profileKey(), JSON.stringify(profile));
  }

  async getSlot(slotKey: string): Promise<SlotRecord | undefined> {
    return parseStoredSlotRecord(this.storage.getItem(this.slotKey(slotKey)));
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

  async deleteSlot(slotKey: string): Promise<void> {
    this.storage.removeItem(this.slotKey(slotKey));
    const keys = (await this.listSlotKeys()).filter((key) => key !== slotKey);
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

  private slotKey(slotKey: string): string {
    return `${this.keyPrefix}:slot:${encodeURIComponent(slotKey)}`;
  }
}

class UnconfiguredPersistlyGameSaves implements PersistlyGameSavesFacade {
  async ensureProfile(): Promise<never> {
    throwNotConfigured();
  }

  async getProfileSession(): Promise<never> {
    throwNotConfigured();
  }

  async saveAccountData(): Promise<never> {
    throwNotConfigured();
  }

  async patchAccountData(): Promise<never> {
    throwNotConfigured();
  }

  async forceSyncProfile(): Promise<never> {
    throwNotConfigured();
  }

  async syncDueProfile(): Promise<never> {
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

  async clearLocalSlot(): Promise<never> {
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

  async ensureProfile(): Promise<PersistlyEnsureProfileResult> {
    const existing = await this.getOrCreateLocalProfile();
    if (existing.profileSaveId && existing.profileSessionToken && existing.version !== undefined) {
      return {
        status: PersistlyGameSaveStatus.LocalFound,
        target: PersistlyGameSaveTarget.Profile,
        profileSaveId: existing.profileSaveId,
        profile: profileRecordToSave(existing),
      };
    }

    const synced = await this.createRemoteProfile(existing);
    if (!synced.profileSaveId) {
      throw new PersistlyConfigurationError("ensureProfile could not resolve profileSaveId.");
    }
    return {
      status: PersistlyGameSaveStatus.Synced,
      target: PersistlyGameSaveTarget.Profile,
      profileSaveId: synced.profileSaveId,
      profile: profileRecordToSave(synced),
    };
  }

  async getProfileSession(options: { includeToken?: boolean } = {}): Promise<PersistlyProfileSession> {
    const profile = await this.store.getProfile();
    if (!profile?.profileSaveId) {
      return {};
    }

    return {
      profileSaveId: profile.profileSaveId,
      ...(options.includeToken ? { profileSessionToken: profile.profileSessionToken } : {}),
    };
  }

  async saveAccountData(accountData: JsonObject): Promise<PersistlyGameSaveSyncResult> {
    const profile = await this.getOrCreateLocalProfile();
    await this.store.setProfile({
      ...profile,
      accountData: clone(parseObject(accountData, "accountData")),
      dirty: true,
    });
    return { status: PersistlyGameSaveStatus.LocalSaved, target: PersistlyGameSaveTarget.Profile };
  }

  async patchAccountData(accountDataPatch: JsonObject): Promise<PersistlyGameSaveSyncResult> {
    const patch = parseObject(accountDataPatch, "accountDataPatch");
    const profile = await this.getOrCreateLocalProfile();
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
    return { status: PersistlyGameSaveStatus.LocalSaved, target: PersistlyGameSaveTarget.Profile };
  }

  async forceSyncProfile(options: PersistlyGameSavesSyncOptions = {}): Promise<PersistlyGameSaveSyncResult> {
    let profile = await this.getOrCreateLocalProfile();
    if (!profile.dirty && profile.profileSaveId) {
      if (hasProfileSession(profile) && profile.version === undefined) {
        profile = await this.loadRemoteProfile(profile);
      }
      return this.emit({ status: PersistlyGameSaveStatus.NoChanges, target: PersistlyGameSaveTarget.Profile });
    }
    if (!options.bypassCooldown && !isForceSyncAllowed(profile.lastRemoteSyncedAt, profile.syncPolicy)) {
      return this.emit({ status: PersistlyGameSaveStatus.Cooldown, target: PersistlyGameSaveTarget.Profile });
    }

    try {
      if (hasProfileSession(profile) && profile.version === undefined) {
        const loaded = await this.loadRemoteProfile(profile);
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

      if (!profile.profileSaveId || !profile.profileSessionToken) {
        const synced = await this.createRemoteProfile(profile);
        return this.emit({
          status: PersistlyGameSaveStatus.Synced,
          target: PersistlyGameSaveTarget.Profile,
          profile: profileRecordToSave(synced),
        });
      }

      const result = await this.client.syncProfileAccountData({
        profileSaveId: profile.profileSaveId,
        profileSessionToken: profile.profileSessionToken,
        baseVersion: profile.version ?? 1,
        accountData: profile.accountData,
      });

      if (result.status === PersistlySyncStatus.Conflict) {
        const cloudAccountData = readProfileAccountData(result.save);
        const conflictedProfile: ProfileRecord = {
          ...profile,
          cloudAccountData: clone(cloudAccountData),
          cloudMetadata: clone(result.save.metadata),
          cloudVersion: result.save.version,
          dirty: true,
        };
        await this.store.setProfile(conflictedProfile);
        return this.emit({
          status: PersistlyGameSaveStatus.Conflict,
          target: PersistlyGameSaveTarget.Profile,
          localState: clone(profile.accountData),
          cloudState: clone(cloudAccountData),
          ...(profile.version === undefined ? {} : { localVersion: profile.version }),
          cloudVersion: result.save.version,
          cloudSave: result.save,
        });
      }

      const syncedProfile = profileFromSave(result.save, profile.profileSessionToken, profile.syncPolicy);
      await this.store.setProfile({ ...syncedProfile, dirty: false, lastRemoteSyncedAt: this.now() });
      return this.emit({
        status: PersistlyGameSaveStatus.Synced,
        target: PersistlyGameSaveTarget.Profile,
        profile: result.save,
        historyRetained: result.historyRetained,
        ...(result.warnings === undefined ? {} : { warnings: result.warnings }),
      });
    } catch (error) {
      return this.mapSyncError(error, PersistlyGameSaveTarget.Profile);
    }
  }

  async syncDueProfile(options: PersistlyGameSavesSyncOptions = {}): Promise<PersistlyGameSaveSyncResult> {
    const profile = await this.store.getProfile();
    if (!profile?.dirty) {
      return { status: PersistlyGameSaveStatus.NoChanges, target: PersistlyGameSaveTarget.Profile };
    }
    if (!options.bypassCooldown && !isDue(profile.lastRemoteSyncedAt, profile.syncPolicy)) {
      return { status: PersistlyGameSaveStatus.Cooldown, target: PersistlyGameSaveTarget.Profile };
    }
    return await this.forceSyncProfile({ ...options, bypassCooldown: true });
  }

  async loadSlot(slotKey: string): Promise<PersistlySlotInspection> {
    return await this.inspectSlot(slotKey);
  }

  async saveSlot(
    slotKey: string,
    state: JsonObject,
    options: PersistlyGameSavesSaveSlotOptions = {},
  ): Promise<PersistlyGameSaveSyncResult> {
    const canonicalSlotKey = assertSlotKey(slotKey);
    const existing = await this.store.getSlot(canonicalSlotKey);
    const reusableExisting = existing?.archived ? undefined : existing;
    const record: SlotRecord = {
      schema: SLOT_RECORD_SCHEMA,
      schemaVersion: 1,
      slotKey: canonicalSlotKey,
      ...(reusableExisting?.characterSaveId === undefined ? {} : { characterSaveId: reusableExisting.characterSaveId }),
      ...(reusableExisting?.version === undefined ? {} : { version: reusableExisting.version }),
      metadata: developerSlotMetadata(options.metadata ?? existing?.metadata ?? {}),
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
    const slots = await Promise.all((await this.store.listSlotKeys()).map((slotKey) => this.inspectSlot(slotKey)));
    return slots.filter((slot) => options.includeArchived || !slot.archived);
  }

  async inspectSlot(slotKey: string): Promise<PersistlySlotInspection> {
    const canonicalSlotKey = assertSlotKey(slotKey);
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

  async forceSync(slotKey: string, options: PersistlyGameSavesSyncOptions = {}): Promise<PersistlyGameSaveSyncResult> {
    const canonicalSlotKey = assertSlotKey(slotKey);
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
        : await this.createProfileOrCharacterForSlot(slot);
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
      results.push(await this.syncDueProfile(options));
    }
    results.push(...(await this.syncDueSlots(options)));
    return results;
  }

  async archiveSlot(slotKey: string): Promise<PersistlyGameSaveSyncResult> {
    const canonicalSlotKey = assertSlotKey(slotKey);
    const profile = await this.requireProfileSession("archiveSlot");
    const slot = await this.store.getSlot(canonicalSlotKey);
    if (!slot?.characterSaveId) {
      throw new PersistlyConfigurationError("archiveSlot requires a synced local slot with a characterSaveId.");
    }

    try {
      const envelope = await this.client.archiveProfileCharacter({
        profileSaveId: profile.profileSaveId,
        profileSessionToken: profile.profileSessionToken,
        characterSaveId: slot.characterSaveId,
      });
      await this.store.setProfile({
        ...profileFromSave(envelope.profile, profile.profileSessionToken, profile.syncPolicy),
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

  async clearLocalSlot(slotKey: string): Promise<PersistlyGameSaveSyncResult> {
    const canonicalSlotKey = assertSlotKey(slotKey);
    await this.store.deleteSlot(canonicalSlotKey);
    return { status: PersistlyGameSaveStatus.LocalSaved, target: PersistlyGameSaveTarget.Slot, slotKey: canonicalSlotKey };
  }

  async acceptCloudVersion(slotKey: string): Promise<PersistlyGameSaveSyncResult> {
    const canonicalSlotKey = assertSlotKey(slotKey);
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

  async overwriteCloudVersion(slotKey: string, options: PersistlyGameSavesSyncOptions = {}): Promise<PersistlyGameSaveSyncResult> {
    const canonicalSlotKey = assertSlotKey(slotKey);
    const slot = await this.store.getSlot(canonicalSlotKey);
    if (!slot?.dirty) {
      return { status: PersistlyGameSaveStatus.NoChanges, target: PersistlyGameSaveTarget.Slot, slotKey: canonicalSlotKey };
    }
    if (slot.cloudVersion !== undefined) {
      await this.store.setSlot({ ...slot, version: slot.cloudVersion });
    }
    return await this.forceSync(canonicalSlotKey, options);
  }

  async keepLocalForLater(slotKey: string): Promise<PersistlyGameSaveSyncResult> {
    const canonicalSlotKey = assertSlotKey(slotKey);
    const slot = await this.store.getSlot(canonicalSlotKey);
    if (slot) {
      await this.store.setSlot({ ...slot, dirty: true });
    }
    return { status: PersistlyGameSaveStatus.LocalSaved, target: PersistlyGameSaveTarget.Slot, slotKey: canonicalSlotKey };
  }

  private async createProfileOrCharacterForSlot(slot: SlotRecord): Promise<PersistlyGameSaveSyncResult> {
    let profile = await this.getOrCreateLocalProfile();
    if (!profile.profileSaveId || !profile.profileSessionToken) {
      const envelope = await this.client.createProfile({
        ...(this.config.playerRef === undefined ? {} : { playerRef: this.config.playerRef }),
        ...(this.config.externalProfileRef === undefined ? {} : { externalProfileRef: this.config.externalProfileRef }),
        accountData: profile.accountData,
        character: {
          metadata: remoteSlotMetadata(slot.slotKey, slot.metadata),
          state: slot.state,
        },
      });
      const profileRecord = profileFromSave(envelope.profile, envelope.profileSessionToken, envelope.syncPolicy);
      await this.store.setProfile({ ...profileRecord, dirty: false, lastRemoteSyncedAt: this.now() });
      if (!envelope.character) {
        throw new PersistlyConfigurationError("Create profile response did not include the requested initial character.");
      }
      await this.store.setSlot(slotFromSave(slot.slotKey, envelope.character, slot.state, slot.metadata, this.now()));
      return { status: PersistlyGameSaveStatus.Synced, target: PersistlyGameSaveTarget.Slot, slotKey: slot.slotKey, save: envelope.character };
    }

    if (!hasProfileSession(profile)) {
      throw new PersistlyConfigurationError("createProfileOrCharacterForSlot requires profileSaveId and profileSessionToken.");
    }
    const profileSaveId = profile.profileSaveId;
    const profileSessionToken = profile.profileSessionToken;

    if (profile.version === undefined) {
      profile = await this.loadRemoteProfile(profile);
    }

    try {
      const envelope = await this.client.createProfileCharacter({
        profileSaveId,
        profileSessionToken,
        metadata: remoteSlotMetadata(slot.slotKey, slot.metadata),
        state: slot.state,
      });
      await this.store.setProfile({
        ...profileFromSave(envelope.profile, profileSessionToken, profile.syncPolicy),
        dirty: false,
        lastRemoteSyncedAt: this.now(),
      });
      await this.store.setSlot(slotFromSave(slot.slotKey, envelope.character, slot.state, slot.metadata, this.now()));
      return { status: PersistlyGameSaveStatus.Synced, target: PersistlyGameSaveTarget.Slot, slotKey: slot.slotKey, save: envelope.character };
    } catch (error) {
      if (!(error instanceof PersistlySlotAlreadyExistsError)) {
        throw error;
      }
      const reconciled = await this.reconcileExistingRemoteSlot(slot, profileSaveId, profileSessionToken, profile.syncPolicy);
      return await this.syncExistingCharacter(reconciled);
    }
  }

  private async syncExistingCharacter(slot: SlotRecord): Promise<PersistlyGameSaveSyncResult> {
    const profile = await this.requireProfileSession("forceSync");
    if (!slot.characterSaveId) {
      throw new PersistlyConfigurationError("syncExistingCharacter requires characterSaveId.");
    }

    const baseVersion = slot.version ?? slot.cloudVersion;
    const result = await this.client.syncProfileCharacter({
      profileSaveId: profile.profileSaveId,
      profileSessionToken: profile.profileSessionToken,
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

  private async getOrCreateLocalProfile(): Promise<ProfileRecord> {
    const stored = await this.store.getProfile();
    if (stored) {
      return stored;
    }

    const profile: ProfileRecord = {
      schema: PROFILE_RECORD_SCHEMA,
      schemaVersion: 1,
      ...(this.config.profileSaveId === undefined ? {} : { profileSaveId: this.config.profileSaveId }),
      ...(this.config.profileSessionToken === undefined ? {} : { profileSessionToken: this.config.profileSessionToken }),
      ...(this.config.profileSaveId === undefined || this.config.profileSessionToken === undefined ? { version: 1 } : {}),
      metadata: {},
      accountData: {},
      characterSlots: [],
      dirty: false,
    };
    await this.store.setProfile(profile);
    return profile;
  }

  private async createRemoteProfile(profile: ProfileRecord): Promise<ProfileRecord> {
    if (hasProfileSession(profile)) {
      return await this.loadRemoteProfile(profile);
    }

    const envelope = await this.client.createProfile({
      ...(this.config.playerRef === undefined ? {} : { playerRef: this.config.playerRef }),
      ...(this.config.externalProfileRef === undefined ? {} : { externalProfileRef: this.config.externalProfileRef }),
      accountData: profile.accountData,
    });
    const nextProfile = profileFromSave(envelope.profile, envelope.profileSessionToken, envelope.syncPolicy);
    await this.store.setProfile({ ...nextProfile, dirty: false, lastRemoteSyncedAt: this.now() });
    return nextProfile;
  }

  private async requireProfileSession(operation: string): Promise<ProfileRecord & { profileSaveId: string; profileSessionToken: string }> {
    let profile = await this.getOrCreateLocalProfile();
    if (!hasProfileSession(profile)) {
      throw new PersistlyConfigurationError(`${operation} requires profileSaveId and profileSessionToken.`);
    }
    const profileSaveId = profile.profileSaveId;
    const profileSessionToken = profile.profileSessionToken;
    if (profile.version === undefined) {
      profile = await this.loadRemoteProfile(profile);
    }
    return { ...profile, profileSaveId, profileSessionToken };
  }

  private async loadRemoteProfile(profile: ProfileRecord & { profileSaveId: string; profileSessionToken: string }): Promise<ProfileRecord> {
    const envelope = await this.client.loadProfileEnvelope({
      profileSaveId: profile.profileSaveId,
      profileSessionToken: profile.profileSessionToken,
    });
    const syncPolicy = envelope.syncPolicy ?? (await this.client.getRuntimeConfig()).syncPolicy;
    const nextProfile = profileFromSave(envelope.profile, profile.profileSessionToken, syncPolicy);
    await this.store.setProfile({ ...nextProfile, dirty: false, lastRemoteSyncedAt: this.now() });
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
    profileSaveId: string,
    profileSessionToken: string,
    syncPolicy: SyncPolicy | undefined,
  ): Promise<SlotRecord> {
    const envelope = await this.client.loadProfileEnvelope({
      profileSaveId,
      profileSessionToken,
    });
    const nextProfile = profileFromSave(envelope.profile, profileSessionToken, envelope.syncPolicy ?? syncPolicy);
    await this.store.setProfile({ ...nextProfile, dirty: false, lastRemoteSyncedAt: this.now() });

    const remoteSlot = findRemoteCharacterSlot(nextProfile.characterSlots, slot.slotKey);
    if (!remoteSlot?.characterSaveId) {
      throw new PersistlyConfigurationError(
        `Remote profile reported slot_already_exists for ${slot.slotKey} but did not expose a matching characterSaveId.`,
      );
    }

    const remoteCharacter = await this.client.loadProfileCharacter({
      profileSaveId,
      profileSessionToken,
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
  if ((config.storage ?? "memory") === "localStorage") {
    return new LocalStorageGameSavesStore(config);
  }

  return new MemoryGameSavesStore();
}

function resolveLocalNamespace(config: PersistlyGameSavesConfig, storage: LocalStorageLike): string {
  if (config.localProfileKey) {
    return config.localProfileKey;
  }
  if (config.externalProfileRef) {
    return `${config.externalProfileRef.provider}:${config.externalProfileRef.subject}`;
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

function profileFromSave(save: Save, profileSessionToken: string | undefined, syncPolicy: SyncPolicy | undefined): ProfileRecord {
  const profileState = readProfileState(save);
  return {
    schema: PROFILE_RECORD_SCHEMA,
    schemaVersion: 1,
    profileSaveId: save.saveId,
    ...(profileSessionToken === undefined ? {} : { profileSessionToken }),
    version: save.version,
    metadata: clone(save.metadata),
    accountData: clone(profileState.accountData),
    characterSlots: clone(profileState.characterSlots),
    dirty: false,
    ...(syncPolicy === undefined ? {} : { syncPolicy }),
  };
}

function profileRecordToSave(profile: ProfileRecord): Save {
  return {
    saveId: profile.profileSaveId ?? "local_profile",
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

function readProfileAccountData(save: Save): JsonObject {
  return clone(readProfileState(save).accountData);
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
  slotKey: string,
): { slotKey: string; characterSaveId?: string } | undefined {
  for (const slot of characterSlots) {
    if (slot.slotKey !== slotKey) {
      continue;
    }
    const characterSaveId = typeof slot.characterSaveId === "string" ? slot.characterSaveId : undefined;
    return { slotKey, ...(characterSaveId === undefined ? {} : { characterSaveId }) };
  }
  return undefined;
}

function slotFromSave(
  slotKey: string,
  save: Save,
  localState: JsonObject,
  localMetadata: JsonObject,
  now: string,
): SlotRecord {
  return {
    schema: SLOT_RECORD_SCHEMA,
    schemaVersion: 1,
    slotKey,
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

function remoteSlotMetadata(slotKey: string, metadata: JsonObject): JsonObject {
  const clean = stripReservedSlotMetadata(metadata);
  clean._persistly = { slotKey };
  return clean;
}

function stripReservedSlotMetadata(metadata: JsonObject): JsonObject {
  const clean = clone(parseObject(metadata, "slot.metadata"));
  delete clean._persistly;
  return clean;
}

function assertSlotKey(slotKey: string): string {
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(slotKey)) {
    throw new PersistlyConfigurationError("slotKey must match ^[A-Za-z0-9_.-]{1,64}$.");
  }
  return slotKey;
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

function hasProfileSession(profile: ProfileRecord): profile is ProfileRecord & { profileSaveId: string; profileSessionToken: string } {
  return typeof profile.profileSaveId === "string" && typeof profile.profileSessionToken === "string";
}

function parseStoredProfileRecord(value: string | null): ProfileRecord | undefined {
  if (value === null) {
    return undefined;
  }
  const record = parseStoredObject(value, "profile record");
  if (record.schema !== PROFILE_RECORD_SCHEMA) {
    throw new PersistlyStorageError(`Stored profile record schema is unsupported: ${String(record.schema)}.`);
  }
  if (record.schemaVersion !== 1) {
    throw new PersistlyStorageError("Stored profile record schemaVersion is unsupported.");
  }
  return {
    schema: PROFILE_RECORD_SCHEMA,
    schemaVersion: 1,
    ...(typeof record.profileSaveId === "string" ? { profileSaveId: record.profileSaveId } : {}),
    ...(typeof record.profileSessionToken === "string" ? { profileSessionToken: record.profileSessionToken } : {}),
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

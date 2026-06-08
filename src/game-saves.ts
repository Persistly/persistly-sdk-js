import {
  PersistlyClient,
  PersistlySyncStatus,
  type Account,
  type AccountSlot,
  type CreatedTransferCode,
  type ExternalAccountRef,
  type Save,
  type SyncPolicy,
} from "./client.js";
import type {
  LinkProviderInput,
  PersistlyAccountMode,
  PersistlyAuthOptions,
  PersistlyAuthSessionResult,
  PersistlyLinkedProvider,
  SignInWithProviderInput,
} from "./auth.js";
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
  AuthRequired: "auth_required",
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
  accountId?: string;
  accountSessionToken?: string;
  accountMode?: PersistlyAccountMode;
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

export interface PersistlyCreateTransferCodeOptions {
  deviceLabel?: string;
  ttlSeconds?: number;
}

export interface PersistlyAttachWithTransferCodeOptions {
  deviceLabel?: string;
}

export interface PersistlyEnsureAccountResult {
  status: typeof PersistlyGameSaveStatus.Synced | typeof PersistlyGameSaveStatus.LocalFound;
  target: typeof PersistlyGameSaveTarget.Account;
  accountId: string;
  /** @internal */
  account?: Save;
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
      /** @internal */
      save?: Save | undefined;
      /** @internal */
      account?: Save | undefined;
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
      /** @internal */
      cloudSave: Save;
    }
  | {
      status: typeof PersistlyGameSaveStatus.AuthRequired;
      target: PersistlyGameSaveTargetValue;
      slotId?: string;
      /** @internal */
      slotKey?: string;
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
  slots: JsonObject[];
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
  getAccount(): Promise<AccountRecord | undefined>;
  setAccount(account: AccountRecord): Promise<void>;
  deleteAccount(): Promise<void>;
  getSlot(slotId: string): Promise<SlotRecord | undefined>;
  setSlot(slot: SlotRecord): Promise<void>;
  deleteSlot(slotId: string): Promise<void>;
  listSlotKeys(): Promise<string[]>;
}

interface PersistlyGameSavesFacade {
  createAccount(): Promise<PersistlyEnsureAccountResult>;
  attachAccount(options: PersistlyAttachAccountOptions): Promise<PersistlyEnsureAccountResult>;
  createTransferCode(options?: PersistlyCreateTransferCodeOptions): Promise<CreatedTransferCode>;
  attachWithTransferCode(
    transferCode: string,
    options?: PersistlyAttachWithTransferCodeOptions,
  ): Promise<PersistlyEnsureAccountResult>;
  signInWithFirebaseToken(token: string, options?: PersistlyAuthOptions): Promise<PersistlyAuthSessionResult>;
  signInWithProvider(input: SignInWithProviderInput): Promise<PersistlyAuthSessionResult>;
  linkProvider(input: LinkProviderInput): Promise<PersistlyAuthSessionResult>;
  listLinkedProviders(): Promise<PersistlyLinkedProvider[]>;
  signOut(): Promise<PersistlyGameSaveSyncResult>;
  ensureAccount(): Promise<PersistlyEnsureAccountResult>;
  getAccountSession(options?: { includeToken?: boolean }): Promise<PersistlyAccountSession>;
  getAccountInfo(): Promise<PersistlyAccountInspection>;
  getAccountData(): Promise<JsonObject>;
  saveAccountData(accountData: JsonObject): Promise<PersistlyGameSaveSyncResult>;
  patchAccountData(accountDataPatch: JsonObject): Promise<PersistlyGameSaveSyncResult>;
  forceSyncAccount(options?: PersistlyGameSavesSyncOptions): Promise<PersistlyGameSaveSyncResult>;
  syncDueAccount(options?: PersistlyGameSavesSyncOptions): Promise<PersistlyGameSaveSyncResult>;
  loadData(): Promise<PersistlySlotInspection>;
  saveData(data: JsonObject, options?: PersistlyGameSavesSaveSlotOptions): Promise<PersistlyGameSaveSyncResult>;
  inspectData(): Promise<PersistlySlotInspection>;
  loadSlot(slotId: string): Promise<PersistlySlotInspection>;
  saveSlot(slotId: string, data: JsonObject, options?: PersistlyGameSavesSaveSlotOptions): Promise<PersistlyGameSaveSyncResult>;
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
  private account: AccountRecord | undefined;
  private readonly slots = new Map<string, SlotRecord>();

  async getAccount(): Promise<AccountRecord | undefined> {
    return cloneOptional(this.account);
  }

  async setAccount(account: AccountRecord): Promise<void> {
    this.account = clone(account);
  }

  async deleteAccount(): Promise<void> {
    this.account = undefined;
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

  async getAccount(): Promise<AccountRecord | undefined> {
    return parseStoredAccountRecord(this.storage.getItem(this.accountKey()));
  }

  async setAccount(account: AccountRecord): Promise<void> {
    this.storage.setItem(this.accountKey(), JSON.stringify(account));
  }

  async deleteAccount(): Promise<void> {
    this.storage.removeItem(this.accountKey());
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

  private accountKey(): string {
    return `${this.keyPrefix}:account`;
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

  async createTransferCode(): Promise<never> {
    throwNotConfigured();
  }

  async attachWithTransferCode(): Promise<never> {
    throwNotConfigured();
  }

  async signInWithFirebaseToken(): Promise<never> {
    throwNotConfigured();
  }

  async signInWithProvider(): Promise<never> {
    throwNotConfigured();
  }

  async linkProvider(): Promise<never> {
    throwNotConfigured();
  }

  async listLinkedProviders(): Promise<never> {
    throwNotConfigured();
  }

  async signOut(): Promise<never> {
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
  private ignoreConfiguredAccountSessionSeed = false;

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
    await this.assertNoExistingLocalAccountState(
      "createAccount requires empty local account state. Call clearLocalAccount() before creating a different account.",
    );
    const account = await this.getOrCreateLocalAccount();
    const created = await this.createRemoteAccount(account);
    if (!created.accountId) {
      throw new PersistlyConfigurationError("createAccount could not resolve accountId.");
    }
    return {
      status: PersistlyGameSaveStatus.Synced,
      target: PersistlyGameSaveTarget.Account,
      accountId: created.accountId,
      account: accountRecordToSave(created),
    };
  }

  async attachAccount(options: PersistlyAttachAccountOptions): Promise<PersistlyEnsureAccountResult> {
    await this.assertNoExistingLocalAccountState(
      "attachAccount requires empty local account state. Call clearLocalAccount() before attaching a different account.",
    );
    this.ignoreConfiguredAccountSessionSeed = true;
    const seed: AccountRecord = {
      schema: ACCOUNT_RECORD_SCHEMA,
      schemaVersion: 1,
      accountId: options.accountId,
      accountSessionToken: options.accountSessionToken,
      metadata: {},
      accountData: {},
      slots: [],
      dirty: false,
    };
    await this.store.setAccount(seed);
    const attached = await this.loadRemoteAccount(seed as AccountRecord & { accountId: string; accountSessionToken: string });
    return {
      status: PersistlyGameSaveStatus.Synced,
      target: PersistlyGameSaveTarget.Account,
      accountId: attached.accountId ?? options.accountId,
      account: accountRecordToSave(attached),
    };
  }

  async createTransferCode(options: PersistlyCreateTransferCodeOptions = {}): Promise<CreatedTransferCode> {
    const account = await this.requireAccountSession("createTransferCode");
    return await this.client.createTransferCode({
      accountId: account.accountId,
      accountSessionToken: account.accountSessionToken,
      ...(options.deviceLabel === undefined ? {} : { deviceLabel: options.deviceLabel }),
      ...(options.ttlSeconds === undefined ? {} : { ttlSeconds: options.ttlSeconds }),
    });
  }

  async attachWithTransferCode(
    transferCode: string,
    options: PersistlyAttachWithTransferCodeOptions = {},
  ): Promise<PersistlyEnsureAccountResult> {
    await this.assertNoExistingLocalAccountState(
      "attachWithTransferCode requires empty local account state. Call clearLocalAccount() before attaching a transferred account.",
    );
    this.ignoreConfiguredAccountSessionSeed = true;
    const envelope = await this.client.consumeTransferCode({
      transferCode,
      ...(options.deviceLabel === undefined ? {} : { deviceLabel: options.deviceLabel }),
    });
    const account = accountRecordFromAccount(envelope.account, envelope.accountSessionToken, envelope.syncPolicy);
    await this.store.setAccount({ ...account, dirty: false, lastRemoteSyncedAt: this.now() });
    await this.materializeAccountSlotRefs(account);
    return {
      status: PersistlyGameSaveStatus.Synced,
      target: PersistlyGameSaveTarget.Account,
      accountId: account.accountId ?? envelope.accountId,
      account: accountRecordToSave(account),
    };
  }

  async signInWithFirebaseToken(
    token: string,
    options: PersistlyAuthOptions = {},
  ): Promise<PersistlyAuthSessionResult> {
    return await this.signInWithProvider({
      provider: "firebase",
      token,
      ...(options.deviceLabel === undefined ? {} : { deviceLabel: options.deviceLabel }),
    });
  }

  async signInWithProvider(input: SignInWithProviderInput): Promise<PersistlyAuthSessionResult> {
    const account = await this.getOrCreateLocalAccount();
    const result = await this.client.exchangeAccountAuthSession({
      ...input,
      ...(hasAccountSession(account)
        ? {
            accountId: account.accountId,
            accountSessionToken: account.accountSessionToken,
          }
        : {}),
    });
    await this.store.setAccount({
      ...account,
      accountId: result.accountId,
      accountSessionToken: result.accountSessionToken,
      ...(result.syncPolicy === undefined ? {} : { syncPolicy: result.syncPolicy }),
      dirty: account.dirty,
    });
    return result;
  }

  async linkProvider(input: LinkProviderInput): Promise<PersistlyAuthSessionResult> {
    const account = await this.getOrCreateLocalAccount();
    if (!hasAccountSession(account)) {
      throw new PersistlyConfigurationError("linkProvider requires accountId and accountSessionToken.");
    }
    const result = await this.client.exchangeAccountAuthSession({
      ...input,
      accountId: account.accountId,
      accountSessionToken: account.accountSessionToken,
    });
    await this.store.setAccount({
      ...account,
      accountId: result.accountId,
      accountSessionToken: result.accountSessionToken,
      ...(result.syncPolicy === undefined ? {} : { syncPolicy: result.syncPolicy }),
    });
    return result;
  }

  async listLinkedProviders(): Promise<PersistlyLinkedProvider[]> {
    const account = await this.getOrCreateLocalAccount();
    if (!hasAccountSession(account)) {
      throw new PersistlyConfigurationError("listLinkedProviders requires accountId and accountSessionToken.");
    }
    return await this.client.listLinkedAuthProviders({
      accountId: account.accountId,
      accountSessionToken: account.accountSessionToken,
    });
  }

  async signOut(): Promise<PersistlyGameSaveSyncResult> {
    return await this.clearLocalAccount();
  }

  async ensureAccount(): Promise<PersistlyEnsureAccountResult> {
    const existing = await this.getOrCreateLocalAccount();
    if (existing.accountId && existing.accountSessionToken && existing.version !== undefined) {
      return {
        status: PersistlyGameSaveStatus.LocalFound,
        target: PersistlyGameSaveTarget.Account,
        accountId: existing.accountId,
        account: accountRecordToSave(existing),
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
      account: accountRecordToSave(synced),
    };
  }

  async getAccountSession(options: { includeToken?: boolean } = {}): Promise<PersistlyAccountSession> {
    const account = await this.store.getAccount();
    if (!account?.accountId) {
      return {};
    }

    return {
      accountId: account.accountId,
      ...(options.includeToken ? { accountSessionToken: account.accountSessionToken } : {}),
    };
  }

  async getAccountInfo(): Promise<PersistlyAccountInspection> {
    const account = await this.store.getAccount();
    if (!account) {
      return {
        status: PersistlyGameSaveStatus.NotFound,
        target: PersistlyGameSaveTarget.Account,
        dirty: false,
      };
    }

    return {
      status: PersistlyGameSaveStatus.LocalFound,
      target: PersistlyGameSaveTarget.Account,
      ...(account.accountId === undefined ? {} : { accountId: account.accountId }),
      accountData: clone(account.accountData),
      slots: clone(account.slots),
      ...(account.version === undefined ? {} : { version: account.version }),
      dirty: account.dirty,
      ...(account.cloudAccountData === undefined ? {} : { lastCloudAccountData: clone(account.cloudAccountData) }),
      ...(account.cloudMetadata === undefined ? {} : { lastCloudMetadata: clone(account.cloudMetadata) }),
      ...(account.cloudVersion === undefined ? {} : { cloudVersion: account.cloudVersion }),
      ...(account.lastRemoteSyncedAt === undefined ? {} : { lastRemoteSyncedAt: account.lastRemoteSyncedAt }),
    };
  }

  async getAccountData(): Promise<JsonObject> {
    return clone((await this.store.getAccount())?.accountData ?? {});
  }

  async saveAccountData(accountData: JsonObject): Promise<PersistlyGameSaveSyncResult> {
    const account = await this.getOrCreateLocalAccount();
    await this.store.setAccount({
      ...account,
      accountData: clone(parseObject(accountData, "accountData")),
      dirty: true,
    });
    return { status: PersistlyGameSaveStatus.LocalSaved, target: PersistlyGameSaveTarget.Account };
  }

  async patchAccountData(accountDataPatch: JsonObject): Promise<PersistlyGameSaveSyncResult> {
    const patch = parseObject(accountDataPatch, "accountDataPatch");
    const account = await this.getOrCreateLocalAccount();
    const accountData = clone(account.accountData);

    for (const [key, value] of Object.entries(patch)) {
      if (value === null) {
        delete accountData[key];
      } else {
        accountData[key] = value;
      }
    }

    await this.store.setAccount({
      ...account,
      accountData,
      dirty: true,
    });
    return { status: PersistlyGameSaveStatus.LocalSaved, target: PersistlyGameSaveTarget.Account };
  }

  async forceSyncAccount(options: PersistlyGameSavesSyncOptions = {}): Promise<PersistlyGameSaveSyncResult> {
    let account = await this.getOrCreateLocalAccount();
    if (!account.dirty && account.accountId) {
      if (hasAccountSession(account) && account.version === undefined) {
        account = await this.loadRemoteAccount(account);
      }
      return this.emit({ status: PersistlyGameSaveStatus.NoChanges, target: PersistlyGameSaveTarget.Account });
    }
    if (!options.bypassCooldown && !isForceSyncAllowed(account.lastRemoteSyncedAt, account.syncPolicy)) {
      return this.emit({ status: PersistlyGameSaveStatus.Cooldown, target: PersistlyGameSaveTarget.Account });
    }

    try {
      if (hasAccountSession(account) && account.version === undefined) {
        const loaded = await this.loadRemoteAccount(account);
        account = {
          ...loaded,
          accountData: account.accountData,
          dirty: account.dirty,
          ...(account.cloudAccountData === undefined ? {} : { cloudAccountData: account.cloudAccountData }),
          ...(account.cloudMetadata === undefined ? {} : { cloudMetadata: account.cloudMetadata }),
          ...(account.cloudVersion === undefined ? {} : { cloudVersion: account.cloudVersion }),
        };
        await this.store.setAccount(account);
      }

      if (!account.accountId || !account.accountSessionToken) {
        if (this.requiresAuthSession()) {
          return this.emit({ status: PersistlyGameSaveStatus.AuthRequired, target: PersistlyGameSaveTarget.Account });
        }
        const synced = await this.createRemoteAccount(account);
        return this.emit({
          status: PersistlyGameSaveStatus.Synced,
          target: PersistlyGameSaveTarget.Account,
          account: accountRecordToSave(synced),
        });
      }

      const result = await this.client.syncAccountData({
        accountId: account.accountId,
        accountSessionToken: account.accountSessionToken,
        baseVersion: account.version ?? 1,
        accountData: account.accountData,
      });

      if (result.status === PersistlySyncStatus.Conflict) {
        const cloudAccountData = readAccountAccountData(result.save);
        const conflictedAccount: AccountRecord = {
          ...account,
          cloudAccountData: clone(cloudAccountData),
          cloudMetadata: clone(result.save.metadata),
          cloudVersion: result.save.version,
          dirty: true,
        };
        await this.store.setAccount(conflictedAccount);
        return this.emit({
          status: PersistlyGameSaveStatus.Conflict,
          target: PersistlyGameSaveTarget.Account,
          localState: clone(account.accountData),
          cloudState: clone(cloudAccountData),
          ...(account.version === undefined ? {} : { localVersion: account.version }),
          cloudVersion: result.save.version,
          cloudSave: result.save,
        });
      }

      const syncedAccount = accountFromSave(result.save, account.accountSessionToken, account.syncPolicy);
      await this.store.setAccount({ ...syncedAccount, dirty: false, lastRemoteSyncedAt: this.now() });
      return this.emit({
        status: PersistlyGameSaveStatus.Synced,
        target: PersistlyGameSaveTarget.Account,
        account: result.save,
        historyRetained: result.historyRetained,
        ...(result.warnings === undefined ? {} : { warnings: result.warnings }),
      });
    } catch (error) {
      return this.mapSyncError(error, PersistlyGameSaveTarget.Account);
    }
  }

  async syncDueAccount(options: PersistlyGameSavesSyncOptions = {}): Promise<PersistlyGameSaveSyncResult> {
    const account = await this.store.getAccount();
    if (!account?.dirty) {
      return { status: PersistlyGameSaveStatus.NoChanges, target: PersistlyGameSaveTarget.Account };
    }
    if (!options.bypassCooldown && !isDue(account.lastRemoteSyncedAt, account.syncPolicy)) {
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
    data: JsonObject,
    options: PersistlyGameSavesSaveSlotOptions = {},
  ): Promise<PersistlyGameSaveSyncResult> {
    return await this.saveSlot(PersistlyDefaultSlotKey, data, options);
  }

  async saveSlot(
    slotId: string,
    data: JsonObject,
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
      ...(reusableExisting?.version === undefined ? {} : { version: reusableExisting.version }),
      metadata: developerSlotMetadata(options.slotInfo ?? options.metadata ?? existing?.metadata ?? {}),
      slotInfo: developerSlotMetadata(options.slotInfo ?? options.metadata ?? existing?.metadata ?? {}),
      state: clone(parseObject(data, "slot.data")),
      ...(reusableExisting?.cloudState === undefined ? {} : { cloudState: reusableExisting.cloudState }),
      ...(reusableExisting?.cloudMetadata === undefined ? {} : { cloudMetadata: reusableExisting.cloudMetadata }),
      ...(reusableExisting?.cloudVersion === undefined ? {} : { cloudVersion: reusableExisting.cloudVersion }),
      dirty: true,
      archived: false,
      lastLocalSavedAt: this.now(),
      ...(reusableExisting?.lastRemoteSyncedAt === undefined ? {} : { lastRemoteSyncedAt: reusableExisting.lastRemoteSyncedAt }),
    };

    await this.store.setSlot(record);
    return { status: PersistlyGameSaveStatus.LocalSaved, target: PersistlyGameSaveTarget.Slot, ...slotIdentity(canonicalSlotKey) };
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
        ...slotIdentity(canonicalSlotKey),
        dirty: false,
        archived: false,
      };
    }

    return {
      status: PersistlyGameSaveStatus.LocalFound,
      target: PersistlyGameSaveTarget.Slot,
      ...slotIdentity(canonicalSlotKey),
      data: clone(slot.state),
      state: clone(slot.state),
      slotInfo: clone(slot.metadata),
      metadata: clone(slot.metadata),
      ...(slot.version === undefined ? {} : { version: slot.version }),
      dirty: slot.dirty,
      archived: slot.archived,
      ...(slot.cloudState === undefined ? {} : { lastCloudData: clone(slot.cloudState) }),
      ...(slot.cloudState === undefined ? {} : { lastCloudState: clone(slot.cloudState) }),
      ...(slot.cloudMetadata === undefined ? {} : { lastCloudSlotInfo: clone(slot.cloudMetadata) }),
      ...(slot.cloudMetadata === undefined ? {} : { lastCloudMetadata: clone(slot.cloudMetadata) }),
      ...(slot.lastLocalSavedAt === undefined ? {} : { lastLocalSavedAt: slot.lastLocalSavedAt }),
      ...(slot.lastRemoteSyncedAt === undefined ? {} : { lastRemoteSyncedAt: slot.lastRemoteSyncedAt }),
    };
  }

  async refreshSlot(slotId: string): Promise<PersistlyGameSaveSyncResult> {
    const canonicalSlotKey = assertSlotKey(slotId);
    const account = await this.requireAccountSession("refreshSlot");
    let slot = await this.store.getSlot(canonicalSlotKey);

    if (!slot?.version) {
      await this.materializeAccountSlotRefs(account);
      slot = await this.store.getSlot(canonicalSlotKey);
    }

    if (!slot?.version) {
      return this.emit({
        status: PersistlyGameSaveStatus.NoChanges,
        target: PersistlyGameSaveTarget.Slot,
        ...slotIdentity(canonicalSlotKey),
      });
    }

    try {
      const remote = await this.client.loadAccountSlot({
        accountId: account.accountId,
        accountSessionToken: account.accountSessionToken,
        slotId: canonicalSlotKey,
      });
      const remoteSave = accountSlotToLocalSave(account.accountId, remote);

      if (slot.dirty) {
        await this.store.setSlot({
          ...slot,
          cloudState: clone(remote.data),
          cloudMetadata: clone(remote.slotInfo),
          cloudVersion: remote.version,
        });
        return this.emit({
          status: PersistlyGameSaveStatus.Conflict,
          target: PersistlyGameSaveTarget.Slot,
          ...slotIdentity(canonicalSlotKey),
          localData: clone(slot.state),
          cloudData: clone(remote.data),
          localState: clone(slot.state),
          cloudState: clone(remote.data),
          ...(slot.version === undefined ? {} : { localVersion: slot.version }),
          cloudVersion: remote.version,
          cloudSave: remoteSave,
        });
      }

      await this.store.setSlot(slotFromSave(
        canonicalSlotKey,
        remoteSave,
        remote.data,
        remote.slotInfo,
        this.now(),
      ));
      return this.emit({
        status: PersistlyGameSaveStatus.Synced,
        target: PersistlyGameSaveTarget.Slot,
        ...slotIdentity(canonicalSlotKey),
        save: remoteSave,
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
      return this.emit({ status: PersistlyGameSaveStatus.NoChanges, target: PersistlyGameSaveTarget.Slot, ...slotIdentity(canonicalSlotKey) });
    }
    if (!options.bypassCooldown && !isForceSyncAllowed(slot.lastRemoteSyncedAt, (await this.store.getAccount())?.syncPolicy)) {
      return this.emit({ status: PersistlyGameSaveStatus.Cooldown, target: PersistlyGameSaveTarget.Slot, ...slotIdentity(canonicalSlotKey) });
    }

    try {
      const result = slot.version
        ? await this.syncExistingSlot(slot)
        : await this.createAccountOrSlot(slot);
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
          results.push({ status: PersistlyGameSaveStatus.NoChanges, target: PersistlyGameSaveTarget.Slot, ...slotIdentity(slotKey) });
        }
        continue;
      }
      if (!options.bypassCooldown && !isDue(slot.lastRemoteSyncedAt, (await this.store.getAccount())?.syncPolicy)) {
        if (options.includeSkipped) {
          results.push({ status: PersistlyGameSaveStatus.Cooldown, target: PersistlyGameSaveTarget.Slot, ...slotIdentity(slotKey) });
        }
        continue;
      }
      results.push(await this.forceSync(slotKey, { ...options, bypassCooldown: true }));
    }
    return results;
  }

  async syncDue(options: PersistlyGameSavesSyncOptions = {}): Promise<PersistlyGameSaveSyncResult[]> {
    const results: PersistlyGameSaveSyncResult[] = [];
    const account = await this.store.getAccount();
    if (account?.dirty || options.includeSkipped) {
      results.push(await this.syncDueAccount(options));
    }
    results.push(...(await this.syncDueSlots(options)));
    return results;
  }

  async archiveSlot(slotId: string): Promise<PersistlyGameSaveSyncResult> {
    const canonicalSlotKey = assertSlotKey(slotId);
    const account = await this.requireAccountSession("archiveSlot");
    const slot = await this.store.getSlot(canonicalSlotKey);
    if (!slot?.version) {
      throw new PersistlyConfigurationError("archiveSlot requires a synced local slot.");
    }

    try {
      const envelope = await this.client.archiveAccountSlot({
        accountId: account.accountId,
        accountSessionToken: account.accountSessionToken,
        slotId: canonicalSlotKey,
      });
      await this.store.setAccount({
        ...accountRecordFromAccount(envelope.account, account.accountSessionToken, envelope.syncPolicy ?? account.syncPolicy),
        dirty: false,
        lastRemoteSyncedAt: this.now(),
      });
      await this.store.setSlot({
        ...slot,
        dirty: false,
        archived: true,
        lastRemoteSyncedAt: this.now(),
      });
      return this.emit({ status: PersistlyGameSaveStatus.Synced, target: PersistlyGameSaveTarget.Slot, ...slotIdentity(canonicalSlotKey) });
    } catch (error) {
      return this.mapSyncError(error, PersistlyGameSaveTarget.Slot, canonicalSlotKey);
    }
  }

  async deleteAccount(): Promise<PersistlyGameSaveSyncResult> {
    const localAccount = await this.store.getAccount();
    const slotKeys = await this.store.listSlotKeys();
    if (!localAccount?.accountId || !localAccount.accountSessionToken) {
      for (const slotKey of slotKeys) {
        await this.store.deleteSlot(slotKey);
      }
      await this.store.deleteAccount();
      this.ignoreConfiguredAccountSessionSeed = true;
      return this.emit({ status: PersistlyGameSaveStatus.LocalSaved, target: PersistlyGameSaveTarget.Account });
    }

    const account = await this.requireAccountSession("deleteAccount");
    const result = await this.client.deleteAccount({
      accountId: account.accountId,
      accountSessionToken: account.accountSessionToken,
    });
    for (const slotKey of slotKeys) {
      await this.store.deleteSlot(slotKey);
    }
    await this.store.deleteAccount();
    this.ignoreConfiguredAccountSessionSeed = true;
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
      return this.emit({ status: PersistlyGameSaveStatus.NoChanges, target: PersistlyGameSaveTarget.Slot, ...slotIdentity(canonicalSlotKey) });
    }
    if (!slot.version) {
      await this.store.deleteSlot(canonicalSlotKey);
      const account = await this.store.getAccount();
      if (account) {
        await this.store.setAccount(removeSlotRefFromAccount(account, canonicalSlotKey));
      }
      return this.emit({ status: PersistlyGameSaveStatus.LocalSaved, target: PersistlyGameSaveTarget.Slot, ...slotIdentity(canonicalSlotKey) });
    }

    const account = await this.requireAccountSession("deleteSlot");
    const result = await this.client.deleteAccountSlot({
      accountId: account.accountId,
      accountSessionToken: account.accountSessionToken,
      slotId: canonicalSlotKey,
    });
    await this.store.deleteSlot(canonicalSlotKey);
    if (result.account) {
      await this.store.setAccount({
        ...accountRecordFromAccount(result.account, account.accountSessionToken, account.syncPolicy),
        dirty: false,
        lastRemoteSyncedAt: this.now(),
      });
    } else {
      await this.store.setAccount(removeSlotRefFromAccount(account, canonicalSlotKey, this.now()));
    }
    return this.emit({
      status: PersistlyGameSaveStatus.Synced,
      target: PersistlyGameSaveTarget.Slot,
      ...slotIdentity(canonicalSlotKey),
      ...(result.cleanupQueued ? { warnings: ["delete_cleanup_queued"] } : {}),
    });
  }

  async clearLocalAccount(): Promise<PersistlyGameSaveSyncResult> {
    for (const slotKey of await this.store.listSlotKeys()) {
      await this.store.deleteSlot(slotKey);
    }
    await this.store.deleteAccount();
    this.ignoreConfiguredAccountSessionSeed = true;
    return { status: PersistlyGameSaveStatus.LocalSaved, target: PersistlyGameSaveTarget.Account };
  }

  async clearLocalSlot(slotId: string): Promise<PersistlyGameSaveSyncResult> {
    const canonicalSlotKey = assertSlotKey(slotId);
    await this.store.deleteSlot(canonicalSlotKey);
    return { status: PersistlyGameSaveStatus.LocalSaved, target: PersistlyGameSaveTarget.Slot, ...slotIdentity(canonicalSlotKey) };
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
      return { status: PersistlyGameSaveStatus.NoChanges, target: PersistlyGameSaveTarget.Slot, ...slotIdentity(canonicalSlotKey) };
    }

    await this.store.setSlot({
      ...slot,
      state: clone(slot.cloudState),
      metadata: stripReservedSlotMetadata(slot.cloudMetadata ?? slot.metadata),
      version: slot.cloudVersion,
      dirty: false,
      lastRemoteSyncedAt: this.now(),
    });
    return { status: PersistlyGameSaveStatus.Synced, target: PersistlyGameSaveTarget.Slot, ...slotIdentity(canonicalSlotKey) };
  }

  async overwriteCloudVersion(slotId: string, options: PersistlyGameSavesSyncOptions = {}): Promise<PersistlyGameSaveSyncResult> {
    const canonicalSlotKey = assertSlotKey(slotId);
    const slot = await this.store.getSlot(canonicalSlotKey);
    if (!slot?.dirty) {
      return { status: PersistlyGameSaveStatus.NoChanges, target: PersistlyGameSaveTarget.Slot, ...slotIdentity(canonicalSlotKey) };
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
    return { status: PersistlyGameSaveStatus.LocalSaved, target: PersistlyGameSaveTarget.Slot, ...slotIdentity(canonicalSlotKey) };
  }

  private async createAccountOrSlot(slot: SlotRecord): Promise<PersistlyGameSaveSyncResult> {
    let account = await this.getOrCreateLocalAccount();
    if (!account.accountId || !account.accountSessionToken) {
      if (this.requiresAuthSession()) {
        return { status: PersistlyGameSaveStatus.AuthRequired, target: PersistlyGameSaveTarget.Slot, ...slotIdentity(slot.slotKey) };
      }
      const envelope = await this.client.createAccount({
        ...(this.config.playerRef === undefined ? {} : { playerRef: this.config.playerRef }),
        ...(this.config.externalAccountRef === undefined ? {} : { externalAccountRef: this.config.externalAccountRef }),
        accountData: account.accountData,
        slot: {
          slotId: slot.slotKey,
          slotInfo: slot.metadata,
          data: slot.state,
        },
      });
      const accountRecord = accountRecordFromAccount(envelope.account, envelope.accountSessionToken, envelope.syncPolicy);
      await this.store.setAccount({ ...accountRecord, dirty: false, lastRemoteSyncedAt: this.now() });
      if (!envelope.slot) {
        throw new PersistlyConfigurationError("Create account response did not include the requested initial slot.");
      }
      const save = accountSlotToLocalSave(envelope.accountId, envelope.slot);
      await this.store.setSlot(slotFromSave(slot.slotKey, save, slot.state, slot.metadata, this.now()));
      return { status: PersistlyGameSaveStatus.Synced, target: PersistlyGameSaveTarget.Slot, ...slotIdentity(slot.slotKey), save };
    }

    if (!hasAccountSession(account)) {
      throw new PersistlyConfigurationError("createAccountOrSlot requires accountId and accountSessionToken.");
    }
    const accountId = account.accountId;
    const accountSessionToken = account.accountSessionToken;

    if (account.version === undefined) {
      account = await this.loadRemoteAccount(account);
    }

    try {
      const envelope = await this.client.createAccountSlot({
        accountId,
        accountSessionToken,
        slotId: slot.slotKey,
        slotInfo: slot.metadata,
        data: slot.state,
      });
      await this.store.setAccount({
        ...accountRecordFromAccount(envelope.account, accountSessionToken, envelope.syncPolicy ?? account.syncPolicy),
        dirty: false,
        lastRemoteSyncedAt: this.now(),
      });
      const save = accountSlotToLocalSave(accountId, envelope.slot);
      await this.store.setSlot(slotFromSave(slot.slotKey, save, slot.state, slot.metadata, this.now()));
      return { status: PersistlyGameSaveStatus.Synced, target: PersistlyGameSaveTarget.Slot, ...slotIdentity(slot.slotKey), save };
    } catch (error) {
      if (!(error instanceof PersistlySlotAlreadyExistsError)) {
        throw error;
      }
      const reconciled = await this.reconcileExistingRemoteSlot(slot, accountId, accountSessionToken, account.syncPolicy);
      return await this.syncExistingSlot(reconciled);
    }
  }

  private async syncExistingSlot(slot: SlotRecord): Promise<PersistlyGameSaveSyncResult> {
    const account = await this.requireAccountSession("forceSync");
    if (!slot.version) {
      throw new PersistlyConfigurationError("syncExistingSlot requires a synced local slot.");
    }

    const baseVersion = slot.version ?? slot.cloudVersion;
    const result = await this.client.syncAccountSlot({
      accountId: account.accountId,
      accountSessionToken: account.accountSessionToken,
      slotId: slot.slotKey,
      ...(baseVersion === undefined ? {} : { baseVersion }),
      slotInfo: slot.metadata,
      data: slot.state,
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
        ...slotIdentity(slot.slotKey),
        localData: clone(slot.state),
        cloudData: clone(result.save.state),
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
      ...slotIdentity(slot.slotKey),
      save: result.save,
      historyRetained: result.historyRetained,
      ...(result.warnings === undefined ? {} : { warnings: result.warnings }),
    };
  }

  private async getOrCreateLocalAccount(): Promise<AccountRecord> {
    const stored = await this.store.getAccount();
    if (stored) {
      return stored;
    }

    const account: AccountRecord = {
      schema: ACCOUNT_RECORD_SCHEMA,
      schemaVersion: 1,
      ...(this.ignoreConfiguredAccountSessionSeed || this.config.accountId === undefined
        ? {}
        : { accountId: this.config.accountId }),
      ...(this.ignoreConfiguredAccountSessionSeed || this.config.accountSessionToken === undefined
        ? {}
        : { accountSessionToken: this.config.accountSessionToken }),
      ...(this.ignoreConfiguredAccountSessionSeed || this.config.accountId === undefined || this.config.accountSessionToken === undefined
        ? { version: 1 }
        : {}),
      metadata: {},
      accountData: {},
      slots: [],
      dirty: false,
    };
    await this.store.setAccount(account);
    return account;
  }

  private async createRemoteAccount(account: AccountRecord): Promise<AccountRecord> {
    if (hasAccountSession(account)) {
      return await this.loadRemoteAccount(account);
    }

    const envelope = await this.client.createAccount({
      ...(this.config.playerRef === undefined ? {} : { playerRef: this.config.playerRef }),
      ...(this.config.externalAccountRef === undefined ? {} : { externalAccountRef: this.config.externalAccountRef }),
      accountData: account.accountData,
    });
    const nextAccount = accountRecordFromAccount(envelope.account, envelope.accountSessionToken, envelope.syncPolicy);
    await this.store.setAccount({ ...nextAccount, dirty: false, lastRemoteSyncedAt: this.now() });
    return nextAccount;
  }

  private async requireAccountSession(operation: string): Promise<AccountRecord & { accountId: string; accountSessionToken: string }> {
    let account = await this.getOrCreateLocalAccount();
    if (!hasAccountSession(account)) {
      throw new PersistlyConfigurationError(`${operation} requires accountId and accountSessionToken.`);
    }
    const accountId = account.accountId;
    const accountSessionToken = account.accountSessionToken;
    if (account.version === undefined) {
      account = await this.loadRemoteAccount(account);
    }
    return { ...account, accountId, accountSessionToken };
  }

  private requiresAuthSession(): boolean {
    return this.config.accountMode === "authRequired";
  }

  private async loadRemoteAccount(account: AccountRecord & { accountId: string; accountSessionToken: string }): Promise<AccountRecord> {
    const envelope = await this.client.loadAccountEnvelope({
      accountId: account.accountId,
      accountSessionToken: account.accountSessionToken,
    });
    const syncPolicy = envelope.syncPolicy ?? (await this.client.getRuntimeConfig()).syncPolicy;
    const nextAccount = accountRecordFromAccount(envelope.account, account.accountSessionToken, syncPolicy);
    await this.store.setAccount({ ...nextAccount, dirty: false, lastRemoteSyncedAt: this.now() });
    await this.materializeAccountSlotRefs(nextAccount);
    return nextAccount;
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
        ...(slotKey === undefined ? {} : slotIdentity(slotKey)),
        ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      });
    }
    if (error instanceof PersistlyTransportError || (error instanceof Error && /fetch|network|offline/i.test(error.message))) {
      return this.emit({ status: PersistlyGameSaveStatus.Offline, target, ...(slotKey === undefined ? {} : slotIdentity(slotKey)) });
    }
    if (error instanceof PersistlyApiError && error.code === "rate_limited") {
      return this.emit({ status: PersistlyGameSaveStatus.RateLimited, target, ...(slotKey === undefined ? {} : slotIdentity(slotKey)) });
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
    const nextAccount = accountRecordFromAccount(envelope.account, accountSessionToken, envelope.syncPolicy ?? syncPolicy);
    await this.store.setAccount({ ...nextAccount, dirty: false, lastRemoteSyncedAt: this.now() });

    const remoteSlot = findRemoteSlot(nextAccount.slots, slot.slotKey);
    if (!remoteSlot) {
      throw new PersistlyConfigurationError(
        `Remote account reported slot_already_exists for ${slot.slotKey} but did not expose a matching slot.`,
      );
    }

    const remote = await this.client.loadAccountSlot({
      accountId,
      accountSessionToken,
      slotId: remoteSlot.slotId,
    });

    const reconciled: SlotRecord = {
      ...slot,
      version: remote.version,
      cloudState: clone(remote.data),
      cloudMetadata: clone(remote.slotInfo),
      cloudVersion: remote.version,
      archived: false,
      ...(slot.lastRemoteSyncedAt === undefined ? {} : { lastRemoteSyncedAt: slot.lastRemoteSyncedAt }),
    };
    await this.store.setSlot(reconciled);
    return reconciled;
  }

  private async assertNoExistingLocalAccountState(message: string): Promise<void> {
    const account = await this.store.getAccount();
    const slotKeys = await this.store.listSlotKeys();
    if (!isBlankLocalAccount(account) || slotKeys.length > 0) {
      throw new PersistlyConfigurationError(message);
    }
  }

  private async materializeAccountSlotRefs(account: AccountRecord): Promise<void> {
    for (const slotRef of account.slots) {
      const slotKey = typeof slotRef.slotKey === "string" ? slotRef.slotKey : "";
      if (!slotKey) {
        continue;
      }
      const existing = await this.store.getSlot(slotKey);
      if (existing) {
        continue;
      }
      const metadata = "metadata" in slotRef ? stripReservedSlotMetadata(parseObject(slotRef.metadata, `account.slots.${slotKey}.metadata`)) : {};
      const archived = slotRef.archived === true;
      const stub: SlotRecord = {
        schema: SLOT_RECORD_SCHEMA,
        schemaVersion: 1,
        slotKey,
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
  if (config.localAccountKey) {
    return config.localAccountKey;
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

function accountFromSave(save: Save, accountSessionToken: string | undefined, syncPolicy: SyncPolicy | undefined): AccountRecord {
  const accountState = readAccountState(save);
  return {
    schema: ACCOUNT_RECORD_SCHEMA,
    schemaVersion: 1,
    accountId: save.saveId,
    ...(accountSessionToken === undefined ? {} : { accountSessionToken }),
    version: save.version,
    metadata: clone(save.metadata),
    accountData: clone(accountState.accountData),
    slots: clone(accountState.slots),
    dirty: false,
    ...(syncPolicy === undefined ? {} : { syncPolicy }),
  };
}

function accountRecordFromAccount(account: Account, accountSessionToken: string | undefined, syncPolicy: SyncPolicy | undefined): AccountRecord {
  return {
    schema: ACCOUNT_RECORD_SCHEMA,
    schemaVersion: 1,
    accountId: account.accountId,
    ...(accountSessionToken === undefined ? {} : { accountSessionToken }),
    ...(account.version === undefined ? {} : { version: account.version }),
    metadata: {},
    accountData: clone(account.accountData),
    slots: account.slots.map((slot) => ({
      slotKey: slot.slotId,
      slotId: slot.slotId,
      slotInfo: clone(slot.slotInfo),
      metadata: clone(slot.slotInfo),
      ...(slot.version === undefined ? {} : { version: slot.version }),
      ...(slot.status === undefined ? {} : { status: slot.status }),
      ...(slot.updatedAt === undefined ? {} : { updatedAt: slot.updatedAt }),
    })),
    dirty: false,
    ...(syncPolicy === undefined ? {} : { syncPolicy }),
  };
}

function accountSlotToLocalSave(accountId: string, slot: AccountSlot): Save {
  return {
    saveId: `${accountId}:${slot.slotId}`,
    playerRef: null,
    metadata: clone(slot.slotInfo),
    state: clone(slot.data),
    version: slot.version,
    createdAt: slot.updatedAt,
    updatedAt: slot.updatedAt,
  };
}

function accountRecordToSave(account: AccountRecord): Save {
  return {
    saveId: account.accountId ?? "local_account",
    playerRef: null,
    metadata: clone(account.metadata),
    state: {
      schema: "persistly.account.v1",
      accountData: clone(account.accountData),
      slots: clone(account.slots),
    },
    version: account.version ?? 1,
    createdAt: account.lastRemoteSyncedAt ?? new Date(0).toISOString(),
    updatedAt: account.lastRemoteSyncedAt ?? new Date(0).toISOString(),
  };
}

function removeSlotRefFromAccount(
  account: AccountRecord,
  slotId: string,
  lastRemoteSyncedAt?: string,
): AccountRecord {
  return {
    ...account,
    slots: account.slots.filter((entry) => {
      if (entry.slotKey === slotId) {
        return false;
      }
      return true;
    }),
    ...(lastRemoteSyncedAt === undefined ? {} : { lastRemoteSyncedAt }),
  };
}

function readAccountAccountData(save: Save): JsonObject {
  return clone(readAccountState(save).accountData);
}

function isBlankLocalAccount(account: AccountRecord | undefined): boolean {
  if (!account) {
    return true;
  }
  return !account.accountId
    && !account.accountSessionToken
    && Object.keys(account.metadata).length === 0
    && Object.keys(account.accountData).length === 0
    && account.slots.length === 0
    && !account.dirty
    && account.cloudAccountData === undefined
    && account.cloudMetadata === undefined
    && account.cloudVersion === undefined
    && account.lastRemoteSyncedAt === undefined;
}

function readAccountState(save: Save): { accountData: JsonObject; slots: JsonObject[] } {
  const state = parseObject(save.state, "account.state");
  if (state.schema !== "persistly.account.v1") {
    throw new PersistlyConfigurationError("account.state.schema must be persistly.account.v1.");
  }
  const slots = state.slots;
  if (!Array.isArray(slots)) {
    throw new PersistlyConfigurationError("account.state.slots must be an array.");
  }

  return {
    accountData: parseObject(state.accountData, "account.state.accountData"),
    slots: slots.map((slot, index) => parseObject(slot, `account.state.slots[${index}]`)),
  };
}

function findRemoteSlot(
  slots: JsonObject[],
  slotId: string,
): { slotId: string } | undefined {
  for (const slot of slots) {
    const remoteSlotId = typeof slot.slotId === "string" ? slot.slotId : slot.slotKey;
    if (remoteSlotId !== slotId) {
      continue;
    }
    return { slotId };
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
  return clone(parseObject(metadata, "slot.metadata"));
}

function stripReservedSlotMetadata(metadata: JsonObject): JsonObject {
  return clone(parseObject(metadata, "slot.metadata"));
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

function hasAccountSession(account: AccountRecord): account is AccountRecord & { accountId: string; accountSessionToken: string } {
  return typeof account.accountId === "string" && typeof account.accountSessionToken === "string";
}

function parseStoredAccountRecord(value: string | null): AccountRecord | undefined {
  if (value === null) {
    return undefined;
  }
  const record = parseStoredObject(value, "account record");
  if (record.schema !== ACCOUNT_RECORD_SCHEMA) {
    throw new PersistlyStorageError(`Stored account record schema is unsupported: ${String(record.schema)}.`);
  }
  if (record.schemaVersion !== 1) {
    throw new PersistlyStorageError("Stored account record schemaVersion is unsupported.");
  }
  return {
    schema: ACCOUNT_RECORD_SCHEMA,
    schemaVersion: 1,
    ...(typeof record.accountId === "string" ? { accountId: record.accountId } : {}),
    ...(typeof record.accountSessionToken === "string" ? { accountSessionToken: record.accountSessionToken } : {}),
    ...(typeof record.version === "number" ? { version: record.version } : {}),
    metadata: parseObject(record.metadata, "stored account.metadata"),
    accountData: parseObject(record.accountData, "stored account.accountData"),
    slots: parseStoredObjectArray(record.slots, "stored account.slots"),
    ...(record.cloudAccountData === undefined ? {} : { cloudAccountData: parseObject(record.cloudAccountData, "stored account.cloudAccountData") }),
    ...(record.cloudMetadata === undefined ? {} : { cloudMetadata: parseObject(record.cloudMetadata, "stored account.cloudMetadata") }),
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
  const record = parseObject(value, "stored account.syncPolicy");
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

function slotIdentity(slotId: string) {
  return {
    slotId,
    /** @internal */
    slotKey: slotId,
  };
}

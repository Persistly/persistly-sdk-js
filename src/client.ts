import {
  MemorySaveCache,
  type SaveCacheStore,
} from "./cache.js";
import {
  PersistlyConfigurationError,
  PersistlyTransportError,
  createPersistlyApiError,
  type PersistlyApiError,
  type PersistlyErrorCode,
} from "./errors.js";
import type {
  PersistlyAuthProvider,
  PersistlyAuthSessionResult,
  PersistlyLinkedProvider,
  SignInWithProviderInput,
} from "./auth.js";
import { validatePayloadLimits } from "./limits.js";
import { parseObject as parseSchemaObject, parseSaveSnapshot, type JsonObject, type SaveSnapshot } from "./schema.js";

export type Save = SaveSnapshot;

export interface ExternalAccountRef {
  provider: string;
  subject: string;
}

export interface SyncPolicy {
  minRemoteSyncIntervalSeconds: number;
  forceSyncCooldownSeconds: number;
  syncOnAppBackground: boolean;
  syncOnAppForeground: boolean;
  syncOnReconnect: boolean;
  maxQueuedLocalSnapshots: number;
}

export interface RuntimeConfig {
  syncPolicy: SyncPolicy;
  gameConfig?: RuntimeGameConfig;
}

export interface RuntimeConfigOptions {
  gameConfigVersion?: number;
}

export interface RuntimeGameConfig {
  enabled: boolean;
  version?: number;
  unchanged?: boolean;
  sizeBytes?: number;
  hasData?: boolean;
  eventName?: string;
  config?: JsonObject;
}

export interface CreateAccountInput {
  playerRef?: string;
  externalAccountRef?: ExternalAccountRef;
  accountData?: JsonObject;
  slot?: {
    slotId: string;
    slotInfo?: JsonObject;
    data: JsonObject;
  };
}

export interface AccountSlotSummary {
  slotId: string;
  slotInfo: JsonObject;
  version?: number;
  status?: "active" | "archived";
  updatedAt?: string;
}

export interface Account {
  accountId: string;
  accountData: JsonObject;
  slots: AccountSlotSummary[];
  version?: number;
}

export interface AccountSlot {
  slotId: string;
  slotInfo: JsonObject;
  data: JsonObject;
  version: number;
  updatedAt: string;
}

export interface AccountEnvelope {
  accountId: string;
  accountSessionToken?: string;
  account: Account;
  slot?: AccountSlot;
  syncPolicy?: SyncPolicy;
}

export interface CreatedAccountEnvelope extends AccountEnvelope {
  accountSessionToken: string;
  syncPolicy: SyncPolicy;
}

export interface CreateTransferCodeInput extends AccountSessionInput {
  deviceLabel?: string;
  ttlSeconds?: number;
}

export interface CreatedTransferCode {
  transferCode: string;
  expiresAt: string;
  expiresInSeconds: number;
}

export interface ConsumeTransferCodeInput {
  transferCode: string;
  deviceLabel?: string;
}

export interface AccountSlotEnvelope extends AccountEnvelope {
  slot: AccountSlot;
}

export interface DeleteAccountResult {
  accountId: string;
  deletedAt: string;
  deletedSlotCount: number;
  alreadyDeleted: boolean;
  cleanupQueued: boolean;
}

export interface DeleteAccountSlotResult {
  accountId: string;
  slotId: string;
  deletedAt: string;
  alreadyDeleted: boolean;
  cleanupQueued: boolean;
  account?: Account;
}

export interface AccountSessionInput {
  accountId: string;
  accountSessionToken: string;
}

export interface AccountAuthSessionInput extends SignInWithProviderInput {
  accountId?: string;
  accountSessionToken?: string;
}

export interface AccountSlotInput extends AccountSessionInput {
  slotId: string;
}

export interface CreateAccountSlotInput extends AccountSessionInput {
  slotId: string;
  slotInfo?: JsonObject;
  data: JsonObject;
}

export interface SyncAccountSlotInput extends AccountSlotInput {
  baseVersion?: number;
  slotInfo?: JsonObject;
  data: JsonObject;
}

export interface SyncAccountDataInput extends AccountSessionInput {
  baseVersion: number;
  accountData?: JsonObject;
  accountDataPatch?: JsonObject;
}

export interface SyncAcceptedResult {
  status: typeof PersistlySyncStatus.Accepted;
  save: Save;
  version: number;
  updatedAt: string;
  historyRetained: boolean;
  warnings?: string[];
}

export interface SyncConflictDetails {
  reason: "base_version_mismatch";
}

export interface SyncConflictResult {
  status: typeof PersistlySyncStatus.Conflict;
  save: Save;
  details: SyncConflictDetails;
}

export type SyncSaveResult = SyncAcceptedResult | SyncConflictResult;

export const PersistlySyncStatus = {
  Accepted: "accepted",
  Conflict: "conflict",
} as const;

export type PersistlySyncStatus = (typeof PersistlySyncStatus)[keyof typeof PersistlySyncStatus];

export interface PersistlyClientOptions {
  runtimeKey: string;
  cache?: SaveCacheStore;
  fetch?: typeof globalThis.fetch;
  clientVersion?: string;
  platform?: string;
  engineVersion?: string;
}

export const DEFAULT_PERSISTLY_API_BASE_URL = "https://api.persistly.app";
export const PERSISTLY_JS_SDK_VERSION = "1.0.0";

export class PersistlyClient {
  private readonly baseUrl: string;
  private readonly runtimeKey: string;
  private readonly cache: SaveCacheStore;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly diagnosticsHeaders: Record<string, string>;

  constructor(options: PersistlyClientOptions) {
    if (!options.runtimeKey) {
      throw new PersistlyConfigurationError("PersistlyClient requires a non-empty runtimeKey.");
    }

    const resolvedFetch = options.fetch ?? bindFetch(globalThis.fetch);

    if (typeof resolvedFetch !== "function") {
      throw new PersistlyConfigurationError("PersistlyClient requires a fetch implementation.");
    }

    this.baseUrl = DEFAULT_PERSISTLY_API_BASE_URL.replace(/\/+$/, "");
    this.runtimeKey = options.runtimeKey;
    this.cache = options.cache ?? new MemorySaveCache();
    this.fetchImpl = resolvedFetch;
    this.diagnosticsHeaders = buildDiagnosticsHeaders(options);
  }

  async updateLocal(save: Save): Promise<Save> {
    const canonicalSave = parseSave(save);
    await this.cache.set(canonicalSave);
    return canonicalSave;
  }

  async getLocal(saveId: string): Promise<Save | null> {
    assertSaveId(saveId, "getLocal");
    return await this.cache.get(saveId);
  }

  async createAccount(payload: CreateAccountInput): Promise<CreatedAccountEnvelope> {
    validateAccountCreatePayload(payload);
    const requestPayload = normalizeCreateAccountPayload(payload);
    const response = await this.requestJson("/api/v1/accounts", {
      method: "POST",
      body: JSON.stringify(requestPayload),
    });
    const envelope = requireCreatedAccountEnvelope(parseAccountEnvelope(response));

    return envelope;
  }

  async exchangeAccountAuthSession(payload: AccountAuthSessionInput): Promise<PersistlyAuthSessionResult> {
    const provider = assertAuthProvider(payload.provider, "exchangeAccountAuthSession");
    const token = assertProviderToken(payload.token, "exchangeAccountAuthSession");
    if ((payload.accountId === undefined) !== (payload.accountSessionToken === undefined)) {
      throw new PersistlyConfigurationError(
        "exchangeAccountAuthSession requires both accountId and accountSessionToken when linking to a current account.",
      );
    }

    const response = await this.requestJson("/api/v1/accounts/auth/session", {
      method: "POST",
      headers: payload.accountSessionToken === undefined
        ? {}
        : accountSessionHeaders(payload.accountSessionToken, payload.accountId),
      body: JSON.stringify({
        provider,
        token,
        ...(payload.deviceLabel === undefined ? {} : { deviceLabel: payload.deviceLabel }),
      }),
    });
    return parseAuthSessionResult(response);
  }

  async listLinkedAuthProviders(payload: AccountSessionInput): Promise<PersistlyLinkedProvider[]> {
    const accountId = assertAccountId(payload.accountId, "listLinkedAuthProviders");
    assertAccountSessionToken(payload.accountSessionToken, "listLinkedAuthProviders");
    const response = await this.requestJson("/api/v1/accounts/auth/providers", {
      method: "GET",
      headers: accountSessionHeaders(payload.accountSessionToken, accountId),
    });
    return parseLinkedAuthProviders(response);
  }

  async syncAccountData(payload: SyncAccountDataInput): Promise<SyncSaveResult> {
    const accountId = assertAccountId(payload.accountId, "syncAccountData");
    assertAccountSessionToken(payload.accountSessionToken, "syncAccountData");
    validateSyncAccountDataPayload(payload);
    validatePayloadLimits({
      ...(payload.accountData === undefined && payload.accountDataPatch === undefined
        ? {}
        : { accountData: payload.accountData ?? payload.accountDataPatch }),
    });

    const body: Record<string, unknown> = {
      baseVersion: payload.baseVersion,
    };
    if (payload.accountData !== undefined) {
      body.accountData = payload.accountData;
    }
    if (payload.accountDataPatch !== undefined) {
      body.accountDataPatch = payload.accountDataPatch;
    }

    const response = await this.requestRaw(
      `/api/v1/accounts/${encodeURIComponent(accountId)}/data/sync`,
      {
        method: "POST",
        headers: accountSessionHeaders(payload.accountSessionToken),
        body: JSON.stringify(body),
      },
    );
    const json = await parseJsonResponse(response);

    if (response.status === 200) {
      const accepted = parseAcceptedSyncResult(json);
      const cached = (await this.cache.get(accountId)) ?? undefined;
      const result = syncAcceptedResultWithSave(
        accepted,
        accepted.save ??
          synthesizeAccountSaveFromSync({
            saveId: accountId,
            cached,
            accountData: payload.accountData,
            accountDataPatch: payload.accountDataPatch,
          }),
      );
      await this.cache.set(result.save);
      return result;
    }

    if (response.status === 409 && isSyncConflictPayload(json)) {
      const result = parseConflictSyncResult(json, { saveId: accountId });
      await this.cache.set(result.save);
      return result;
    }

    throw parseApiError(response.status, json);
  }

  async loadAccount(payload: AccountSessionInput): Promise<Account> {
    const envelope = await this.loadAccountEnvelope(payload);
    return envelope.account;
  }

  async loadAccountEnvelope(payload: AccountSessionInput): Promise<AccountEnvelope> {
    const accountId = assertAccountId(payload.accountId, "loadAccount");
    assertAccountSessionToken(payload.accountSessionToken, "loadAccount");
    const response = await this.requestJson(`/api/v1/accounts/${encodeURIComponent(accountId)}`, {
      method: "GET",
      headers: accountSessionHeaders(payload.accountSessionToken),
    });
    return parseAccountEnvelope(response);
  }

  async createTransferCode(payload: CreateTransferCodeInput): Promise<CreatedTransferCode> {
    const accountId = assertAccountId(payload.accountId, "createTransferCode");
    assertAccountSessionToken(payload.accountSessionToken, "createTransferCode");
    const response = await this.requestJson(
      `/api/v1/accounts/${encodeURIComponent(accountId)}/transfer-codes`,
      {
        method: "POST",
        headers: accountSessionHeaders(payload.accountSessionToken),
        body: JSON.stringify(transferCodeRequestBody(payload)),
      },
    );
    return parseCreatedTransferCode(response);
  }

  async consumeTransferCode(payload: ConsumeTransferCodeInput): Promise<CreatedAccountEnvelope> {
    const transferCode = assertTransferCode(payload.transferCode, "consumeTransferCode");
    const response = await this.requestJson("/api/v1/account-transfer-codes/consume", {
      method: "POST",
      body: JSON.stringify(transferCodeRequestBody({
        transferCode,
        ...(payload.deviceLabel === undefined ? {} : { deviceLabel: payload.deviceLabel }),
      })),
    });
    return requireCreatedAccountEnvelope(parseAccountEnvelope(response));
  }

  async deleteAccount(payload: AccountSessionInput): Promise<DeleteAccountResult> {
    const accountId = assertAccountId(payload.accountId, "deleteAccount");
    assertAccountSessionToken(payload.accountSessionToken, "deleteAccount");
    const response = await this.requestJson(`/api/v1/accounts/${encodeURIComponent(accountId)}`, {
      method: "DELETE",
      headers: accountSessionHeaders(payload.accountSessionToken),
    });
    const result = parseDeleteAccountResult(response);
    await this.cache.clear(accountId);
    return result;
  }

  async createAccountSlot(payload: CreateAccountSlotInput): Promise<AccountSlotEnvelope> {
    const accountId = assertAccountId(payload.accountId, "createAccountSlot");
    const slotId = assertSlotId(payload.slotId, "createAccountSlot");
    assertAccountSessionToken(payload.accountSessionToken, "createAccountSlot");
    validatePayloadLimits({ slotInfo: payload.slotInfo ?? {}, data: payload.data });
    const response = await this.requestJson(`/api/v1/accounts/${encodeURIComponent(accountId)}/slots`, {
      method: "POST",
      headers: accountSessionHeaders(payload.accountSessionToken),
      body: JSON.stringify({
        slotId,
        slotInfo: payload.slotInfo ?? {},
        data: payload.data,
      }),
    });
    return requireAccountSlotEnvelope(parseAccountEnvelope(response));
  }

  async loadAccountSlot(payload: AccountSlotInput): Promise<AccountSlot> {
    const accountId = assertAccountId(payload.accountId, "loadAccountSlot");
    const slotId = assertSlotId(payload.slotId, "loadAccountSlot");
    assertAccountSessionToken(payload.accountSessionToken, "loadAccountSlot");
    const response = await this.requestJson(
      `/api/v1/accounts/${encodeURIComponent(accountId)}/slots/${encodeURIComponent(slotId)}`,
      {
        method: "GET",
        headers: accountSessionHeaders(payload.accountSessionToken),
      },
    );
    return parseAccountSlot(response);
  }

  async deleteAccountSlot(payload: AccountSlotInput): Promise<DeleteAccountSlotResult> {
    const accountId = assertAccountId(payload.accountId, "deleteAccountSlot");
    const slotId = assertSlotId(payload.slotId, "deleteAccountSlot");
    assertAccountSessionToken(payload.accountSessionToken, "deleteAccountSlot");
    const response = await this.requestJson(
      `/api/v1/accounts/${encodeURIComponent(accountId)}/slots/${encodeURIComponent(slotId)}`,
      {
        method: "DELETE",
        headers: accountSessionHeaders(payload.accountSessionToken),
      },
    );
    return parseDeleteAccountSlotResult(response);
  }

  async syncAccountSlot(payload: SyncAccountSlotInput): Promise<SyncSaveResult> {
    const accountId = assertAccountId(payload.accountId, "syncAccountSlot");
    const slotId = assertSlotId(payload.slotId, "syncAccountSlot");
    assertAccountSessionToken(payload.accountSessionToken, "syncAccountSlot");
    validatePayloadLimits({ slotInfo: payload.slotInfo ?? {}, data: payload.data });
    const cacheId = accountSlotCacheId(accountId, slotId);
    const cached = (await this.cache.get(cacheId)) ?? undefined;
    const baseVersion = payload.baseVersion ?? cached?.version;

    if (!baseVersion) {
      throw new PersistlyConfigurationError(
        "syncAccountSlot requires baseVersion unless the cache already holds a canonical slot snapshot for this accountId and slotId.",
      );
    }

    const response = await this.requestRaw(
      `/api/v1/accounts/${encodeURIComponent(accountId)}/slots/${encodeURIComponent(slotId)}/sync`,
      {
        method: "POST",
        headers: accountSessionHeaders(payload.accountSessionToken),
        body: JSON.stringify({
          baseVersion,
          slotInfo: payload.slotInfo,
          data: payload.data,
        }),
      },
    );
    const json = await parseJsonResponse(response);

    if (response.status === 200) {
      const accepted = parseAcceptedSyncResult(json);
      const result = syncAcceptedResultWithSave(
        accepted,
        accepted.save ??
          synthesizeSaveFromSync({
            saveId: cacheId,
            cached,
            metadata: payload.slotInfo,
            state: payload.data,
          }),
      );
      await this.cache.set(result.save);
      return result;
    }

    if (response.status === 409 && isSyncConflictPayload(json)) {
      const result = parseConflictSyncResult(json, { saveId: cacheId });
      await this.cache.set(result.save);
      return result;
    }

    throw parseApiError(response.status, json);
  }

  async archiveAccountSlot(payload: AccountSlotInput): Promise<AccountEnvelope> {
    const accountId = assertAccountId(payload.accountId, "archiveAccountSlot");
    const slotId = assertSlotId(payload.slotId, "archiveAccountSlot");
    assertAccountSessionToken(payload.accountSessionToken, "archiveAccountSlot");
    const response = await this.requestJson(
      `/api/v1/accounts/${encodeURIComponent(accountId)}/slots/${encodeURIComponent(slotId)}/archive`,
      {
        method: "POST",
        headers: accountSessionHeaders(payload.accountSessionToken),
      },
    );
    return parseAccountEnvelope(response);
  }

  async getRuntimeConfig(options: RuntimeConfigOptions = {}): Promise<RuntimeConfig> {
    const path = runtimeConfigPath(options);
    const response = await this.requestJson(path, {
      method: "GET",
    });
    return parseRuntimeConfig(response);
  }

  private async requestJson(pathname: string, init: RequestInit): Promise<unknown> {
    const response = await this.requestRaw(pathname, init);
    const json = await parseJsonResponse(response);

    if (!response.ok) {
      throw parseApiError(response.status, json);
    }

    return json;
  }

  private async requestRaw(pathname: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(new URL(pathname, `${this.baseUrl}/`), {
        ...init,
        headers: {
          authorization: `Bearer ${this.runtimeKey}`,
          "content-type": "application/json",
          ...this.diagnosticsHeaders,
          ...init.headers,
        },
      });
    } catch (error) {
      throw new PersistlyTransportError("Persistly request failed before the runtime API responded.", error);
    }
  }
}

function buildDiagnosticsHeaders(options: PersistlyClientOptions): Record<string, string> {
  return {
    "x-persistly-sdk": "javascript",
    "x-persistly-sdk-version": PERSISTLY_JS_SDK_VERSION,
    "x-persistly-platform": normalizeDiagnosticsValue(options.platform) ?? detectJavaScriptPlatform(),
    ...(normalizeDiagnosticsValue(options.engineVersion) === undefined
      ? {}
      : { "x-persistly-engine-version": normalizeDiagnosticsValue(options.engineVersion)! }),
    ...(normalizeDiagnosticsValue(options.clientVersion) === undefined
      ? {}
      : { "x-persistly-client-version": normalizeDiagnosticsValue(options.clientVersion)! }),
  };
}

function detectJavaScriptPlatform(): string {
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    return "browser";
  }
  if (typeof process !== "undefined" && process.versions?.node) {
    return "node";
  }
  return "javascript";
}

function normalizeDiagnosticsValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function runtimeConfigPath(options: RuntimeConfigOptions): string {
  if (options.gameConfigVersion === undefined) {
    return "/api/v1/runtime-config";
  }

  if (
    typeof options.gameConfigVersion !== "number" ||
    !Number.isInteger(options.gameConfigVersion) ||
    options.gameConfigVersion < 0
  ) {
    throw new PersistlyConfigurationError("getRuntimeConfig gameConfigVersion must be a non-negative integer.");
  }

  return `/api/v1/runtime-config?gameConfigVersion=${encodeURIComponent(String(options.gameConfigVersion))}`;
}

function assertSaveId(saveId: string, operation: string): string {
  const canonicalSaveId = saveId.trim();

  if (!canonicalSaveId) {
    throw new PersistlyConfigurationError(`${operation} requires a non-empty saveId.`);
  }

  return canonicalSaveId;
}

function assertAccountId(accountId: string, operation: string): string {
  const canonicalAccountId = accountId.trim();

  if (!canonicalAccountId) {
    throw new PersistlyConfigurationError(`${operation} requires a non-empty accountId.`);
  }

  return canonicalAccountId;
}

function assertSlotId(slotId: string, operation: string): string {
  if (typeof slotId !== "string" || !/^[A-Za-z0-9_.-]{1,64}$/.test(slotId)) {
    throw new PersistlyConfigurationError(`${operation} slotId must match ^[A-Za-z0-9_.-]{1,64}$.`);
  }

  return slotId;
}

function assertAccountSessionToken(token: string, operation: string): string {
  if (typeof token !== "string" || token.trim() === "") {
    throw new PersistlyConfigurationError(`${operation} requires a non-empty accountSessionToken.`);
  }
  return token;
}

function assertTransferCode(code: string, operation: string): string {
  if (typeof code !== "string" || code.trim() === "") {
    throw new PersistlyConfigurationError(`${operation} requires a non-empty transferCode.`);
  }
  return code.trim();
}

function accountSessionHeaders(token: string, accountId?: string): HeadersInit {
  return {
    ...(accountId === undefined ? {} : { "x-persistly-account-id": accountId }),
    "x-persistly-account-session": token,
  };
}

function bindFetch(fetchImpl: typeof globalThis.fetch | undefined): typeof globalThis.fetch | undefined {
  if (typeof fetchImpl !== "function") {
    return fetchImpl;
  }

  return fetchImpl.bind(globalThis);
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const body = await response.text();

  if (body.trim().length === 0) {
    if (response.ok) {
      throw new PersistlyTransportError("Persistly response was unexpectedly empty.", null);
    }

    return {
      error: {
        code: "server_error",
        message: `Persistly returned an empty error response with status ${response.status}.`,
      },
    };
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    if (!response.ok) {
      return {
        error: {
          code: "server_error",
          message: `Persistly returned a non-JSON error response with status ${response.status}.`,
          details: {
            rawBody: body.slice(0, 500),
          },
        },
      };
    }

    throw new PersistlyTransportError("Persistly response was not valid JSON.", error);
  }
}

function parseDeleteAccountResult(value: unknown): DeleteAccountResult {
  const record = parseObject(value, "Delete account response");
  if (typeof record.accountId !== "string" || record.accountId.trim() === "") {
    throw new PersistlyConfigurationError("Delete account response accountId must be a non-empty string.");
  }
  if (typeof record.deletedAt !== "string" || Number.isNaN(Date.parse(record.deletedAt))) {
    throw new PersistlyConfigurationError("Delete account response deletedAt must be a valid date-time string.");
  }
  if (typeof record.deletedSlotCount !== "number" || !Number.isInteger(record.deletedSlotCount) || record.deletedSlotCount < 0) {
    throw new PersistlyConfigurationError("Delete account response deletedSlotCount must be a non-negative integer.");
  }
  if (typeof record.alreadyDeleted !== "boolean") {
    throw new PersistlyConfigurationError("Delete account response alreadyDeleted must be a boolean.");
  }
  if (typeof record.cleanupQueued !== "boolean") {
    throw new PersistlyConfigurationError("Delete account response cleanupQueued must be a boolean.");
  }
  return {
    accountId: record.accountId,
    deletedAt: record.deletedAt,
    deletedSlotCount: record.deletedSlotCount,
    alreadyDeleted: record.alreadyDeleted,
    cleanupQueued: record.cleanupQueued,
  };
}

function parseDeleteAccountSlotResult(value: unknown): DeleteAccountSlotResult {
  const record = parseObject(value, "Delete account slot response");
  if (typeof record.accountId !== "string" || record.accountId.trim() === "") {
    throw new PersistlyConfigurationError("Delete account slot response accountId must be a non-empty string.");
  }
  if (typeof record.slotId !== "string" || record.slotId.trim() === "") {
    throw new PersistlyConfigurationError("Delete account slot response slotId must be a non-empty string.");
  }
  if (typeof record.deletedAt !== "string" || Number.isNaN(Date.parse(record.deletedAt))) {
    throw new PersistlyConfigurationError("Delete account slot response deletedAt must be a valid date-time string.");
  }
  if (typeof record.alreadyDeleted !== "boolean") {
    throw new PersistlyConfigurationError("Delete account slot response alreadyDeleted must be a boolean.");
  }
  if (typeof record.cleanupQueued !== "boolean") {
    throw new PersistlyConfigurationError("Delete account slot response cleanupQueued must be a boolean.");
  }
    return {
      accountId: record.accountId,
      slotId: record.slotId,
      deletedAt: record.deletedAt,
      alreadyDeleted: record.alreadyDeleted,
      cleanupQueued: record.cleanupQueued,
      ...(record.account === undefined ? {} : { account: parseAccount(record.account) }),
    };
  }

function parseCreatedTransferCode(value: unknown): CreatedTransferCode {
  const record = parseObject(value, "Create transfer code response");
  const expiresInSeconds = record.expiresInSeconds;

  if (typeof record.transferCode !== "string" || record.transferCode.trim() === "") {
    throw new PersistlyConfigurationError("Create transfer code response transferCode must be a non-empty string.");
  }
  if (typeof record.expiresAt !== "string" || Number.isNaN(Date.parse(record.expiresAt))) {
    throw new PersistlyConfigurationError("Create transfer code response expiresAt must be a valid date-time string.");
  }
  if (typeof expiresInSeconds !== "number" || !Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new PersistlyConfigurationError("Create transfer code response expiresInSeconds must be a positive integer.");
  }

  return {
    transferCode: record.transferCode,
    expiresAt: record.expiresAt,
    expiresInSeconds,
  };
}

function parseAccountEnvelope(value: unknown): AccountEnvelope {
  const record = parseObject(value, "Account response");
  const accountId = record.accountId;
  const accountSessionToken = record.accountSessionToken;
  const account = parseAccount(record.account ?? record);
  const slot = record.slot === undefined || record.slot === null ? undefined : parseAccountSlot(record.slot);
  const syncPolicy = record.syncPolicy === undefined ? undefined : parseSyncPolicy(record.syncPolicy);

  if (typeof accountId !== "string" || accountId.trim() === "") {
    throw new PersistlyConfigurationError("Account response accountId must be a non-empty string.");
  }

  if (!(accountSessionToken === undefined || typeof accountSessionToken === "string")) {
    throw new PersistlyConfigurationError("Account response accountSessionToken must be a string when present.");
  }

  return {
    accountId,
    ...(accountSessionToken === undefined ? {} : { accountSessionToken }),
    account,
    ...(slot === undefined ? {} : { slot }),
    ...(syncPolicy === undefined ? {} : { syncPolicy }),
  };
}

function requireCreatedAccountEnvelope(envelope: AccountEnvelope): CreatedAccountEnvelope {
  if (typeof envelope.accountSessionToken !== "string" || envelope.accountSessionToken.trim() === "") {
    throw new PersistlyConfigurationError("Create account response must include a non-empty accountSessionToken.");
  }
  if (envelope.syncPolicy === undefined) {
    throw new PersistlyConfigurationError("Create account response must include syncPolicy.");
  }

  return {
    ...envelope,
    accountSessionToken: envelope.accountSessionToken,
    syncPolicy: envelope.syncPolicy,
  };
}

function requireAccountSlotEnvelope(envelope: AccountEnvelope): AccountSlotEnvelope {
  if (envelope.slot === undefined) {
    throw new PersistlyConfigurationError("Create account slot response must include the slot.");
  }

  return {
    ...envelope,
    slot: envelope.slot,
  };
}

function parseAccount(value: unknown): Account {
  const record = parseObject(value, "Account");
  const slots = record.slots;
  const version = record.version;

  if (typeof record.accountId !== "string" || record.accountId.trim() === "") {
    throw new PersistlyConfigurationError("Account.accountId must be a non-empty string.");
  }
  if (!(slots === undefined || Array.isArray(slots))) {
    throw new PersistlyConfigurationError("Account.slots must be an array when present.");
  }
  if (!(version === undefined || (typeof version === "number" && Number.isInteger(version) && version >= 1))) {
    throw new PersistlyConfigurationError("Account.version must be a positive integer when present.");
  }

  return {
    accountId: record.accountId,
    accountData: parseObject(record.accountData ?? {}, "Account.accountData"),
    slots: (slots ?? []).map((slot, index) => parseAccountSlotSummary(slot, `Account.slots[${index}]`)),
    ...(version === undefined ? {} : { version }),
  };
}

function parseAccountSlotSummary(value: unknown, label: string): AccountSlotSummary {
  const record = parseObject(value, label);
  const version = record.version;
  const status = record.status;
  const updatedAt = record.updatedAt;

  if (typeof record.slotId !== "string" || record.slotId.trim() === "") {
    throw new PersistlyConfigurationError(`${label}.slotId must be a non-empty string.`);
  }
  if (!(version === undefined || (typeof version === "number" && Number.isInteger(version) && version >= 1))) {
    throw new PersistlyConfigurationError(`${label}.version must be a positive integer when present.`);
  }
  if (!(status === undefined || status === "active" || status === "archived")) {
    throw new PersistlyConfigurationError(`${label}.status must be active or archived when present.`);
  }
  if (!(updatedAt === undefined || typeof updatedAt === "string")) {
    throw new PersistlyConfigurationError(`${label}.updatedAt must be a string when present.`);
  }

  return {
    slotId: record.slotId,
    slotInfo: parseObject(record.slotInfo ?? {}, `${label}.slotInfo`),
    ...(version === undefined ? {} : { version }),
    ...(status === undefined ? {} : { status }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
  };
}

function parseAccountSlot(value: unknown): AccountSlot {
  const record = parseObject(value, "Account slot");

  if (typeof record.slotId !== "string" || record.slotId.trim() === "") {
    throw new PersistlyConfigurationError("Account slot slotId must be a non-empty string.");
  }
  if (typeof record.version !== "number" || !Number.isInteger(record.version) || record.version < 1) {
    throw new PersistlyConfigurationError("Account slot version must be a positive integer.");
  }
  if (record.updatedAt !== undefined && typeof record.updatedAt !== "string") {
    throw new PersistlyConfigurationError("Account slot updatedAt must be a string when present.");
  }

  return {
    slotId: record.slotId,
    slotInfo: parseObject(record.slotInfo ?? {}, "Account slot slotInfo"),
    data: parseObject(record.data, "Account slot data"),
    version: record.version,
    updatedAt: record.updatedAt ?? nowForCompat(),
  };
}

function parseRuntimeConfig(value: unknown): RuntimeConfig {
  const record = parseObject(value, "Runtime config response");
  const config: RuntimeConfig = {
    syncPolicy: parseSyncPolicy(record.syncPolicy),
  };
  if (record.gameConfig !== undefined) {
    config.gameConfig = parseRuntimeGameConfig(record.gameConfig);
  }
  return config;
}

function parseRuntimeGameConfig(value: unknown): RuntimeGameConfig {
  const record = parseObject(value, "Runtime game config");

  if (typeof record.enabled !== "boolean") {
    throw new PersistlyConfigurationError("gameConfig.enabled must be a boolean.");
  }

  const gameConfig: RuntimeGameConfig = {
    enabled: record.enabled,
  };
  if (record.version !== undefined) {
    gameConfig.version = parseNonNegativeInteger(record.version, "gameConfig.version");
  }
  if (record.unchanged !== undefined) {
    if (typeof record.unchanged !== "boolean") {
      throw new PersistlyConfigurationError("gameConfig.unchanged must be a boolean.");
    }
    gameConfig.unchanged = record.unchanged;
  }
  if (record.sizeBytes !== undefined) {
    gameConfig.sizeBytes = parseNonNegativeInteger(record.sizeBytes, "gameConfig.sizeBytes");
  }
  if (record.hasData !== undefined) {
    if (typeof record.hasData !== "boolean") {
      throw new PersistlyConfigurationError("gameConfig.hasData must be a boolean.");
    }
    gameConfig.hasData = record.hasData;
  }
  if (record.eventName !== undefined) {
    if (typeof record.eventName !== "string") {
      throw new PersistlyConfigurationError("gameConfig.eventName must be a string.");
    }
    gameConfig.eventName = record.eventName;
  }
  if (record.config !== undefined) {
    gameConfig.config = parseObject(record.config, "gameConfig.config");
  }

  return gameConfig;
}

function parseSyncPolicy(value: unknown): SyncPolicy {
  const record = parseObject(value, "Sync policy");
  const minRemoteSyncIntervalSeconds = parsePositiveInteger(record.minRemoteSyncIntervalSeconds, "syncPolicy.minRemoteSyncIntervalSeconds");
  const forceSyncCooldownSeconds = parsePositiveInteger(record.forceSyncCooldownSeconds, "syncPolicy.forceSyncCooldownSeconds");
  const maxQueuedLocalSnapshots = parsePositiveInteger(record.maxQueuedLocalSnapshots, "syncPolicy.maxQueuedLocalSnapshots");

  if (typeof record.syncOnAppBackground !== "boolean") {
    throw new PersistlyConfigurationError("syncPolicy.syncOnAppBackground must be a boolean.");
  }
  if (typeof record.syncOnAppForeground !== "boolean") {
    throw new PersistlyConfigurationError("syncPolicy.syncOnAppForeground must be a boolean.");
  }
  if (typeof record.syncOnReconnect !== "boolean") {
    throw new PersistlyConfigurationError("syncPolicy.syncOnReconnect must be a boolean.");
  }

  return {
    minRemoteSyncIntervalSeconds,
    forceSyncCooldownSeconds,
    syncOnAppBackground: record.syncOnAppBackground,
    syncOnAppForeground: record.syncOnAppForeground,
    syncOnReconnect: record.syncOnReconnect,
    maxQueuedLocalSnapshots,
  };
}

function parsePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new PersistlyConfigurationError(`${label} must be a positive integer.`);
  }
  return value;
}

function parseNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new PersistlyConfigurationError(`${label} must be a non-negative integer.`);
  }
  return value;
}

function parseDateTime(value: unknown, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new PersistlyConfigurationError(`${label} must be a valid date-time string.`);
  }
  return value;
}

type AcceptedSyncResponse = Omit<SyncAcceptedResult, "save"> & { save?: Save };

function parseAcceptedSyncResult(value: unknown): AcceptedSyncResponse {
  const record = parseObject(value, "Accepted sync response");

  if (record.status !== "accepted") {
    throw new PersistlyConfigurationError("Accepted sync response had an unexpected status.");
  }
  const save = record.save === undefined ? undefined : parseSave(record.save);
  const version = record.version ?? save?.version;
  const updatedAt = record.updatedAt ?? save?.updatedAt;
  const historyRetained = record.historyRetained ?? false;
  const warnings = record.warnings;

  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new PersistlyConfigurationError("Accepted sync response version must be an integer greater than or equal to 1.");
  }
  if (typeof updatedAt !== "string" || Number.isNaN(Date.parse(updatedAt))) {
    throw new PersistlyConfigurationError("Accepted sync response updatedAt must be a valid date-time string.");
  }
  if (typeof historyRetained !== "boolean") {
    throw new PersistlyConfigurationError("Accepted sync response historyRetained must be a boolean.");
  }
  if (warnings !== undefined && (!Array.isArray(warnings) || warnings.some((warning) => typeof warning !== "string"))) {
    throw new PersistlyConfigurationError("Accepted sync response warnings must be an array of strings.");
  }
  const parsedWarnings = warnings as string[] | undefined;

  return {
    status: PersistlySyncStatus.Accepted,
    ...(save === undefined ? {} : { save }),
    version,
    updatedAt,
    historyRetained,
    ...(parsedWarnings === undefined ? {} : { warnings: parsedWarnings }),
  };
}

function syncAcceptedResultWithSave(result: AcceptedSyncResponse, save: Save): SyncAcceptedResult {
  return {
    ...result,
    save: {
      ...save,
      version: result.version,
      createdAt: save.createdAt === nowForCompat() ? result.updatedAt : save.createdAt,
      updatedAt: result.updatedAt,
    },
  };
}

function synthesizeSaveFromSync(input: {
  saveId: string;
  cached: Save | undefined;
  metadata: JsonObject | undefined;
  state: JsonObject;
}): Save {
  return {
    saveId: input.saveId,
    playerRef: input.cached?.playerRef ?? null,
    metadata: cloneJsonObject(input.metadata ?? input.cached?.metadata ?? {}),
    state: cloneJsonObject(input.state),
    version: 1,
    createdAt: input.cached?.createdAt ?? new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function accountSlotCacheId(accountId: string, slotId: string): string {
  return `${accountId}:${slotId}`;
}

function nowForCompat(): string {
  return new Date(0).toISOString();
}

function accountToSave(account: Account): Save {
  const now = nowForCompat();
  return {
    saveId: account.accountId,
    playerRef: null,
    metadata: {},
    state: {
      schema: "persistly.account.v1",
      accountData: cloneJsonObject(account.accountData),
      slots: structuredClone(account.slots) as unknown as JsonObject[],
    },
    version: account.version ?? 1,
    createdAt: now,
    updatedAt: now,
  };
}

function accountSlotToSave(accountId: string, slot: AccountSlot): Save {
  const now = nowForCompat();
  return {
    saveId: accountSlotCacheId(accountId, slot.slotId),
    playerRef: null,
    metadata: cloneJsonObject(slot.slotInfo),
    state: cloneJsonObject(slot.data),
    version: slot.version,
    createdAt: now,
    updatedAt: slot.updatedAt ?? now,
  };
}

function synthesizeAccountSaveFromSync(input: {
  saveId: string;
  cached: Save | undefined;
  accountData: JsonObject | undefined;
  accountDataPatch: JsonObject | undefined;
}): Save {
  const cachedState = input.cached ? parseObject(input.cached.state, "Cached account state") : {};
  const cachedAccountData = parseObject(cachedState.accountData ?? {}, "Cached accountData");
  const accountData =
    input.accountData === undefined
      ? { ...cachedAccountData, ...cloneJsonObject(input.accountDataPatch ?? {}) }
      : cloneJsonObject(input.accountData);

  return {
    saveId: input.saveId,
    playerRef: input.cached?.playerRef ?? null,
    metadata: cloneJsonObject(input.cached?.metadata ?? {}),
    state: {
      schema: "persistly.account.v1",
      accountData,
      slots: Array.isArray(cachedState.slots) ? structuredClone(cachedState.slots) : [],
    },
    version: 1,
    createdAt: input.cached?.createdAt ?? new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return structuredClone(value);
}

function parseConflictSyncResult(value: unknown, options: { saveId?: string } = {}): SyncConflictResult {
  const record = parseObject(value, "Conflict sync response");
  const details = parseObject(record.details, "Conflict details");

  if (record.status !== "conflict") {
    throw new PersistlyConfigurationError("Conflict sync response had an unexpected status.");
  }

  if (details.reason !== "base_version_mismatch") {
    throw new PersistlyConfigurationError("Conflict sync response had an unexpected reason.");
  }

  return {
    status: PersistlySyncStatus.Conflict,
    save: parseConflictCanonicalSave(record, options.saveId),
    details: {
      reason: "base_version_mismatch",
    },
  };
}

function parseConflictCanonicalSave(record: Record<string, unknown>, fallbackSaveId?: string): Save {
  if (record.save !== undefined) {
    return parseSave(record.save);
  }

  if (record.slot !== undefined) {
    const slot = parseAccountSlot(record.slot);
    return {
      saveId: fallbackSaveId ?? slot.slotId,
      playerRef: null,
      metadata: cloneJsonObject(slot.slotInfo),
      state: cloneJsonObject(slot.data),
      version: slot.version,
      createdAt: slot.updatedAt,
      updatedAt: slot.updatedAt,
    };
  }

  if (record.account !== undefined) {
    const account = parseAccount(record.account);
    const version = parsePositiveInteger(record.version ?? account.version, "Conflict account version");
    const updatedAt = parseDateTime(record.updatedAt, "Conflict account updatedAt");
    return {
      saveId: fallbackSaveId ?? account.accountId,
      playerRef: null,
      metadata: {},
      state: {
        schema: "persistly.account.v1",
        accountData: cloneJsonObject(account.accountData),
        slots: structuredClone(account.slots) as unknown as JsonObject[],
      },
      version,
      createdAt: updatedAt,
      updatedAt,
    };
  }

  throw new PersistlyConfigurationError("Conflict sync response must include save, slot, or account.");
}

function isSyncConflictPayload(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as { status?: unknown }).status === "conflict";
}

function validateAccountCreatePayload(payload: CreateAccountInput): void {
  validatePayloadLimits({
    ...(payload.accountData === undefined ? {} : { accountData: payload.accountData }),
  });
  if (payload.slot) {
    assertSlotId(payload.slot.slotId, "createAccount.slot");
    validatePayloadLimits({ slotInfo: payload.slot.slotInfo ?? {}, data: payload.slot.data });
  }
}

function normalizeCreateAccountPayload(payload: CreateAccountInput): Record<string, unknown> {
  return {
    ...(payload.playerRef === undefined ? {} : { playerRef: payload.playerRef }),
    ...(payload.externalAccountRef === undefined ? {} : { externalAccountRef: payload.externalAccountRef }),
    ...(payload.accountData === undefined ? {} : { accountData: payload.accountData }),
    ...(payload.slot === undefined ? {} : { slot: payload.slot }),
  };
}

function transferCodeRequestBody(payload: {
  transferCode?: string;
  deviceLabel?: string;
  ttlSeconds?: number;
}): Record<string, unknown> {
  if (
    payload.ttlSeconds !== undefined &&
    (typeof payload.ttlSeconds !== "number" || !Number.isInteger(payload.ttlSeconds) || payload.ttlSeconds <= 0)
  ) {
    throw new PersistlyConfigurationError("transfer code ttlSeconds must be a positive integer when provided.");
  }

  return {
    ...(payload.transferCode === undefined ? {} : { transferCode: payload.transferCode }),
    ...(payload.deviceLabel === undefined ? {} : { deviceLabel: payload.deviceLabel }),
    ...(payload.ttlSeconds === undefined ? {} : { ttlSeconds: payload.ttlSeconds }),
  };
}

function assertAuthProvider(provider: PersistlyAuthProvider, operation: string): PersistlyAuthProvider {
  if (provider !== "firebase") {
    throw new PersistlyConfigurationError(`${operation} provider must be "firebase".`);
  }
  return provider;
}

function assertProviderToken(token: string, operation: string): string {
  if (typeof token !== "string" || token.trim() === "") {
    throw new PersistlyConfigurationError(`${operation} requires a non-empty provider token.`);
  }
  return token;
}

function parseAuthSessionResult(value: unknown): PersistlyAuthSessionResult {
  const record = parseObject(value, "Auth session response");
  const provider = record.linkedProvider;
  if (typeof record.accountId !== "string" || record.accountId.trim() === "") {
    throw new PersistlyConfigurationError("Auth session response accountId must be a non-empty string.");
  }
  if (typeof record.accountSessionToken !== "string" || record.accountSessionToken.trim() === "") {
    throw new PersistlyConfigurationError("Auth session response accountSessionToken must be a non-empty string.");
  }
  if (provider !== "firebase") {
    throw new PersistlyConfigurationError("Auth session response linkedProvider must be firebase.");
  }
  if (typeof record.isNewAccount !== "boolean") {
    throw new PersistlyConfigurationError("Auth session response isNewAccount must be a boolean.");
  }
  if (typeof record.wasProviderNewForAccount !== "boolean") {
    throw new PersistlyConfigurationError("Auth session response wasProviderNewForAccount must be a boolean.");
  }
  return {
    accountId: record.accountId,
    accountSessionToken: record.accountSessionToken,
    isNewAccount: record.isNewAccount,
    linkedProvider: provider,
    wasProviderNewForAccount: record.wasProviderNewForAccount,
    ...(record.syncPolicy === undefined ? {} : { syncPolicy: parseSyncPolicy(record.syncPolicy) }),
  };
}

function parseLinkedAuthProviders(value: unknown): PersistlyLinkedProvider[] {
  if (!Array.isArray(value)) {
    throw new PersistlyConfigurationError("Linked auth providers response must be an array.");
  }
  return value.map((entry, index) => {
    const record = parseObject(entry, `Linked auth providers response[${index}]`);
    const provider = record.provider;
    if (provider !== "firebase") {
      throw new PersistlyConfigurationError(`Linked auth providers response[${index}].provider must be firebase.`);
    }
    const display = parseObject(record.display, `Linked auth providers response[${index}].display`);
    if (typeof display.label !== "string" || display.label.trim() === "") {
      throw new PersistlyConfigurationError(`Linked auth providers response[${index}].display.label must be a non-empty string.`);
    }
    if (display.emailHint !== undefined && typeof display.emailHint !== "string") {
      throw new PersistlyConfigurationError(`Linked auth providers response[${index}].display.emailHint must be a string.`);
    }
    if (typeof record.linkedAt !== "string" || Number.isNaN(Date.parse(record.linkedAt))) {
      throw new PersistlyConfigurationError(`Linked auth providers response[${index}].linkedAt must be a date-time string.`);
    }
    if (record.lastUsedAt !== undefined && (typeof record.lastUsedAt !== "string" || Number.isNaN(Date.parse(record.lastUsedAt)))) {
      throw new PersistlyConfigurationError(`Linked auth providers response[${index}].lastUsedAt must be a date-time string.`);
    }
    return {
      provider,
      display: {
        label: display.label,
        ...(display.emailHint === undefined ? {} : { emailHint: display.emailHint }),
      },
      linkedAt: record.linkedAt,
      ...(record.lastUsedAt === undefined ? {} : { lastUsedAt: record.lastUsedAt }),
    };
  });
}

function validateSyncAccountDataPayload(payload: SyncAccountDataInput): void {
  if (payload.accountData !== undefined && payload.accountDataPatch !== undefined) {
    throw new PersistlyConfigurationError("syncAccountData accepts either accountData or accountDataPatch, not both.");
  }
  if (payload.accountData === undefined && payload.accountDataPatch === undefined) {
    throw new PersistlyConfigurationError(
      "syncAccountData requires accountData or accountDataPatch.",
    );
  }
}

function parseSave(value: unknown): Save {
  try {
    return parseSaveSnapshot(value);
  } catch (error) {
    throw new PersistlyConfigurationError(error instanceof Error ? error.message : "Save payload was malformed.");
  }
}

function parseApiError(status: number, value: unknown): PersistlyApiError {
  const record = parseObject(value, "Error response");
  const errorRecord = parseObject(record.error, "Error response payload");
  const code = errorRecord.code;
  const message = errorRecord.message;

  if (!isPersistlyErrorCode(code)) {
    throw new PersistlyConfigurationError(`Persistly error code was unexpected: ${String(code)}`);
  }

  if (typeof message !== "string") {
    throw new PersistlyConfigurationError("Persistly error message must be a string.");
  }

  const details = errorRecord.details === undefined ? undefined : parseObject(errorRecord.details, "Error details");
  return createPersistlyApiError(status, code, message, details);
}

function parseObject(value: unknown, label: string): JsonObject {
  try {
    return parseSchemaObject(value, label);
  } catch (error) {
    throw new PersistlyConfigurationError(error instanceof Error ? error.message : `${label} must be an object.`);
  }
}

function isPersistlyErrorCode(value: unknown): value is PersistlyErrorCode {
  return (
    value === "invalid_request" ||
    value === "unauthorized" ||
    value === "forbidden" ||
    value === "not_found" ||
    value === "conflict" ||
    value === "slot_already_exists" ||
    value === "slot_archived" ||
    value === "account_deleted" ||
    value === "slot_deleted" ||
    value === "transfer_code_invalid" ||
    value === "transfer_code_expired" ||
    value === "transfer_code_consumed" ||
    value === "transfer_code_rate_limited" ||
    value === "transfer_code_disabled" ||
    value === "provider_token_invalid" ||
    value === "auth_provider_not_configured" ||
    value === "account_auth_conflict" ||
    value === "rate_limited" ||
    value === "payload_too_large" ||
    value === "server_error"
  );
}

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
import { validatePayloadLimits } from "./limits.js";
import { parseObject as parseSchemaObject, parseSaveSnapshot, type JsonObject, type SaveSnapshot } from "./schema.js";

export type Save = SaveSnapshot;

export interface SaveEnvelope {
  save: Save;
}

export interface CreateSaveInput {
  playerRef?: string;
  metadata?: JsonObject;
  state: JsonObject;
}

export interface SyncSaveInput {
  baseVersion?: number;
  metadata?: JsonObject;
  state: JsonObject;
}

export interface ExternalProfileRef {
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
}

export interface CreateProfileInput {
  playerRef?: string;
  externalProfileRef?: ExternalProfileRef;
  profileMetadata?: JsonObject;
  accountData?: JsonObject;
  character?: {
    metadata: JsonObject;
    state: JsonObject;
  };
}

export interface ProfileEnvelope {
  profileSaveId: string;
  profileSessionToken?: string;
  profile: Save;
  character?: Save;
  syncPolicy?: SyncPolicy;
}

export interface CreatedProfileEnvelope extends ProfileEnvelope {
  profileSessionToken: string;
  syncPolicy: SyncPolicy;
}

export interface ProfileCharacterEnvelope extends ProfileEnvelope {
  character: Save;
}

export interface ProfileSessionInput {
  profileSaveId: string;
  profileSessionToken: string;
}

export interface ProfileCharacterInput extends ProfileSessionInput {
  characterSaveId: string;
}

export interface CreateProfileCharacterInput extends ProfileSessionInput {
  metadata: JsonObject;
  state: JsonObject;
}

export interface SyncProfileCharacterInput extends ProfileCharacterInput {
  baseVersion?: number;
  metadata?: JsonObject;
  state: JsonObject;
}

export interface SyncProfileAccountDataInput extends ProfileSessionInput {
  baseVersion: number;
  accountData?: JsonObject;
  accountDataPatch?: JsonObject;
  metadata?: JsonObject | null;
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
}

export const DEFAULT_PERSISTLY_API_BASE_URL = "https://api.persistly.app";

export class PersistlyClient {
  private readonly baseUrl: string;
  private readonly runtimeKey: string;
  private readonly cache: SaveCacheStore;
  private readonly fetchImpl: typeof globalThis.fetch;

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

  async createSave(payload: CreateSaveInput): Promise<Save> {
    validatePayloadLimits(payload);
    const response = await this.requestJson("/api/v1/saves", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const save = parseSaveEnvelope(response).save;

    await this.cache.set(save);
    return save;
  }

  async createProfile(payload: CreateProfileInput): Promise<CreatedProfileEnvelope> {
    validateProfileCreatePayload(payload);
    const response = await this.requestJson("/api/v1/profiles", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const envelope = requireCreatedProfileEnvelope(parseProfileEnvelope(response));

    await this.cache.set(envelope.profile);
    if (envelope.character) {
      await this.cache.set(envelope.character);
    }

    return envelope;
  }

  async syncProfileAccountData(payload: SyncProfileAccountDataInput): Promise<SyncSaveResult> {
    const profileSaveId = assertSaveId(payload.profileSaveId, "syncProfileAccountData");
    assertProfileSessionToken(payload.profileSessionToken, "syncProfileAccountData");
    validateSyncProfileAccountDataPayload(payload);
    validatePayloadLimits({
      ...(payload.metadata === undefined || payload.metadata === null ? {} : { metadata: payload.metadata }),
      ...(payload.accountData === undefined && payload.accountDataPatch === undefined
        ? {}
        : { state: payload.accountData ?? payload.accountDataPatch }),
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
    if ("metadata" in payload) {
      body.metadata = payload.metadata;
    }

    const response = await this.requestRaw(
      `/api/v1/profiles/${encodeURIComponent(payload.profileSaveId)}/account-data/sync`,
      {
        method: "POST",
        headers: profileSessionHeaders(payload.profileSessionToken),
        body: JSON.stringify(body),
      },
    );
    const json = await parseJsonResponse(response);

    if (response.status === 200) {
      const accepted = parseAcceptedSyncResult(json);
      const cached = (await this.cache.get(profileSaveId)) ?? undefined;
      const result = syncAcceptedResultWithSave(
        accepted,
        accepted.save ??
          synthesizeProfileSaveFromSync({
            saveId: profileSaveId,
            cached,
            accountData: payload.accountData,
            accountDataPatch: payload.accountDataPatch,
            metadata: "metadata" in payload ? payload.metadata : undefined,
          }),
      );
      await this.cache.set(result.save);
      return result;
    }

    if (response.status === 409 && isSyncConflictPayload(json)) {
      const result = parseConflictSyncResult(json);
      await this.cache.set(result.save);
      return result;
    }

    throw parseApiError(response.status, json);
  }

  async loadProfile(payload: ProfileSessionInput): Promise<Save> {
    const envelope = await this.loadProfileEnvelope(payload);
    return envelope.profile;
  }

  async loadProfileEnvelope(payload: ProfileSessionInput): Promise<ProfileEnvelope> {
    assertSaveId(payload.profileSaveId, "loadProfile");
    assertProfileSessionToken(payload.profileSessionToken, "loadProfile");
    const response = await this.requestJson(`/api/v1/profiles/${encodeURIComponent(payload.profileSaveId)}`, {
      method: "GET",
      headers: profileSessionHeaders(payload.profileSessionToken),
    });
    const envelope = parseProfileEnvelope(response);

    await this.cache.set(envelope.profile);
    if (envelope.character) {
      await this.cache.set(envelope.character);
    }
    return envelope;
  }

  async createProfileCharacter(payload: CreateProfileCharacterInput): Promise<ProfileCharacterEnvelope> {
    assertSaveId(payload.profileSaveId, "createProfileCharacter");
    assertProfileSessionToken(payload.profileSessionToken, "createProfileCharacter");
    requireProfileCharacterSlotMetadata(payload.metadata, "createProfileCharacter.metadata");
    validatePayloadLimits({ metadata: payload.metadata, state: payload.state });
    const response = await this.requestJson(`/api/v1/profiles/${encodeURIComponent(payload.profileSaveId)}/characters`, {
      method: "POST",
      headers: profileSessionHeaders(payload.profileSessionToken),
      body: JSON.stringify({
        metadata: payload.metadata,
        state: payload.state,
      }),
    });
    const envelope = requireProfileCharacterEnvelope(parseProfileEnvelope(response));

    await this.cache.set(envelope.profile);
    if (envelope.character) {
      await this.cache.set(envelope.character);
    }
    return envelope;
  }

  async loadProfileCharacter(payload: ProfileCharacterInput): Promise<Save> {
    assertSaveId(payload.profileSaveId, "loadProfileCharacter");
    assertSaveId(payload.characterSaveId, "loadProfileCharacter");
    assertProfileSessionToken(payload.profileSessionToken, "loadProfileCharacter");
    const response = await this.requestJson(
      `/api/v1/profiles/${encodeURIComponent(payload.profileSaveId)}/characters/${encodeURIComponent(payload.characterSaveId)}`,
      {
        method: "GET",
        headers: profileSessionHeaders(payload.profileSessionToken),
      },
    );
    const save = parseSaveEnvelope(response).save;

    await this.cache.set(save);
    return save;
  }

  async syncProfileCharacter(payload: SyncProfileCharacterInput): Promise<SyncSaveResult> {
    assertSaveId(payload.profileSaveId, "syncProfileCharacter");
    assertSaveId(payload.characterSaveId, "syncProfileCharacter");
    assertProfileSessionToken(payload.profileSessionToken, "syncProfileCharacter");
    if (payload.metadata !== undefined) {
      validateReservedProfileCharacterMetadata(payload.metadata, "syncProfileCharacter.metadata");
    }
    validatePayloadLimits(payload);
    const cached = (await this.cache.get(payload.characterSaveId)) ?? undefined;
    const baseVersion = payload.baseVersion ?? cached?.version;

    if (!baseVersion) {
      throw new PersistlyConfigurationError(
        "syncProfileCharacter requires baseVersion unless the cache already holds a canonical save for this characterSaveId.",
      );
    }

    const response = await this.requestRaw(
      `/api/v1/profiles/${encodeURIComponent(payload.profileSaveId)}/characters/${encodeURIComponent(payload.characterSaveId)}/sync`,
      {
        method: "POST",
        headers: profileSessionHeaders(payload.profileSessionToken),
        body: JSON.stringify({
          baseVersion,
          metadata: payload.metadata,
          state: payload.state,
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
            saveId: payload.characterSaveId,
            cached,
            metadata: payload.metadata,
            state: payload.state,
          }),
      );
      await this.cache.set(result.save);
      return result;
    }

    if (response.status === 409 && isSyncConflictPayload(json)) {
      const result = parseConflictSyncResult(json);
      await this.cache.set(result.save);
      return result;
    }

    throw parseApiError(response.status, json);
  }

  async archiveProfileCharacter(payload: ProfileCharacterInput): Promise<ProfileEnvelope> {
    assertSaveId(payload.profileSaveId, "archiveProfileCharacter");
    assertSaveId(payload.characterSaveId, "archiveProfileCharacter");
    assertProfileSessionToken(payload.profileSessionToken, "archiveProfileCharacter");
    const response = await this.requestJson(
      `/api/v1/profiles/${encodeURIComponent(payload.profileSaveId)}/characters/${encodeURIComponent(payload.characterSaveId)}/archive`,
      {
        method: "POST",
        headers: profileSessionHeaders(payload.profileSessionToken),
      },
    );
    const envelope = parseProfileEnvelope(response);

    await this.cache.set(envelope.profile);
    if (envelope.character) {
      await this.cache.set(envelope.character);
    }
    return envelope;
  }

  async getRuntimeConfig(): Promise<RuntimeConfig> {
    const response = await this.requestJson("/api/v1/runtime-config", {
      method: "GET",
    });
    return parseRuntimeConfig(response);
  }

  async loadSave(saveId: string): Promise<Save> {
    const canonicalSaveId = assertSaveId(saveId, "loadSave");
    const response = await this.requestJson(`/api/v1/saves/${encodeURIComponent(canonicalSaveId)}`, {
      method: "GET",
    });
    const save = parseSaveEnvelope(response).save;

    await this.cache.set(save);
    return save;
  }

  async syncSave(saveId: string, payload: SyncSaveInput): Promise<SyncSaveResult> {
    const canonicalSaveId = assertSaveId(saveId, "syncSave");
    validatePayloadLimits(payload);
    const cached = (await this.cache.get(canonicalSaveId)) ?? undefined;
    const baseVersion = payload.baseVersion ?? cached?.version;

    if (!baseVersion) {
      throw new PersistlyConfigurationError(
        "syncSave requires baseVersion unless the cache already holds a canonical save for this saveId.",
      );
    }

    const response = await this.requestRaw(`/api/v1/saves/${encodeURIComponent(canonicalSaveId)}/sync`, {
      method: "POST",
      body: JSON.stringify({
        baseVersion,
        metadata: payload.metadata,
        state: payload.state,
      }),
    });
    const json = await parseJsonResponse(response);

    if (response.status === 200) {
      const accepted = parseAcceptedSyncResult(json);
      const result = syncAcceptedResultWithSave(
        accepted,
        accepted.save ??
          synthesizeSaveFromSync({
            saveId: canonicalSaveId,
            cached,
            metadata: payload.metadata,
            state: payload.state,
          }),
      );
      await this.cache.set(result.save);
      return result;
    }

    if (response.status === 409) {
      const result = parseConflictSyncResult(json);
      await this.cache.set(result.save);
      return result;
    }

    throw parseApiError(response.status, json);
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
          ...init.headers,
        },
      });
    } catch (error) {
      throw new PersistlyTransportError("Persistly request failed before the runtime API responded.", error);
    }
  }
}

function assertSaveId(saveId: string, operation: string): string {
  const canonicalSaveId = saveId.trim();

  if (!canonicalSaveId) {
    throw new PersistlyConfigurationError(`${operation} requires a non-empty saveId.`);
  }

  return canonicalSaveId;
}

function assertProfileSessionToken(token: string, operation: string): string {
  if (typeof token !== "string" || token.trim() === "") {
    throw new PersistlyConfigurationError(`${operation} requires a non-empty profileSessionToken.`);
  }
  return token;
}

function profileSessionHeaders(token: string): HeadersInit {
  return {
    "x-persistly-profile-session": token,
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

function parseSaveEnvelope(value: unknown): SaveEnvelope {
  const record = parseObject(value, "Save response");

  return {
    save: parseSave(record.save),
  };
}

function parseProfileEnvelope(value: unknown): ProfileEnvelope {
  const record = parseObject(value, "Profile response");
  const profileSaveId = record.profileSaveId;
  const profileSessionToken = record.profileSessionToken;
  const profile = parseSave(record.profile);
  const character = record.character === undefined || record.character === null ? undefined : parseSave(record.character);
  const syncPolicy = record.syncPolicy === undefined ? undefined : parseSyncPolicy(record.syncPolicy);

  if (typeof profileSaveId !== "string" || profileSaveId.trim() === "") {
    throw new PersistlyConfigurationError("Profile response profileSaveId must be a non-empty string.");
  }

  if (!(profileSessionToken === undefined || typeof profileSessionToken === "string")) {
    throw new PersistlyConfigurationError("Profile response profileSessionToken must be a string when present.");
  }

  return {
    profileSaveId,
    ...(profileSessionToken === undefined ? {} : { profileSessionToken }),
    profile,
    ...(character === undefined ? {} : { character }),
    ...(syncPolicy === undefined ? {} : { syncPolicy }),
  };
}

function requireCreatedProfileEnvelope(envelope: ProfileEnvelope): CreatedProfileEnvelope {
  if (typeof envelope.profileSessionToken !== "string" || envelope.profileSessionToken.trim() === "") {
    throw new PersistlyConfigurationError("Create profile response must include a non-empty profileSessionToken.");
  }
  if (envelope.syncPolicy === undefined) {
    throw new PersistlyConfigurationError("Create profile response must include syncPolicy.");
  }

  return {
    ...envelope,
    profileSessionToken: envelope.profileSessionToken,
    syncPolicy: envelope.syncPolicy,
  };
}

function requireProfileCharacterEnvelope(envelope: ProfileEnvelope): ProfileCharacterEnvelope {
  if (envelope.character === undefined) {
    throw new PersistlyConfigurationError("Create profile character response must include the character save.");
  }

  return {
    ...envelope,
    character: envelope.character,
  };
}

function parseRuntimeConfig(value: unknown): RuntimeConfig {
  const record = parseObject(value, "Runtime config response");
  return {
    syncPolicy: parseSyncPolicy(record.syncPolicy),
  };
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

function synthesizeProfileSaveFromSync(input: {
  saveId: string;
  cached: Save | undefined;
  accountData: JsonObject | undefined;
  accountDataPatch: JsonObject | undefined;
  metadata: JsonObject | null | undefined;
}): Save {
  const cachedState = input.cached ? parseObject(input.cached.state, "Cached profile state") : {};
  const cachedAccountData = parseObject(cachedState.accountData ?? {}, "Cached profile accountData");
  const accountData =
    input.accountData === undefined
      ? { ...cachedAccountData, ...cloneJsonObject(input.accountDataPatch ?? {}) }
      : cloneJsonObject(input.accountData);

  return {
    saveId: input.saveId,
    playerRef: input.cached?.playerRef ?? null,
    metadata: input.metadata === null ? {} : cloneJsonObject(input.metadata ?? input.cached?.metadata ?? {}),
    state: {
      schema: "persistly.profile.v1",
      accountData,
      characterSlots: Array.isArray(cachedState.characterSlots) ? structuredClone(cachedState.characterSlots) : [],
    },
    version: 1,
    createdAt: input.cached?.createdAt ?? new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return structuredClone(value);
}

function parseConflictSyncResult(value: unknown): SyncConflictResult {
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
    save: parseSave(record.save),
    details: {
      reason: "base_version_mismatch",
    },
  };
}

function isSyncConflictPayload(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as { status?: unknown }).status === "conflict";
}

function validateProfileCreatePayload(payload: CreateProfileInput): void {
  validatePayloadLimits({
    ...(payload.profileMetadata === undefined ? {} : { metadata: payload.profileMetadata }),
    ...(payload.accountData === undefined ? {} : { state: payload.accountData }),
  });
  if (payload.character) {
    requireProfileCharacterSlotMetadata(payload.character.metadata, "createProfile.character.metadata");
    validatePayloadLimits(payload.character);
  }
}

function validateSyncProfileAccountDataPayload(payload: SyncProfileAccountDataInput): void {
  if (payload.accountData !== undefined && payload.accountDataPatch !== undefined) {
    throw new PersistlyConfigurationError("syncProfileAccountData accepts either accountData or accountDataPatch, not both.");
  }
  if (payload.accountData === undefined && payload.accountDataPatch === undefined && !("metadata" in payload)) {
    throw new PersistlyConfigurationError(
      "syncProfileAccountData requires accountData, accountDataPatch, or metadata.",
    );
  }
}

function requireProfileCharacterSlotMetadata(metadata: JsonObject, label: string): void {
  const record = parseObject(metadata, label);
  const persistly = record._persistly;

  if (persistly === undefined) {
    throw new PersistlyConfigurationError(`${label}._persistly.slotKey is required.`);
  }

  validatePersistlySlotMetadata(persistly, label);
}

function validateReservedProfileCharacterMetadata(metadata: JsonObject, label: string): void {
  const record = parseObject(metadata, label);
  const persistly = record._persistly;
  if (persistly !== undefined) {
    validatePersistlySlotMetadata(persistly, label);
  }
}

function validatePersistlySlotMetadata(persistly: unknown, label: string): void {
  const persistlyRecord = parseObject(persistly, `${label}._persistly`);
  const slotKey = persistlyRecord.slotKey;
  if (typeof slotKey !== "string" || !/^[A-Za-z0-9_.-]{1,64}$/.test(slotKey)) {
    throw new PersistlyConfigurationError(`${label}._persistly.slotKey must match ^[A-Za-z0-9_.-]{1,64}$.`);
  }
  if (Object.keys(persistlyRecord).length !== 1) {
    throw new PersistlyConfigurationError(`${label}._persistly is reserved and may only contain slotKey.`);
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
    value === "character_archived" ||
    value === "rate_limited" ||
    value === "payload_too_large" ||
    value === "server_error"
  );
}

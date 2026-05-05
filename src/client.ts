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
  characterMetadata: JsonObject;
  characterState: JsonObject;
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
  character: Save;
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

export interface SyncAcceptedResult {
  status: typeof PersistlySyncStatus.Accepted;
  save: Save;
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

  async loadProfile(payload: ProfileSessionInput): Promise<Save> {
    assertSaveId(payload.profileSaveId, "loadProfile");
    assertProfileSessionToken(payload.profileSessionToken, "loadProfile");
    const response = await this.requestJson(`/api/v1/profiles/${encodeURIComponent(payload.profileSaveId)}`, {
      method: "GET",
      headers: profileSessionHeaders(payload.profileSessionToken),
    });
    const profile = parseProfileEnvelope(response).profile;

    await this.cache.set(profile);
    return profile;
  }

  async createProfileCharacter(payload: CreateProfileCharacterInput): Promise<ProfileCharacterEnvelope> {
    assertSaveId(payload.profileSaveId, "createProfileCharacter");
    assertProfileSessionToken(payload.profileSessionToken, "createProfileCharacter");
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
    validatePayloadLimits(payload);
    const baseVersion = payload.baseVersion ?? (await this.cache.get(payload.characterSaveId))?.version;

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
      const result = parseAcceptedSyncResult(json);
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
    const baseVersion = payload.baseVersion ?? (await this.cache.get(canonicalSaveId))?.version;

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
      const result = parseAcceptedSyncResult(json);
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
  if (envelope.character === undefined) {
    throw new PersistlyConfigurationError("Create profile response must include the first character save.");
  }
  if (envelope.syncPolicy === undefined) {
    throw new PersistlyConfigurationError("Create profile response must include syncPolicy.");
  }

  return {
    ...envelope,
    profileSessionToken: envelope.profileSessionToken,
    character: envelope.character,
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

function parseAcceptedSyncResult(value: unknown): SyncAcceptedResult {
  const record = parseObject(value, "Accepted sync response");

  if (record.status !== "accepted") {
    throw new PersistlyConfigurationError("Accepted sync response had an unexpected status.");
  }

  return {
    status: PersistlySyncStatus.Accepted,
    save: parseSave(record.save),
  };
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
    value === "rate_limited" ||
    value === "payload_too_large" ||
    value === "server_error"
  );
}

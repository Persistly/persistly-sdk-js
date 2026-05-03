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
  externalUserId?: string;
  metadata?: JsonObject;
  state: JsonObject;
}

export interface SyncSaveInput {
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
    value === "not_found" ||
    value === "conflict" ||
    value === "rate_limited" ||
    value === "payload_too_large" ||
    value === "server_error"
  );
}

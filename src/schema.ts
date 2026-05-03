export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface SaveSnapshot {
  saveId: string;
  version: number;
  metadata: JsonObject;
  state: JsonObject;
  createdAt: string;
  updatedAt: string;
  externalUserId: string | null;
}

const RFC3339_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function parseObject(value: unknown, label: string): JsonObject {
  if (!isJsonObject(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value;
}

export function parseSaveSnapshot(value: unknown): SaveSnapshot {
  const record = parseObject(value, "Save");
  const metadata = parseObject(record.metadata, "Save.metadata");
  const state = parseObject(record.state, "Save.state");
  const externalUserId = record.externalUserId;
  const version = record.version;
  const createdAt = record.createdAt;
  const updatedAt = record.updatedAt;

  if (typeof record.saveId !== "string") {
    throw new Error("Save.saveId must be a string.");
  }

  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new Error("Save.version must be an integer greater than or equal to 1.");
  }

  if (!isDateTimeString(createdAt)) {
    throw new Error("Save.createdAt must be a valid RFC 3339 date-time string.");
  }

  if (!isDateTimeString(updatedAt)) {
    throw new Error("Save.updatedAt must be a valid RFC 3339 date-time string.");
  }

  if (!(typeof externalUserId === "string" || externalUserId === null)) {
    throw new Error("Save.externalUserId must be a string or null.");
  }

  return {
    saveId: record.saveId,
    externalUserId,
    metadata,
    state,
    version,
    createdAt,
    updatedAt,
  };
}

export function cloneSaveSnapshot(snapshot: SaveSnapshot): SaveSnapshot {
  return structuredClone(snapshot);
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDateTimeString(value: unknown): value is string {
  return typeof value === "string" && RFC3339_DATE_TIME_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

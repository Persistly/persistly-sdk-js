import { parseObject, parseSaveSnapshot, type JsonObject, type SaveSnapshot } from "./schema.js";

export const PersistlyProfileSchema = "persistly.profile.v1" as const;

export interface PersistlyProfileCharacter extends JsonObject {
  slotKey: string;
  characterSaveId: string;
  metadata: JsonObject;
  archived?: boolean;
  archivedAt?: string;
}

export interface PersistlyProfileState extends JsonObject {
  schema: typeof PersistlyProfileSchema;
  accountData: JsonObject;
  characterSlots: PersistlyProfileCharacter[];
}

export interface BuildProfileStateInput {
  accountData?: JsonObject;
  characterSlots?: PersistlyProfileCharacter[];
}

export function buildProfileState(input: BuildProfileStateInput = {}): PersistlyProfileState {
  const accountData = input.accountData === undefined ? {} : parseObject(input.accountData, "profile.accountData");
  const characterSlots = input.characterSlots === undefined ? [] : parseProfileCharacters(input.characterSlots);

  return {
    schema: PersistlyProfileSchema,
    accountData: structuredClone(accountData),
    characterSlots: structuredClone(characterSlots),
  };
}

export function addCharacterToProfileState(
  profileState: PersistlyProfileState,
  characterSave: SaveSnapshot,
  slotKey: string,
): PersistlyProfileState {
  const canonicalProfileState = parseProfileState(profileState);
  const canonicalCharacterSave = parseSaveSnapshot(characterSave);

  return buildProfileState({
    accountData: canonicalProfileState.accountData,
    characterSlots: [
      ...canonicalProfileState.characterSlots,
      {
        slotKey: assertSlotKey(slotKey),
        characterSaveId: canonicalCharacterSave.saveId,
        metadata: canonicalCharacterSave.metadata,
      },
    ],
  });
}

export function isPersistlyProfileState(value: unknown): value is PersistlyProfileState {
  try {
    parseProfileState(value);
    return true;
  } catch {
    return false;
  }
}

function parseProfileState(value: unknown): PersistlyProfileState {
  const record = parseObject(value, "profile");

  if (record.schema !== PersistlyProfileSchema) {
    throw new Error(`profile.schema must be ${PersistlyProfileSchema}.`);
  }

  const accountData = parseObject(record.accountData, "profile.accountData");
  const characterSlots = parseProfileCharacters(record.characterSlots);

  return {
    schema: PersistlyProfileSchema,
    accountData,
    characterSlots,
  };
}

function parseProfileCharacters(value: unknown): PersistlyProfileCharacter[] {
  if (!Array.isArray(value)) {
    throw new Error("profile.characterSlots must be an array.");
  }

  return value.map((item, index) => {
    const record = parseObject(item, `profile.characterSlots[${index}]`);

    if (typeof record.characterSaveId !== "string" || record.characterSaveId.trim().length === 0) {
      throw new Error(`profile.characterSlots[${index}].characterSaveId must be a non-empty string.`);
    }

    const archived = record.archived;
    const archivedAt = record.archivedAt;

    if (!(archived === undefined || typeof archived === "boolean")) {
      throw new Error(`profile.characterSlots[${index}].archived must be a boolean when present.`);
    }
    if (!(archivedAt === undefined || typeof archivedAt === "string")) {
      throw new Error(`profile.characterSlots[${index}].archivedAt must be a string when present.`);
    }

    return {
      slotKey: assertSlotKey(record.slotKey, `profile.characterSlots[${index}].slotKey`),
      characterSaveId: record.characterSaveId,
      metadata: parseObject(record.metadata, `profile.characterSlots[${index}].metadata`),
      ...(archived === undefined ? {} : { archived }),
      ...(archivedAt === undefined ? {} : { archivedAt }),
    };
  });
}

function assertSlotKey(value: unknown, label = "slotKey"): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.-]{1,64}$/.test(value)) {
    throw new Error(`${label} must match ^[A-Za-z0-9_.-]{1,64}$.`);
  }

  return value;
}

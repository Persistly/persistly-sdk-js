import { parseObject, parseSaveSnapshot, type JsonObject, type SaveSnapshot } from "./schema.js";

export const PersistlyProfileSchema = "persistly.profile.v1" as const;

export interface PersistlyProfileCharacter extends JsonObject {
  saveId: string;
  metadata: JsonObject;
}

export interface PersistlyProfileState extends JsonObject {
  schema: typeof PersistlyProfileSchema;
  accountData: JsonObject;
  characters: PersistlyProfileCharacter[];
}

export interface BuildProfileStateInput {
  accountData?: JsonObject;
  characters?: PersistlyProfileCharacter[];
}

export class PersistlyProfileCreationError extends Error {
  constructor(
    message: string,
    readonly character: SaveSnapshot,
    readonly cause: unknown,
  ) {
    super(message);
    this.name = "PersistlyProfileCreationError";
  }
}

export function buildProfileState(input: BuildProfileStateInput = {}): PersistlyProfileState {
  const accountData = input.accountData === undefined ? {} : parseObject(input.accountData, "profile.accountData");
  const characters = input.characters === undefined ? [] : parseProfileCharacters(input.characters);

  return {
    schema: PersistlyProfileSchema,
    accountData: structuredClone(accountData),
    characters: structuredClone(characters),
  };
}

export function addCharacterToProfileState(
  profileState: PersistlyProfileState,
  characterSave: SaveSnapshot,
): PersistlyProfileState {
  const canonicalProfileState = parseProfileState(profileState);
  const canonicalCharacterSave = parseSaveSnapshot(characterSave);

  return buildProfileState({
    accountData: canonicalProfileState.accountData,
    characters: [
      ...canonicalProfileState.characters,
      {
        saveId: canonicalCharacterSave.saveId,
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
  const characters = parseProfileCharacters(record.characters);

  return {
    schema: PersistlyProfileSchema,
    accountData,
    characters,
  };
}

function parseProfileCharacters(value: unknown): PersistlyProfileCharacter[] {
  if (!Array.isArray(value)) {
    throw new Error("profile.characters must be an array.");
  }

  return value.map((item, index) => {
    const record = parseObject(item, `profile.characters[${index}]`);

    if (typeof record.saveId !== "string" || record.saveId.trim().length === 0) {
      throw new Error(`profile.characters[${index}].saveId must be a non-empty string.`);
    }

    return {
      saveId: record.saveId,
      metadata: parseObject(record.metadata, `profile.characters[${index}].metadata`),
    };
  });
}

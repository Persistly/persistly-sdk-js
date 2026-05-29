import { parseObject, type JsonObject } from "./schema.js";

export const PersistlyAccountSchema = "persistly.account.v1" as const;

export type PersistlyAccountSlot = JsonObject & {
  slotId: string;
  slotInfo: JsonObject;
  version?: number;
  status?: "active" | "archived";
  updatedAt?: string;
};

export type PersistlyAccountState = JsonObject & {
  schema: typeof PersistlyAccountSchema;
  accountData: JsonObject;
  slots: PersistlyAccountSlot[];
};

export interface BuildAccountStateInput {
  accountData?: JsonObject;
  slots?: PersistlyAccountSlot[];
}

export function buildAccountState(input: BuildAccountStateInput = {}): PersistlyAccountState {
  const accountData = input.accountData === undefined ? {} : parseObject(input.accountData, "account.accountData");
  const slots = input.slots === undefined ? [] : parseAccountSlots(input.slots);

  return {
    schema: PersistlyAccountSchema,
    accountData: structuredClone(accountData),
    slots: structuredClone(slots),
  };
}

export function addSlotToAccountState(
  accountState: PersistlyAccountState,
  slotId: string,
  slotInfo: JsonObject,
): PersistlyAccountState {
  const canonicalAccountState = parseAccountState(accountState);

  return buildAccountState({
    accountData: canonicalAccountState.accountData,
    slots: [
      ...canonicalAccountState.slots,
      {
        slotId: assertSlotId(slotId),
        slotInfo: parseObject(slotInfo, "slot.slotInfo"),
      },
    ],
  });
}

export function isPersistlyAccountState(value: unknown): value is PersistlyAccountState {
  try {
    parseAccountState(value);
    return true;
  } catch {
    return false;
  }
}

function parseAccountState(value: unknown): PersistlyAccountState {
  const record = parseObject(value, "account");

  if (record.schema !== PersistlyAccountSchema) {
    throw new Error(`account.schema must be ${PersistlyAccountSchema}.`);
  }

  return {
    schema: PersistlyAccountSchema,
    accountData: parseObject(record.accountData, "account.accountData"),
    slots: parseAccountSlots(record.slots),
  };
}

function parseAccountSlots(value: unknown): PersistlyAccountSlot[] {
  if (!Array.isArray(value)) {
    throw new Error("account.slots must be an array.");
  }

  return value.map((item, index) => {
    const record = parseObject(item, `account.slots[${index}]`);

    const version = record.version;
    const status = record.status;
    const updatedAt = record.updatedAt;

    if (!(version === undefined || (typeof version === "number" && Number.isInteger(version) && version >= 1))) {
      throw new Error(`account.slots[${index}].version must be a positive integer when present.`);
    }
    if (!(status === undefined || status === "active" || status === "archived")) {
      throw new Error(`account.slots[${index}].status must be active or archived when present.`);
    }
    if (!(updatedAt === undefined || typeof updatedAt === "string")) {
      throw new Error(`account.slots[${index}].updatedAt must be a string when present.`);
    }

    return {
      slotId: assertSlotId(record.slotId, `account.slots[${index}].slotId`),
      slotInfo: parseObject(record.slotInfo, `account.slots[${index}].slotInfo`),
      ...(version === undefined ? {} : { version }),
      ...(status === undefined ? {} : { status }),
      ...(updatedAt === undefined ? {} : { updatedAt }),
    };
  });
}

function assertSlotId(value: unknown, label = "slotId"): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.-]{1,64}$/.test(value)) {
    throw new Error(`${label} must match ^[A-Za-z0-9_.-]{1,64}$.`);
  }

  return value;
}

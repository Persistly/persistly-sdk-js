import { PersistlyPayloadTooLargeError } from "./errors.js";
import type { JsonObject } from "./schema.js";
import runtimeLimitsJson from "../contracts/persistly-contract-v0.4.0/limits/runtime-limits.json" with { type: "json" };

interface RuntimeLimits {
  slotInfoMaxBytes: number;
  slotDataMaxBytes: number;
  accountDataMaxBytes: number;
  planLimits?: Record<string, {
    accountDataMaxBytes?: number;
    slotDataMaxBytes?: number;
    slotInfoMaxBytes?: number;
  }>;
  errorCodes: string[];
  conflictReasons: string[];
}

let cachedLimits: RuntimeLimits | undefined;

export function validatePayloadLimits(payload: {
  accountData?: JsonObject;
  slotInfo?: JsonObject;
  data?: JsonObject;
  /** @internal */
  metadata?: JsonObject;
  /** @internal */
  state?: JsonObject;
}): void {
  const limits = getRuntimeLimits();

  if (payload.accountData) {
    assertWithinLimit("accountData", payload.accountData, limits.accountDataMaxBytes);
  }

  if (payload.slotInfo) {
    assertWithinLimit("slotInfo", payload.slotInfo, limits.slotInfoMaxBytes);
  }

  if (payload.data) {
    assertWithinLimit("data", payload.data, limits.slotDataMaxBytes);
  }

  if (payload.metadata) {
    assertWithinLimit("metadata", payload.metadata, limits.slotInfoMaxBytes);
  }

  if (payload.state) {
    assertWithinLimit("state", payload.state, limits.slotDataMaxBytes);
  }
}

function getRuntimeLimits(): RuntimeLimits {
  if (cachedLimits) {
    return cachedLimits;
  }

  const value = runtimeLimitsJson as Partial<RuntimeLimits>;

  if (
    typeof value.slotInfoMaxBytes !== "number" ||
    typeof value.slotDataMaxBytes !== "number" ||
    !Array.isArray(value.errorCodes) ||
    !Array.isArray(value.conflictReasons)
  ) {
    throw new Error("Pinned runtime-limits.json is malformed.");
  }

  cachedLimits = {
    slotInfoMaxBytes: maxPlanLimit(value, "slotInfoMaxBytes", value.slotInfoMaxBytes),
    slotDataMaxBytes: maxPlanLimit(value, "slotDataMaxBytes", value.slotDataMaxBytes),
    accountDataMaxBytes: maxPlanLimit(value, "accountDataMaxBytes", value.slotDataMaxBytes),
    ...(isPlanLimits(value.planLimits) ? { planLimits: value.planLimits } : {}),
    errorCodes: value.errorCodes,
    conflictReasons: value.conflictReasons,
  };

  return cachedLimits;
}

type PayloadLimitField = "accountData" | "slotInfo" | "data" | "metadata" | "state";

function assertWithinLimit(field: PayloadLimitField, payload: JsonObject, maxBytes: number): void {
  const serialized = JSON.stringify(payload);
  const size = utf8ByteLength(serialized);

  if (size > maxBytes) {
    throw new PersistlyPayloadTooLargeError(
      `${payloadLimitLabel(field)} exceeds the maximum allowed size.`,
      {
        field,
        maxBytes,
      },
    );
  }
}

function payloadLimitLabel(field: PayloadLimitField): string {
  switch (field) {
    case "accountData":
      return "Account data";
    case "slotInfo":
      return "Slot info";
    case "data":
      return "Data";
    case "state":
      return "State";
    case "metadata":
      return "Metadata";
  }
}

function maxPlanLimit(value: Partial<RuntimeLimits>, field: string, fallback: number): number {
  if (!isPlanLimits(value.planLimits)) {
    return fallback;
  }

  let maxBytes = fallback;
  for (const plan of Object.values(value.planLimits)) {
    const candidate = plan[field as keyof typeof plan];
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > maxBytes) {
      maxBytes = candidate;
    }
  }
  return maxBytes;
}

function isPlanLimits(value: unknown): value is NonNullable<RuntimeLimits["planLimits"]> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function utf8ByteLength(value: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).byteLength;
  }

  return value.length;
}

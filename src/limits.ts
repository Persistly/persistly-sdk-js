import { PersistlyPayloadTooLargeError } from "./errors.js";
import type { JsonObject } from "./schema.js";
import runtimeLimitsJson from "../contracts/persistly-contract-v0.3.0/limits/runtime-limits.json" with { type: "json" };

interface RuntimeLimits {
  metadataMaxBytes: number;
  stateMaxBytes: number;
  planLimits?: Record<string, {
    accountDataMaxBytes?: number;
    characterStateMaxBytes?: number;
    metadataMaxBytes?: number;
    stateMaxBytes?: number;
  }>;
  errorCodes: string[];
  conflictReasons: string[];
}

let cachedLimits: RuntimeLimits | undefined;

export function validatePayloadLimits(payload: {
  metadata?: JsonObject;
  state?: JsonObject;
}): void {
  const limits = getRuntimeLimits();

  if (payload.metadata) {
    assertWithinLimit("metadata", payload.metadata, limits.metadataMaxBytes);
  }

  if (payload.state) {
    assertWithinLimit("state", payload.state, limits.stateMaxBytes);
  }
}

function getRuntimeLimits(): RuntimeLimits {
  if (cachedLimits) {
    return cachedLimits;
  }

  const value = runtimeLimitsJson as Partial<RuntimeLimits>;

  if (
    typeof value.metadataMaxBytes !== "number" ||
    typeof value.stateMaxBytes !== "number" ||
    !Array.isArray(value.errorCodes) ||
    !Array.isArray(value.conflictReasons)
  ) {
    throw new Error("Pinned runtime-limits.json is malformed.");
  }

  cachedLimits = {
    metadataMaxBytes: maxPlanLimit(value, "metadataMaxBytes", value.metadataMaxBytes),
    stateMaxBytes: Math.max(
      maxPlanLimit(value, "stateMaxBytes", value.stateMaxBytes),
      maxPlanLimit(value, "accountDataMaxBytes", value.stateMaxBytes),
      maxPlanLimit(value, "characterStateMaxBytes", value.stateMaxBytes),
    ),
    ...(isPlanLimits(value.planLimits) ? { planLimits: value.planLimits } : {}),
    errorCodes: value.errorCodes,
    conflictReasons: value.conflictReasons,
  };

  return cachedLimits;
}

function assertWithinLimit(field: "metadata" | "state", payload: JsonObject, maxBytes: number): void {
  const serialized = JSON.stringify(payload);
  const size = utf8ByteLength(serialized);

  if (size > maxBytes) {
    throw new PersistlyPayloadTooLargeError(
      `${field === "state" ? "State" : "Metadata"} exceeds the maximum allowed size.`,
      {
        field,
        maxBytes,
      },
    );
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

import { PersistlyPayloadTooLargeError } from "./errors.js";
import type { JsonObject } from "./schema.js";
import runtimeLimitsJson from "../contracts/persistly-contract-v0.3.0/limits/runtime-limits.json" with { type: "json" };

interface RuntimeLimits {
  metadataMaxBytes: number;
  stateMaxBytes: number;
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
    metadataMaxBytes: value.metadataMaxBytes,
    stateMaxBytes: value.stateMaxBytes,
    errorCodes: value.errorCodes,
    conflictReasons: value.conflictReasons,
  };

  return cachedLimits;
}

function assertWithinLimit(field: "metadata" | "state", payload: JsonObject, maxBytes: number): void {
  const serialized = JSON.stringify(payload);
  const size = Buffer.byteLength(serialized, "utf8");

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

export type PersistlyErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "slot_already_exists"
  | "character_archived"
  | "rate_limited"
  | "payload_too_large"
  | "server_error";

export class PersistlyApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: PersistlyErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PersistlyApiError";
  }
}

export class PersistlyInvalidRequestError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status = 400) {
    super(status, "invalid_request", message, details);
    this.name = "PersistlyInvalidRequestError";
  }
}

export class PersistlyUnauthorizedError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status = 401) {
    super(status, "unauthorized", message, details);
    this.name = "PersistlyUnauthorizedError";
  }
}

export class PersistlyForbiddenError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status = 403) {
    super(status, "forbidden", message, details);
    this.name = "PersistlyForbiddenError";
  }
}

export class PersistlyNotFoundError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status = 404) {
    super(status, "not_found", message, details);
    this.name = "PersistlyNotFoundError";
  }
}

export class PersistlyConflictError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status = 409) {
    super(status, "conflict", message, details);
    this.name = "PersistlyConflictError";
  }
}

export class PersistlySlotAlreadyExistsError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status = 409) {
    super(status, "slot_already_exists", message, details);
    this.name = "PersistlySlotAlreadyExistsError";
  }
}

export class PersistlyCharacterArchivedError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status = 409) {
    super(status, "character_archived", message, details);
    this.name = "PersistlyCharacterArchivedError";
  }
}

export class PersistlyRateLimitedError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status = 429) {
    super(status, "rate_limited", message, details);
    this.name = "PersistlyRateLimitedError";
  }
}

export class PersistlyPayloadTooLargeError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status = 413) {
    super(status, "payload_too_large", message, details);
    this.name = "PersistlyPayloadTooLargeError";
  }
}

export class PersistlyServerError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status = 500) {
    super(status, "server_error", message, details);
    this.name = "PersistlyServerError";
  }
}

export class PersistlyTransportError extends Error {
  constructor(message: string, readonly cause: unknown) {
    super(message);
    this.name = "PersistlyTransportError";
  }
}

export class PersistlyConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistlyConfigurationError";
  }
}

export class PersistlyStorageError extends PersistlyConfigurationError {
  constructor(message: string) {
    super(message);
    this.name = "PersistlyStorageError";
  }
}

export interface PersistlyErrorPayload {
  error: {
    code: PersistlyErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function createPersistlyApiError(
  status: number,
  code: PersistlyErrorCode,
  message: string,
  details?: Record<string, unknown>,
): PersistlyApiError {
  switch (code) {
    case "invalid_request":
      return new PersistlyInvalidRequestError(message, details, status);
    case "unauthorized":
      return new PersistlyUnauthorizedError(message, details, status);
    case "forbidden":
      return new PersistlyForbiddenError(message, details, status);
    case "not_found":
      return new PersistlyNotFoundError(message, details, status);
    case "conflict":
      return new PersistlyConflictError(message, details, status);
    case "slot_already_exists":
      return new PersistlySlotAlreadyExistsError(message, details, status);
    case "character_archived":
      return new PersistlyCharacterArchivedError(message, details, status);
    case "rate_limited":
      return new PersistlyRateLimitedError(message, details, status);
    case "payload_too_large":
      return new PersistlyPayloadTooLargeError(message, details, status);
    case "server_error":
      return new PersistlyServerError(message, details, status);
    default: {
      const exhaustivenessCheck: never = code;
      throw new PersistlyApiError(status, exhaustivenessCheck, message, details);
    }
  }
}

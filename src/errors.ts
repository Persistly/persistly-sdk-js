export type PersistlyErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "slot_already_exists"
  | "slot_archived"
  | "account_deleted"
  | "slot_deleted"
  | "transfer_code_invalid"
  | "transfer_code_expired"
  | "transfer_code_consumed"
  | "transfer_code_rate_limited"
  | "transfer_code_disabled"
  | "provider_token_invalid"
  | "auth_provider_not_configured"
  | "account_auth_conflict"
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

export class PersistlySlotArchivedError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status = 409) {
    super(status, "slot_archived", message, details);
    this.name = "PersistlySlotArchivedError";
  }
}

export class PersistlyAccountDeletedError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status = 410) {
    super(status, "account_deleted", message, details);
    this.name = "PersistlyAccountDeletedError";
  }
}

export class PersistlySlotDeletedError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status = 410) {
    super(status, "slot_deleted", message, details);
    this.name = "PersistlySlotDeletedError";
  }
}

export class PersistlyTransferCodeInvalidError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status = 400) {
    super(status, "transfer_code_invalid", message, details);
    this.name = "PersistlyTransferCodeInvalidError";
  }
}

export class PersistlyTransferCodeExpiredError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status = 400) {
    super(status, "transfer_code_expired", message, details);
    this.name = "PersistlyTransferCodeExpiredError";
  }
}

export class PersistlyTransferCodeConsumedError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status = 400) {
    super(status, "transfer_code_consumed", message, details);
    this.name = "PersistlyTransferCodeConsumedError";
  }
}

export class PersistlyTransferCodeRateLimitedError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status = 429) {
    super(status, "transfer_code_rate_limited", message, details);
    this.name = "PersistlyTransferCodeRateLimitedError";
  }
}

export class PersistlyTransferCodeDisabledError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status = 403) {
    super(status, "transfer_code_disabled", message, details);
    this.name = "PersistlyTransferCodeDisabledError";
  }
}

export class PersistlyProviderTokenInvalidError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status = 400) {
    super(status, "provider_token_invalid", message, details);
    this.name = "PersistlyProviderTokenInvalidError";
  }
}

export class PersistlyAuthProviderNotConfiguredError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status = 403) {
    super(status, "auth_provider_not_configured", message, details);
    this.name = "PersistlyAuthProviderNotConfiguredError";
  }
}

export class PersistlyAccountAuthConflictError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status = 409) {
    super(status, "account_auth_conflict", message, details);
    this.name = "PersistlyAccountAuthConflictError";
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
    case "slot_archived":
      return new PersistlySlotArchivedError(message, details, status);
    case "account_deleted":
      return new PersistlyAccountDeletedError(message, details, status);
    case "slot_deleted":
      return new PersistlySlotDeletedError(message, details, status);
    case "transfer_code_invalid":
      return new PersistlyTransferCodeInvalidError(message, details, status);
    case "transfer_code_expired":
      return new PersistlyTransferCodeExpiredError(message, details, status);
    case "transfer_code_consumed":
      return new PersistlyTransferCodeConsumedError(message, details, status);
    case "transfer_code_rate_limited":
      return new PersistlyTransferCodeRateLimitedError(message, details, status);
    case "transfer_code_disabled":
      return new PersistlyTransferCodeDisabledError(message, details, status);
    case "provider_token_invalid":
      return new PersistlyProviderTokenInvalidError(message, details, status);
    case "auth_provider_not_configured":
      return new PersistlyAuthProviderNotConfiguredError(message, details, status);
    case "account_auth_conflict":
      return new PersistlyAccountAuthConflictError(message, details, status);
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

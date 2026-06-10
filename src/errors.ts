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
  | "provider_not_supported"
  | "provider_not_enabled"
  | "provider_not_configured"
  | "provider_token_invalid"
  | "firebase_token_invalid"
  | "firebase_token_expired"
  | "firebase_project_mismatch"
  | "supabase_project_url_required"
  | "supabase_project_url_invalid"
  | "supabase_token_missing"
  | "supabase_token_invalid"
  | "supabase_token_expired"
  | "supabase_project_mismatch"
  | "supabase_audience_mismatch"
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
  constructor(message: string, details?: Record<string, unknown>, status?: number);
  constructor(
    code: Extract<
      PersistlyErrorCode,
      | "provider_token_invalid"
      | "firebase_token_invalid"
      | "firebase_token_expired"
      | "supabase_token_missing"
      | "supabase_token_invalid"
      | "supabase_token_expired"
    >,
    message: string,
    details?: Record<string, unknown>,
    status?: number,
  );
  constructor(
    codeOrMessage: string,
    messageOrDetails?: string | Record<string, unknown>,
    detailsOrStatus?: Record<string, unknown> | number,
    maybeStatus = 400,
  ) {
    const hasExplicitCode = typeof messageOrDetails === "string";
    const code = hasExplicitCode ? codeOrMessage as PersistlyErrorCode : "provider_token_invalid";
    const message = hasExplicitCode ? messageOrDetails : codeOrMessage;
    const details = hasExplicitCode ? detailsOrStatus as Record<string, unknown> | undefined : messageOrDetails;
    const status = hasExplicitCode ? maybeStatus : typeof detailsOrStatus === "number" ? detailsOrStatus : 400;
    super(status, code, message, details);
    this.name = "PersistlyProviderTokenInvalidError";
  }
}

export class PersistlyFirebaseProjectMismatchError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status?: number);
  constructor(
    code: Extract<PersistlyErrorCode, "firebase_project_mismatch" | "supabase_project_mismatch" | "supabase_audience_mismatch">,
    message: string,
    details?: Record<string, unknown>,
    status?: number,
  );
  constructor(
    codeOrMessage: string,
    messageOrDetails?: string | Record<string, unknown>,
    detailsOrStatus?: Record<string, unknown> | number,
    maybeStatus = 401,
  ) {
    const hasExplicitCode = typeof messageOrDetails === "string";
    const code = hasExplicitCode ? codeOrMessage as PersistlyErrorCode : "firebase_project_mismatch";
    const message = hasExplicitCode ? messageOrDetails : codeOrMessage;
    const details = hasExplicitCode ? detailsOrStatus as Record<string, unknown> | undefined : messageOrDetails;
    const status = hasExplicitCode ? maybeStatus : typeof detailsOrStatus === "number" ? detailsOrStatus : 401;
    super(status, code, message, details);
    this.name = "PersistlyFirebaseProjectMismatchError";
  }
}

export class PersistlyAuthProviderNotConfiguredError extends PersistlyApiError {
  constructor(message: string, details?: Record<string, unknown>, status?: number);
  constructor(
    code: Extract<
      PersistlyErrorCode,
      | "auth_provider_not_configured"
      | "provider_not_configured"
      | "provider_not_enabled"
      | "provider_not_supported"
      | "supabase_project_url_required"
      | "supabase_project_url_invalid"
    >,
    message: string,
    details?: Record<string, unknown>,
    status?: number,
  );
  constructor(
    codeOrMessage: string,
    messageOrDetails?: string | Record<string, unknown>,
    detailsOrStatus?: Record<string, unknown> | number,
    maybeStatus = 403,
  ) {
    const hasExplicitCode = typeof messageOrDetails === "string";
    const code = hasExplicitCode ? codeOrMessage as PersistlyErrorCode : "auth_provider_not_configured";
    const message = hasExplicitCode ? messageOrDetails : codeOrMessage;
    const details = hasExplicitCode ? detailsOrStatus as Record<string, unknown> | undefined : messageOrDetails;
    const status = hasExplicitCode ? maybeStatus : typeof detailsOrStatus === "number" ? detailsOrStatus : 403;
    super(status, code, message, details);
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
    case "firebase_token_invalid":
    case "firebase_token_expired":
    case "supabase_token_missing":
    case "supabase_token_invalid":
    case "supabase_token_expired":
      return new PersistlyProviderTokenInvalidError(code, message, details, status);
    case "firebase_project_mismatch":
    case "supabase_project_mismatch":
    case "supabase_audience_mismatch":
      return new PersistlyFirebaseProjectMismatchError(code, message, details, status);
    case "auth_provider_not_configured":
    case "provider_not_configured":
    case "provider_not_enabled":
    case "provider_not_supported":
    case "supabase_project_url_required":
    case "supabase_project_url_invalid":
      return new PersistlyAuthProviderNotConfiguredError(code, message, details, status);
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

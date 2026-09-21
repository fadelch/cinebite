export type ServiceErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "AUTHORIZATION_DENIED"
  | "DUPLICATE_ADMIN_EMAIL"
  | "DUPLICATE_ORGANIZATION_SLUG"
  | "DUPLICATE_LOCATION_SLUG"
  | "ORGANIZATION_NOT_FOUND"
  | "ORGANIZATION_NOT_ACTIVE"
  | "NO_STATUS_CHANGE"
  | "ONBOARDING_FAILED";

export class ServiceError extends Error {
  constructor(
    readonly code: ServiceErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}

export type ServiceErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "AUTHORIZATION_DENIED"
  | "DUPLICATE_ADMIN_EMAIL"
  | "DUPLICATE_ORGANIZATION_SLUG"
  | "DUPLICATE_LOCATION_SLUG"
  | "ORGANIZATION_NOT_FOUND"
  | "ORGANIZATION_NOT_ACTIVE"
  | "TENANT_CONTEXT_MISSING"
  | "LOCATION_ACCESS_DENIED"
  | "LOCATION_CREATION_DENIED"
  | "LOCATION_NOT_FOUND"
  | "LOCATION_NOT_ACTIVE"
  | "DUPLICATE_HALL_NUMBER"
  | "HALL_NOT_FOUND"
  | "HALL_NOT_ACTIVE"
  | "DUPLICATE_SEAT"
  | "SEAT_NOT_FOUND"
  | "NO_STATUS_CHANGE"
  | "ONBOARDING_FAILED"
  | "CATEGORY_NOT_FOUND"
  | "DUPLICATE_CATEGORY_SLUG"
  | "PRODUCT_NOT_FOUND"
  | "DUPLICATE_PRODUCT_SLUG"
  | "DUPLICATE_PRODUCT_SKU"
  | "PRODUCT_LOCATION_CONFLICT"
  | "IMAGE_UPLOAD_INVALID";

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
